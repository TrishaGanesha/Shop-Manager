import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

const topics = [
  {
    week: 'WEEK 1',
    name: 'Introduction to SQLite',
    description: 'Learn what SQLite is, inspect the live database, and run your first SQL query.',
    sql: `SELECT product_name, category, price, stock_count
FROM products
LIMIT 5;`,
  },
  {
    week: 'WEEK 2',
    name: 'Data types, operators & expressions',
    description: 'Explore SQLite storage types, arithmetic, comparison, and logical expressions.',
    sql: `SELECT product_name, price, stock_count,
       typeof(price) AS price_storage_type,
       price * stock_count AS inventory_value
FROM products
WHERE stock_count > 0
ORDER BY inventory_value DESC;`,
    concept: `SELECT product_name, price, stock_count,
       typeof(price) AS price_storage_type,
       price * stock_count AS inventory_value
FROM products;`,
  },
  {
    week: 'WEEK 3',
    name: 'Database & table management',
    description: 'Inspect the SQLite schema and study how databases and tables are created and managed.',
    sql: `SELECT name, sql
FROM sqlite_master
WHERE type IN ('table', 'index')
  AND name NOT LIKE 'sqlite_%'
ORDER BY type, name;`,
    concept: `-- SQLite opens a database file; ATTACH adds another database.
ATTACH DATABASE 'archive.db' AS archive;
DETACH DATABASE archive;

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  student_name TEXT NOT NULL
);

DROP TABLE students;`,
  },
  {
    week: 'WEEK 4',
    name: 'CRUD: INSERT, UPDATE & DELETE',
    description: 'Understand how records are inserted, changed, and removed. These write examples are for study; the live runner is read-only.',
    sql: `SELECT product_id, product_name, price, stock_count
FROM products
ORDER BY product_id;`,
    concept: `INSERT INTO products (product_name, category, price, stock_count, supplier_id)
VALUES ('Sample item', 'Produce', 10.00, 25, 1);

UPDATE products SET stock_count = 30 WHERE product_id = 1;
DELETE FROM products WHERE product_id = 1;`,
  },
  {
    week: 'WEEK 5',
    name: 'Data retrieval & conditions',
    description: 'Use SELECT, WHERE, DISTINCT, LIKE, IN, BETWEEN, and ORDER BY to find the data you need.',
    sql: `SELECT DISTINCT category, product_name, price, stock_count
FROM products
WHERE product_name LIKE '%a%'
  AND price BETWEEN 100 AND 300
  AND category IN ('Produce', 'Dairy')
ORDER BY price DESC;`,
  },
  {
    week: 'WEEK 6',
    name: 'Aggregate functions & grouping',
    description: 'Summarize records with COUNT, SUM, AVG, MIN, and MAX, then filter groups with HAVING.',
    sql: `SELECT category,
       COUNT(*) AS product_count,
       SUM(stock_count) AS total_stock,
       ROUND(AVG(price), 2) AS average_price,
       MIN(price) AS lowest_price,
       MAX(price) AS highest_price
FROM products
GROUP BY category
HAVING COUNT(*) > 0
ORDER BY total_stock DESC;`,
  },
  {
    week: 'WEEK 7',
    name: 'Lab Test I practice',
    description: 'Practice database basics, table management, CRUD concepts, and conditional SELECT queries.',
    sql: `SELECT category, product_name, price, stock_count
FROM products
WHERE stock_count > 0
ORDER BY category, price DESC;`,
  },
  {
    week: 'WEEK 8',
    name: 'Joins: INNER & OUTER',
    description: 'Combine related tables with INNER and LEFT JOIN, and compare rows that do not have a match.',
    sql: `SELECT p.product_name, p.category, s.supplier_name
FROM products AS p
LEFT JOIN suppliers AS s
  ON p.supplier_id = s.supplier_id
ORDER BY s.supplier_name, p.product_name;`,
  },
  {
    week: 'WEEK 8',
    name: 'Advanced joins',
    description: 'Explore self, cross, RIGHT, and FULL OUTER JOIN patterns supported by SQLite.',
    sql: `SELECT a.product_name AS product_a, b.product_name AS product_b,
       a.category
FROM products AS a
JOIN products AS b
  ON a.category = b.category
 AND a.product_id < b.product_id;`,
    concept: `-- A CROSS JOIN pairs every row from both tables.
SELECT p.product_name, s.supplier_name
FROM products AS p CROSS JOIN suppliers AS s;

-- RIGHT JOIN and FULL OUTER JOIN are supported by modern SQLite.`,
  },
  {
    week: 'WEEK 9',
    name: 'Date & time functions',
    description: 'Format timestamps and calculate date differences with SQLite date and time functions.',
    sql: `SELECT product_id, old_price, new_price,
       STRFTIME('%Y-%m-%d %H:%M', change_timestamp) AS changed_at,
       CAST(JULIANDAY('now') - JULIANDAY(change_timestamp) AS INTEGER) AS days_ago
FROM inventory_audit
ORDER BY change_timestamp DESC;`,
    concept: `SELECT DATE('now'), TIME('now'), DATETIME('now'),
       STRFTIME('%Y-%m', 'now');`,
  },
  {
    week: 'WEEK 10',
    name: 'Keys & constraints',
    description: 'Inspect primary keys, foreign keys, UNIQUE, CHECK, and NOT NULL constraints in the project schema.',
    sql: `SELECT name, sql
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('products', 'suppliers', 'orders', 'order_items')
ORDER BY name;`,
    concept: `CREATE TABLE example (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  age INTEGER CHECK (age >= 0),
  supplier_id INTEGER REFERENCES suppliers(supplier_id)
);`,
  },
  {
    week: 'WEEK 11',
    name: 'Triggers',
    description: 'See how a trigger records price changes automatically in the inventory audit table.',
    sql: `SELECT type, name, tbl_name, sql
FROM sqlite_master
WHERE type = 'trigger'
ORDER BY name;`,
    concept: `CREATE TRIGGER after_price_update
AFTER UPDATE OF price ON products
BEGIN
  INSERT INTO inventory_audit (product_id, old_price, new_price)
  VALUES (NEW.product_id, OLD.price, NEW.price);
END;`,
  },
  {
    week: 'WEEK 12',
    name: 'Integrated SQL practice',
    description: 'Bring together table relationships, joins, constraints, and summary queries in a retail database.',
    sql: `SELECT s.supplier_name, p.category,
       COUNT(*) AS product_count,
       SUM(p.stock_count) AS total_stock,
       ROUND(AVG(p.price), 2) AS average_price
FROM suppliers AS s
JOIN products AS p ON p.supplier_id = s.supplier_id
GROUP BY s.supplier_id, p.category
ORDER BY s.supplier_name, p.category;`,
  },
  {
    week: 'WEEK 13',
    name: 'Lab Test II practice',
    description: 'Practice advanced SQL, joins, keys, constraints, and triggers with a report query.',
    sql: `SELECT o.order_id, c.customer_name, o.order_status,
       COUNT(oi.order_item_id) AS item_lines,
       SUM(oi.quantity * oi.unit_price) AS order_total
FROM orders AS o
JOIN customers AS c ON c.customer_id = o.customer_id
LEFT JOIN order_items AS oi ON oi.order_id = o.order_id
GROUP BY o.order_id, c.customer_name, o.order_status
ORDER BY o.order_date DESC;`,
  },
  {
    week: 'WEEK 14',
    name: 'Mini project: retail database',
    description: 'Use the project tables to demonstrate database design, relationships, and useful reports.',
    sql: `SELECT p.product_name, s.supplier_name, p.category,
       p.price, p.stock_count,
       ROUND(p.price * p.stock_count, 2) AS stock_value
FROM products AS p
JOIN suppliers AS s ON s.supplier_id = p.supplier_id
ORDER BY stock_value DESC;`,
  },
  {
    week: 'EXTRA',
    name: 'Advanced SQL: CTEs & windows',
    description: 'Go beyond the core syllabus with common table expressions and window functions.',
    sql: `WITH category_stock AS (
  SELECT category, SUM(stock_count) AS units
  FROM products
  GROUP BY category
)
SELECT category, units,
       RANK() OVER (ORDER BY units DESC) AS stock_rank
FROM category_stock
ORDER BY stock_rank;`,
  },
  {
    week: 'EXTRA',
    name: 'Indexes & query plans',
    description: 'Learn how indexes speed up lookups and inspect the plan SQLite chooses for a query.',
    sql: `EXPLAIN QUERY PLAN
SELECT product_name, stock_count
FROM products
WHERE supplier_id = 1
ORDER BY product_name;`,
  },
]

