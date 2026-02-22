# Systemd service

A sample user service unit used locally:

```
[Unit]
Description=MBTracker service (personal matched betting tracker)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/sduran/.openclaw/workspace/dev/mbtracker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=2
ProtectSystem=full
ProtectHome=read-only
PrivateTmp=true
NoNewPrivileges=true
ReadWritePaths=/home/sduran/.openclaw/workspace/dev/mbtracker /home/sduran/.openclaw/workspace/logs

[Install]
WantedBy=default.target
```

Adjust paths to your environment.
