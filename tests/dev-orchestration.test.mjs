import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { relative } from "node:path";
import { test } from "node:test";

const REPO_SCAN_IGNORES = new Set([".git", ".next", "dist"]);

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function isExecutable(path) {
  const file = new URL(`../${path}`, import.meta.url);
  await access(file, constants.X_OK);
  const info = await stat(file);
  return info.isFile();
}

async function* walkRepoFiles(url) {
  for (const entry of await readdir(url, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (
        !REPO_SCAN_IGNORES.has(entry.name) &&
        !entry.name.startsWith("node_modules")
      ) {
        yield* walkRepoFiles(new URL(`${entry.name}/`, url));
      }
      continue;
    }
    if (entry.isFile()) {
      yield new URL(entry.name, url);
    }
  }
}

test("Taskfile exposes one-command dev orchestration", async () => {
  const taskfile = await text("Taskfile.yml");

  for (const taskName of [
    "doctor:",
    "env:dev:",
    "deps:node:",
    "deps:python:",
    "docker:up:",
    "mail:up:",
    "mail:down:",
    "db:migrate:",
    "ci:",
    "deps:update:",
    "up:dev:",
    "dev:",
  ]) {
    assert.match(taskfile, new RegExp(`^\\s{2}${taskName}`, "m"));
  }

  assert.match(taskfile, /docker-compose\.dev\.yml/);
  assert.match(taskfile, /scripts\/dev-node-deps\.sh/);
  assert.match(taskfile, /scripts\/dev-up\.sh/);
  assert.match(taskfile, /DOTENV_CONFIG_PATH/);
  assert.match(taskfile, /pnpm ci:local/);
  assert.match(taskfile, /pnpm install --lockfile-only/);
});

test("Taskfile exposes safe Docker teardown and optional Mailpit controls", async () => {
  const taskfile = await text("Taskfile.yml");

  assert.match(
    taskfile,
    /docker:down:[\s\S]*deps:[\s\S]*- env:dev[\s\S]*docker compose -f \{\{\.COMPOSE_FILE\}\} --env-file \.env\.dev down/,
  );
  assert.match(
    taskfile,
    /docker:reset:[\s\S]*deps:[\s\S]*- env:dev[\s\S]*docker compose -f \{\{\.COMPOSE_FILE\}\} --env-file \.env\.dev down -v/,
  );
  assert.match(taskfile, /mail:up:[\s\S]*--profile mail up -d mailpit/);
  assert.match(taskfile, /mail:up:[\s\S]*http:\/\/localhost:8025/);
  assert.match(taskfile, /mail:down:[\s\S]*--profile mail stop mailpit/);
  assert.match(taskfile, /mail:down:[\s\S]*--profile mail rm -f mailpit/);
});

test("Docker Compose provides local development dependencies", async () => {
  const compose = await text("docker-compose.dev.yml");

  assert.match(compose, /^\s{2}postgres:/m);
  assert.match(compose, /postgres:16/);
  assert.match(compose, /127\.0\.0\.1:\$\{POSTGRES_PORT:-5432\}:5432/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /quickvoice-dev/);
  assert.match(compose, /^\s{2}redis:/m);
  assert.match(compose, /redis:7/);
  assert.match(compose, /127\.0\.0\.1:\$\{REDIS_PORT:-6379\}:6379/);
  assert.match(compose, /quickvoice_redis_data/);
  assert.match(compose, /^\s{2}mailpit:/m);
  assert.match(compose, /profiles:/);
});

test("development env templates exist for every runnable service", async () => {
  const templates = [
    ".env.dev.example",
    "apps/server/.env.dev.example",
    "apps/console/.env.dev.example",
    "apps/web/.env.dev.example",
    "apps/ai/.env.dev.example",
  ];

  for (const path of templates) {
    const body = await text(path);
    assert.ok(body.length > 0, `${path} should not be empty`);
    assert.doesNotMatch(body, /sk_live_|whsec_live_|AKIA[0-9A-Z]{16}/);
    if (path === ".env.dev.example") {
      assert.match(body, /AI_API_PORT=5555/);
    }
    if (path === "apps/server/.env.dev.example") {
      assert.match(body, /BETTER_AUTH_URL=http:\/\/localhost:5000/);
      assert.match(body, /TWILIO_ACCOUNT_SID=AC[0-9a-f]{32}/);
      assert.match(body, /REDIS_URL=redis:\/\/localhost:6379/);
      assert.match(body, /quickvoice:quickvoice@localhost:5432/);
    }
    if (path === "apps/ai/.env.dev.example") {
      assert.match(body, /AI_API_PORT=5555/);
    }
    if (path === "apps/console/.env.dev.example") {
      assert.match(body, /NEXT_PUBLIC_SERVER_URL=http:\/\/localhost:5000/);
    }
    if (path === "apps/web/.env.dev.example") {
      assert.match(body, /NEXT_PUBLIC_CONSOLE_URL=http:\/\/localhost:3000/);
    }
  }
});

test("app gitignores allow development env templates to be tracked", async () => {
  for (const path of [
    "apps/server/.gitignore",
    "apps/console/.gitignore",
    "apps/web/.gitignore",
  ]) {
    const body = await text(path);
    assert.match(
      body,
      /!\.env\.dev\.example/,
      `${path} should unignore .env.dev.example`,
    );
  }
});

