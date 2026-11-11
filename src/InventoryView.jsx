import { useCallback, useEffect, useMemo, useState } from 'react'
import AddProductDialog from './AddProductDialog.jsx'
import AnalyticsView from './AnalyticsView.jsx'
import DataAssistant from './DataAssistant.jsx'
import OrdersView from './OrdersView.jsx'
import RecordSaleDialog from './RecordSaleDialog.jsx'
import { formatCurrency } from './currency.js'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

async function requestProducts() {
  const response = await fetch(`${API_URL}/products`, { credentials: 'include' })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || 'Unable to load inventory.')
  }
  return result
}

async function requestAnalytics() {
  const response = await fetch(`${API_URL}/analytics`, { credentials: 'include' })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || 'Unable to load shop insights.')
  }
  return result
}

async function requestShopData() {
  const [products, summary] = await Promise.all([requestProducts(), requestAnalytics()])
  return { products, summary }
}

function InventoryView({ user, onLogout }) {
  const [products, setProducts] = useState([])
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All categories')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState('inventory')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [productToEdit, setProductToEdit] = useState(null)
  const [showRecordSale, setShowRecordSale] = useState(false)
  const [notice, setNotice] = useState('')
  const [logoutError, setLogoutError] = useState('')

  const loadProducts = useCallback(async () => {
    try {
      const data = await requestShopData()
      setProducts(data.products)
      setSummary(data.summary)
      setError('')
    } catch (requestError) {
      setError(requestError.message || 'Unable to connect to the inventory API.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    requestShopData()
      .then((data) => {
        if (active) {
          setProducts(data.products)
          setSummary(data.summary)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load your shop.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const categories = useMemo(
    () => ['All categories', ...new Set(products.map((product) => product.category))],
    [products],
  )

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory = category === 'All categories' || product.category === category
      const matchesSearch =
        !query ||
        product.product_name.toLowerCase().includes(query) ||
        product.supplier_name.toLowerCase().includes(query)
      return matchesCategory && matchesSearch
    })
  }, [category, products, search])

  const stats = {
    skuCount: summary?.product_count ?? 0,
    totalUnits: summary?.total_units ?? 0,
    inventoryValue: summary?.inventory_value ?? 0,
    lowStock: summary?.low_stock_count ?? 0,
  }

  async function adjustStock(productId, change) {
    setUpdatingId(productId)
    setError('')
    try {
      const response = await fetch(`${API_URL}/products/${productId}/stock`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Unable to update stock.')
      }
      setProducts((current) =>
        current.map((product) =>
          product.product_id === productId ? result.product : product,
        ),
      )
      requestAnalytics().then(setSummary).catch((requestError) => {
        setError(requestError.message || 'Unable to refresh shop insights.')
      })
    } catch (requestError) {
      setError(requestError.message || 'Unable to update stock.')
    } finally {
      setUpdatingId(null)
    }
  }

  function handleProductCreated(product) {
    setProducts((current) => [...current, product])
    setShowAddProduct(false)
    setNotice(`${product.product_name} was saved to your inventory.`)
    loadProducts()
    window.setTimeout(() => setNotice(''), 4000)
  }

  function handleProductSaved(product) {
    setProducts((current) => current.map((item) => item.product_id === product.product_id ? product : item))
    setProductToEdit(null)
    setNotice(`${product.product_name} details were saved. Price changes are recorded automatically.`)
    loadProducts()
    window.setTimeout(() => setNotice(''), 5000)
  }

  function handleSaleRecorded(sale) {
    setProducts((current) => current.map((product) =>
      product.product_id === sale.product_id
        ? { ...product, stock_count: sale.stock_count }
        : product,
    ))
    loadProducts()
    setShowRecordSale(false)
    setNotice(sale.message)
    window.setTimeout(() => setNotice(''), 5000)
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Remove ${product.product_name} from your shop? Products already included in orders cannot be removed.`)) return
    setError('')
    try {
      const response = await fetch(`${API_URL}/products/${product.product_id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to remove product.')
      setProducts((current) => current.filter((item) => item.product_id !== product.product_id))
      loadProducts()
      setNotice(result.message)
      window.setTimeout(() => setNotice(''), 4000)
    } catch (requestError) {
      setError(requestError.message || 'Unable to remove product.')
    }
  }

  async function handleLogout() {
    setLogoutError('')
    try {
      await onLogout()
    } catch (error) {
      setLogoutError(error.message || 'Unable to log out.')
    }
  }

  const viewTitles = {
    inventory: 'Inventory',
    analytics: 'Analytics',
    ask: 'Ask your data',
    orders: 'Orders',
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Shop Manager home">
          <span className="brand-mark">m</span>
          <span>Shop<span className="brand-light"> Manager</span></span>
        </a>

        <div className="workspace-switcher">
          <div className="workspace-avatar">S</div>
          <div className="workspace-copy">
            <span className="eyebrow">WORKSPACE</span>
            <strong>Shop workspace</strong>
          </div>
          <span className="switcher-chevron" aria-hidden="true">⌄</span>
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <span className="nav-heading">YOUR SHOP</span>
          <button className={`nav-item${activeView === 'inventory' ? ' active' : ''}`} type="button" onClick={() => setActiveView('inventory')}><span className="nav-icon">▦</span>Inventory</button>
          <button className={`nav-item${activeView === 'ask' ? ' active' : ''}`} type="button" onClick={() => setActiveView('ask')}><span className="nav-icon">⌕</span>Ask your data</button>
          <button className={`nav-item${activeView === 'orders' ? ' active' : ''}`} type="button" onClick={() => setActiveView('orders')}><span className="nav-icon">↗</span>Orders</button>
          <button className={`nav-item${activeView === 'analytics' ? ' active' : ''}`} type="button" onClick={() => setActiveView('analytics')}><span className="nav-icon">▤</span>Analytics</button>

          <span className="nav-heading nav-heading-spaced">MANAGE</span>
          <button className="nav-item" type="button" onClick={() => setActiveView('inventory')}><span className="nav-icon">◇</span>Products</button>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">?</span>
            <div><strong>Need a hand?</strong><span>Visit our help center</span></div>
            <span aria-hidden="true">↗</span>
          </div>
          <div className="profile">
          <div className="profile-avatar">{user.display_name.slice(0, 2).toUpperCase()}</div>
          <div className="profile-copy"><strong>{user.display_name}</strong><span>{user.email}</span></div>
          </div>
        </div>
      </aside>

      <main className="main-content" id="inventory">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{viewTitles[activeView]}</strong></div>
          <div className="topbar-actions">
            <span className="live-indicator"><i /> Live data</span>
            <button className="icon-button notification-button" type="button" aria-label="Notifications">♧<i /></button>
            <div className="topbar-divider" />
            <div className="topbar-user"><div className="profile-avatar small">{user.display_name.slice(0, 2).toUpperCase()}</div><span>{user.display_name}</span><button className="logout-button" type="button" onClick={handleLogout}>Log out</button></div>
          </div>
        </header>

        <div className="page-content">
          {notice && <div className="success-banner" role="status"><span>✓</span>{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
          {logoutError && <div className="error-banner" role="alert"><span className="error-symbol">!</span>{logoutError}<button type="button" onClick={() => setLogoutError('')} aria-label="Dismiss error">×</button></div>}
          {activeView === 'analytics' ? <AnalyticsView /> : activeView === 'ask' ? <DataAssistant /> : activeView === 'orders' ? <OrdersView /> : (
          <>
          <section className="page-heading">
            <div>
              <div className="section-kicker"><span className="kicker-line" /> INVENTORY MANAGEMENT</div>
              <h1>Inventory</h1>
              <p className="page-subtitle">Add products, record sales, and keep an eye on the stock in your shop.</p>
            </div>
            <div className="heading-actions">
              <button className="button button-secondary" type="button" onClick={loadProducts} disabled={loading}>
                <span className="refresh-icon">↻</span> Refresh
              </button>
              <button className="button button-secondary" type="button" onClick={() => setShowRecordSale(true)} disabled={!products.length}>
                <span aria-hidden="true">↗</span> Record sale
              </button>
              <button className="button button-primary" type="button" onClick={() => setShowAddProduct(true)}>
                <span className="plus-icon">＋</span> Add product
              </button>
            </div>
          </section>

          {error && (
            <div className="error-banner" role="alert">
              <span className="error-symbol">!</span>
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button>
            </div>
          )}

          <section className="stats-grid" aria-label="Inventory summary">
            <article className="stat-card">
              <div className="stat-card-top"><span className="stat-icon icon-lavender">▦</span><span className="stat-trend neutral">Live</span></div>
              <span className="stat-label">Total products</span>
              <strong className="stat-value">{loading ? '—' : stats.skuCount}</strong>
              <span className="stat-footnote">Across your catalog</span>
            </article>
            <article className="stat-card">
              <div className="stat-card-top"><span className="stat-icon icon-mint">▤</span><span className="stat-trend positive">In stock</span></div>
              <span className="stat-label">Units in stock</span>
              <strong className="stat-value">{loading ? '—' : stats.totalUnits.toLocaleString()}</strong>
              <span className="stat-footnote">Total available units</span>
            </article>
            <article className="stat-card">
              <div className="stat-card-top"><span className="stat-icon icon-peach">$</span><span className="stat-trend neutral">At retail</span></div>
              <span className="stat-label">Inventory value</span>
              <strong className="stat-value">{loading ? '—' : formatCurrency(stats.inventoryValue)}</strong>
              <span className="stat-footnote">Based on current prices</span>
            </article>
            <article className="stat-card">
              <div className="stat-card-top"><span className="stat-icon icon-yellow">⌁</span><span className={`stat-trend ${stats.lowStock ? 'warning' : 'positive'}`}>{stats.lowStock ? 'Needs attention' : 'All healthy'}</span></div>
              <span className="stat-label">Low stock items</span>
              <strong className="stat-value">{loading ? '—' : stats.lowStock}</strong>
              <span className="stat-footnote">Products below 20 units</span>
            </article>
          </section>

          <section className="inventory-panel">
            <div className="panel-heading">
              <div>
                <h2>All products <span className="product-count">{products.length}</span></h2>
                <p>Changes are saved to your shop inventory automatically.</p>
              </div>
              <span className="stock-safety-note">Stock is protected from going below zero</span>
            </div>

            <div className="table-controls">
              <label className="search-box">
                <span className="search-icon" aria-hidden="true">⌕</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products or suppliers..." />
                <kbd>⌘ K</kbd>
              </label>
              <div className="filters">
                <label className="select-wrap">
                  <span className="sr-only">Filter by category</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {categories.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <button className="filter-button" type="button" onClick={() => { setSearch(''); setCategory('All categories') }}>
                  <span aria-hidden="true">☷</span> Filters
                </button>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="product-column">PRODUCT</th>
                    <th>CATEGORY</th>
                    <th>SUPPLIER</th>
                    <th>PRICE</th>
                    <th>STOCK LEVEL</th>
                    <th className="actions-heading">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="table-message" colSpan="6">Connecting to your inventory…</td></tr>
                  ) : filteredProducts.length ? filteredProducts.map((product, index) => {
                    const isLowStock = product.stock_count < 20
                    return (
                      <tr key={product.product_id}>
                        <td>
                          <div className="product-cell">
                            <span className={`product-art art-${index % 4}`} aria-hidden="true">{product.category === 'Produce' ? '◉' : '◒'}</span>
                            <span className="product-name-wrap"><strong>{product.product_name}</strong><span>SKU-{String(product.product_id).padStart(4, '0')}</span></span>
                          </div>
                        </td>
                        <td><span className={`category-pill category-${product.category.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{product.category}</span></td>
                        <td><span className="supplier-name"><span className="supplier-dot">{product.supplier_name.charAt(0)}</span>{product.supplier_name}</span></td>
                        <td className="price-cell">{formatCurrency(product.price)}</td>
                        <td>
                          <div className="stock-cell">
                            <div className="stock-track"><span className={isLowStock ? 'stock-fill low' : 'stock-fill'} style={{ width: `${Math.min(product.stock_count, 100)}%` }} /></div>
                            <span className="stock-number">{product.stock_count} <span>units</span></span>
                            {isLowStock && <span className="stock-warning">Low</span>}
                          </div>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="stock-action pick-action" type="button" onClick={() => adjustStock(product.product_id, -1)} disabled={updatingId === product.product_id || product.stock_count < 1} aria-label={`Remove one ${product.product_name} from stock`} title="Remove one from stock">−1</button>
                            <button className="stock-action restock-action" type="button" onClick={() => adjustStock(product.product_id, 5)} disabled={updatingId === product.product_id} aria-label={`Restock ${product.product_name} by five`} title="Add five to stock">+5</button>
                            <button className="stock-action edit-action" type="button" onClick={() => setProductToEdit(product)} aria-label={`Edit ${product.product_name}`} title="Edit product">Edit</button>
                            <button className="stock-action remove-action" type="button" onClick={() => deleteProduct(product)} aria-label={`Remove ${product.product_name}`} title="Remove product">×</button>
                          </div>
                        </td>
                      </tr>
                    )
                  }) : (
                    <tr><td className="table-message" colSpan="6">No products match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>Showing <strong>{filteredProducts.length ? 1 : 0}–{filteredProducts.length}</strong> of <strong>{filteredProducts.length}</strong> products</span>
              <div className="pagination"><button type="button" disabled aria-label="Previous page">‹</button><button type="button" className="current-page">1</button><button type="button" disabled aria-label="Next page">›</button></div>
            </div>
          </section>

          <footer className="page-footer"><span>© 2025 MarketOS</span><span><a href="#help">Help center</a><a href="#privacy">Privacy</a><a href="#status"><i /> All systems operational</a></span></footer>
          </>
          )}
        </div>
      </main>
      {showAddProduct && <AddProductDialog categories={categories.filter((item) => item !== 'All categories')} onClose={() => setShowAddProduct(false)} onSaved={handleProductCreated} />}
      {productToEdit && <AddProductDialog categories={categories.filter((item) => item !== 'All categories')} product={productToEdit} onClose={() => setProductToEdit(null)} onSaved={handleProductSaved} />}
      {showRecordSale && <RecordSaleDialog products={products} onClose={() => setShowRecordSale(false)} onRecorded={handleSaleRecorded} />}
    </div>
  )
}

export default InventoryView
