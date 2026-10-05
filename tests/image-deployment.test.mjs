import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deployImage } from '../.github/scripts/deploy-image.mjs';
const imageTag = `registry.example/quickvoice:sha-${'a'.repeat(40)}`;
function fixture({ status = 'finished', healthy = true, mismatch = false, failPollOnce = false, badAck = false, wrongImage = false, ambiguousPost = false, hiddenId = false, missingMembership = false, wrappedList = false, foreignUuid = false, scopedMismatch = false } = {}) {
  let polls = 0, posts = 0;
  const app = { id: 1, uuid: 'app', status: healthy ? 'running:healthy' : 'running:unhealthy', docker_registry_image_name: 'registry.example/quickvoice', docker_registry_image_tag: imageTag.split(':')[1] };
  if (hiddenId) delete app.id;
  if (foreignUuid) app.uuid = 'other';
  return {
    run: () => deployImage({ apiUrl: 'https://coolify.example/api/v1', token: 'local-test-token', resourceUuid: 'app', imageTag }, {
      pollAttempts: 2, sleep: async () => {}, fetchImpl: async (url, options) => {
        let body = wrongImage && posts > 0 ? { ...app, docker_registry_image_tag: 'sha-other' } : app;
        if (url.includes('/deployments/applications/app?')) {
          const rows = missingMembership ? [] : [{ deployment_uuid: 'deploy', application_id: scopedMismatch ? 2 : 1 }];
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
