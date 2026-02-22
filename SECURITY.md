# Security Policy

## Supported Versions
This project is maintained on a best-effort basis. No formal support guarantees are provided.

## Reporting a Vulnerability
Open an issue marked as `security` or contact the maintainer privately if preferred.

## Guidelines
- The server binds to `127.0.0.1` by default and is not intended for public exposure.
- If exposing publicly, use TLS and a reverse proxy; review rate limiting and auth.
- Database is a local SQLite file; avoid committing it.
