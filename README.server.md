# MBTracker Server

Express-based API server with SQLite storage using `better-sqlite3`.

## Endpoints
See main `README.md` for a quick API list. The server also performs database migrations on start.

### Bets
- `GET /api/bets?status=&from=&to=` — list
- `POST /api/bets` — create (includes odds/stake for back/lay, commission, EV, freebet flag)
- `PUT /api/bets/:id/settle` — settle with `{ result, pnl_net, ts_settled? }`
- `PUT /api/bets/:id/cancel` — cancel

## Configuration
- `PORT` env var to override the default `5174`.
- Binds to `127.0.0.1`.

## Data
- Database path: `data/mbtracker.sqlite`
- WAL mode enabled.
