import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const WEB_APP_UUID = "76d9ooqtvm1hl9tbzmza3few";
const API_URL = "https://webhook.quickintell.com/api/v1";
const activeStatuses = new Set(["queued", "in_progress", "building"]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Deploy only the established marketing app; never print raw API responses. */
export async function deployWeb({
  apiUrl,
  token,
  expectedCommit,
  fetchImpl = fetch,
  sleep = delay,
  log = console.log,
  pollAttempts = 120,
  pollIntervalMs = 10_000,
}) {
  if (apiUrl?.replace(/\/$/, "") !== API_URL || !token) {
    throw new Error("Missing credential or unexpected Coolify API URL.");
  }
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? "")) {
    throw new Error("A full expected main commit is required.");
  }

  async function request(path, method = "GET") {
    let response;
    try {
      response = await fetchImpl(`${API_URL}${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 QuickVoice-Web-Deploy",
        },
      });
    } catch {
      throw new Error(`Coolify ${method} request did not receive a response.`);
    }
    if (!response.ok) {
      throw new Error(`Coolify ${method} returned HTTP ${response.status}.`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`Coolify ${method} returned invalid JSON.`);
    }
  }

  const appPath = `/applications/${WEB_APP_UUID}`;
  const app = await request(appPath);
  const repo = app.git_repository
    ?.replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  const domains = String(app.fqdn ?? "")
    .split(",")
    .map((domain) => domain.trim().replace(/\/$/, ""));
  if (
    app.uuid !== WEB_APP_UUID ||
    repo !== "allgpt-co/QuickVoice" ||
    app.git_branch !== "main" ||
    app.git_commit_sha !== "HEAD" ||
    !domains.includes("https://quickvoice.co") ||
    app.id == null
  ) {
    throw new Error(
      "Marketing application identity or main-branch configuration does not match.",
    );
  }

  async function listDeployments() {
    const response = await request(
      `/deployments/applications/${WEB_APP_UUID}?take=10`,
    );
    const rows = Array.isArray(response) ? response : response.deployments;
    if (!Array.isArray(rows))
      throw new Error("Unexpected application deployment list.");
    return rows;
  }

  const before = await listDeployments();
  const active = before.filter((row) => activeStatuses.has(row.status));
  if (
    active.length > 1 ||
    (active.length === 1 && active[0].commit !== expectedCommit)
  ) {
    throw new Error(
      "Another marketing deployment is active; no additional deployment was requested.",
    );
  }
  let deploymentUuid = active[0]?.deployment_uuid;
  if (!deploymentUuid) {
    let queued;
    try {
      queued = await request(
        `/deploy?uuid=${WEB_APP_UUID}&force=false`,
        "POST",
      );
    } catch {
      // A timeout/502 can follow an accepted request. Reconcile once, never POST again.
      const known = new Set(before.map((row) => row.deployment_uuid));
      const candidates = (await listDeployments()).filter(
        (row) =>
          !known.has(row.deployment_uuid) && row.commit === expectedCommit,
      );
      if (candidates.length !== 1) {
        throw new Error(
          "Deployment acknowledgment was unavailable; inspect Coolify before retrying. POST was not repeated.",
        );
      }
      deploymentUuid = candidates[0].deployment_uuid;
    }
    if (queued) {
      const entries = queued.deployments;
      if (
        !Array.isArray(entries) ||
        entries.length !== 1 ||
        entries[0].resource_uuid !== WEB_APP_UUID
      ) {
        throw new Error(
          "Unexpected deployment acknowledgment; inspect Coolify before retrying.",
        );
      }
      deploymentUuid = entries[0].deployment_uuid;
    }
  }
  if (!/^[a-zA-Z0-9-]+$/.test(deploymentUuid ?? "")) {
    throw new Error(
      "Missing or invalid deployment identifier; inspect Coolify before retrying.",
    );
  }

  log(`Watching marketing deployment ${deploymentUuid} for ${expectedCommit}.`);
  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    let deployment;
    try {
      deployment = await request(`/deployments/${deploymentUuid}`);
    } catch (error) {
      if (attempt + 1 === pollAttempts) throw error;
      log(
        "Deployment status temporarily unavailable; retrying a read-only check.",
      );
      await sleep(pollIntervalMs);
      continue;
    }
    if (
      deployment.deployment_uuid !== deploymentUuid ||
      String(deployment.application_id) !== String(app.id)
    ) {
      throw new Error(
        "Deployment does not belong to the expected marketing application.",
      );
    }
    if (
      ["failed", "cancelled", "canceled", "cancelled-by-user"].includes(
        deployment.status,
      )
    ) {
      throw new Error(
        `Marketing deployment ${deploymentUuid} did not finish successfully.`,
      );
    }
    if (deployment.status === "finished") {
      if (deployment.commit !== expectedCommit)
        throw new Error(
          "Deployed commit does not match the expected main commit.",
        );
      const current = await request(appPath);
      if (current.status !== "running:healthy")
        throw new Error(
          "Deployment finished but the marketing application is not healthy.",
        );
      return { deploymentUuid, commit: deployment.commit, status: "finished" };
    }
    if (!activeStatuses.has(deployment.status))
      throw new Error("Unexpected deployment status.");
    log(`Marketing deployment ${deploymentUuid}: ${deployment.status}.`);
    await sleep(pollIntervalMs);
  }
  throw new Error(
    `Deployment ${deploymentUuid} is still pending. Inspect Coolify; no deployment was cancelled or repeated.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await deployWeb({
      apiUrl: process.env.COOLIFY_API_URL,
      token: process.env.COOLIFY_API_TOKEN,
      expectedCommit: process.env.GITHUB_SHA,
    });
    const summary = `Marketing deployment finished: ${result.deploymentUuid}\nCommit: ${result.commit}\nApplication: running:healthy\nPublic URL: https://quickvoice.co\n`;
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
