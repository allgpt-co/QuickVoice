import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/query-cache.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const testModule = { exports: {} };
vm.runInNewContext(output, {
  exports: testModule.exports,
  module: testModule,
  require: () => ({}),
});

const { clearIdentityCache, queryCacheIdentity } = testModule.exports;

const readConsoleSource = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("query cache identity changes across users and active organizations", () => {
  assert.equal(queryCacheIdentity(undefined, true), "pending");
  assert.equal(queryCacheIdentity(null, false), "anonymous");
  assert.equal(
    queryCacheIdentity(
      { user: { id: "user-a" }, session: { activeOrganizationId: "org-a" } },
      false,
    ),
    "user:user-a:org:org-a",
  );
  assert.equal(
    queryCacheIdentity(
      { user: { id: "user-b" }, session: { activeOrganizationId: "org-a" } },
      false,
    ),
    "user:user-b:org:org-a",
  );
  assert.equal(
    queryCacheIdentity(
      { user: { id: "user-a" }, session: { activeOrganizationId: "org-b" } },
      false,
    ),
    "user:user-a:org:org-b",
  );
});

test("identity transitions clear queries and mutations together", () => {
  let clears = 0;
  clearIdentityCache({ clear: () => { clears++; } });
  assert.equal(clears, 1);
});

test("the provider and every identity-changing flow enforce the cache boundary", () => {
  const provider = readConsoleSource("providers/query-provider.tsx");
  assert.match(provider, /queryCacheIdentity\(session, isPending\)/);
  assert.match(provider, /<IdentityQueryProvider key=\{identity\}>/);

  for (const path of [
    "components/forms/auth/login-form.tsx",
    "components/shell/NavUser.tsx",
    "components/shell/OrgSwitcher.tsx",
    "components/forms/orgs/CreateOrg.tsx",
    "app/(onboarding)/orgs/page.tsx",
    "app/(auth)/accept-invitation/page.tsx",
  ]) {
    assert.match(readConsoleSource(path), /clearIdentityCache\(queryClient\)/, path);
  }
});
