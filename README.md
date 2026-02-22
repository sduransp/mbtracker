# MBTracker

A lightweight local web app to track matched betting cash flows and P&L across betting houses and exchanges.

- Backend: Node.js (Express) + SQLite (better-sqlite3)
- Frontend: Vite static app (vanilla JS + CSS)
- Scope: local-only by default (binds to 127.0.0.1)

## Features

- Houses registry (e.g., Retabet, Betfair) with metadata and active flag
- Journal of entries: deposit, withdrawal, profit, loss, bonus, fee
- Analytics views: balances per house, 30-day aggregation, and overall summary
- Health endpoints (`/api/health`, `/health`) and static web serving

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install
```bash
npm install
```

### Development
Run server + web dev:
```bash
npm run dev
```
- Server: http://127.0.0.1:5174
- Web (Vite dev): http://127.0.0.1:5173

### Build frontend
```bash
npm run build
```
Builds static assets to `web/dist/`.

### Production
```bash
npm start
```
Serves the built frontend from `web/dist/` and the API under `/api/*`.

## API Overview

Base URL: `http://127.0.0.1:5174`

- `GET /api/houses` → list houses
- `POST /api/houses` → create house `{ name, country?, notes?, active? }`
- `PUT /api/houses/:id` → update fields
- `GET /api/entries?house_id=&from=&to=` → list entries with filters
- `POST /api/entries` → create entry `{ house_id, kind, amount, currency?, ts?, ref?, notes? }`
- `GET /api/analytics/house/:id` → per-house balance + last 30-day totals
- `GET /api/analytics/summary` → table `v_house_balances` + totals
- `GET /api/health` → JSON health
- `GET /health` → plain text health

Kinds allowed: `deposit | withdrawal | profit | loss | bonus | fee`

## Data Storage

- SQLite database located at `data/mbtracker.sqlite`
- WAL mode enabled for durability/concurrency
- Schema is created/migrated on server start (see `server/index.js`)

## Project Structure

```
mbtracker/
├── server/
│   └── index.js         # Express API + static server + migrations
├── web/
│   ├── index.html       # UI entry
│   ├── main.js          # UI logic
│   ├── style.css        # Styles
│   └── ...
├── data/                # SQLite database (ignored in git)
├── package.json         # Scripts and deps
├── package-lock.json
├── .gitignore
├── LICENSE
└── README.md
```

## Systemd Service (optional)

A sample user service is configured on this machine:
```
[Unit]
Description=MBTracker service (personal matched betting tracker)
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/mbtracker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=2
ProtectSystem=full
ProtectHome=read-only
PrivateTmp=true
NoNewPrivileges=true
ReadWritePaths=/path/to/mbtracker /path/to/logs

[Install]
WantedBy=default.target
```
Adjust paths accordingly.

## Development Notes

- The app is intentionally minimal; add new endpoints or views as your workflow grows.
- For production, ensure `web/dist` is built and avoid exposing the server publicly unless behind proper TLS/reverse proxy.

## License

MIT
