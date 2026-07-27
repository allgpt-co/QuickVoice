import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SCRIPT = fileURLToPath(new URL("../scripts/local-api-health-smoke.mjs", import.meta.url));

async function withServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function runSmoke(args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: {
        PATH: process.env.PATH,
        API_VERSION: "v1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("API health smoke passes against a synthetic healthy server", async () => {
  await withServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/v1/health") {
      response.end(JSON.stringify({ success: true }));
      return;
    }
    response.statusCode = 503;
    response.end(JSON.stringify({ success: false, message: "warming up" }));
  }, async (baseUrl) => {
    const result = await runSmoke([baseUrl]);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /API health passed/);
    assert.match(result.stdout, /API readiness check did not pass/);
  });
});

test("API health smoke reports non-success health status distinctly", async () => {
  await withServer((_request, response) => {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: false }));
  }, async (baseUrl) => {
    const result = await runSmoke([baseUrl]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /returned non-success HTTP 503/);
  });
});

test("API health smoke reports invalid JSON distinctly", async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("not json");
  }, async (baseUrl) => {
    const result = await runSmoke([baseUrl]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /returned invalid JSON/);
  });
});

test("API health smoke reports timeout distinctly", async () => {
  await withServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ success: true }));
    }, 250);
  }, async (baseUrl) => {
    const result = await runSmoke([baseUrl, "--timeout-ms", "20"]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /timed out after 20ms/);
  });
});

test("API health smoke reports connection refusal distinctly", async () => {
  let releasedPort;
  await withServer((_request, response) => response.end("{}"), async (baseUrl) => {
    releasedPort = new URL(baseUrl).port;
  });

  const result = await runSmoke([`http://127.0.0.1:${releasedPort}`, "--timeout-ms", "1000"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /connection refused/);
});
