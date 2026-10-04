import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import ts from "typescript";

function evaluate(source, scope = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const testModule = { exports: {} };
  vm.runInNewContext(outputText, { module: testModule, exports: testModule.exports, ...scope });
  return testModule.exports;
}
const { queryKeys } = evaluate(readFileSync(new URL("../src/lib/query-keys.ts", import.meta.url), "utf8"));
function pageSource(page) {
  return ts.createSourceFile(page, readFileSync(new URL(`../src/app/(app)/settings/${page}/page.tsx`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function queryOptions(page, index, scope) {
  const source = pageSource(page);
  const queries = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useQuery") queries.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return evaluate(`module.exports = (${queries[index].getText(source)});`, { queryKeys, ...scope });
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
for (const [page, index] of [["api-keys", 0], ["organization", 0], ["organization", 1], ["roles", 0], ["organization", 2]]) {
  test(`${page} query ${index}: late org A response cannot replace org B`, async (t) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    t.after(() => client.clear());
    const pending = new Map();
    const request = (input) => new Promise((resolve) => pending.set(input.query?.organizationId ?? input.organizationId, resolve));
    const api = { list: request, getFullOrganization: request, listRoles: request, hasPermission: request };
    const options = (id) => queryOptions(page, index, {
      orgId: id, activeOrgId: id, currentUserId: "user-1",
      authClient: { apiKey: api, organization: api },
      roleApi: () => api, toRoleList: (data) => data,
    });
    const observer = new QueryObserver(client, options("org-A"));
    t.after(observer.subscribe(() => {}));
    assert.ok(pending.has("org-A"));
    observer.setOptions(options("org-B"));
    assert.equal(observer.getCurrentResult().data, undefined);
    const response = (id) => page === "api-keys" ? { data: { apiKeys: [{ id }] } }
      : index === 2 ? { data: { success: id === "org-A" } }
      : page === "organization" && index === 0 ? { data: { id, members: [{ id }] } }
      : { data: [{ id, role: id }] };
    pending.get("org-B")(response("org-B"));
    await flush();
    const current = observer.getCurrentResult().data;
    assert.notEqual(current, undefined);
    pending.get("org-A")(response("org-A"));
    await flush();
    assert.deepEqual(observer.getCurrentResult().data, current);
    assert.notDeepEqual(client.getQueryData(options("org-A").queryKey), current);
    observer.setOptions(options(null));
    assert.equal(observer.getCurrentResult().data, undefined);
  });
}

test("invite roles and resend guard follow membership and server permission", () => {
  const source = pageSource("organization");
  const statements = [];
  function visit(node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ["isOwner", "inviteRoles"].includes(d.name.getText(source)))) statements.push(node.getText(source));
    if (ts.isFunctionDeclaration(node) && node.name?.text === "canInviteRole") statements.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const role of ["member", "admin", "custom-inviter", "owner", "admin, owner"]) {
    for (const canInvite of [false, true]) {
      const result = evaluate(`${statements.join("\n")}\nmodule.exports = { inviteRoles, canInviteRole };`, {
        members: [{ user: { id: "user-1" }, role }], currentUserId: "user-1", canInvite,
        roles: ["member", "admin", "owner", "custom-inviter"],
      });
      const owner = role.includes("owner");
      assert.equal(result.inviteRoles.includes("owner"), owner);
      assert.equal(result.canInviteRole("member"), canInvite);
      assert.equal(result.canInviteRole("owner"), canInvite && owner);
      assert.equal(result.canInviteRole("member, owner"), canInvite && owner);
    }
  }
});

test("invitation permission fails closed on service failure or missing plugin", async () => {
  for (const organization of [{}, { hasPermission: async () => ({ error: { message: "Denied" } }) }]) {
    const options = queryOptions("organization", 2, { orgId: "org-1", currentUserId: "user-1", authClient: { organization } });
    if (organization.hasPermission) await assert.rejects(options.queryFn, /Denied/);
    else assert.equal(await options.queryFn(), false);
  }
});
