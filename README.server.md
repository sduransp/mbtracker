# MBTracker Server

Express-based API server with SQLite storage using `better-sqlite3`.

## Endpoints
See main `README.md` for a quick API list. The server also performs database migrations on start.

## Configuration
- `PORT` env var to override the default `5174`.
- Binds to `127.0.0.1`.

## Data
- Database path: `data/mbtracker.sqlite`
- WAL mode enabled.
