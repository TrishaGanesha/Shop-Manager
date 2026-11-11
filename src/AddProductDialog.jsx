import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'
const commonCategories = ['Produce', 'Dairy', 'Bakery', 'Meat', 'Seafood', 'Pantry', 'Frozen', 'Beverages', 'Household']

function suggestCategory(productName) {
  const name = productName.toLowerCase()
  const suggestions = [
    [/apple|banana|fruit|vegetable|lettuce|tomato|potato|onion|spinach|produce/, 'Produce'],
    [/milk|cheese|yogurt|yoghurt|butter|cream/, 'Dairy'],
    [/bread|bun|cake|pastry|croissant|bakery/, 'Bakery'],
    [/chicken|beef|pork|lamb|meat/, 'Meat'],
    [/fish|salmon|shrimp|prawn|seafood/, 'Seafood'],
    [/frozen|ice cream/, 'Frozen'],
    [/coffee|tea|juice|water|soda|drink|beverage/, 'Beverages'],
    [/rice|pasta|cereal|flour|spice|sauce|oil|beans|lentil|snack|pantry/, 'Pantry'],
    [/soap|detergent|cleaner|tissue|household/, 'Household'],
  ]
  return suggestions.find(([pattern]) => pattern.test(name))?.[1] ?? ''
}

function AddProductDialog({ categories = [], product, onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState(() => product ? {
    product_name: product.product_name,
    category: product.category,
    price: String(product.price),
    stock_count: String(product.stock_count),
    supplier_id: String(product.supplier_id),
  } : {
    product_name: '',
    category: '',
    price: '',
    stock_count: '0',
    supplier_id: '',
  })
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inferredCategory = suggestCategory(form.product_name)
  const categorySuggestions = [...new Set([inferredCategory, ...categories, ...commonCategories])]
    .filter((suggestion) => suggestion && suggestion.toLowerCase().includes(form.category.trim().toLowerCase()))
    .slice(0, 5)

  useEffect(() => {
    let active = true
    fetch(`${API_URL}/suppliers`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load suppliers.')
        }
        return data
      })
      .then((data) => {
        if (active) {
          setSuppliers(data)
          if (!product) {
            setForm((current) => ({ ...current, supplier_id: data[0] ? String(data[0].supplier_id) : '' }))
          }
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || 'Unable to load suppliers.')
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSuppliers(false)
        }
      })
    return () => {
      active = false
    }
  }, [product])

  async function submitProduct(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/products${product ? `/${product.product_id}` : ''}`, {
        method: product ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          price: Number(form.price),
          stock_count: Number(form.stock_count),
          supplier_id: Number(form.supplier_id),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save product.')
      }
      onSaved(data.product)
    } catch (requestError) {
      setError(requestError.message || 'Unable to save product.')
    } finally {
      setSaving(false)
    }
  }

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="add-product-title">
        <div className="dialog-heading">
          <div><span className="dialog-icon">{product ? '✎' : '＋'}</span><div><h2 id="add-product-title">{product ? 'Edit product' : 'Add a product'}</h2><p>{product ? 'Update the details in your shop inventory.' : 'Add a new item to your shop inventory.'}</p></div></div>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        <form onSubmit={submitProduct}>
          <label className="form-field">
            <span>Product name</span>
            <input name="product_name" value={form.product_name} onChange={updateField} maxLength="120" placeholder="e.g. Whole grain bread" required autoFocus />
          </label>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="product-category"><span>Category</span></label>
              <input id="product-category" name="category" value={form.category} onChange={updateField} maxLength="60" placeholder="Start typing a category…" list="product-category-suggestions" required />
              <datalist id="product-category-suggestions">{categorySuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>
              {inferredCategory && <div className="category-suggestion"><span>Suggested from product name</span><button type="button" onClick={() => setForm((current) => ({ ...current, category: inferredCategory }))}>{inferredCategory} <span>＋</span></button></div>}
              {!inferredCategory && <span className="field-hint">Suggestions include your existing product categories.</span>}
            </div>
            <label className="form-field">
              <span>Supplier</span>
              <select name="supplier_id" value={form.supplier_id} onChange={updateField} required disabled={loadingSuppliers || !suppliers.length}>
                {suppliers.map((supplier) => <option key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.supplier_name}</option>)}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="form-field">
              <span>Price (₹)</span>
              <div className="input-prefix"><span>₹</span><input name="price" type="number" value={form.price} onChange={updateField} min="0.01" step="0.01" placeholder="0.00" required /></div>
            </label>
            <label className="form-field">
              <span>Available stock</span>
              <input name="stock_count" type="number" value={form.stock_count} onChange={updateField} min="0" step="1" required />
            </label>
          </div>
          {error && <div className="dialog-error" role="alert">{error}</div>}
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={saving || loadingSuppliers || !suppliers.length}>
              {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default AddProductDialog