test("dev env bootstrap preflights every source before copying", async () => {
  const script = await text("scripts/dev-env.sh");

  assert.match(script, /required_sources=\(/);
  assert.match(script, /missing=0/);
  assert.match(script, /for src in "\$\{required_sources\[@\]\}"/);
  assert.match(script, /exit 1/);
  assert.match(
    script,
    /copy_if_missing "\$ROOT\/apps\/server\/\.env\.dev\.example"/,
  );
  assert.match(
    script,
    /copy_if_missing "\$ROOT\/apps\/console\/\.env\.dev\.example"/,
  );
  assert.match(
    script,
    /copy_if_missing "\$ROOT\/apps\/web\/\.env\.dev\.example"/,
  );
  assert.match(script, /Generated files/);
  assert.match(script, /Local-only defaults/);
  assert.match(script, /External features blocked until configured/);
});

test("local dependency install is frozen by default", async () => {
  const script = await text("scripts/dev-node-deps.sh");

  assert.match(script, /INSTALL_ARGS=\("--frozen-lockfile"\)/);
  assert.match(script, /pnpm install "\$\{INSTALL_ARGS\[@\]\}"/);
});

test("doctor checks env templates, ports, Redis, and Compose health", async () => {
  const script = await text("scripts/dev-doctor.sh");

  assert.match(script, /Bash >= 4 is required/);
  assert.match(script, /Node\.js \^20\.19, \^22\.13, or >=24 is required/);
  assert.match(script, /check_env_templates/);
  assert.match(script, /check_port/);
  assert.match(script, /check_port "\$\{POSTGRES_PORT:-5432\}" "Postgres"/);
  assert.match(script, /check_port "\$\{REDIS_PORT:-6379\}" "Redis"/);
  assert.match(script, /check_redis/);
  assert.match(script, /check_compose_health/);
  assert.match(
    script,
    /docker compose -f "\$COMPOSE_FILE" --env-file "\$ENV_EXAMPLE" config/,
  );
});

test("root package exposes aggregate CI and test scripts", async () => {
  const pkg = JSON.parse(await text("package.json"));

  assert.equal(pkg.scripts.dev, "task up:dev");
  assert.equal(pkg.scripts["dev:turbo"], "turbo run dev");
  assert.match(pkg.scripts.test, /node --test tests\/\*\.test\.mjs/);
  assert.match(
    pkg.scripts.test,
    /node --test apps\/console\/tests\/\*\.test\.mjs/,
  );
  assert.match(pkg.scripts.test, /pnpm --filter server test/);
  assert.equal(
    pkg.scripts["ci:local"],
    "pnpm check:tasks && pnpm check:configs && pnpm lint && pnpm check-types && pnpm build && pnpm test && pnpm ci:python && pnpm ci:docker",
  );
  assert.equal(
    pkg.scripts["check:tasks"],
    "node scripts/verify-turbo-tasks.mjs",
  );
  assert.equal(pkg.scripts["audit:deps"], "node scripts/security-audit.mjs");
  assert.equal(pkg.engines.node, "^20.19 || ^22.13 || >=24");
});

test("Turborepo build outputs include Next and server artifacts", async () => {
  const turbo = JSON.parse(await text("turbo.json"));

  assert.deepEqual(turbo.tasks.build.outputs, [
    ".next/**",
    "!.next/cache/**",
    "dist/**",
  ]);
});

test("workspace packages expose expected Turborepo quality tasks", async () => {
  const expected = {
    "apps/server/package.json": ["build", "lint", "check-types", "test"],
    "apps/console/package.json": ["build", "lint", "check-types"],
    "apps/web/package.json": ["build", "lint", "check-types"],
  };

  for (const [path, scripts] of Object.entries(expected)) {
    const pkg = JSON.parse(await text(path));
    for (const script of scripts) {
      assert.equal(
        typeof pkg.scripts?.[script],
        "string",
        `${path} missing ${script}`,
      );
    }
  }
});

test("pnpm lockfile is the only tracked package-manager lockfile", async () => {
  const root = new URL("../", import.meta.url);
  const lockfiles = [];
  for await (const file of walkRepoFiles(root)) {
    lockfiles.push(relative(root.pathname, file.pathname));
  }

  const packageManagerLockfiles = lockfiles.filter((path) =>
    /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(
      path,
    ),
  );

  assert.deepEqual(packageManagerLockfiles.sort(), ["pnpm-lock.yaml"]);
});

test("helper scripts are executable and wired for local dev", async () => {
  for (const path of [
    "scripts/dev-doctor.sh",
    "scripts/dev-env.sh",
    "scripts/dev-node-deps.sh",
    "scripts/dev-up.sh",
  ]) {
    assert.equal(
      await isExecutable(path),
      true,
      `${path} should be executable`,
    );
  }

  const up = await text("scripts/dev-up.sh");
  assert.match(up, /pnpm dev/);
  assert.match(up, /CONSOLE_PORT/);
  assert.match(up, /WEB_PORT/);
  assert.doesNotMatch(up, /pnpm dev -- -p/);
  assert.match(up, /AI_API_ENABLED/);
  assert.match(up, /print_service_summary/);
  assert.match(up, /Enabled services/);
  assert.match(up, /Optional services disabled/);
  assert.match(up, /wait_for_http/);
  assert.match(up, /pid_names/);
  assert.match(up, /exited with status/);
  assert.match(up, /\[\$name\]/);
});
