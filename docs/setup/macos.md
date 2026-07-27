# macOS Setup Troubleshooting

macOS can run QuickVoice locally when the shell resolves a modern Bash (`>=4`). The `/bin/bash` bundled with macOS is usually Bash 3.2 and is not sufficient for every orchestration script.

## Required checks

```sh
command -v bash
bash --version
node --version
corepack --version
python3 --version
docker --version
docker compose version
task --version
```

The scripts use `#!/usr/bin/env bash`, so the first `bash` on `PATH` is the one that runs. Install a current Bash with your preferred package manager and ensure it appears before `/bin/bash` on `PATH`. Do not replace `/bin/bash` or edit protected system files.

## Apple Silicon and Intel notes

- Use the Docker Desktop build matching your Mac architecture.
- Keep Node and Python from one architecture path consistently. Mixed Rosetta/native toolchains can make dependency installs harder to diagnose.
- If a command cannot find the modern Bash in a GUI terminal, open a fresh terminal after updating shell profile files.

## Start path

```sh
task doctor
task up:dev
```

`task doctor` checks the host and local Docker setup before dependency installation. It does not require production provider credentials.

## Safe failure evidence

When reporting a setup issue, share version output and the first relevant error only. Do not share environment files, cookies, authorization headers, signed URLs, phone numbers, recordings, transcripts, or provider account data.

Related guides: [Docker health](./docker-health.md), [provider boundaries](./provider-boundaries.md), and [safe reproduction data](../community/safe-reproduction-data.md).
