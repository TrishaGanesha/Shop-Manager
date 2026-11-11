import { useState } from 'react'
import { formatCurrency } from './currency.js'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'
const prompts = [
  'Show all stock',
  'What items are low in stock?',
  'Show today’s customer orders',
  'What is my inventory worth?',
  'Which products need restocking?',
]

function DataAssistant() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)

  function displayValue(column, value) {
    if (value === null) return '—'
    if (
      typeof value === 'number' &&
      /price|value|total|amount/i.test(column)
    ) {
      return formatCurrency(value)
    }
    return String(value)
  }

  async function ask(value) {
    const text = value.trim()
    if (!text || sending) return
    setQuestion('')
    setMessages((current) => [...current, { type: 'question', text }])
    setSending(true)
    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to answer that question.')
      setMessages((current) => [...current, { type: 'answer', data }])
    } catch (error) {
      setMessages((current) => [...current, { type: 'error', text: error.message || 'Unable to reach the database.' }])
    } finally {
      setSending(false)
    }
  }

  function submitQuestion(event) {
    event.preventDefault()
    ask(question)
  }

  return (
    <section className="assistant-page">
      <div className="page-heading">
        <div>
          <div className="section-kicker"><span className="kicker-line" /> INVENTORY ASSISTANT</div>
          <h1>Ask your data</h1>
          <p className="page-subtitle">Ask about products, stock, and customer orders. Answers come from your SQLite database.</p>
        </div>
      </div>

      <div className="assistant-card">
        <div className="assistant-intro">
          <span className="assistant-avatar">S</span>
          <div>
          <h2>Shop assistant</h2>
          <p>Ask a question in everyday language and get an answer from your shop records.</p>
          </div>
        </div>

        {!messages.length && (
          <div className="prompt-suggestions">
            <span>TRY ASKING</span>
            <div>{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => ask(prompt)}>{prompt}<span>↗</span></button>)}</div>
          </div>
        )}

        {messages.length > 0 && (
          <div className="conversation">
            {messages.map((message, index) => message.type === 'question' ? (
              <div className="chat-question" key={`question-${index}`}><span>{message.text}</span></div>
            ) : message.type === 'error' ? (
              <div className="chat-error" role="alert" key={`error-${index}`}>{message.text}</div>
            ) : (
              <article className="chat-answer" key={`answer-${index}`}>
                <div className="answer-summary"><span className="assistant-avatar small-assistant">S</span><div><strong>{message.data.answer}</strong><span>{message.data.rows.length} {message.data.rows.length === 1 ? 'result' : 'results'}</span></div></div>
                {message.data.rows.length ? (
                  <div className="table-scroll answer-table-scroll">
                    <table className="results-table answer-table">
                      <thead><tr>{message.data.columns.map((column) => <th key={column}>{column.replaceAll('_', ' ')}</th>)}</tr></thead>
                      <tbody>{message.data.rows.map((row, rowIndex) => <tr key={rowIndex}>{message.data.columns.map((column) => <td key={column}>{displayValue(column, row[column])}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                ) : <p className="empty-results">No matching records were found.</p>}
              </article>
            ))}
            {sending && <div className="assistant-thinking"><span className="thinking-dots">•••</span> Checking your database…</div>}
          </div>
        )}

        <div className="assistant-compose">
          <form onSubmit={submitQuestion}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your stock or orders…" aria-label="Ask about inventory data" />
            <button type="submit" disabled={sending || !question.trim()} aria-label="Send question">{sending ? '…' : '↑'}</button>
          </form>
          <span>Answers are generated from saved products and orders. Try “show all stock”.</span>
        </div>
      </div>
      <p className="assistant-footnote">The answers come directly from your products and customer orders.</p>
    </section>
  )
}

export default DataAssistant
