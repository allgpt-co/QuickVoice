# QuickVoice Dev Container

This Dev Container is an optional contributor environment for Linux, macOS, WSL2, Codespaces, or another host that can run Docker-backed development containers. It does not embed provider credentials and does not start the full application automatically.

## What it installs

- Node.js 24, which satisfies the repository requirement of `>=20.9`.
- Python 3.12, matching the AI runtime and CI path.
- Go, used to install Go Task.
- Docker CLI access through the host Docker engine.
- `pnpm@9.0.0` through Corepack.
- Go Task through `go install github.com/go-task/task/v3/cmd/task@latest`.

## Host assumptions

- The host can run Dev Containers and Docker.
- Docker Desktop users should enable WSL integration when launching from WSL2.
- The container uses the host Docker engine; it does not provide production isolation or credentials.
- Allocate enough CPU, memory, and disk for Node dependencies, the AI Python virtualenv, Postgres, Redis, and Docker image builds if you choose to run them.

## First command

The post-create step runs `task doctor` only. To start the stack manually, run:

```sh
task up:dev
```

Provider-backed flows still require your own LiveKit, telephony, model, billing, storage, email, and OAuth credentials. See [provider boundaries](../docs/setup/provider-boundaries.md).
