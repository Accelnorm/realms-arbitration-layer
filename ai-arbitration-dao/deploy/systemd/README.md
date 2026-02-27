# systemd deployment template

This directory contains a starter unit template for always-on seat worker operation.

## Setup

1. Copy `ai-arb-seat@.service` into `/etc/systemd/system/`.
2. Place per-seat env files in `/etc/ai-arbitration-dao/<seat-user>.env`.
3. Install project into `/opt/ai-arbitration-dao`.
4. Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ai-arb-seat@seat-claude
sudo systemctl enable --now ai-arb-seat@seat-openai
sudo systemctl enable --now ai-arb-seat@seat-minimax
```

## Expected behavior

- Automatic restart on failure.
- Structured logs in journald.
- One worker per seat user.
