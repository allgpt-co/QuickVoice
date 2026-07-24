# Mailpit Local Email Smoke Test

Mailpit runs as an optional Docker Compose profile in QuickVoice. This guide walks through a credential-free smoke test: start the service, send a synthetic message, verify it in the Mailpit UI, and shut down cleanly.

The smoke test never contacts an external SMTP service and requires no real names, addresses, tokens, or customer content.

## Prerequisites

- Docker with Compose v2 (already required by `task up:dev`)
- [Go Task](https://taskfile.dev/) (`task` binary on `PATH`)

No additional packages are needed. The examples use Python's standard-library `smtplib`, which is already available since QuickVoice requires Python 3.

## Start Mailpit

```sh
task mail:up
```

This starts the Mailpit container with two local-only bindings:

| Port | Service | URL |
|------|---------|-----|
| `1025` | SMTP (receive) | `localhost:1025` |
| `8025` | Web UI | `http://localhost:8025` |

The ports are bound to `127.0.0.1` only — nothing listens on external interfaces.

## Send A Synthetic Test Message

Use Python's `smtplib` to deliver a test message to Mailpit's local SMTP endpoint. The server config defaults already point at `localhost:1025` with dev credentials, so no auth overrides are needed.

Create a temporary script or run in the Python REPL:

**Option A — one-liner in the REPL:**

```sh
python3 -c "
import smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg['From'] = 'no-reply@localhost'
msg['To'] = 'example@localhost'
msg['Subject'] = 'Mailpit smoke test'
msg.set_content('This message confirms local email delivery works without real credentials.')

with smtplib.SMTP('localhost', 1025) as s:
    s.send_message(msg)
print('Sent — check http://localhost:8025')
"
```

**Option B — save as a script and run:**

```sh
cat > /tmp/mailpit-smoke-test.py << 'PYEOF'
import smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg["From"] = "no-reply@localhost"
msg["To"] = "example@localhost"
msg["Subject"] = "Mailpit smoke test"
msg.set_content(
    "This message confirms local email delivery works without real credentials."
)

with smtplib.SMTP("localhost", 1025) as s:
    s.send_message(msg)

print("Sent — open http://localhost:8025 to confirm delivery.")
PYEOF

python3 /tmp/mailpit-smoke-test.py
```

## Verify In The Mailpit UI

Open `http://localhost:8025` in a browser. You should see one message from `no-reply@localhost` to `example@localhost` with the subject "Mailpit smoke test."

Click into the message to inspect the full content, headers, and MIME parts.

## What Cannot Be Tested Without Real Credentials

The smoke test proves that Mailpit accepts and stores locally delivered messages. It does **not** cover:

- **Live email delivery** — sending mail to real addresses (`@gmail.com`, custom domains) requires a configured SMTP provider (ZeptoMail, SendGrid, SES, etc.) with valid credentials in `apps/server/.env.dev`.
- **App-initiated email flows** — the QuickVoice server sends verification, password-reset, and invite emails through its configured SMTP transport. Those flows need the server running and real SMTP credentials set.
- **OAuth-bound email addresses** — Google OAuth login uses the provider's identity rather than QuickVoice's SMTP, so it is outside this smoke test.
- **Bounce handling, SPF/DKIM, and deliverability** — these depend on DNS configuration and the chosen production mail provider.

## Cleanup

```sh
task mail:down
```

This stops and removes the Mailpit container. Messages stored in memory are discarded.

## Failure Guidance

### Port 1025 already in use

Another process is listening on the SMTP port. Check with:

```sh
ss -tlnp | grep 1025
lsof -i :1025
```

Stop the conflicting process or change QuickVoice's `SMTP_PORT` in `apps/server/.env.dev` to a free port, then update the Mailpit port binding in `docker-compose.dev.yml` to match.

### Port 8025 already in use

Another process is listening on the Mailpit UI port. Check with:

```sh
ss -tlnp | grep 8025
lsof -i :8025
```

Stop the conflicting process or change the exposed port mapping in `docker-compose.dev.yml` (e.g. `"127.0.0.1:8026:8025"`).

### Connection refused on localhost:1025

Mailpit is not running. Re-run `task mail:up` and confirm the container started:

```sh
docker compose -f docker-compose.dev.yml --env-file .env.dev --profile mail ps
```

### Mailpit UI loads but does not show the test message

The SMTP delivery may have failed silently. Re-run the Python script and watch for exceptions. If the script prints "Sent" without errors, refresh the Mailpit UI — the message list does not auto-update on all browsers.
