# Credential-Free Mailpit Email Smoke Test

Mailpit is an optional local SMTP and inbox service. It lets contributors verify that QuickVoice can send a synthetic email without contacting an external SMTP provider.

## Start Mailpit

```sh
task env:dev
task mail:up
```

The local SMTP endpoint is `localhost:1025`. The inbox UI is `http://localhost:8025`.

## Send a synthetic message

Use only local, fake content:

```sh
node -e "const net=require('node:net'); const s=net.createConnection(1025,'127.0.0.1',()=>{s.end('HELO localhost\r\nMAIL FROM:<quickvoice@example.localhost>\r\nRCPT TO:<example@localhost>\r\nDATA\r\nSubject: QuickVoice Mailpit smoke\r\n\r\nSynthetic local test only.\r\n.\r\nQUIT\r\n')})"
```

Open `http://localhost:8025` and confirm the message appears. This only validates local SMTP wiring; it does not test production email delivery, OAuth mail flows, DNS records, provider quotas, or real recipients.

## Port conflicts

If startup fails, check whether ports `1025` or `8025` are already in use. Stop the conflicting process or change the Compose mapping for local testing.

## Cleanup

```sh
task mail:down
```

Never paste real email addresses, message bodies, credentials, or provider SMTP logs into public issues. Use [safe reproduction data](../community/safe-reproduction-data.md) instead.
