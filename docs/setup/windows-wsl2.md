# Windows WSL2 Setup Troubleshooting

QuickVoice's development scripts are Bash-based and are supported on Windows through WSL2, not native PowerShell or Command Prompt.

## Supported shape

- Clone the repository inside the Linux filesystem, for example `~/projects/QuickVoice`, not under `/mnt/c`.
- Run commands from an Ubuntu WSL2 shell.
- Use Docker Desktop with WSL integration enabled for the same distribution.
- Do not install a second Docker daemon inside WSL when Docker Desktop integration is already enabled.

## First checks

```sh
wsl --status
bash --version
node --version
corepack --version
task --version
docker --version
docker compose version
git rev-parse --show-toplevel
```

If `git rev-parse --show-toplevel` prints a path under `/mnt/c`, move the clone into the WSL filesystem before installing dependencies. Windows path mounts are slower and can trigger line-ending and file-watch issues.

## Docker Desktop WSL integration

1. Open Docker Desktop.
2. Go to **Settings → Resources → WSL integration**.
3. Enable integration for your Ubuntu distribution.
4. Restart the WSL shell.
5. Check from WSL:

```sh
docker info
docker compose version
```

If `docker info` cannot reach the daemon, fix Docker Desktop integration first. Do not run `sudo dockerd` in the same WSL distro unless you intentionally choose a separate Linux Docker install.

## Line endings

Scripts such as `scripts/dev-doctor.sh` must keep LF endings. If a shell script fails with a `bad interpreter` or `$'\r'` error, check Git's line-ending handling:

```sh
git config --show-origin core.autocrlf
git status --short
```

Prefer a fresh clone inside WSL with LF endings instead of editing generated files by hand.

## Port conflicts

QuickVoice defaults are listed in `.env.dev.example`: console `3000`, marketing web `3001`, API `5000`, AI API `5555`, Postgres `5432`, and Redis `6379`.

```sh
task env:dev
task doctor
```

If a port is already in use, either stop the other service or edit `.env.dev` before startup. Do not paste `.env.dev` into public issues.

## Redacted diagnostics for issues

When sharing logs, include the command, first relevant error, and tool versions. Redact cookies, authorization headers, signed URLs, phone numbers, real transcripts, and provider account IDs before posting.

Related guides: [Docker health](./docker-health.md), [provider boundaries](./provider-boundaries.md), and [safe reproduction data](../community/safe-reproduction-data.md).
