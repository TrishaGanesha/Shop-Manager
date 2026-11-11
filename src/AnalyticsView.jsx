import { useEffect, useState } from 'react'
import { formatCurrency } from './currency.js'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

function AnalyticsView() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch(`${API_URL}/analytics`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load shop insights.')
        return data
      })
      .then((data) => {
        if (active) setReport(data)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load shop insights.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const categories = report?.categories ?? []
  const maxUnits = Math.max(...categories.map((entry) => entry.total_units), 1)

  return (
    <section className="analytics-page">
      <div className="page-heading">
        <div>
          <div className="section-kicker"><span className="kicker-line" /> SHOP INSIGHTS</div>
          <h1>Analytics</h1>
          <p className="page-subtitle">A quick view of your shop, calculated from saved products and stock.</p>
        </div>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="analytics-summary">
        <article className="stat-card"><span className="stat-label">Products</span><strong className="stat-value">{loading ? '—' : report?.product_count ?? 0}</strong><span className="stat-footnote">In your shop</span></article>
        <article className="stat-card"><span className="stat-label">Units available</span><strong className="stat-value">{loading ? '—' : Number(report?.total_units ?? 0).toLocaleString()}</strong><span className="stat-footnote">Across all products</span></article>
        <article className="stat-card"><span className="stat-label">Stock value</span><strong className="stat-value">{loading ? '—' : formatCurrency(report?.inventory_value ?? 0)}</strong><span className="stat-footnote">Based on current prices</span></article>
        <article className="stat-card"><span className="stat-label">Need restocking</span><strong className="stat-value">{loading ? '—' : report?.low_stock_count ?? 0}</strong><span className="stat-footnote">Fewer than 20 units left</span></article>
      </div>
      <section className="inventory-panel analytics-panel">
        <div className="panel-heading"><div><h2>Stock by category</h2><p>See which types of products make up your available stock.</p></div></div>
        {loading ? <p className="empty-results">Loading shop insights…</p> : categories.length ? <div className="category-analytics">
          {categories.map((entry) => (
            <div className="category-analytics-row" key={entry.category}>
              <div className="category-analytics-label"><strong>{entry.category}</strong><span>{entry.product_count} {entry.product_count === 1 ? 'product' : 'products'} · {entry.total_units} units</span></div>
              <div className="analytics-bar-track"><span style={{ width: `${(entry.total_units / maxUnits) * 100}%` }} /></div>
              <strong className="analytics-value">{formatCurrency(entry.inventory_value)}</strong>
            </div>
          ))}
        </div> : <p className="empty-results">Add a product to see category insights.</p>}
      </section>
      <section className="inventory-panel analytics-panel">
        <div className="panel-heading"><div><h2>Recent shop updates</h2><p>Stock and price changes are saved automatically.</p></div></div>
        {loading ? <p className="empty-results">Loading recent updates…</p> : report?.recent_changes?.length ? (
          <div className="shop-change-list">
            {report.recent_changes.map((change, index) => (
              <div className="shop-change-row" key={`${change.change_type}-${change.change_timestamp}-${index}`}>
                <span className={`shop-change-icon ${change.change_type === 'price' ? 'price-change' : 'stock-change'}`} aria-hidden="true">
                  {change.change_type === 'price' ? '$' : '↕'}
                </span>
                <div className="shop-change-copy">
                  <strong>{change.product_name}</strong>
                  <span>{change.change_type === 'price'
                    ? `Price changed from ${formatCurrency(change.previous_value)} to ${formatCurrency(change.new_value)}`
                    : `Stock changed from ${change.previous_value} to ${change.new_value} units`}</span>
                </div>
                <time dateTime={`${change.change_timestamp.replace(' ', 'T')}Z`}>
                  {new Date(`${change.change_timestamp.replace(' ', 'T')}Z`).toLocaleString('en-IN')}
                </time>
              </div>
            ))}
          </div>
        ) : <p className="empty-results">There are no stock or price changes yet.</p>}
      </section>
    </section>
  )
}

export default AnalyticsView
