import test from "node:test";
import assert from "node:assert/strict";

import { buildTrustedOrigins } from "../../src/config/origins.js";

test("buildTrustedOrigins includes the console, web, and server origins", () => {
  const origins = buildTrustedOrigins({
    CONSOLE_URL: "http://localhost:3000",
    WEB_URL: "http://localhost:3001",
    SERVER_URL: "http://localhost:5000",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(origins, [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5000",
  ]);
});