function SqlLab() {
  const [selectedTopic, setSelectedTopic] = useState(topics[0])
  const [sql, setSql] = useState(topics[0].sql)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  function chooseTopic(topic) {
    setSelectedTopic(topic)
    setSql(topic.sql)
    setResult(null)
    setError('')
  }

  async function runQuery(event) {
    event.preventDefault()
    setRunning(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/query`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'The query could not be run.')
      }
      setResult(data)
    } catch (requestError) {
      setError(requestError.message || 'Unable to connect to the SQL backend.')
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="learning-page">
      <div className="page-heading">
        <div>
          <div className="section-kicker"><span className="kicker-line" /> SQL LEARNING</div>
          <h1>How SQL works</h1>
          <p className="page-subtitle">Follow the SQLite course topics, try queries against the project database, and inspect the results.</p>
        </div>
      </div>
      <div className="sql-layout">
        <aside className="topic-panel">
          <div className="topic-panel-heading">
            <h2>Topics</h2>
            <span>{topics.length} lessons</span>
          </div>
          <div className="topic-list">
            {topics.map((topic) => (
              <button
                type="button"
                key={topic.name}
                className={`topic-button${selectedTopic.name === topic.name ? ' selected' : ''}`}
                onClick={() => chooseTopic(topic)}
              >
                <span className="topic-number">{topic.week}</span>
                <span className="topic-name">{topic.name}</span>
              </button>
            ))}
          </div>
          <div className="sql-safety-note"><span>✓</span><p>Run examples are read-only. INSERT, UPDATE, DELETE, and table-management examples are for learning and won't change saved data.</p></div>
        </aside>

        <div className="sql-workspace">
          <article className="lesson-card">
            <span className="lesson-label">{selectedTopic.week} · CURRENT TOPIC</span>
            <h2>{selectedTopic.name}</h2>
            <p>{selectedTopic.description}</p>
          </article>
          {selectedTopic.concept && (
            <article className="concept-card">
              <div><strong>SQL syntax to study</strong><span>Example only · not run against saved data</span></div>
              <pre><code>{selectedTopic.concept}</code></pre>
            </article>
          )}
          <form className="query-card" onSubmit={runQuery}>
            <div className="query-card-heading">
              <div><span className="query-dot" /><strong>Query editor</strong><span className="sql-language">SQLite</span></div>
              <button type="button" className="reset-query" onClick={() => setSql(selectedTopic.sql)}>Reset example</button>
            </div>
            <label className="sr-only" htmlFor="sql-editor">SQL query</label>
            <textarea
              id="sql-editor"
              className="sql-editor"
              spellCheck="false"
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              placeholder="Write a SELECT query..."
            />
            <div className="query-actions">
              <span>Only read-only queries are allowed.</span>
              <button type="submit" className="button button-primary run-query" disabled={running || !sql.trim()}>
                {running ? 'Running…' : '▶ Run query'}
              </button>
            </div>
          </form>

          <section className="query-results">
            <div className="results-heading">
              <div><h2>Results</h2><span>{result ? `${result.rows.length} rows` : 'Run a query to see results'}</span></div>
              {result && <span className="results-success"><i /> Query completed</span>}
            </div>
            {error ? <div className="query-error" role="alert">{error}</div> : null}
            {result ? (
              result.columns.length ? (
                <div className="table-scroll">
                  <table className="results-table">
                    <thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>
                      {result.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>{result.columns.map((column) => <td key={column}>{row[column] === null ? <span className="null-value">NULL</span> : String(row[column])}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-results">The query ran successfully and returned no rows.</p>
            ) : !error ? <p className="empty-results">Choose a topic or write your own query, then select <strong>Run query</strong>.</p> : null}
          </section>
        </div>
      </div>
    </section>
  )
}

export default SqlLab
