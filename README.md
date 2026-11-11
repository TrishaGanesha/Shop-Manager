# Retail Edge Inventory

A React inventory dashboard backed by Express and SQLite. It supports staff email/password accounts, rupee-denominated prices, product entry, order viewing, analytics, and an everyday-language inventory assistant.

The **Ask your data** screen accepts questions about stock and customer orders and returns matching records from SQLite. It supports all stock, a product's stock, low-stock products, category inventory, inventory value, and today's/all/pending/completed orders. Questions map to predefined SQL queries rather than executing generated SQL.

## Run locally

Use two VS Code terminals from the project root:

```bash
cd backend
npm install
npm start
```

In the second terminal:

```bash
npm install
npm run dev
```

Open the Vite URL printed in the frontend terminal (normally `http://localhost:5173`). Create a staff account on first visit. The API runs at `http://localhost:5000`; set `VITE_API_URL` in the frontend environment if it should use a different API base URL.

## API

- `POST /api/auth/register` — create a staff account
- `POST /api/auth/login` — log into an account
- `GET /api/auth/me` — current signed-in staff member
- `POST /api/auth/logout` — log out and revoke the session
- `GET /api/suppliers` — suppliers available for new products
- `GET /api/products` — inventory with supplier names
- `POST /api/products` — add a product with name, category, price, stock, and supplier
- `GET /api/orders` — customer orders with item counts and totals
- `POST /api/ask` — answer a supported natural-language inventory or order question
- `PATCH /api/products/:productId/stock` — adjust stock with a JSON body such as `{"change":-1}` or `{"change":5}`
- `POST /api/query` — run one read-only `SELECT`, `WITH`, or `EXPLAIN` query

Stock changes must be non-zero integers and cannot reduce inventory below zero.
The schema includes `customers`, `orders`, and `order_items`. Two clearly named demo customers and orders are seeded so the Orders and Ask your data screens have example records to display. The pre-existing sample product prices are migrated to INR on startup.

Passwords are stored as salted scrypt hashes. Login sessions use random, HTTP-only cookies and expire after seven days. For deployment outside local development, use HTTPS and configure a production origin allowlist.

## Frontend checks

```bash
npm run lint
npm run build
```
