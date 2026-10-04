import { pathToFileURL } from 'node:url';

export async function deployImage({ apiUrl, token, resourceUuid, imageTag }, {
  fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollAttempts = 180, pollIntervalMs = 10_000,
} = {}) {
  if (!apiUrl || !token || !/^[a-zA-Z0-9-]+$/.test(resourceUuid ?? '') ||
      !/^.+:sha-[a-f0-9]{40}$/.test(imageTag ?? '')) throw new Error('Invalid image deployment configuration');
  const imageName = imageTag.slice(0, imageTag.lastIndexOf(':'));
  const tag = imageTag.slice(imageTag.lastIndexOf(':') + 1);
  async function request(path, method = 'GET', body) {
    const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Coolify ${method} failed with HTTP ${response.status}`);
    return response.json();
  }
  const appPath = `/applications/${resourceUuid}`;
  const app = await request(appPath);
  if (app?.uuid !== resourceUuid) throw new Error('Unexpected Coolify application');
  await request(appPath, 'PATCH', { docker_registry_image_name: imageName, docker_registry_image_tag: tag });
  // Never automatically repeat an ambiguous deployment POST.
  const queued = await request(`/deploy?uuid=${resourceUuid}&force=false`, 'POST');
  const entries = queued.deployments;
  if (!Array.isArray(entries) || entries.length !== 1 || entries[0].resource_uuid !== resourceUuid ||
      !/^[a-zA-Z0-9-]+$/.test(entries[0].deployment_uuid ?? '')) throw new Error('Invalid deployment acknowledgment; inspect Coolify before retrying');
  const deploymentUuid = entries[0].deployment_uuid;
  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    let deployment;
    try { deployment = await request(`/deployments/${deploymentUuid}`); }
    catch (error) {
      if (attempt + 1 === pollAttempts) throw error;
      await sleep(pollIntervalMs); continue;
    }
    if (deployment.deployment_uuid !== deploymentUuid || (app.id != null && String(deployment.application_id) !== String(app.id))) {
      throw new Error('Deployment does not belong to the expected application');
    }
    if (app.id == null) {
      // Coolify hides numeric application IDs; verify through UUID-scoped history.
      // ponytail: fail closed outside the ten latest deployments; paginate for busier apps.
      const history = await request(`/deployments/applications/${resourceUuid}?take=10`);
      const rows = Array.isArray(history) ? history : history?.deployments;
      const matches = Array.isArray(rows) ? rows.filter(row => row?.deployment_uuid === deploymentUuid) : [];
      if (matches.length !== 1 || (matches[0].application_id != null &&
          deployment.application_id != null && String(matches[0].application_id) !== String(deployment.application_id))) {
        throw new Error('Deployment does not belong to the expected application');
      }
    }
    if (['failed', 'cancelled', 'canceled', 'cancelled-by-user'].includes(deployment.status)) throw new Error(`Coolify deployment ${deployment.status}`);
    if (deployment.status === 'finished') {
      const current = await request(appPath);
      if (current.docker_registry_image_name !== imageName || current.docker_registry_image_tag !== tag) {
        throw new Error('Deployment image changed during rollout');
      }
      if (current.status === 'running:healthy') return { deploymentUuid, imageTag, status: 'finished' };
      // Container healthchecks can settle after Coolify marks the deploy finished.
    } else if (!['queued', 'in_progress', 'pending'].includes(deployment.status)) {
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
