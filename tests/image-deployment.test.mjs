import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deployImage } from '../.github/scripts/deploy-image.mjs';
const imageTag = `registry.example/quickvoice:sha-${'a'.repeat(40)}`;
function fixture({ status = 'finished', healthy = true, mismatch = false, failPollOnce = false, badAck = false, wrongImage = false, ambiguousPost = false, hiddenId = false, missingMembership = false, wrappedList = false, foreignUuid = false, scopedMismatch = false, intercept, historyRows, initialTag } = {}) {
  let polls = 0, posts = 0;
  const requests = [];
  const app = { id: 1, uuid: 'app', status: healthy ? 'running:healthy' : 'running:unhealthy', docker_registry_image_name: 'registry.example/quickvoice', docker_registry_image_tag: imageTag.split(':')[1] };
  if (initialTag) app.docker_registry_image_tag = initialTag;
  if (hiddenId) delete app.id;
  if (foreignUuid) app.uuid = 'other';
  return {
    run: () => deployImage({ apiUrl: 'https://coolify.example/api/v1', token: 'local-test-token', resourceUuid: 'app', imageTag }, {
      pollAttempts: 2, log: () => {}, sleep: async () => {}, fetchImpl: async (url, options) => {
        requests.push({ url, method: options.method });
        const override = await intercept?.({ url, options, app, posts, polls, requests });
        if (override) return override;
        if (options.method === 'PATCH') Object.assign(app, JSON.parse(options.body));
        let body = wrongImage && posts > 0 ? { ...app, docker_registry_image_tag: 'sha-other' } : app;
        if (url.includes('/deployments/applications/app?')) {
          const rows = historyRows ? historyRows(posts) : missingMembership || posts === 0 ? [] : [{ deployment_uuid: 'deploy', application_id: scopedMismatch ? 2 : 1 }];
          body = wrappedList ? { deployments: rows } : rows;
        }
        if (options.method === 'POST') { posts++; if (ambiguousPost) throw new Error('response lost'); body = { deployments: [{ resource_uuid: badAck ? 'other' : 'app', deployment_uuid: 'deploy' }] }; }
        if (url.endsWith('/deployments/deploy')) {
          polls++;
          if (failPollOnce && polls === 1) throw new Error('transient read failure');
          body = { deployment_uuid: 'deploy', application_id: mismatch ? 2 : 1, status };
        }
        return new Response(JSON.stringify(body), { status: 200 });
      },
    }),
    count: () => ({ polls, posts }),
    requests,
  };
}
test('image deployment succeeds only after terminal success and healthy application', async () => {
  const f = fixture({ failPollOnce: true });
  assert.equal((await f.run()).status, 'finished');
  assert.deepEqual(f.count(), { polls: 2, posts: 1 });
});
for (const options of [{ status: 'failed' }, { status: 'cancelled' }, { status: 'in_progress' }, { healthy: false }, { mismatch: true }, { badAck: true }, { wrongImage: true }, { ambiguousPost: true }]) {
  test(`image deployment rejects ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); await assert.rejects(f.run()); assert.equal(f.count().posts, 1);
  });
}

for (const wrappedList of [false, true]) {
  test(`image deployment verifies public UUID membership when numeric ID is hidden (wrapped=${wrappedList})`, async () => {
    const f = fixture({ hiddenId: true, wrappedList });
    assert.equal((await f.run()).status, 'finished');
    assert.equal(f.count().posts, 1);
  });
}
for (const options of [{ hiddenId: true, missingMembership: true }, { hiddenId: true, scopedMismatch: true }, { hiddenId: true, badAck: true }]) {
  test(`hidden application ID does not bypass deployment ownership: ${JSON.stringify(options)}`, async () => {
    await assert.rejects(fixture(options).run());
  });
}
test('wrong public application UUID fails before a deployment request', async () => {
  const f = fixture({ hiddenId: true, foreignUuid: true });
  await assert.rejects(f.run());
  assert.equal(f.count().posts, 0);
});

for (const phase of ['initial application', 'application history', 'finished health']) {
  test(`a transient ${phase} read timeout does not fail the rollout`, async () => {
    let injected = false;
    const f = fixture({
      intercept: ({ url, posts, options }) => {
        const matches = options.method === 'GET' && (
          phase === 'application history' ? url.includes('/deployments/applications/') :
          url.endsWith('/applications/app') && (phase === 'finished health' ? posts > 0 : posts === 0));
        if (matches && !injected) { injected = true; throw new DOMException('secret body must not be logged', 'TimeoutError'); }
      },
    });
    assert.equal((await f.run()).status, 'finished');
    assert.equal(injected, true);
    assert.equal(f.count().posts, 1);
  });
}

for (const status of [429, 502, 503]) {
  test(`transient HTTP ${status} on a read is retried`, async () => {
    let first = true;
    const f = fixture({ intercept: ({ options }) => {
      if (options.method === 'GET' && first) { first = false; return new Response('private upstream body', { status }); }
    } });
    assert.equal((await f.run()).status, 'finished');
    assert.equal(f.count().posts, 1);
  });
}

test('permanent authentication failure is not retried or exposed', async () => {
  const f = fixture({ intercept: () => new Response('private provider credentials', { status: 401 }) });
  await assert.rejects(f.run(), error => /GET \/applications\/app failed with HTTP 401/.test(error.message) && !error.message.includes('private'));
  assert.equal(f.requests.length, 1);
});

test('read timeout retries are bounded and identify the failing request', async () => {
  const f = fixture({ intercept: () => { throw new Error('private credentials'); } });
  await assert.rejects(f.run(), error => /GET \/applications\/app.*timeout/.test(error.message) && !error.message.includes('private credentials'));
  assert.equal(f.requests.length, 3);
  assert.equal(f.count().posts, 0);
});

test('an accepted image PATCH with a lost response is reconciled without repeating PATCH', async () => {
  const f = fixture({ initialTag: 'sha-old', intercept: ({ app, options }) => {
    if (options.method === 'PATCH') { Object.assign(app, JSON.parse(options.body)); throw new Error('response lost'); }
  } });
  assert.equal((await f.run()).status, 'finished');
  assert.equal(f.requests.filter(request => request.method === 'PATCH').length, 1);
  assert.equal(f.count().posts, 1);
});

test('an unconfirmed image PATCH stops before deploying', async () => {
  const f = fixture({ initialTag: 'sha-old', intercept: ({ options }) => {
    if (options.method === 'PATCH') throw new Error('response lost');
  } });
  await assert.rejects(f.run(), /Image update was not confirmed/);
  assert.equal(f.requests.filter(request => request.method === 'PATCH').length, 1);
  assert.equal(f.count().posts, 0);
});

const expectedTag = imageTag.slice(imageTag.lastIndexOf(':') + 1);
test('a lost deployment acknowledgment is recovered from a new application-scoped matching image', async () => {
  const f = fixture({ ambiguousPost: true, hiddenId: true, wrappedList: true,
    historyRows: posts => posts ? [{ deployment_uuid: 'deploy', application_id: 1, docker_registry_image_tag: expectedTag }] : [],
  });
  assert.equal((await f.run()).status, 'finished');
  assert.equal(f.count().posts, 1);
});

for (const candidates of [[], [{ deployment_uuid: 'old', docker_registry_image_tag: expectedTag }],
  [{ deployment_uuid: 'deploy', docker_registry_image_tag: 'sha-other' }],
  ['first', 'second'].map(deployment_uuid => ({ deployment_uuid, docker_registry_image_tag: expectedTag }))]) {
  test(`ambiguous acknowledgment fails closed with ${JSON.stringify(candidates)}`, async () => {
    const f = fixture({ ambiguousPost: true, historyRows: posts => posts ? candidates :
      [{ deployment_uuid: 'old', docker_registry_image_tag: expectedTag }] });
    await assert.rejects(f.run(), /POST was not repeated/);
    assert.equal(f.count().posts, 1);
  });
}

for (const status of ['in_progress', 'finished']) {
  test(`a retry resumes an existing ${status} deployment of the same image`, async () => {
    const f = fixture({ historyRows: () => [{ deployment_uuid: 'deploy', application_id: 1, docker_registry_image_tag: expectedTag, status }] });
    assert.equal((await f.run()).status, 'finished');
    assert.equal(f.requests.filter(request => request.method !== 'GET').length, 0);
  });
}

test('an unrelated or unknown active deployment is not overwritten', async () => {
  const f = fixture({ historyRows: () => [{ deployment_uuid: 'other', status: 'in_progress', docker_registry_image_tag: 'sha-other' }] });
  await assert.rejects(f.run(), /Another or unverified deployment is active/);
  assert.equal(f.requests.filter(request => request.method !== 'GET').length, 0);
});

test('authorization failure during polling stops rather than consuming the rollout budget', async () => {
  const f = fixture({ intercept: ({ url }) => url.endsWith('/deployments/deploy') ? new Response('{}', { status: 403 }) : undefined });
  await assert.rejects(f.run(), /GET \/deployments\/deploy failed with HTTP 403/);
  assert.equal(f.requests.filter(request => request.url.endsWith('/deployments/deploy')).length, 1);
  assert.equal(f.count().posts, 1);
});

test('resuming a same-tag deployment still verifies its application owner', async () => {
  const f = fixture({ mismatch: true, historyRows: () => [{ deployment_uuid: 'deploy', docker_registry_image_tag: expectedTag, status: 'in_progress' }] });
  await assert.rejects(f.run(), /does not belong to the expected application/);
  assert.equal(f.count().posts, 0);
});
