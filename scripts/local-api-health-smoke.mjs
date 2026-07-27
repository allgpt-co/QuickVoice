#!/usr/bin/env node

const options = parseArgs(process.argv.slice(2));
const apiVersion = process.env.API_VERSION || "v1";
const baseUrl = trimTrailingSlash(
  options.baseUrl ||
    process.env.API_BASE_URL ||
    process.env.SERVER_URL ||
    `http://localhost:${process.env.SERVER_PORT || "5000"}`,
);

const health = await requestJson(`/api/${apiVersion}/health`, { required: true });
if (health.body?.success !== true) {
  fail(`Health endpoint returned an unexpected response from ${health.url}`);
}
console.log(`[ok] API health passed: ${health.url}`);

const ready = await requestJson(`/api/${apiVersion}/ready`, { required: false });
if (ready.ok && ready.body?.success === true) {
  console.log(`[ok] API readiness passed: ${ready.url}`);
} else {
  const status = ready.status ? `HTTP ${ready.status}` : "unreachable";
  const message = ready.body?.message || ready.error || "Server not ready";
  const line = `[warn] API readiness check did not pass (${status}): ${message}`;
  if (options.strictReady) fail(line);
  console.log(line);
  printReadinessChecks(ready.body?.data?.checks);
}

function parseArgs(args) {
  const parsed = { baseUrl: "", strictReady: false, timeoutMs: 3000 };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--strict-ready") {
      parsed.strictReady = true;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        fail("--timeout-ms requires a positive integer value");
      }
      parsed.timeoutMs = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) fail(`Unknown option: ${arg}`);
    if (parsed.baseUrl) fail("Only one API base URL argument is supported");
    parsed.baseUrl = arg;
  }

  return parsed;
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

async function requestJson(path, { required }) {
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    const body = parseJson(text, url, required);
    if (required && !response.ok) fail(`${url} returned non-success HTTP ${response.status}`);
    return { url, ok: response.ok, status: response.status, body };
  } catch (error) {
    const message = describeRequestError(error);
    if (required) fail(`${url} ${message}`);
    return { url, ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text, url, required) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    if (required) fail(`${url} returned invalid JSON`);
    return null;
  }
}

function describeRequestError(error) {
  if (error instanceof Error && error.name === "AbortError") {
    return `timed out after ${options.timeoutMs}ms`;
  }

  const cause = error instanceof Error ? error.cause : null;
  if (cause && typeof cause === "object" && "code" in cause) {
    if (cause.code === "ECONNREFUSED") return "connection refused";
    return `request failed (${cause.code})`;
  }

  return `request failed: ${error instanceof Error ? error.message : String(error)}`;
}

function printReadinessChecks(checks) {
  if (!checks || typeof checks !== "object") return;
  for (const [name, check] of Object.entries(checks)) {
    if (!check || typeof check !== "object") continue;
    console.log(`  - ${name}: ${check.status}${check.message ? ` (${check.message})` : ""}`);
  }
}

function fail(message) {
  console.error(`[fail] ${message}`);
  process.exit(1);
}
