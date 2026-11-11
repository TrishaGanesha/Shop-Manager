import { useEffect, useState } from 'react'
import { formatCurrency } from './currency.js'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

function OrdersView() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch(`${API_URL}/orders`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load orders.')
        return data
      })
      .then((data) => {
        if (active) setOrders(data)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Unable to load orders.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  return (
    <section className="orders-page">
      <div className="page-heading">
        <div>
          <div className="section-kicker"><span className="kicker-line" /> CUSTOMER ACTIVITY</div>
          <h1>Orders</h1>
          <p className="page-subtitle">Every completed sale appears here with its customer, quantity, and total.</p>
        </div>
      </div>
      <section className="inventory-panel">
        <div className="panel-heading"><div><h2>Customer orders <span className="product-count">{orders.length}</span></h2><p>Order totals are calculated from order items.</p></div></div>
        {error && <div className="query-error" role="alert">{error}</div>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>ORDER</th><th>CUSTOMER</th><th>DATE</th><th>ITEMS</th><th>TOTAL</th><th>STATUS</th></tr></thead>
            <tbody>
              {loading ? <tr><td className="table-message" colSpan="6">Loading customer orders…</td></tr> : orders.length ? orders.map((order) => (
                <tr key={order.order_id}>
                  <td><strong className="order-id">ORD-{String(order.order_id).padStart(4, '0')}</strong></td>
                  <td>{order.customer_name}</td>
                  <td>{new Date(`${order.order_date.replace(' ', 'T')}Z`).toLocaleString('en-IN')}</td>
                  <td>{order.item_count}</td>
                  <td className="price-cell">{formatCurrency(order.order_total)}</td>
                  <td><span className={`order-status status-${order.order_status}`}>{order.order_status}</span></td>
                </tr>
              )) : <tr><td className="table-message" colSpan="6">No customer orders have been recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="orders-note">Use <strong>Record sale</strong> in Inventory to add a sale. Available stock is reduced automatically.</div>
      </section>
    </section>
  )
}

export default OrdersView
