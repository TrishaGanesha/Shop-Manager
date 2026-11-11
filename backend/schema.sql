PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL CHECK (price > 0),
    stock_count INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
    supplier_id INTEGER NOT NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_audit (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    old_price REAL,
    new_price REAL,
    change_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_audit (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    old_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    change_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    email TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    order_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (order_status IN ('pending', 'processing', 'completed', 'cancelled')),
    order_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE IF NOT EXISTS order_items (
    order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price > 0),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME
);

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);

INSERT OR IGNORE INTO suppliers (supplier_id, supplier_name)
VALUES (1, 'Fresh Farms Co'), (2, 'Dairy Best');

INSERT OR IGNORE INTO products (product_id, product_name, category, price, stock_count, supplier_id)
VALUES
    (1, 'Organic Apples', 'Produce', 249.00, 150, 1),
    (2, 'Almond Milk', 'Dairy', 289.00, 80, 2);

INSERT OR IGNORE INTO customers (customer_id, customer_name, email)
VALUES
    (1, 'Demo Customer One', 'demo.one@example.test'),
    (2, 'Demo Customer Two', 'demo.two@example.test');

INSERT OR IGNORE INTO orders (order_id, customer_id, order_status)
VALUES
    (1, 1, 'pending'),
    (2, 2, 'completed');

INSERT OR IGNORE INTO order_items (order_item_id, order_id, product_id, quantity, unit_price)
VALUES
    (1, 1, 1, 3, 249.00),
    (2, 1, 2, 1, 289.00),
    (3, 2, 1, 2, 249.00);

CREATE TRIGGER IF NOT EXISTS after_price_update
AFTER UPDATE OF price ON products
FOR EACH ROW WHEN OLD.price <> NEW.price
BEGIN
    INSERT INTO inventory_audit (product_id, old_price, new_price)
    VALUES (NEW.product_id, OLD.price, NEW.price);
END;

CREATE TRIGGER IF NOT EXISTS prevent_negative_stock_on_insert
BEFORE INSERT ON products
FOR EACH ROW WHEN NEW.stock_count < 0
BEGIN
    SELECT RAISE(ABORT, 'Stock cannot be below zero.');
END;

CREATE TRIGGER IF NOT EXISTS prevent_negative_stock_on_update
BEFORE UPDATE OF stock_count ON products
FOR EACH ROW WHEN NEW.stock_count < 0
BEGIN
    SELECT RAISE(ABORT, 'Stock cannot be below zero.');
END;

CREATE TRIGGER IF NOT EXISTS after_stock_update
AFTER UPDATE OF stock_count ON products
FOR EACH ROW WHEN OLD.stock_count <> NEW.stock_count
BEGIN
    INSERT INTO stock_audit (product_id, old_stock, new_stock)
    VALUES (NEW.product_id, OLD.stock_count, NEW.stock_count);
END;
