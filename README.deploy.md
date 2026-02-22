# Deployment (Optional)

MBTracker is intended for local use. If you need remote access, consider:

## Cloudflare Tunnel
- No open ports required
- Map local `http://127.0.0.1:5174` to a subdomain

## Caddy or Nginx
- Reverse proxy + TLS
- Restrict by IP or basic auth

## Tailscale Serve
- Private access within your tailnet

Use with caution; the app has no built-in auth.
