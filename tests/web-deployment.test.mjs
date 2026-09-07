import assert from "node:assert/strict";
import { test } from "node:test";
import { deployWeb, WEB_APP_UUID } from "../.github/scripts/deploy-web.mjs";

const apiUrl = "https://webhook.quickintell.com/api/v1";
const token = "test-only-coolify-token";
const expectedCommit = "a".repeat(40);
const oldCommit = "b".repeat(40);
const deploymentUuid = "web-deployment-123";
const applicationPath = `/api/v1/applications/${WEB_APP_UUID}`;
const listPath = `/api/v1/deployments/applications/${WEB_APP_UUID}`;
const deployPath = "/api/v1/deploy";
const statusPath = `/api/v1/deployments/${deploymentUuid}`;

function application(overrides = {}) {
  return {
    id: 47,
    uuid: WEB_APP_UUID,
    git_repository: "allgpt-co/QuickVoice",
    git_branch: "main",
    git_commit_sha: "HEAD",
    fqdn: "https://quickvoice.co,https://www.quickvoice.co",
    status: "running:healthy",
    ...overrides,
  };
}

function deployment(overrides = {}) {
  return {
    deployment_uuid: deploymentUuid,
    application_id: 47,
    commit: expectedCommit,
    status: "finished",
    ...overrides,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fixture(handler = () => undefined) {
  const calls = [];
  const logs = [];
  const sleeps = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    const method = (
      init.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const call = { url, method, init };
    calls.push(call);
    const customResponse = await handler(call, calls);
    if (customResponse !== undefined) return customResponse;
    if (method === "GET" && url.pathname === applicationPath)
      return json(application());
    if (method === "GET" && url.pathname === listPath) return json([]);
    if (method === "POST" && url.pathname === deployPath) {
      return json({
        deployments: [
          { resource_uuid: WEB_APP_UUID, deployment_uuid: deploymentUuid },
        ],
      });
    }
    if (method === "GET" && url.pathname === statusPath)
      return json(deployment());
    throw new Error(`Unexpected mock request: ${method} ${url.pathname}`);
  };
  return {
    calls,
    logs,
    sleeps,
    run: (overrides = {}) =>
      deployWeb({
        apiUrl,
        token,
        expectedCommit,
        fetchImpl,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        log: (...values) => {
          logs.push(values.join(" "));
        },
        pollAttempts: 3,
        pollIntervalMs: 1,
        ...overrides,
      }),
  };
}

function posts(context) {
  return context.calls.filter((call) => call.method === "POST");
}

test("web deployment validates the target, queues once, and verifies the finished revision and health", async () => {
  let polls = 0;
  const context = fixture(({ url }) => {
    if (url.pathname === statusPath) {
      polls += 1;
      return json(
        deployment({ status: polls === 1 ? "in_progress" : "finished" }),
      );
    }
  });

  assert.deepEqual(await context.run(), {
    deploymentUuid,
    commit: expectedCommit,
    status: "finished",
  });
  assert.equal(posts(context).length, 1);
  assert.equal(posts(context)[0].url.searchParams.get("uuid"), WEB_APP_UUID);
  assert.equal(posts(context)[0].url.searchParams.get("force"), "false");
  assert.equal(
    context.calls.filter(({ url }) => url.pathname === applicationPath).length,
    2,
  );
  assert.equal(polls, 2);
  assert.deepEqual(context.sleeps, [1]);
  assert.ok(
    context.calls.every(
      ({ url, init }) =>
        url.origin === "https://webhook.quickintell.com" &&
        new Headers(init.headers).get("Authorization") === `Bearer ${token}`,
    ),
  );
  assert.ok(!context.logs.join("\n").includes(token));
});

test("invalid API origin, revision, or missing credential fails before any request", async (t) => {
  for (const overrides of [
    { apiUrl: "https://example.com/api/v1" },
    { apiUrl: "https://webhook.quickintell.com.example.com/api/v1" },
    { expectedCommit: "main" },
    { expectedCommit: "a".repeat(39) },
    { token: "" },
  ]) {
    await t.test(JSON.stringify(overrides), async () => {
      const context = fixture();
      await assert.rejects(context.run(overrides));
      assert.equal(context.calls.length, 0);
    });
  }
});

test("a different application, repository, branch, pinned revision, or misleading domain cannot be deployed", async (t) => {
  for (const overrides of [
    { uuid: "another-application" },
    { git_repository: "another-owner/QuickVoice" },
    { git_branch: "feature-branch" },
    { git_commit_sha: oldCommit },
    { fqdn: "https://quickvoice.co.example.com" },
  ]) {
    await t.test(JSON.stringify(overrides), async () => {
      const context = fixture(({ url }) =>
        url.pathname === applicationPath
          ? json(application(overrides))
          : undefined,
      );
      await assert.rejects(context.run());
      assert.equal(posts(context).length, 0);
    });
  }
});

test("authentication failure aborts before deployment and does not echo response bodies or credentials", async () => {
  const privateBody = `private-response ${token}`;
  const context = fixture(() => new Response(privateBody, { status: 401 }));
  await assert.rejects(context.run(), (error) => {
    assert.ok(!error.message.includes(privateBody));
    assert.ok(!error.message.includes(token));
    return true;
  });
  assert.equal(posts(context).length, 0);
  assert.ok(!context.logs.join("\n").includes(privateBody));
  assert.ok(!context.logs.join("\n").includes(token));
});

test("an active deployment of another revision blocks a second queue request", async (t) => {
  for (const status of ["queued", "in_progress", "building"]) {
    await t.test(status, async () => {
      const context = fixture(({ url }) =>
        url.pathname === listPath
          ? json({ deployments: [deployment({ status, commit: oldCommit })] })
          : undefined,
      );
      await assert.rejects(context.run());
      assert.equal(posts(context).length, 0);
    });
  }
});

test("an existing active deployment of the expected revision is monitored without another POST", async () => {
  const context = fixture(({ url }) =>
    url.pathname === listPath
      ? json({ deployments: [deployment({ status: "in_progress" })] })
      : undefined,
  );
  assert.deepEqual(await context.run(), {
    deploymentUuid,
    commit: expectedCommit,
    status: "finished",
  });
  assert.equal(posts(context).length, 0);
});

test("an ambiguous POST is reconciled to exactly one new deployment of the expected revision", async () => {
  let lists = 0;
  const context = fixture(({ url, method }) => {
    if (url.pathname === listPath) {
      lists += 1;
      return json(lists === 1 ? [] : [deployment({ status: "queued" })]);
    }
    if (method === "POST") throw new Error("upstream connection closed");
  });
  assert.deepEqual(await context.run(), {
    deploymentUuid,
    commit: expectedCommit,
    status: "finished",
  });
  assert.equal(posts(context).length, 1);
  assert.equal(lists, 2);
});

test("an ambiguous POST is never retried when a unique matching new deployment cannot be established", async (t) => {
  for (const records of [
    [],
    [deployment({ commit: oldCommit })],
    [deployment(), deployment({ deployment_uuid: "another-new-deployment" })],
  ]) {
    await t.test(
      `${records.length} candidates: ${records.map(({ commit }) => commit).join(",")}`,
      async () => {
        let lists = 0;
        const privateBody = `gateway debug: ${token}`;
        const context = fixture(({ url, method }) => {
          if (url.pathname === listPath) {
            lists += 1;
            return json(lists === 1 ? [] : records);
          }
          if (method === "POST")
            return new Response(privateBody, { status: 502 });
        });
        await assert.rejects(context.run(), (error) => {
          assert.ok(!error.message.includes(privateBody));
          assert.ok(!error.message.includes(token));
          return true;
        });
        assert.equal(posts(context).length, 1);
        assert.equal(lists, 2);
        assert.ok(!context.logs.join("\n").includes(token));
      },
    );
  }
});

test("an old matching deployment cannot be mistaken for acknowledgement of an ambiguous POST", async () => {
  const context = fixture(({ url, method }) => {
    if (url.pathname === listPath) return json([deployment()]);
    if (method === "POST") throw new Error("connection lost");
  });
  await assert.rejects(context.run());
  assert.equal(posts(context).length, 1);
});

test("polling rejects foreign application or deployment identifiers", async (t) => {
  for (const overrides of [
    { application_id: 48 },
    { deployment_uuid: "foreign-deployment" },
  ]) {
    await t.test(JSON.stringify(overrides), async () => {
      const context = fixture(({ url }) =>
        url.pathname === statusPath ? json(deployment(overrides)) : undefined,
      );
      await assert.rejects(context.run());
      assert.equal(posts(context).length, 1);
    });
  }
});

test("failed, cancelled, wrong-revision, and unhealthy deployments never report success", async (t) => {
  for (const overrides of [
    { status: "failed" },
    { status: "cancelled" },
    { status: "cancelled-by-user" },
    { commit: oldCommit },
  ]) {
    await t.test(JSON.stringify(overrides), async () => {
      const context = fixture(({ url }) =>
        url.pathname === statusPath ? json(deployment(overrides)) : undefined,
      );
      await assert.rejects(context.run());
      assert.equal(posts(context).length, 1);
    });
  }
  await t.test("unhealthy application after finished deployment", async () => {
    let applicationReads = 0;
    const context = fixture(({ url }) => {
      if (url.pathname === applicationPath) {
        applicationReads += 1;
        return json(
          application({
            status:
              applicationReads === 1 ? "running:healthy" : "running:unhealthy",
          }),
        );
      }
    });
    await assert.rejects(context.run());
    assert.equal(applicationReads, 2);
  });
});

test("an unfinished deployment exhausts bounded polling without queueing another deployment", async () => {
  const context = fixture(({ url }) =>
    url.pathname === statusPath
      ? json(deployment({ status: "in_progress" }))
      : undefined,
  );
  await assert.rejects(context.run());
  assert.equal(
    context.calls.filter(({ url }) => url.pathname === statusPath).length,
    3,
  );
  assert.equal(posts(context).length, 1);
});
