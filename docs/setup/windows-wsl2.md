# Windows Setup With WSL2 and Docker Desktop

Use this runbook when `task doctor` or `task up:dev` fails on Windows. QuickVoice's local orchestration (`Taskfile.yml` and the `scripts/dev-*.sh` helpers) is Bash-based, so the supported Windows path is an Ubuntu WSL2 distribution with Docker Desktop's WSL integration. Native PowerShell and Command Prompt are not supported for the one-command flow.

The failure modes below assume the prerequisites from the [Quick Start](../../README.md#quick-start): Bash `>=4`, Node.js `^22.23.4 || >=24.22.1`, Corepack with `pnpm@9.0.0`, Python 3, Docker with the Compose v2 plugin, and Go Task.

Commands are labeled by shell. Run `wsl` blocks in the Ubuntu WSL2 terminal and `powershell` blocks in Windows PowerShell.

## Confirm you are inside WSL2

If you typed `task up:dev` into PowerShell or Command Prompt, the failure is expected. Go Task has a Windows build, but the scripts it invokes (`scripts/dev-doctor.sh`, `scripts/dev-env.sh`, `scripts/dev-up.sh`, `scripts/dev-clear-processes.sh`) are `#!/usr/bin/env bash` programs that also read `/proc`, which does not exist on Windows.

Check where the shell is running:

```sh
# WSL: Linux kernels under WSL2 report "microsoft" or "WSL2".
uname -r

# WSL: set by WSL; empty on plain Linux and unset in PowerShell.
echo "$WSL_DISTRO_NAME"
```

From Windows, confirm the distribution runs WSL2 and not WSL1:

```powershell
# PowerShell: the VERSION column must show 2.
wsl -l -v

# PowerShell: convert a WSL1 distribution if needed, then reopen it.
wsl --set-version Ubuntu 2
```

Docker Desktop's WSL integration requires WSL2; it does not integrate with WSL1 distributions.

## Start with the built-in prerequisite check

```sh
# WSL: version checks QuickVoice requires.
bash --version          # must be >= 4
node --version          # must satisfy ^22.23.4 || >=24.22.1
python3 --version
docker compose version  # Compose v2 plugin, not legacy docker-compose
task --version

# WSL: aggregates every check above plus ports and container health.
task doctor
```

`task doctor` runs `scripts/dev-doctor.sh`. It prints `[ok]`, `[warn]`, or `[fail]` per check and exits non-zero on any `[fail]`. A `[warn]` about a port already accepting connections or Go not being installed is advisory; a `[fail]` is a blocker. The doctor never prints environment values, so its output is safe to share.

## Failure mode: Docker commands missing or the daemon is unreachable

**Symptoms in WSL:** `docker: command not found`, `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`, or `task doctor` reporting `[fail] Docker daemon is not reachable`.

**Cause:** Docker Desktop is installed on Windows but its WSL integration is off for your distribution, or Docker Desktop is not running.

**Fix:**

1. Start Docker Desktop on Windows and wait until it reports it is running.
2. In Docker Desktop, open **Settings → Resources → WSL Integration**, enable integration for your Ubuntu distribution, and choose **Apply & Restart**.
3. Verify inside WSL:

```sh
# WSL: must show a Server section; the client alone is not enough.
docker version

# WSL: prints "Docker Desktop" when the engine comes from Docker Desktop.
docker info --format '{{.OperatingSystem}}'
```

## Failure mode: a second Docker daemon inside WSL2

**Symptoms:** `docker ps` sometimes shows `quickvoice-dev-postgres` and sometimes does not; `docker compose ... up` reports the container name is already in use by a container you cannot see; port `5432` or `6379` stays busy after `task docker:down`.

**Cause:** `sudo apt-get install docker.io` was run inside WSL while Docker Desktop also serves the distribution. Two daemons keep separate containers, images, and volumes but compete for the same `127.0.0.1` port bindings.

**Do not install a second daemon** when Docker Desktop is present and integrated. The `apt-get install docker.io docker-compose-v2` line in the [Quick Start](../../README.md#quick-start) is for native Linux or for a WSL2 setup that deliberately avoids Docker Desktop. Check which engine answers before installing anything:

```sh
# WSL: "Docker Desktop" means the desktop engine; a distro name like
# "Ubuntu 24.04 LTS" means a daemon installed inside WSL is serving.
docker info --format '{{.OperatingSystem}}'

# WSL: shows whether a distribution-packaged engine is even installed.
dpkg -l docker.io docker-ce 2>/dev/null
```

A native daemon is only the right choice when Docker Desktop is not used at all. In that case, install `docker.io docker-compose-v2`, add your user to the `docker` group (`sudo usermod -aG docker "$USER"`, then reopen the shell), ensure the daemon is running (`sudo service docker start`, or systemd below), and turn Docker Desktop's WSL integration for that distribution off so exactly one engine answers.

## Failure mode: repository cloned on the Windows filesystem

**Symptoms:** `pnpm install` is extremely slow or stalls; Next.js dev servers do not hot-reload edited files; `./scripts/dev-doctor.sh: Permission denied` even though the script is executable in git; `task deps:python` fails while creating `apps/ai/.venv`.

**Cause:** the clone lives under `/mnt/c/...` (or another `/mnt/<drive>` path). Windows drives mount through a 9P/drvfs layer that is slow for many small files, does not propagate the filesystem events the dev servers watch, and does not honor Linux executable bits.

```sh
# WSL: an /mnt/<drive> prefix means the repo is on the Windows filesystem.
pwd

# WSL: drvfs or 9p filesystem types confirm the same thing.
df -T . | tail -1
```

**Fix:** clone again inside the Linux filesystem, for example `~/QuickVoice`, and rerun `task env:dev` and `task up:dev` there. In VS Code, reopen the folder through the WSL extension so the integrated terminal lands on the Linux path.

## Failure mode: CRLF line endings

**Symptoms:** `/usr/bin/env: 'bash\r': No such file or directory`, `$'\r': command not found`, or sourced env files behaving as if values had invisible trailing characters.

**Cause:** the repository only marks `*.pdf` as binary in `.gitattributes`; there is no repo-level text normalization, so your git settings decide line endings. A checkout made by Windows git with `core.autocrlf=true` writes CRLF into the Bash scripts and `*.env.dev.example` templates.

```sh
# WSL: "with CRLF line terminators" confirms the problem.
file scripts/dev-doctor.sh scripts/dev-env.sh
```

**Fix:** inside WSL, set `git config --global core.autocrlf input` (this prevents CRLF conversion on checkout), delete the clone, and clone again. Repairing in place with `git add --renormalize .` also works but leaves a large staged diff; a fresh clone from the Linux filesystem location above is cleaner.

## Failure mode: port conflicts or stale containers

**Symptoms:** `task doctor` warns that port `5432`, `6379`, `3000`, `3001`, `5000`, or `5555` is already accepting connections; `docker compose ... up` fails with `Bind for 127.0.0.1:5432 failed: port is already allocated` or `The container name "/quickvoice-dev-postgres" is already in use`.

`docker-compose.dev.yml` binds `postgres` to `127.0.0.1:${POSTGRES_PORT:-5432}`, `redis` to `127.0.0.1:${REDIS_PORT:-6379}`, `qdrant` to `127.0.0.1:6333-6334`, and the optional `mailpit` to `127.0.0.1:1025` and `127.0.0.1:8025`. The dev servers add console `3000`, web `3001`, API `5000`, and AI API `5555`. With Docker Desktop's localhost forwarding, a Windows-side Postgres, Redis, or another project can occupy the same ports and appear inside WSL.

Find the owner before changing anything:

```sh
# WSL: Linux-side listeners on the QuickVoice ports.
ss -ltn | grep -E ':(5432|6379|6333|6334|3000|3001|5000|5555|1025|8025) '

# WSL: stale or duplicated QuickVoice containers.
docker ps -a --filter name=quickvoice-dev
```

```powershell
# PowerShell: a Windows-side listener (for example a local Postgres install)
# is invisible to ss inside WSL but still claims the port.
netstat -ano | findstr :5432
```

**Fixes, least destructive first:**

- Stop a previous dev run: `task dev:clear` kills leftover `pnpm dev`, `next dev`, `tsx watch`, and `main.py api|dev` processes for this repo.
- Stop the dev containers: `task docker:down`.
- Remove one colliding container from an earlier clone: `docker rm -f quickvoice-dev-postgres`.
- Keep the conflicting service and remap QuickVoice instead: edit `.env.dev` and set `POSTGRES_PORT`, `REDIS_PORT`, `SERVER_PORT`, `CONSOLE_PORT`, `WEB_PORT`, or `AI_API_PORT` to free values, then rerun `task docker:up`.
- `task docker:reset` additionally deletes the `quickvoice_postgres_data`, `quickvoice_redis_data`, and `quickvoice_qdrant_data` volumes; it fixes corrupted-volume cases at the cost of local data.

## Failure mode: only legacy `docker-compose` is installed

**Symptoms:** `docker compose version` fails or reports no `compose` plugin, even though `docker-compose --version` prints something.

**Cause:** every QuickVoice task and script calls the Compose v2 plugin syntax (`docker compose -f docker-compose.dev.yml ...`). The hyphenated `docker-compose` v1 binary is never invoked, so a v1-only environment cannot start Postgres or Redis. Docker Desktop ships v2; the native-daemon path gets it from the `docker-compose-v2` package in the Quick Start install line.

## Failure mode: `localhost` does not reach bound services

**Symptoms:** `curl http://localhost:3000` fails or hangs while `http://127.0.0.1:3000` works; `task doctor` reports ports free but the browser cannot open the console, or the reverse.

**Causes and fixes:**

- All Compose ports and the dev servers bind `127.0.0.1`. If `localhost` resolves to `::1` first, the connection misses. Use `127.0.0.1` in checks: `curl http://127.0.0.1:5000/api/v1/health`.
- `localhostForwarding=false` in `%UserProfile%\.wslconfig` hides Windows-bound ports from WSL and WSL-bound ports from Windows. Remove the override or set it to `true`, then run `wsl --shutdown` in PowerShell and reopen the distribution.
- `networkingMode=mirrored` in `.wslconfig` changes which addresses are reachable; reproduce against the default `nat` mode before filing a setup issue.
- Image pulls or `apt-get update` timing out under a VPN or proxy is a WSL/Docker Desktop DNS issue, not a QuickVoice issue. Check `/etc/resolv.conf`, reconnect the VPN, run `wsl --shutdown`, and retry. Do not paste proxy URLs that embed credentials when reporting this.

## Failure mode: WSL2 memory limits kill installs or dev servers

**Symptoms:** `pnpm install` or a Next.js dev process exits with code `137` or `Killed`; `docker compose -f docker-compose.dev.yml --env-file .env.dev ps` shows `quickvoice-dev-postgres` or `quickvoice-dev-redis` restarting; `task up:dev` stalls partway through.

**Cause:** the WSL2 virtual machine is capped (about half of host RAM by default), and the stack runs three Node dev servers, a Python AI service, Postgres, and Redis at once. Enabling `AI_WORKER_ENABLED=true` adds the torch-based LiveKit worker on top.

```sh
# WSL: check the memory the VM actually sees.
free -h
```

**Fix:** create or edit `%UserProfile%\.wslconfig` on the Windows side, set a larger cap under `[wsl2]` (for example `memory=8GB`), run `wsl --shutdown` in PowerShell, and reopen the distribution.

## Behaviors that look broken but are not

- **`systemd` is optional with Docker Desktop.** The desktop engine does not need an init system inside WSL. It is only required for the native `docker.io` path (enable it with `[boot] systemd=true` in `/etc/wsl.conf`, then `wsl --shutdown`) or for other services you add yourself. `ps -p 1 -o comm=` prints `systemd` or `init`.
- **No GPU is required.** The AI image installs CPU-only torch from `download.pytorch.org/whl/cpu` (see `apps/ai/Dockerfile`), and `task up:dev` runs the AI API from `apps/ai/.venv`, not a container. CUDA or GPU-passthrough work is unnecessary for local development.
- **No audio devices are needed in WSL.** Call audio flows between the browser and LiveKit, not through WSL sound or USB devices. Live calls still need real LiveKit and telephony credentials; see [Setup Boundaries](../../README.md#setup-boundaries).
- **`qdrant` and `mailpit` are stopped by default.** `task docker:up` starts only `postgres` and `redis`. `mailpit` runs under the `mail` Compose profile (`task mail:up`), and `qdrant` stays down until started explicitly.

## Collect diagnostics safely

> **Redact before you paste.** Never paste the contents of `.env.dev`, `apps/server/.env.dev`, `apps/ai/.env.dev`, `apps/console/.env.local`, `apps/web/.env.local`, or any other `*.env*` file. Do not paste `printenv`, `env`, or `set` output, `docker compose config` output (it resolves variable values), or full `docker inspect` output (it embeds container environment variables). Replace tokens, keys, signed URLs, phone numbers, and email addresses with obvious placeholders, as described in [SUPPORT.md](../../SUPPORT.md).

These commands report versions and state without revealing environment values:

```sh
# WSL: safe to paste in a setup issue.
bash --version
node --version
pnpm --version
task --version
python3 --version
docker version
docker compose version
uname -r

# WSL: prints only [ok]/[warn]/[fail] check lines.
task doctor

# WSL: container names, states, and ports; no env values.
docker compose -f docker-compose.dev.yml --env-file .env.dev ps

# WSL: health status for one dev container.
docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' quickvoice-dev-postgres
docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' quickvoice-dev-redis
```

```powershell
# PowerShell: WSL version per distribution and Windows-side port owners.
wsl -l -v
netstat -ano | findstr :5432
```

Container logs can mention connection strings or handshake details, so read `docker logs --tail 50 quickvoice-dev-postgres` output before sharing and cut anything that is not part of the error.

## Still blocked

Open a [setup issue](https://github.com/allgpt-co/QuickVoice/issues/new?template=setup.yml), choose `Windows with WSL2` as the host environment, and attach the safe diagnostics above. Include the exact command that failed and the first relevant error, per [SUPPORT.md](../../SUPPORT.md).
