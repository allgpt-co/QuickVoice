# macOS Setup

QuickVoice can run on macOS when the shell resolves to a modern Bash and the usual local-development tools are installed. macOS still ships `/bin/bash` 3.2, so verify the Bash that QuickVoice scripts will actually execute before running `task up:dev`.

The orchestration scripts use this shebang:

```sh
#!/usr/bin/env bash
```

That means macOS asks `env` to find `bash` on your `PATH`. It does **not** force `/bin/bash`. Do not replace `/bin/bash`, disable system integrity protections, or edit protected system files. Install a newer Bash and put that install location earlier on `PATH`.

## Tested Host Record

Before approving a macOS release or setup PR, record the exact host used for verification in the PR body:

- macOS version:
- CPU: Apple Silicon or Intel:
- Bash path and version:
- Docker Desktop version:
- Node.js version:
- Python version:
- Go Task version:

## Prerequisites

Install these with your preferred package manager or vendor installer:

- Bash `>=4`
- Node.js `^20.19 || ^22.13 || >=24`
- Corepack
- Python 3; Python 3.12 matches CI and the AI runtime image
- Docker Desktop with Docker Compose v2
- [Go Task](https://taskfile.dev/)

Homebrew installs command-line tools under different prefixes by CPU family:

- Apple Silicon default: `/opt/homebrew/bin`
- Intel default: `/usr/local/bin`

If you use Homebrew, make sure the matching prefix appears before `/bin` and `/usr/bin` on `PATH` in the shell that will run QuickVoice.

## Verify The Bash That Scripts Will Use

Run:

```sh
command -v bash
type -a bash
bash --version
```

Expected result:

- `command -v bash` points to a modern Bash such as `/opt/homebrew/bin/bash` or `/usr/local/bin/bash`.
- `type -a bash` lists the modern Bash before `/bin/bash`.
- `bash --version` reports version 4 or newer.

If `/bin/bash` appears first, update your shell startup file so the modern install prefix is earlier on `PATH`, then open a new terminal and rerun the checks. For example, adapt one of these to your shell and install location:

```sh
export PATH="/opt/homebrew/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
```

## Verify The Other Tools

Run these checks from the repository root or from the terminal you will use for QuickVoice:

```sh
node --version
corepack --version
python3 --version
docker --version
docker compose version
task --version
```

Then run the local preflight:

```sh
task doctor
```

`task doctor` should confirm templates, required ports, Docker Compose availability, and local service prerequisites before you start the full development stack.

## Start The Local Stack

After the prerequisite checks pass, run:

```sh
task up:dev
```

The development task creates ignored local env files from tracked templates, activates the pinned pnpm version, installs dependencies with the frozen lockfile, starts Postgres and Redis through Docker Compose, runs Prisma migrations, and launches the local services.

## Boundaries

The default local templates are for development only. They are enough for startup and health checks, but real calls, billing, OAuth, email delivery, storage, retrieval, and production deployments still require separately configured provider accounts and secrets.

Do not paste real credentials, phone numbers, recordings, transcripts, provider payloads, or customer data into setup issues or pull requests. Use synthetic local data for troubleshooting.

## Troubleshooting

### `task doctor` reports Bash 3.2

Check which Bash is first on `PATH`:

```sh
command -v bash
type -a bash
bash --version
```

Install Bash `>=4` if needed and put its directory before `/bin` in `PATH`. Open a new terminal after changing `PATH`.

### Docker Compose is missing

Install or start Docker Desktop, then verify:

```sh
docker compose version
```

QuickVoice expects the Compose v2 plugin (`docker compose`), not the legacy standalone `docker-compose` binary.

### Node or Corepack is too old

Install a supported Node.js version with a version manager or vendor package, then enable the repo-pinned pnpm through Corepack when instructed by the setup flow.

```sh
node --version
corepack --version
```

### Apple Silicon vs Intel path mismatch

If you moved machines, restored a shell profile, or installed tools under a different prefix, verify both common Homebrew locations:

```sh
ls -ld /opt/homebrew/bin /usr/local/bin 2>/dev/null || true
type -a bash node python3 task
```

Keep the prefix that actually contains your installed tools earlier on `PATH`.
