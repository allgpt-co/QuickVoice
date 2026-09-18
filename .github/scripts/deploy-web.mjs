import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const WEB_APP_UUID = "76d9ooqtvm1hl9tbzmza3few";
export const SERVER_APP_UUID = "udefnayjdhyb2ketfxrbvwdq";
const API_URL = "https://webhook.quickintell.com/api/v1";
const activeStatuses = new Set(["queued", "in_progress", "building"]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Deploy only the established marketing app; never print raw API responses. */
export async function deployWeb({
  apiUrl,
  token,
  expectedCommit,
  flagUpdates = {},
  prerequisitesVerified = false,
  expectedReceiverCommit,
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
  const allowedFlags = new Set(["CONTACT_ATTRIBUTION_ENABLED", "NEXT_PUBLIC_GA_MANUAL_PAGEVIEWS"]);
  const updates = Object.entries(flagUpdates).filter(([, value]) => value !== "preserve");
  if (Object.keys(flagUpdates).some((key) => !allowedFlags.has(key)) ||
      updates.some(([, value]) => !["enable", "disable"].includes(value))) {
    throw new Error("Only the two documented SEO rollout flags can be changed.");
  }
  if (updates.some(([, value]) => value === "enable") && prerequisitesVerified !== true) {
    throw new Error("Verify the compatible receiver / GA history setting before enabling rollout flags.");
  }
  if (flagUpdates.CONTACT_ATTRIBUTION_ENABLED === "enable" &&
      !/^[a-f0-9]{40}$/.test(expectedReceiverCommit ?? "")) {
    throw new Error("Contact activation requires the full compatible API revision.");
  }

  async function request(path, method = "GET", body) {
    let response;
    try {
      response = await fetchImpl(`${API_URL}${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          "User-Agent": "Mozilla/5.0 QuickVoice-Web-Deploy",
        },
      });
    } catch {
      throw new Error(`Coolify ${method} request did not receive a response.`);
    }
    if (!response.ok) {
      // Report a bounded classification, never the raw body or environment data.
      let reason = "";
      if (response.status === 403) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("json")) {
          const body = await response.json().catch(() => ({}));
          const message = String(body?.message ?? "").toLowerCase();
          reason = /ip|allowlist/.test(message) ? " (API network restriction)" :
            /permission|ability|abilities|scope/.test(message) ? " (API permission restriction)" : " (API forbidden)";
        } else reason = " (non-JSON access denial)";
      }
      throw new Error(`Coolify ${method} returned HTTP ${response.status}${reason}.`);
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
  if (updates.length && active.length) {
    throw new Error("Wait for the active deployment before changing rollout flags.");
  }
  if (
    active.length > 1 ||
    (active.length === 1 && active[0].commit !== expectedCommit)
  ) {
    throw new Error(
      "Another marketing deployment is active; no additional deployment was requested.",
    );
  }
  if (updates.length) {
    const envPath = `${appPath}/envs`;
    const readFlags = async () => {
      const rows = await request(envPath);
      if (!Array.isArray(rows)) throw new Error("Unexpected environment-variable response.");
      return rows.filter((row) => row.is_preview === false || row.is_preview === 0);
    };
    let variables = await readFlags();
    if (flagUpdates.CONTACT_ATTRIBUTION_ENABLED === "enable") {
      const serverPath = `/applications/${SERVER_APP_UUID}`;
      const server = await request(serverPath);
      const history = await request(`/deployments/applications/${SERVER_APP_UUID}?take=10`);
      const deployments = Array.isArray(history) ? history : history.deployments;
      if (server.uuid !== SERVER_APP_UUID || server.status !== "running:healthy" ||
          server.docker_registry_image_tag !== `sha-${expectedReceiverCommit}` ||
          !String(server.docker_registry_image_name).endsWith("/allgpt-co/quickvoice-server") ||
          !Array.isArray(deployments) || deployments.length === 0 ||
          deployments.some((row) => activeStatuses.has(row.status)) ||
          deployments[0].status !== "finished") {
        throw new Error("Compatible API revision is not confirmed healthy with a finished deployment.");
      }
      const serverVariables = await request(`${serverPath}/envs`);
      if (!Array.isArray(serverVariables)) throw new Error("Unexpected receiver environment response.");
      const value = (rows, key) => {
        const matches = rows.filter((row) => row.key === key &&
          (row.is_preview === false || row.is_preview === 0) && row.is_runtime);
        return matches.length === 1 ? String(matches[0].value ?? "").trim() : "";
      };
      const webhook = value(variables, "CONTACT_WEBHOOK_URL");
      const secret = value(variables, "CONTACT_WEBHOOK_SECRET");
      const version = value(serverVariables, "API_VERSION") || "v1";
      const endpoints = String(server.fqdn ?? "").split(",")
        .map((domain) => `${domain.trim().replace(/\/$/, "")}/api/${version}/contact-delivery`);
      if (!webhook.startsWith("https://") || !endpoints.includes(webhook) ||
          secret.length < 32 || secret !== value(serverVariables, "CONTACT_WEBHOOK_SECRET")) {
        throw new Error("Website webhook does not match the verified receiver configuration.");
      }
      log(`Verified healthy contact receiver at ${expectedReceiverCommit}; webhook configuration matches.`);
    }
    for (const [key, action] of updates) {
      const matches = variables.filter((row) => row.key === key);
      if (matches.length > 1) throw new Error(`Ambiguous production flag: ${key}.`);
      const desired = {
        key, value: action === "enable" ? "true" : "false",
        is_preview: false, is_literal: true, is_multiline: false,
        is_buildtime: key.startsWith("NEXT_PUBLIC_"), is_runtime: true,
      };
      const matchesDesired = (row) => row?.value === desired.value &&
        Boolean(row.is_buildtime) === desired.is_buildtime && Boolean(row.is_runtime);
      if (!matchesDesired(matches[0])) {
        // A timeout may follow acceptance. Never repeat an uncertain mutation.
        await request(envPath, matches.length ? "PATCH" : "POST", desired);
        variables = await readFlags();
        const verified = variables.filter((row) => row.key === key);
        if (verified.length !== 1 || !matchesDesired(verified[0])) {
          throw new Error(`Rollout flag verification failed: ${key}. Inspect settings before retrying.`);
        }
      }
      log(`Verified production rollout flag ${key}=${desired.value}.`);
    }
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
      flagUpdates: {
        CONTACT_ATTRIBUTION_ENABLED: process.env.CONTACT_ATTRIBUTION_ACTION || "preserve",
        NEXT_PUBLIC_GA_MANUAL_PAGEVIEWS: process.env.MANUAL_PAGEVIEWS_ACTION || "preserve",
      },
      prerequisitesVerified: process.env.ROLLOUT_PREREQUISITES_VERIFIED === "true",
      expectedReceiverCommit: process.env.COMPATIBLE_API_COMMIT,
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
