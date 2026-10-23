import { pathToFileURL } from 'node:url';

const activeStatuses = new Set(['queued', 'in_progress', 'pending', 'building']);

export async function deployImage({ apiUrl, token, resourceUuid, imageTag }, {
  fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollAttempts = 180, pollIntervalMs = 10_000, readAttempts = 3, log = console.log,
} = {}) {
  if (!apiUrl || !token || !/^[a-zA-Z0-9-]+$/.test(resourceUuid ?? '') ||
      !/^.+:sha-[a-f0-9]{40}$/.test(imageTag ?? '')) throw new Error('Invalid image deployment configuration');
  const imageName = imageTag.slice(0, imageTag.lastIndexOf(':'));
  const tag = imageTag.slice(imageTag.lastIndexOf(':') + 1);
  const matchesImage = (app) => app.uuid === resourceUuid && app.docker_registry_image_name === imageName && app.docker_registry_image_tag === tag;
  async function request(path, method = 'GET', body) {
    const attempts = method === 'GET' ? readAttempts : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let retryable = method === 'GET';
      let message = `Coolify ${method} ${path} did not receive a response (network error or timeout)`;
      try {
        const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}${path}`, {
          method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          retryable = method === 'GET' && (response.status === 429 || response.status >= 500);
          message = `Coolify ${method} ${path} failed with HTTP ${response.status}`;
          await response.body?.cancel();
          throw new Error(message);
        }
        message = `Coolify ${method} ${path} returned invalid JSON`;
        return await response.json();
      } catch {
        if (!retryable || attempt + 1 === attempts) throw Object.assign(new Error(message), { retryable });
        log(`${message}; retrying read-only check (${attempt + 1}/${attempts}).`);
        await sleep(pollIntervalMs);
      }
    }
  }
  async function listDeployments() {
    // ponytail: reconciliation is limited to the ten latest deployments; paginate for busier apps.
    const history = await request(`/deployments/applications/${resourceUuid}?take=10`);
    const rows = Array.isArray(history) ? history : history?.deployments;
    if (!Array.isArray(rows)) throw new Error('Invalid Coolify application deployment history');
    return rows;
  }
  const appPath = `/applications/${resourceUuid}`;
  log(`Checking Coolify application ${resourceUuid}.`);
  const app = await request(appPath);
  if (app?.uuid !== resourceUuid) throw new Error('Unexpected Coolify application');
  const before = await listDeployments();
  const active = before.filter(row => activeStatuses.has(row.status));
  let deploymentUuid;
  if (active.length) {
    if (active.length !== 1 || active[0].docker_registry_image_tag !== tag || !matchesImage(app)) {
      throw new Error('Another or unverified deployment is active; inspect Coolify before retrying');
    }
    deploymentUuid = active[0].deployment_uuid;
  } else if (before[0]?.status === 'finished' && before[0].docker_registry_image_tag === tag && matchesImage(app) && app.status === 'running:healthy') {
    deploymentUuid = before[0].deployment_uuid;
  } else {
    log(`Configuring Coolify image ${imageTag}.`);
    try {
      await request(appPath, 'PATCH', { docker_registry_image_name: imageName, docker_registry_image_tag: tag });
    } catch {
      // The update may have been accepted before its response timed out.
      if (!matchesImage(await request(appPath))) {
        throw new Error('Image update was not confirmed; inspect Coolify before retrying. PATCH was not repeated.');
      }
    }
    log(`Requesting Coolify deployment for ${resourceUuid}.`);
    let queued;
    try {
      // Never automatically repeat an ambiguous deployment POST.
      queued = await request(`/deploy?uuid=${resourceUuid}&force=false`, 'POST');
    } catch {
      const known = new Set(before.map(row => row.deployment_uuid));
      const candidates = (await listDeployments()).filter(row =>
        !known.has(row.deployment_uuid) && row.docker_registry_image_tag === tag);
      if (candidates.length !== 1) {
        throw new Error('Deployment acknowledgment was unavailable; inspect Coolify before retrying. POST was not repeated.');
      }
      deploymentUuid = candidates[0].deployment_uuid;
    }
    if (queued) {
      const entries = queued.deployments;
      if (!Array.isArray(entries) || entries.length !== 1 || entries[0].resource_uuid !== resourceUuid) {
        throw new Error('Invalid deployment acknowledgment; inspect Coolify before retrying');
      }
      deploymentUuid = entries[0].deployment_uuid;
    }
  }
  if (!/^[a-zA-Z0-9-]+$/.test(deploymentUuid ?? '')) throw new Error('Invalid deployment identifier; inspect Coolify before retrying');
  log(`Watching Coolify deployment ${deploymentUuid} for ${imageTag}.`);
  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    let deployment, history, current;
    try {
      deployment = await request(`/deployments/${deploymentUuid}`);
      if (app.id == null) history = await listDeployments();
      if (deployment.status === 'finished') current = await request(appPath);
    } catch (error) {
      if (error.retryable === false || attempt + 1 === pollAttempts) throw error;
      log('Deployment status temporarily unavailable; retrying a read-only check.');
      await sleep(pollIntervalMs); continue;
    }
    if (history) {
      // Coolify hides numeric application IDs; verify through UUID-scoped history.
      const matches = history.filter(row => row?.deployment_uuid === deploymentUuid);
      if (matches.length !== 1 || (matches[0].application_id != null &&
          deployment.application_id != null && String(matches[0].application_id) !== String(deployment.application_id))) {
        throw new Error('Deployment does not belong to the expected application');
      }
    }
    if (deployment.deployment_uuid !== deploymentUuid || (app.id != null && String(deployment.application_id) !== String(app.id))) {
      throw new Error('Deployment does not belong to the expected application');
    }
    if (deployment.docker_registry_image_tag && deployment.docker_registry_image_tag !== tag) {
      throw new Error('Deployment image does not match the requested image');
    }
    if (['failed', 'cancelled', 'canceled', 'cancelled-by-user'].includes(deployment.status)) throw new Error(`Coolify deployment ${deployment.status}`);
    if (deployment.status === 'finished') {
      if (!matchesImage(current)) throw new Error('Deployment image changed during rollout');
      if (current.status === 'running:healthy') return { deploymentUuid, imageTag, status: 'finished' };
      // Container healthchecks can settle after Coolify marks the deploy finished.
    } else if (!activeStatuses.has(deployment.status)) {
      throw new Error('Unexpected Coolify deployment status');
    }
    await sleep(pollIntervalMs);
  }
  throw new Error('Coolify rollout did not finish healthy before the deadline');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployImage({ apiUrl: process.env.COOLIFY_API_URL, token: process.env.COOLIFY_API_TOKEN,
    resourceUuid: process.env.COOLIFY_RESOURCE_UUID, imageTag: process.env.DEPLOY_IMAGE_TAG,
  }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
