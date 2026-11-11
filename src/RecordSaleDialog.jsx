import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

function RecordSaleDialog({ products, onClose, onRecorded }) {
  const [productId, setProductId] = useState(products[0] ? String(products[0].product_id) : '')
  const [quantity, setQuantity] = useState('1')
  const [customerName, setCustomerName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedProduct = products.find((product) => String(product.product_id) === productId)

  async function submitSale(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/sales`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: Number(productId),
          quantity: Number(quantity),
          customer_name: customerName,
          email,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to record this sale.')
      onRecorded(data)
    } catch (requestError) {
      setError(requestError.message || 'Unable to record this sale.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="record-sale-title">
        <div className="dialog-heading">
          <div><span className="dialog-icon">↗</span><div><h2 id="record-sale-title">Record a sale</h2><p>Save the sale and update your available stock.</p></div></div>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        <form onSubmit={submitSale}>
          <label className="form-field">
            <span>Product</span>
            <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
              {products.map((product) => (
                <option key={product.product_id} value={product.product_id}>
                  {product.product_name} — {product.stock_count} available
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label className="form-field">
              <span>Quantity sold</span>
              <input type="number" min="1" step="1" max={selectedProduct?.stock_count ?? undefined} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
            </label>
            <label className="form-field">
              <span>Customer name (optional)</span>
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength="100" placeholder="Walk-in customer" />
            </label>
          </div>
          <label className="form-field">
            <span>Customer email (optional)</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength="254" placeholder="name@example.com" />
          </label>
          {selectedProduct && (
            <p className="field-hint">
              {selectedProduct.stock_count} available · {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(selectedProduct.price)} each
            </p>
          )}
          {error && <div className="dialog-error" role="alert">{error}</div>}
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={saving || !products.length || !productId}>
              {saving ? 'Saving…' : 'Complete sale'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default RecordSaleDialog
