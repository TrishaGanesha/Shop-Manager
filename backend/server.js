const cors = require('cors')
const crypto = require('node:crypto')
const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
const sqlite3 = require('sqlite3').verbose()

const app = express()
const port = Number(process.env.PORT) || 5000
const databasePath = path.join(__dirname, 'grocery_edge.db')
const schemaPath = path.join(__dirname, 'schema.sql')
const sessionCookieName = 'market_session'
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
])
const db = new sqlite3.Database(databasePath)
let queryDb
let saleDb

app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.has(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      callback(null, origin || true)
      return
    }
    callback(new Error('This origin is not allowed to access the API.'))
  },
  credentials: true,
}))
app.use(express.json())

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derivedKey.toString('hex'))
    })
  })
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function readSessionToken(request) {
  const cookies = request.headers.cookie || ''
  const cookie = cookies.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`))
  return cookie ? decodeURIComponent(cookie.slice(sessionCookieName.length + 1)) : ''
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
}

function createSession(userId, response) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString()
  db.run(
    'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, hashSessionToken(token), expiresAt],
    (error) => {
      if (error) {
        console.error('Unable to create login session:', error.message)
        response.status(500).json({ error: 'Unable to create a login session.' })
        return
      }
      response.cookie(sessionCookieName, token, {
        ...sessionCookieOptions(),
        maxAge: sessionLifetimeMs,
      })
      response.json({ user: response.locals.user })
    },
  )
}

function requireAuthentication(request, response, next) {
  const token = readSessionToken(request)
  if (!token) {
    response.status(401).json({ error: 'Please log in to continue.' })
    return
  }

  db.get(
    `SELECT users.user_id, users.display_name, users.email
     FROM user_sessions
     JOIN users ON users.user_id = user_sessions.user_id
     WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?`,
    [hashSessionToken(token), new Date().toISOString()],
    (error, user) => {
      if (error) {
        console.error('Unable to verify login session:', error.message)
        response.status(500).json({ error: 'Unable to verify your login session.' })
        return
      }
      if (!user) {
        response.clearCookie(sessionCookieName, sessionCookieOptions())
        response.status(401).json({ error: 'Your login session has expired. Please log in again.' })
        return
      }
      request.user = user
      next()
    },
  )
}

function getProduct(productId, callback) {
  db.get(
    `SELECT products.product_id, products.product_name, products.category,
            products.price, products.stock_count, products.supplier_id,
            suppliers.supplier_name
     FROM products
     JOIN suppliers ON suppliers.supplier_id = products.supplier_id
     WHERE products.product_id = ?`,
    [productId],
    callback,
  )
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.post('/api/auth/register', async (request, response) => {
  const displayName = typeof request.body?.display_name === 'string'
    ? request.body.display_name.trim()
    : ''
  const email = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : ''
  const password = typeof request.body?.password === 'string' ? request.body.password : ''

  if (displayName.length < 2 || displayName.length > 80) {
    response.status(400).json({ error: 'Name must be between 2 and 80 characters.' })
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    response.status(400).json({ error: 'Enter a valid email address.' })
    return
  }
  if (password.length < 10 || password.length > 128) {
    response.status(400).json({ error: 'Password must be between 10 and 128 characters.' })
    return
  }

  try {
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = await hashPassword(password, salt)
    db.run(
      'INSERT INTO users (display_name, email, password_salt, password_hash) VALUES (?, ?, ?, ?)',
      [displayName, email, salt, passwordHash],
      function onUserRegistered(error) {
        if (error) {
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            response.status(409).json({ error: 'An account with that email already exists.' })
            return
          }
          console.error('Unable to register account:', error.message)
          response.status(500).json({ error: 'Unable to create your account.' })
          return
        }
        response.locals.user = {
          user_id: this.lastID,
          display_name: displayName,
          email,
        }
        createSession(this.lastID, response)
      },
    )
  } catch (error) {
    console.error('Unable to secure new account password:', error.message)
    response.status(500).json({ error: 'Unable to create your account.' })
  }
})

app.post('/api/auth/login', (request, response) => {
  const email = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : ''
  const password = typeof request.body?.password === 'string' ? request.body.password : ''

  if (!email || !password || password.length > 128) {
    response.status(400).json({ error: 'Enter your email and password.' })
    return
  }

  db.get(
    'SELECT user_id, display_name, email, password_salt, password_hash FROM users WHERE email = ?',
    [email],
    async (error, user) => {
      if (error) {
        console.error('Unable to find login account:', error.message)
        response.status(500).json({ error: 'Unable to log in.' })
        return
      }
      if (!user) {
        try {
          await hashPassword(password, 'marketos-login-timing-salt')
        } catch (hashError) {
          console.error('Unable to verify login attempt:', hashError.message)
          response.status(500).json({ error: 'Unable to log in.' })
          return
        }
        response.status(401).json({ error: 'Email or password is incorrect.' })
        return
      }

      try {
        const passwordHash = await hashPassword(password, user.password_salt)
        const expected = Buffer.from(user.password_hash, 'hex')
        const actual = Buffer.from(passwordHash, 'hex')
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
          response.status(401).json({ error: 'Email or password is incorrect.' })
          return
        }

        db.run(
          'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?',
          [user.user_id],
          (updateError) => {
            if (updateError) {
              console.error('Unable to update login timestamp:', updateError.message)
              response.status(500).json({ error: 'Unable to complete login.' })
              return
            }
            response.locals.user = {
              user_id: user.user_id,
              display_name: user.display_name,
              email: user.email,
            }
            createSession(user.user_id, response)
          },
        )
      } catch (hashError) {
        console.error('Unable to verify account password:', hashError.message)
        response.status(500).json({ error: 'Unable to log in.' })
      }
    },
  )
})

app.get('/api/auth/me', requireAuthentication, (request, response) => {
  response.json({ user: request.user })
})

app.post('/api/auth/logout', (request, response) => {
  const token = readSessionToken(request)
  if (!token) {
    response.clearCookie(sessionCookieName, sessionCookieOptions())
    response.status(204).end()
    return
  }
  db.run(
    'DELETE FROM user_sessions WHERE token_hash = ?',
    [hashSessionToken(token)],
    (error) => {
      if (error) {
        console.error('Unable to delete login session:', error.message)
        response.status(500).json({ error: 'Unable to log out.' })
        return
      }
      response.clearCookie(sessionCookieName, sessionCookieOptions())
      response.status(204).end()
    },
  )
})

app.use('/api', requireAuthentication)

app.get('/api/suppliers', (_request, response) => {
  db.all(
    'SELECT supplier_id, supplier_name FROM suppliers ORDER BY supplier_name',
    (error, suppliers) => {
      if (error) {
        console.error('Unable to load suppliers:', error.message)
        response.status(500).json({ error: 'Unable to load suppliers.' })
        return
      }
      response.json(suppliers)
    },
  )
})

app.get('/api/products', (_request, response) => {
  db.all(
    `SELECT products.product_id, products.product_name, products.category,
            products.price, products.stock_count, products.supplier_id,
            suppliers.supplier_name
     FROM products
     JOIN suppliers ON suppliers.supplier_id = products.supplier_id
     ORDER BY products.product_id`,
    (error, products) => {
      if (error) {
        console.error('Unable to load products:', error.message)
        response.status(500).json({ error: 'Unable to load inventory.' })
        return
      }
      response.json(products)
    },
  )
})

app.get('/api/analytics', (_request, response) => {
  db.get(
    `SELECT COUNT(*) AS product_count,
            COALESCE(SUM(stock_count), 0) AS total_units,
            ROUND(COALESCE(SUM(price * stock_count), 0), 2) AS inventory_value,
            COALESCE(SUM(CASE WHEN stock_count < 20 THEN 1 ELSE 0 END), 0) AS low_stock_count
     FROM products`,
    (summaryError, summary) => {
      if (summaryError) {
        console.error('Unable to calculate inventory summary:', summaryError.message)
        response.status(500).json({ error: 'Unable to calculate inventory insights.' })
        return
      }
      db.all(
        `SELECT category, COUNT(*) AS product_count,
                SUM(stock_count) AS total_units,
                ROUND(SUM(price * stock_count), 2) AS inventory_value
         FROM products
         GROUP BY category
         ORDER BY inventory_value DESC`,
        (categoryError, categories) => {
          if (categoryError) {
            console.error('Unable to group inventory by category:', categoryError.message)
            response.status(500).json({ error: 'Unable to load category insights.' })
            return
          }
          db.all(
            `SELECT 'price' AS change_type, products.product_name,
                    inventory_audit.old_price AS previous_value,
                    inventory_audit.new_price AS new_value,
                    inventory_audit.change_timestamp
             FROM inventory_audit
             JOIN products ON products.product_id = inventory_audit.product_id
             UNION ALL
             SELECT 'stock' AS change_type, products.product_name,
                    stock_audit.old_stock AS previous_value,
                    stock_audit.new_stock AS new_value,
                    stock_audit.change_timestamp
             FROM stock_audit
             JOIN products ON products.product_id = stock_audit.product_id
             ORDER BY change_timestamp DESC
             LIMIT 10`,
            (changesError, recentChanges) => {
              if (changesError) {
                console.error('Unable to load recent shop updates:', changesError.message)
                response.status(500).json({ error: 'Unable to load recent shop updates.' })
                return
              }
              response.json({ ...summary, categories, recent_changes: recentChanges })
            },
          )
        },
      )
    },
  )
})

const ordersQuery = `SELECT o.order_id, c.customer_name, o.order_status, o.order_date,
                            COALESCE(ROUND(SUM(oi.quantity * oi.unit_price), 2), 0) AS order_total,
                            COALESCE(SUM(oi.quantity), 0) AS item_count
                     FROM orders AS o
                     JOIN customers AS c ON c.customer_id = o.customer_id
                     LEFT JOIN order_items AS oi ON oi.order_id = o.order_id`

app.get('/api/orders', (_request, response) => {
  queryDb.all(
    `${ordersQuery}
     GROUP BY o.order_id
     ORDER BY o.order_date DESC, o.order_id DESC`,
    (error, orders) => {
      if (error) {
        console.error('Unable to load orders:', error.message)
        response.status(500).json({ error: 'Unable to load customer orders.' })
        return
      }
      response.json(orders)
    },
  )
})

app.post('/api/ask', (request, response) => {
  const question = typeof request.body?.question === 'string'
    ? request.body.question.trim().slice(0, 300)
    : ''
  if (!question) {
    response.status(400).json({ error: 'Enter a question about your products, stock, or orders.' })
    return
  }

  const normalized = question.toLowerCase()
  let sql
  let params = []
  let answer

  if (/\b(order|orders|customer|customers|purchase|purchases)\b/.test(normalized)) {
    let orderFilter = ''
    if (/\b(pending|not fulfilled|unfulfilled)\b/.test(normalized)) {
      orderFilter = "WHERE o.order_status = 'pending'"
      answer = 'Here are the pending customer orders.'
    } else if (/\b(processing|in progress)\b/.test(normalized)) {
      orderFilter = "WHERE o.order_status = 'processing'"
      answer = 'Here are the orders being processed.'
    } else if (/\b(completed|fulfilled|delivered)\b/.test(normalized)) {
      orderFilter = "WHERE o.order_status = 'completed'"
      answer = 'Here are the completed customer orders.'
    } else if (/\b(today|daily|this day)\b/.test(normalized)) {
      orderFilter = "WHERE date(o.order_date) = date('now', 'localtime')"
      answer = 'Here are the customer orders placed today.'
    } else {
      answer = 'Here are the customer orders from the database.'
    }
    sql = `${ordersQuery}
           ${orderFilter}
           GROUP BY o.order_id
           ORDER BY o.order_date DESC, o.order_id DESC`
  } else if (/\b(low|running low|below|out of stock|empty)\b/.test(normalized)) {
    sql = `SELECT product_id, product_name, category, price, stock_count
           FROM products
           WHERE stock_count < 20
           ORDER BY stock_count ASC, product_name`
    answer = 'These products have fewer than 20 units in stock.'
  } else if (/\b(value|worth|inventory value)\b/.test(normalized)) {
    sql = `SELECT COUNT(*) AS product_count,
                  COALESCE(SUM(stock_count), 0) AS total_units,
                  ROUND(COALESCE(SUM(price * stock_count), 0), 2) AS inventory_value
           FROM products`
    answer = 'Here is the current inventory value and unit total.'
  } else {
    db.all('SELECT product_id, product_name, category FROM products', (productError, products) => {
      if (productError) {
        console.error('Unable to match product question:', productError.message)
        response.status(500).json({ error: 'Unable to search the inventory.' })
        return
      }
      const requestedProduct = products.find((product) =>
        normalized.includes(product.product_name.toLowerCase()),
      )
      if (requestedProduct) {
        sql = `SELECT product_id, product_name, category, price, stock_count
               FROM products
               WHERE product_id = ?`
        params = [requestedProduct.product_id]
        answer = `Here is the current stock for ${requestedProduct.product_name}.`
      } else {
        const requestedCategory = products.find((product) =>
          normalized.includes(product.category.toLowerCase()),
        )?.category
        if (requestedCategory) {
          sql = `SELECT product_id, product_name, category, price, stock_count
                 FROM products
                 WHERE category = ?
                 ORDER BY product_name`
          params = [requestedCategory]
          answer = `Here are the products in ${requestedCategory}.`
        } else {
          sql = `SELECT product_id, product_name, category, price, stock_count
                 FROM products
                 ORDER BY product_name`
          answer = 'Here are all products and their current stock. You can also ask for low stock, inventory value, or customer orders.'
        }
      }
      runAssistantQuery(sql, params, answer, response)
    })
    return
  }

  runAssistantQuery(sql, params, answer, response)
})

function runAssistantQuery(sql, params, answer, response) {
  queryDb.all(sql, params, (error, rows) => {
    if (error) {
      console.error('Unable to answer inventory question:', error.message)
      response.status(500).json({ error: 'Unable to retrieve that information.' })
      return
    }
    response.json({
      answer: rows.length ? answer : `${answer} There are no matching records yet.`,
      columns: rows.length ? Object.keys(rows[0]) : [],
      rows,
    })
  })
}

app.post('/api/products', (request, response) => {
  const productName = typeof request.body?.product_name === 'string'
    ? request.body.product_name.trim()
    : ''
  const category = typeof request.body?.category === 'string'
    ? request.body.category.trim()
    : ''
  const price = Number(request.body?.price)
  const stockCount = Number(request.body?.stock_count)
  const supplierId = Number(request.body?.supplier_id)

  if (!productName || productName.length > 120) {
    response.status(400).json({ error: 'Product name is required and must be 120 characters or fewer.' })
    return
  }
  if (!category || category.length > 60) {
    response.status(400).json({ error: 'Category is required and must be 60 characters or fewer.' })
    return
  }
  if (!Number.isFinite(price) || price <= 0) {
    response.status(400).json({ error: 'Price must be greater than zero.' })
    return
  }
  if (!Number.isInteger(stockCount) || stockCount < 0) {
    response.status(400).json({ error: 'Stock must be a non-negative whole number.' })
    return
  }
  if (!Number.isInteger(supplierId) || supplierId < 1) {
    response.status(400).json({ error: 'Choose a valid supplier.' })
    return
  }

  db.run(
    `INSERT INTO products (product_name, category, price, stock_count, supplier_id)
     VALUES (?, ?, ?, ?, ?)`,
    [productName, category, price, stockCount, supplierId],
    function onProductCreated(error) {
      if (error) {
        if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || error.message.includes('FOREIGN KEY constraint failed')) {
          response.status(400).json({ error: 'Choose a valid supplier.' })
          return
        }
        console.error('Unable to create product:', error.message)
        response.status(500).json({ error: 'Unable to save product.' })
        return
      }
      getProduct(this.lastID, (lookupError, product) => {
        if (lookupError) {
          console.error('Unable to retrieve created product:', lookupError.message)
          response.status(500).json({ error: 'Product was saved but could not be loaded.' })
          return
        }
        response.status(201).json({ product })
      })
    },
  )
})

app.patch('/api/products/:productId', (request, response) => {
  const productId = Number(request.params.productId)
  const productName = typeof request.body?.product_name === 'string'
    ? request.body.product_name.trim()
    : ''
  const category = typeof request.body?.category === 'string'
    ? request.body.category.trim()
    : ''
  const price = Number(request.body?.price)
  const stockCount = Number(request.body?.stock_count)
  const supplierId = Number(request.body?.supplier_id)

  if (!Number.isInteger(productId) || productId < 1) {
    response.status(400).json({ error: 'Choose a valid product.' })
    return
  }
  if (!productName || productName.length > 120 || !category || category.length > 60) {
    response.status(400).json({ error: 'Enter a product name and category within the allowed length.' })
    return
  }
  if (!Number.isFinite(price) || price <= 0) {
    response.status(400).json({ error: 'Price must be greater than zero.' })
    return
  }
  if (!Number.isInteger(stockCount) || stockCount < 0) {
    response.status(400).json({ error: 'Stock cannot be below zero. Enter a whole number of zero or more.' })
    return
  }
  if (!Number.isInteger(supplierId) || supplierId < 1) {
    response.status(400).json({ error: 'Choose a valid supplier.' })
    return
  }

  db.run(
    `UPDATE products
     SET product_name = ?, category = ?, price = ?, stock_count = ?, supplier_id = ?
     WHERE product_id = ?`,
    [productName, category, price, stockCount, supplierId, productId],
    function onProductUpdated(error) {
      if (error) {
        if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || error.message.includes('FOREIGN KEY constraint failed')) {
          response.status(400).json({ error: 'Choose a valid supplier.' })
          return
        }
        if (error.message.includes('Stock cannot be below zero')) {
          response.status(400).json({ error: 'Stock cannot be below zero.' })
          return
        }
        console.error('Unable to update product:', error.message)
        response.status(500).json({ error: 'Unable to update product.' })
        return
      }
      if (this.changes === 0) {
        response.status(404).json({ error: 'Product not found.' })
        return
      }
      getProduct(productId, (lookupError, product) => {
        if (lookupError) {
          console.error('Unable to retrieve updated product:', lookupError.message)
          response.status(500).json({ error: 'Product was updated but could not be loaded.' })
          return
        }
        response.json({
          product,
          message: 'Product details saved. Any price change was added to the price history automatically.',
        })
      })
    },
  )
})

app.delete('/api/products/:productId', (request, response) => {
  const productId = Number(request.params.productId)
  if (!Number.isInteger(productId) || productId < 1) {
    response.status(400).json({ error: 'Choose a valid product.' })
    return
  }
  db.run('DELETE FROM products WHERE product_id = ?', [productId], function onProductDeleted(error) {
    if (error) {
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || error.message.includes('FOREIGN KEY constraint failed')) {
        response.status(409).json({ error: 'This product is part of an order, so it cannot be deleted without removing its order history.' })
        return
      }
      console.error('Unable to delete product:', error.message)
      response.status(500).json({ error: 'Unable to delete product.' })
      return
    }
    if (this.changes === 0) {
      response.status(404).json({ error: 'Product not found.' })
      return
    }
    response.json({ message: 'Product removed from your inventory.' })
  })
})

app.post('/api/sales', (request, response) => {
  const productId = Number(request.body?.product_id)
  const quantity = Number(request.body?.quantity)
  const customerName = typeof request.body?.customer_name === 'string'
    ? request.body.customer_name.trim().slice(0, 100)
    : ''
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''

  if (!Number.isInteger(productId) || productId < 1) {
    response.status(400).json({ error: 'Choose a product to record this sale.' })
    return
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    response.status(400).json({ error: 'Sale quantity must be a whole number greater than zero.' })
    return
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    response.status(400).json({ error: 'Enter a valid customer email address or leave it blank.' })
    return
  }

  saleDb.run('BEGIN IMMEDIATE', (beginError) => {
    if (beginError) {
      console.error('Unable to begin sale transaction:', beginError.message)
      response.status(500).json({ error: 'Unable to record the sale right now.' })
      return
    }
    const failSale = (status, message, error) => {
      if (error) console.error('Unable to record sale:', error.message)
      saleDb.run('ROLLBACK', (rollbackError) => {
        if (rollbackError) console.error('Unable to roll back sale:', rollbackError.message)
        response.status(status).json({ error: message })
      })
    }
    saleDb.get(
      'SELECT product_id, product_name, price, stock_count FROM products WHERE product_id = ?',
      [productId],
      (productError, product) => {
        if (productError) {
          failSale(500, 'Unable to look up this product.', productError)
          return
        }
        if (!product) {
          failSale(404, 'Product not found.')
          return
        }
        if (product.stock_count < quantity) {
          failSale(400, `Only ${product.stock_count} ${product.stock_count === 1 ? 'unit is' : 'units are'} available. Update the quantity and try again.`)
          return
        }

        const saveOrder = (customerId) => {
          saleDb.run(
            "INSERT INTO orders (customer_id, order_status) VALUES (?, 'completed')",
            [customerId],
            function onOrderCreated(orderError) {
              if (orderError) {
                failSale(500, 'Unable to create the sale record.', orderError)
                return
              }
              const orderId = this.lastID
              saleDb.run(
                'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
                [orderId, productId, quantity, product.price],
                (itemError) => {
                  if (itemError) {
                    failSale(500, 'Unable to save the sale items.', itemError)
                    return
                  }
                  saleDb.run(
                    'UPDATE products SET stock_count = stock_count - ? WHERE product_id = ? AND stock_count >= ?',
                    [quantity, productId, quantity],
                    function onStockReduced(stockError) {
                      if (stockError) {
                        failSale(500, 'Unable to update stock for this sale.', stockError)
                        return
                      }
                      if (this.changes !== 1) {
                        failSale(400, 'There is not enough stock to complete this sale.')
                        return
                      }
                      saleDb.run('COMMIT', (commitError) => {
                        if (commitError) {
                          failSale(500, 'Unable to finish saving this sale.', commitError)
                          return
                        }
                        response.status(201).json({
                          message: `Sale recorded: ${quantity} ${quantity === 1 ? 'unit' : 'units'} of ${product.product_name}. Stock was updated.`,
                          order_id: orderId,
                          product_id: productId,
                          stock_count: product.stock_count - quantity,
                          total: Number((product.price * quantity).toFixed(2)),
                        })
                      })
                    },
                  )
                },
              )
            },
          )
        }

        const resolvedCustomerName = customerName || 'Walk-in customer'
        if (email) {
          saleDb.get('SELECT customer_id FROM customers WHERE email = ?', [email], (customerError, customer) => {
            if (customerError) {
              failSale(500, 'Unable to look up the customer.', customerError)
              return
            }
            if (customer) {
              saveOrder(customer.customer_id)
              return
            }
            saleDb.run(
              'INSERT INTO customers (customer_name, email) VALUES (?, ?)',
              [resolvedCustomerName, email],
              function onCustomerCreated(insertError) {
                if (insertError) {
                  failSale(500, 'Unable to save the customer details.', insertError)
                  return
                }
                saveOrder(this.lastID)
              },
            )
          })
        } else {
          saleDb.run(
            'INSERT INTO customers (customer_name) VALUES (?)',
            [resolvedCustomerName],
            function onWalkInCustomerCreated(customerError) {
              if (customerError) {
                failSale(500, 'Unable to create a sale record.', customerError)
                return
              }
              saveOrder(this.lastID)
            },
          )
        }
      },
    )
  })
})

app.post('/api/query', (request, response) => {
  const sql = typeof request.body?.sql === 'string' ? request.body.sql.trim() : ''
  if (!sql || sql.length > 5000) {
    response.status(400).json({ error: 'Enter a query of 1–5000 characters.' })
    return
  }

  const singleStatement = sql.replace(/;\s*$/, '').trim()
  if (
    !/^(SELECT|WITH|EXPLAIN)\b/i.test(singleStatement) ||
    singleStatement.includes(';')
  ) {
    response.status(400).json({ error: 'The SQL lab accepts one read-only SELECT, WITH, or EXPLAIN query at a time.' })
    return
  }

  queryDb.all(singleStatement, (error, rows) => {
    if (error) {
      response.status(400).json({ error: error.message })
      return
    }
    response.json({ columns: rows.length ? Object.keys(rows[0]) : [], rows })
  })
})

app.patch('/api/products/:productId/stock', (request, response) => {
  const productId = Number(request.params.productId)
  const change = request.body?.change

  if (!Number.isInteger(productId) || productId < 1) {
    response.status(400).json({ error: 'Product ID must be a positive integer.' })
    return
  }

  if (!Number.isInteger(change) || change === 0) {
    response.status(400).json({ error: 'Stock change must be a non-zero integer.' })
    return
  }

  db.run(
    'UPDATE products SET stock_count = stock_count + ? WHERE product_id = ? AND stock_count + ? >= 0',
    [change, productId, change],
    function onStockUpdated(error) {
      if (error) {
        console.error('Unable to update product stock:', error.message)
        response.status(500).json({ error: 'Unable to update stock.' })
        return
      }
      if (this.changes === 0) {
        getProduct(productId, (lookupError, product) => {
          if (lookupError) {
            console.error('Unable to verify product after stock update:', lookupError.message)
            response.status(500).json({ error: 'Unable to update stock.' })
            return
          }
          if (!product) {
            response.status(404).json({ error: 'Product not found.' })
            return
          }
          response.status(400).json({ error: 'Stock cannot be reduced below zero.' })
        })
        return
      }
      getProduct(productId, (lookupError, product) => {
        if (lookupError) {
          console.error('Unable to retrieve updated product:', lookupError.message)
          response.status(500).json({ error: 'Stock was updated but the latest product could not be loaded.' })
          return
        }
        response.json({ product })
      })
    },
  )
})

const schema = fs.readFileSync(schemaPath, 'utf8')
db.exec(schema, (error) => {
  if (error) {
    console.error('Unable to initialize the SQLite database:', error.message)
    process.exitCode = 1
    db.close()
    return
  }

  migrateDemoPrices((migrationError) => {
    if (migrationError) {
      console.error('Unable to migrate sample prices to INR:', migrationError.message)
      process.exitCode = 1
      db.close()
      return
    }

    db.run('DELETE FROM user_sessions WHERE expires_at <= ?', [new Date().toISOString()], (cleanupError) => {
      if (cleanupError) {
        console.error('Unable to clean expired login sessions:', cleanupError.message)
        process.exitCode = 1
        db.close()
        return
      }

      openQueryDatabase()
    })
  })
})

function migrateDemoPrices(callback) {
  const updates = [
    ["UPDATE products SET price = 249 WHERE product_id = 1 AND product_name = 'Organic Apples' AND price = 2.99"],
    ["UPDATE products SET price = 289 WHERE product_id = 2 AND product_name = 'Almond Milk' AND price = 3.49"],
    ["UPDATE order_items SET unit_price = 249 WHERE product_id = 1 AND unit_price = 2.99"],
    ["UPDATE order_items SET unit_price = 289 WHERE product_id = 2 AND unit_price = 3.49"],
  ]

  function runNext(index) {
    if (index === updates.length) {
      callback(null)
      return
    }
    db.run(updates[index][0], (error) => {
      if (error) {
        callback(error)
        return
      }
      runNext(index + 1)
    })
  }
  runNext(0)
}

function openQueryDatabase() {
  queryDb = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, (openError) => {
    if (openError) {
      console.error('Unable to open the read-only SQL connection:', openError.message)
      process.exitCode = 1
      db.close()
      return
    }
    queryDb.run('PRAGMA query_only = ON', (pragmaError) => {
      if (pragmaError) {
        console.error('Unable to protect the SQL query connection:', pragmaError.message)
        process.exitCode = 1
        queryDb.close()
        db.close()
        return
      }
      saleDb = new sqlite3.Database(databasePath, (saleOpenError) => {
        if (saleOpenError) {
          console.error('Unable to open the sales database connection:', saleOpenError.message)
          process.exitCode = 1
          queryDb.close()
          db.close()
          return
        }
        saleDb.configure('busyTimeout', 5000)
        saleDb.run('PRAGMA foreign_keys = ON', (foreignKeyError) => {
          if (foreignKeyError) {
            console.error('Unable to protect sale relationships:', foreignKeyError.message)
            process.exitCode = 1
            saleDb.close()
            queryDb.close()
            db.close()
            return
          }
          app.listen(port, () => {
            console.log(`SQL Backend running on http://localhost:${port}`)
          })
        })
      })
    })
  })
}

process.on('SIGINT', () => {
  const closeDatabase = () => db.close((error) => {
    if (error) {
      console.error('Unable to close the SQLite database:', error.message)
      process.exitCode = 1
    }
    process.exit()
  })
  const closeQueryDatabase = () => {
    if (!queryDb) {
      closeDatabase()
      return
    }
    queryDb.close((error) => {
      if (error) {
        console.error('Unable to close the read-only SQL connection:', error.message)
      }
      closeDatabase()
    })
  }
  if (saleDb) {
    saleDb.close((error) => {
      if (error) console.error('Unable to close the sales database connection:', error.message)
      closeQueryDatabase()
    })
  } else {
    closeQueryDatabase()
  }
})
