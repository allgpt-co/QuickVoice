import { randomUUID } from "node:crypto";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { ForbiddenError } from "../../common/errors/forbidden.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { assertSafeRemoteUrl } from "../../lib/url-safety.js";
import { redactJson } from "../../lib/redaction.js";
import { findCuratedMcp, curatedMcpCatalog } from "./mcp.catalog.js";
import * as repository from "./mcp.repository.js";
import { readSmitheryJson, resolveSmitheryNamespace } from "./smithery-namespace.js";
import {
  findMcpTool,
  mcpToolRequiresConfirmation,
  normalizeMcpTools,
} from "./mcp-tool-policy.js";
import type { ConnectMcpInput, ExecuteMcpToolInput } from "./mcp.schema.js";
import { assertMcpArguments, McpToolContractError } from "./mcp-tool-contract.js";
import { inspectMcpResult, McpProviderError, withoutMcpAuthorizationLinks } from "./mcp-provider-result.js";

type McpStatus = "PENDING" | "CONNECTED" | "AUTH_REQUIRED" | "INPUT_REQUIRED" | "ERROR" | "DISCONNECTED";
type CatalogSort = "popular" | "name";
type CatalogListParams = {
  page: number;
  pageSize: number;
  search?: string;
  verified?: boolean;
  sort: CatalogSort;
};
type CatalogItemLike = {
  mcpServerId?: string | null;
  slug: string;
  name: string;
  description: string;
  provider: string;
  source: "SMITHERY" | "CUSTOM";
  mcpUrl: string;
  smitheryServerKey?: string | null;
  authType: string;
  categories: string[];
  verified: boolean;
  toolCount: number;
  metadata?: Record<string, unknown> | null;
};

const SMITHERY_NAMESPACE = process.env.SMITHERY_NAMESPACE;
const SMITHERY_RUN_BASE_URL = process.env.SMITHERY_RUN_BASE_URL || "https://smithery.run";
const SMITHERY_API_BASE_URL = process.env.SMITHERY_API_BASE_URL || "https://api.smithery.ai";

const getSmitheryApiKey = () => {
  const key = process.env.SMITHERY_API_KEY;
  if (!key) {
    throw new BadRequestError(
      "MCP connections are not configured. Ask an administrator to add a Smithery API key."
    );
  }
  return key;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "custom-mcp";

const normalizeStatus = (state: unknown): McpStatus => {
  const value = String(state ?? "").toLowerCase();
  if (value === "connected" || value === "ready") return "CONNECTED";
  if (value === "auth_required" || value === "authorization_required") return "AUTH_REQUIRED";
  if (value === "input_required") return "INPUT_REQUIRED";
  if (value === "disconnected") return "DISCONNECTED";
  if (value === "error" || value === "failed") return "ERROR";
  return "PENDING";
};

const connectionApiUrl = (namespace: string, connectionId: string) =>
  `${SMITHERY_API_BASE_URL.replace(/\/$/, "")}/connect/${encodeURIComponent(namespace)}/${encodeURIComponent(connectionId)}`;

const smitherySetupUrl = (namespace: string, connectionId: string) =>
  `${SMITHERY_RUN_BASE_URL.replace(/\/$/, "")}/${encodeURIComponent(namespace)}/${encodeURIComponent(connectionId)}/setup`;

const smitheryState = (connection: Record<string, any>) =>
  typeof connection.status === "string"
    ? connection.status
    : connection.status?.state ?? connection.state;

const smitheryAuthorizationUrl = (connection: Record<string, any>) =>
  connection.authorizationUrl ??
  connection.status?.authorizationUrl ??
  connection.status?.setupUrl ??
  connection.setupUrl ??
  null;

const isGoogleDriveMcp = (mcpUrl: string) =>
  mcpUrl.toLowerCase().includes("server.smithery.ai/googledrive");

const metadataObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const normalizeCatalogItem = (item: {
  mcpServerId?: string | null;
  slug: string;
  name: string;
  description: string;
  provider: string;
  source: "SMITHERY" | "CUSTOM";
  mcpUrl: string;
  smitheryServerKey?: string | null;
  authType: string;
  categories: unknown;
  verified: boolean;
  toolCount: number;
  metadata?: unknown;
}): CatalogItemLike => {
  const metadata = metadataObject(item.metadata);
  return {
    mcpServerId: item.mcpServerId ?? null,
    slug: item.slug,
    name: item.name,
    description: item.description,
    provider: item.provider,
    source: item.source,
    mcpUrl: item.mcpUrl,
    smitheryServerKey: item.smitheryServerKey,
    authType: item.authType,
    categories: stringArray(item.categories),
    verified: item.verified,
    toolCount: item.toolCount,
    metadata,
  };
};

const catalogResponseItem = (item: CatalogItemLike) => {
  const metadata = metadataObject(item.metadata);
  return {
    ...item,
    iconUrl: typeof metadata.iconUrl === "string" ? metadata.iconUrl : null,
    homepage: typeof metadata.homepage === "string" ? metadata.homepage : null,
    qualifiedName: typeof metadata.qualifiedName === "string" ? metadata.qualifiedName : item.smitheryServerKey ?? item.slug,
    namespace: typeof metadata.namespace === "string" ? metadata.namespace : null,
    useCount: typeof metadata.useCount === "number" ? metadata.useCount : item.toolCount,
    metadata,
  };
};

const isInsufficientGoogleScope = (value: unknown) => {
  const text = JSON.stringify(value ?? "").toLowerCase();
  return (
    text.includes("access_token_scope_insufficient") ||
    text.includes("insufficient permission") ||
    text.includes("insufficient authentication scopes") ||
    text.includes("insufficientpermissions")
  );
};

const callSmitheryTool = async (
  namespace: string,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>
) => {
  const response = await fetch(
    `${SMITHERY_API_BASE_URL.replace(/\/$/, "")}/connect/${encodeURIComponent(namespace)}/${encodeURIComponent(connectionId)}/.tools/${encodeURIComponent(toolName)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getSmitheryApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(20_000),
    }
  );
  const result = await readSmitheryJson(response);
  if (isInsufficientGoogleScope(result)) {
    throw new McpProviderError("MCP_AUTH_REQUIRED");
  }
  const error = inspectMcpResult(result, response.status);
  if (error) throw error;
  return withoutMcpAuthorizationLinks(result) as Record<string, any>;
};

const checkGoogleDriveScopes = async (namespace: string, connectionId: string) => {
  if (!connectionId.toLowerCase().includes("googledrive")) {
    return { ok: true, error: null };
  }

  let result;
  try {
    result = await callSmitheryTool(namespace, connectionId, "list_files", { pageSize: 1 });
  } catch (error) {
    if (error instanceof McpProviderError && error.code === "MCP_AUTH_REQUIRED") {
      return { ok: false, error: "Google Drive access was not granted during OAuth setup." };
    }
    throw error;
  }
  if (isInsufficientGoogleScope(result)) {
    return {
      ok: false,
      error: "Google Drive access was not granted during OAuth setup.",
    };
  }
  return { ok: true, error: null };
};

const upsertSmitheryConnection = async (args: {
  namespace: string;
  connectionId: string;
  displayName: string;
  mcpUrl: string;
  organizationId: string;
  userId: string | null;
}) => {
  const response = await fetch(connectionApiUrl(args.namespace, args.connectionId), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${getSmitheryApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mcpUrl: args.mcpUrl,
      name: args.displayName,
      metadata: {
        organizationId: args.organizationId,
        userId: args.userId,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const body = await readSmitheryJson(response);
  if (!response.ok) {
    const message = String(body?.message ?? "");
    if (
      [401, 403, 404].includes(response.status) &&
      /credential|namespace|token|unauthor|forbidden/i.test(message)
    ) {
      throw new BadRequestError(
        "MCP connections are not configured correctly. Ask an administrator to verify the Smithery API key."
      );
    }
    throw new BadRequestError("Could not connect to the MCP endpoint. Check its URL and provider setup.");
  }
  return body;
};

export const disconnectSmitheryConnection = async (
  namespace: string,
  connectionId: string,
) => {
  const key = getSmitheryApiKey();

  const response = await fetch(connectionApiUrl(namespace, connectionId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok && response.status !== 404) {
    throw new BadRequestError("Could not disconnect Smithery connection");
  }
};

const syncTools = async (namespace: string, connectionId: string) => {
  const response = await fetch(
    `${SMITHERY_API_BASE_URL.replace(/\/$/, "")}/connect/${encodeURIComponent(namespace)}/${encodeURIComponent(connectionId)}/.tools`,
    {
      headers: { Authorization: `Bearer ${getSmitheryApiKey()}` },
      signal: AbortSignal.timeout(10_000),
    }
  );
  const result = await readSmitheryJson(response);
  if (!response.ok) {
    throw new BadRequestError("Could not list MCP tools");
  }
  if (!Array.isArray(result.tools)) throw new BadRequestError("MCP provider returned an invalid tool list");
  return normalizeMcpTools(result.tools);
};

const filterCuratedCatalog = (params: CatalogListParams) => {
  const term = params.search?.trim().toLowerCase();
  return curatedMcpCatalog
    .filter((item) => {
      if (params.verified && !item.verified) return false;
      if (!term) return true;
      return [
        item.name,
        item.description,
        item.slug,
        item.mcpUrl,
        item.smitheryServerKey,
        ...item.categories,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    })
    .sort((a, b) => {
      if (params.sort === "name") return a.name.localeCompare(b.name);
      return (b.toolCount ?? 0) - (a.toolCount ?? 0) || a.name.localeCompare(b.name);
    });
};

export const listCatalog = async (organizationId: string, params: CatalogListParams) => {
  const [connections, catalogResult] = await Promise.all([
    repository.listConnections(organizationId),
    repository.listCatalogItems(params),
  ]);
  const connectionByUrl = new Map(connections.map((connection) => [connection.mcpUrl, connection]));
  const useCuratedFallback = catalogResult.catalogCount === 0;
  const fallbackCatalog = useCuratedFallback ? filterCuratedCatalog(params) : [];
  const baseCatalog = useCuratedFallback
    ? fallbackCatalog
        .slice((params.page - 1) * params.pageSize, params.page * params.pageSize)
        .map((item) => normalizeCatalogItem({ ...item, metadata: null }))
    : catalogResult.items.map(normalizeCatalogItem);
  const totalCount = useCuratedFallback ? fallbackCatalog.length : catalogResult.totalCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / params.pageSize));

  const items = baseCatalog.map((item) => {
    const connection = connectionByUrl.get(item.mcpUrl);
    return {
      ...catalogResponseItem(item),
      mcpConnectionId: connection?.mcpConnectionId ?? null,
      connectionStatus: connection?.status ?? null,
      setupUrl: connection?.setupUrl ?? null,
      metadata: { ...metadataObject(item.metadata), ...metadataObject(connection?.metadata) },
      connected: connection?.status === "CONNECTED",
    };
  });

  return {
    items,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages,
    },
  };
};

export const listConnections = async (organizationId: string) =>
  (await repository.listConnections(organizationId)).map((connection) => ({
    ...connection,
    tools: normalizeMcpTools(connection.tools),
  }));

export const listAgentConnections = async (organizationId: string, agentId: string) =>
  (await repository.listAgentConnections(organizationId, agentId)).map((connection) => ({
    ...connection,
    mcpConnection: {
      ...connection.mcpConnection,
      tools: normalizeMcpTools(connection.mcpConnection.tools),
    },
  }));

export const connect = async (
  organizationId: string,
  userId: string | null,
  input: ConnectMcpInput
) => {
  const dbCatalogItem = input.catalogSlug
    ? await repository.findCatalogItemBySlug(input.catalogSlug)
    : null;
  const catalogItem = dbCatalogItem
    ? normalizeCatalogItem(dbCatalogItem)
    : input.catalogSlug
      ? findCuratedMcp(input.catalogSlug)
      : null;
  if (input.catalogSlug && !catalogItem) {
    throw new NotFoundError("MCP catalog item not found");
  }

  const mcpUrl = catalogItem?.mcpUrl ?? input.customUrl;
  if (!mcpUrl) throw new BadRequestError("MCP URL is required");
  await assertSafeRemoteUrl(mcpUrl);

  const displayName = input.displayName || catalogItem?.name || new URL(mcpUrl).hostname;
  const rawConnectionKey = catalogItem?.smitheryServerKey ?? `custom-${slugify(displayName)}-${randomUUID().slice(0, 8)}`;
  const connectionKey = slugify(rawConnectionKey);
  const smitheryConnectionId = `${organizationId.slice(0, 8)}-${connectionKey}`.slice(0, 96);
  const customSlug = slugify(displayName);
  const smitheryNamespace = await resolveSmitheryNamespace({
    apiBaseUrl: SMITHERY_API_BASE_URL,
    apiKey: getSmitheryApiKey(),
    preferredNamespace: SMITHERY_NAMESPACE,
  });

  // Persist the handle before creating the remote OAuth connection so a later
  // database failure never leaves an undiscoverable grant at Smithery.
  const pending = await repository.upsertConnection({
    organizationId,
    userId,
    catalogItemId: dbCatalogItem?.mcpServerId ?? null,
    displayName,
    mcpUrl,
    smitheryNamespace,
    smitheryConnectionId,
    status: "PENDING",
    tools: [],
    metadata: { source: catalogItem ? "curated" : "custom", catalogSlug: catalogItem?.slug ?? null },
    lastSyncedAt: null,
  });

  const smithery = await upsertSmitheryConnection({
    namespace: smitheryNamespace,
    connectionId: smitheryConnectionId,
    displayName,
    mcpUrl,
    organizationId,
    userId,
  }).catch(async (error) => {
    await repository.updateConnectionStatus(organizationId, pending.mcpConnectionId, {
      status: "ERROR",
      metadata: { lastSyncError: "Could not create MCP connection at the provider" },
    });
    throw error;
  });

  // Persist a custom catalog row only after the remote connection has been
  // accepted. Upsert also makes retries safe if an older failed attempt left a
  // row with the same display-name slug.
  const persistedCatalogItem = catalogItem
    ? null
    : await repository.upsertCustomCatalogItem({
        organizationId,
        slug: customSlug,
        name: displayName,
        description: "Custom remote MCP server",
        source: "CUSTOM",
        provider: "smithery",
        mcpUrl,
        authType: "oauth",
        categories: ["Custom"],
        verified: false,
      });

  let status = normalizeStatus(smitheryState(smithery));
  let tools: unknown[] = [];
  let lastSyncedAt: Date | null = null;
  let setupUrl: string | null = smitheryAuthorizationUrl(smithery);
  if (!setupUrl && ["AUTH_REQUIRED", "INPUT_REQUIRED"].includes(status)) {
    setupUrl = smitherySetupUrl(smitheryNamespace, smitheryConnectionId);
  }
  const metadata: Record<string, unknown> = {
    source: catalogItem ? "curated" : "custom",
    catalogSlug: catalogItem?.slug ?? null,
    smitheryStatus: smithery?.status ?? null,
  };

  if (status === "CONNECTED") {
    try {
      tools = await syncTools(smitheryNamespace, smitheryConnectionId);
    } catch {
      status = "ERROR";
      metadata.lastSyncError = "Could not sync MCP tools";
    }
    if (status === "CONNECTED" && isGoogleDriveMcp(mcpUrl)) {
      const scopeCheck = await checkGoogleDriveScopes(smitheryNamespace, smitheryConnectionId).catch(() => ({
        ok: false,
        error: "Could not verify Google Drive access",
      }));
      metadata.lastScopeCheckAt = new Date().toISOString();
      metadata.lastProviderMethod = "google.apps.drive.v3.DriveFiles.List";
      if (!scopeCheck.ok) {
        status = scopeCheck.error === "Google Drive access was not granted during OAuth setup." ? "AUTH_REQUIRED" : "ERROR";
        if (status === "AUTH_REQUIRED") {
          setupUrl = setupUrl ?? smitherySetupUrl(smitheryNamespace, smitheryConnectionId);
          metadata.scopeIssue = "missing_google_drive_scope";
        } else {
          metadata.lastSyncError = scopeCheck.error;
        }
        metadata.lastScopeError = scopeCheck.error;
      } else {
        metadata.scopeIssue = null;
        metadata.lastScopeError = null;
        lastSyncedAt = new Date();
      }
    } else if (status === "CONNECTED") {
      lastSyncedAt = new Date();
    }
  }

  return repository.upsertConnection({
    organizationId,
    userId,
    catalogItemId: dbCatalogItem?.mcpServerId ?? persistedCatalogItem?.mcpServerId ?? null,
    displayName,
    mcpUrl,
    smitheryNamespace,
    smitheryConnectionId,
    status,
    setupUrl,
    tools,
    metadata,
    lastSyncedAt,
  });
};

export const refreshConnection = async (organizationId: string, mcpConnectionId: string) => {
  const connection = await repository.findConnection(organizationId, mcpConnectionId);
  if (!connection) throw new NotFoundError("MCP connection not found");

  let tools: unknown[] = [];
  let status: McpStatus = "CONNECTED";
  let error: string | null = null;
  let setupUrl: string | null = null;
  let smitheryStatus: unknown = null;
  const metadata = metadataObject(connection.metadata);
  const providerAuthorization = metadataObject(metadata.providerAuthorization);
  // Discovering tools does not prove that the provider's Google grant is ready.
  if (Array.isArray(providerAuthorization.pendingTools) && providerAuthorization.pendingTools.length) {
    status = "AUTH_REQUIRED";
    error = "Complete provider authorization using Test access, then verify the requested tools.";
  }
  metadata.scopeIssue = null;
  metadata.lastScopeError = null;

  try {
    tools = await syncTools(connection.smitheryNamespace, connection.smitheryConnectionId);
    if (isGoogleDriveMcp(connection.mcpUrl)) {
      const scopeCheck = await checkGoogleDriveScopes(connection.smitheryNamespace, connection.smitheryConnectionId).catch(() => ({
        ok: false,
        error: "Could not verify Google Drive access",
      }));
      metadata.lastScopeCheckAt = new Date().toISOString();
      metadata.lastProviderMethod = "google.apps.drive.v3.DriveFiles.List";
      if (!scopeCheck.ok) {
        status = scopeCheck.error === "Google Drive access was not granted during OAuth setup." ? "AUTH_REQUIRED" : "ERROR";
        error = scopeCheck.error;
        if (status === "AUTH_REQUIRED") {
          setupUrl = connection.setupUrl ?? smitherySetupUrl(connection.smitheryNamespace, connection.smitheryConnectionId);
          metadata.scopeIssue = "missing_google_drive_scope";
        }
        metadata.lastScopeError = scopeCheck.error;
      } else {
        metadata.scopeIssue = null;
        metadata.lastScopeError = null;
      }
    }
  } catch {
    error = "Could not sync MCP tools";
    try {
      const smithery = await upsertSmitheryConnection({
        namespace: connection.smitheryNamespace,
        connectionId: connection.smitheryConnectionId,
        displayName: connection.displayName,
        mcpUrl: connection.mcpUrl,
        organizationId: connection.organizationId,
        userId: connection.userId,
      });
      smitheryStatus = smithery?.status ?? null;
      status = normalizeStatus(smitheryState(smithery));
      if (status === "CONNECTED") status = "ERROR";
      setupUrl = smitheryAuthorizationUrl(smithery) ?? connection.setupUrl;
      if (!setupUrl && ["AUTH_REQUIRED", "INPUT_REQUIRED"].includes(status)) {
        setupUrl = smitherySetupUrl(
          connection.smitheryNamespace,
          connection.smitheryConnectionId
        );
      }
    } catch {
      status = connection.status === "AUTH_REQUIRED" || connection.status === "INPUT_REQUIRED"
        ? connection.status
        : "ERROR";
      setupUrl = connection.setupUrl;
    }
  }

  if (Array.isArray(providerAuthorization.pendingTools) && providerAuthorization.pendingTools.length) status = "AUTH_REQUIRED";
  await repository.updateConnectionStatus(organizationId, mcpConnectionId, {
    status,
    tools,
    setupUrl: status === "CONNECTED" ? null : setupUrl,
    metadata: { ...metadata, lastSyncError: error, smitheryStatus },
    lastSyncedAt: status === "CONNECTED" ? new Date() : connection.lastSyncedAt,
  }, connection.updatedAt);

  return repository.findConnection(organizationId, mcpConnectionId);
};

export const attach = async (
  organizationId: string,
  agentId: string,
  mcpConnectionId: string,
  enabled = true
) => {
  const result = await repository.attachConnection(organizationId, agentId, mcpConnectionId, enabled);
  if (!result) throw new NotFoundError("Agent or MCP connection not found");
  if (enabled) {
    try {
      const connection = await repository.findConnection(organizationId, mcpConnectionId);
      const tools = connection?.tools;
      const missingAnnotations = !Array.isArray(tools) || tools.length === 0 || tools.some((value) => {
        const tool = metadataObject(value);
        return typeof tool.readOnly !== "boolean" &&
          typeof metadataObject(tool.annotations).readOnlyHint !== "boolean";
      });
      if (connection && missingAnnotations) {
        const refreshed = await syncTools(connection.smitheryNamespace, connection.smitheryConnectionId);
        await repository.updateConnectionStatus(organizationId, mcpConnectionId, {
          status: connection.status, tools: refreshed, lastSyncedAt: new Date(),
        });
      }
    } catch {
      // Keep the attachment and its existing fail-closed tool policy on outage.
      console.warn("[mcp] could not refresh legacy tool annotations on attach", { organizationId, mcpConnectionId });
    }
  }
  return result;
};

export const detach = async (organizationId: string, agentId: string, mcpConnectionId: string) => {
  const result = await repository.detachConnection(organizationId, agentId, mcpConnectionId);
  if (result.count === 0) throw new NotFoundError("Agent MCP connection not found");
};

export const disconnect = async (organizationId: string, mcpConnectionId: string) => {
  const connection = await repository.findConnection(organizationId, mcpConnectionId);
  if (!connection) throw new NotFoundError("MCP connection not found");

  await disconnectSmitheryConnection(
    connection.smitheryNamespace,
    connection.smitheryConnectionId,
  );
  await repository.deleteConnection(organizationId, mcpConnectionId);
};

const preview = (value: unknown) => {
  const redacted = redactJson(value ?? null);
  const serialized = JSON.stringify(redacted);
  if (serialized.length <= 2000) return redacted;
  return { truncated: true, text: serialized.slice(0, 2000) };
};

export const executeTool = async (
  organizationId: string,
  mcpConnectionId: string,
  toolName: string,
  input: ExecuteMcpToolInput,
  context: { autonomous?: boolean; providerSetup?: boolean } = {},
) => {
  const connection = input.agentId
    ? await repository.findConnectionForAgent(organizationId, input.agentId, mcpConnectionId)
    : await repository.findConnection(organizationId, mcpConnectionId);

  if (!connection) throw new NotFoundError("MCP connection not attached to this agent");
  if (connection.status === "AUTH_REQUIRED" && !context.providerSetup) {
    throw new McpProviderError("MCP_AUTH_REQUIRED");
  }
  if (connection.status !== "CONNECTED" && !(context.providerSetup && connection.status === "AUTH_REQUIRED")) {
    throw new BadRequestError("MCP connection is not connected");
  }
  const tool = findMcpTool(connection.tools, toolName);
  if (!tool) throw new NotFoundError("MCP tool is not available on this connection");
  if ((context.autonomous || context.providerSetup) && mcpToolRequiresConfirmation(tool)) {
    throw new ForbiddenError(
      "MCP tool requires trusted user confirmation before execution",
    );
  }

  const startedAt = Date.now();
  try {
    assertMcpArguments(tool.inputSchema, input.arguments ?? {});
    const result = await callSmitheryTool(
      connection.smitheryNamespace,
      connection.smitheryConnectionId,
      toolName,
      input.arguments as Record<string, unknown>
    );
    if (isGoogleDriveMcp(connection.mcpUrl) && isInsufficientGoogleScope(result)) {
      throw new Error("Google Drive access was not granted during OAuth setup.");
    }
    if (context.providerSetup) {
      await recordProviderAuthorization(organizationId, mcpConnectionId, toolName, false);
    }
    await repository.createExecutionLog({
      organizationId,
      agentId: input.agentId,
      mcpConnectionId,
      toolName,
      callId: input.callId,
      status: "success",
      latencyMs: Date.now() - startedAt,
      argumentsPreview: preview(input.arguments),
      resultPreview: preview(result),
    });
    return result;
  } catch (err) {
    if (err instanceof McpToolContractError) {
      await repository.createExecutionLog({
        organizationId, agentId: input.agentId, mcpConnectionId, toolName, callId: input.callId,
        status: "validation_error", latencyMs: Date.now() - startedAt,
        argumentsPreview: preview(input.arguments), error: err.code,
      });
      throw err;
    }
    if (err instanceof McpProviderError) {
      if (err.code === "MCP_AUTH_REQUIRED") {
        await recordProviderAuthorization(organizationId, mcpConnectionId, toolName, true);
      }
      await repository.createExecutionLog({
        organizationId, agentId: input.agentId, mcpConnectionId, toolName,
        callId: input.callId, status: err.code === "MCP_AUTH_REQUIRED" ? "auth_required" : "error",
        latencyMs: Date.now() - startedAt, argumentsPreview: preview(input.arguments), error: err.code,
      });
      throw err;
    }
    const message = isInsufficientGoogleScope(err instanceof Error ? err.message : "")
      ? "Google Drive access was not granted during OAuth setup."
      : "MCP tool execution failed at the provider";
    if (isGoogleDriveMcp(connection.mcpUrl) && (isInsufficientGoogleScope(message) || message.includes("Google Drive access"))) {
      await repository.updateConnectionStatus(organizationId, mcpConnectionId, {
        status: "AUTH_REQUIRED",
        setupUrl: connection.setupUrl ?? smitherySetupUrl(connection.smitheryNamespace, connection.smitheryConnectionId),
        metadata: {
          ...metadataObject(connection.metadata),
          scopeIssue: "missing_google_drive_scope",
          lastScopeError: message,
          lastScopeCheckAt: new Date().toISOString(),
          lastProviderMethod: "google.apps.drive.v3.DriveFiles.List",
        },
      });
    }
    await repository.createExecutionLog({
      organizationId,
      agentId: input.agentId,
      mcpConnectionId,
      toolName,
      callId: input.callId,
      status: "error",
      latencyMs: Date.now() - startedAt,
      argumentsPreview: preview(input.arguments),
      error: message,
    });
    if (message.includes("Google Drive access")) throw new BadRequestError(message);
    throw new McpProviderError("MCP_PROVIDER_ERROR");
  }
};

async function recordProviderAuthorization(
  organizationId: string, id: string, toolName: string, required: boolean,
) {
  // CAS protects independently requested tool permissions from concurrent calls
  // or console checks overwriting one another. No tokens or URLs are stored here.
  for (let attempt = 0; attempt < 5; attempt++) {
    const connection = await repository.findConnection(organizationId, id);
    if (!connection) throw new NotFoundError("MCP connection not found");
    if (!["CONNECTED", "AUTH_REQUIRED"].includes(connection.status)) {
      throw new BadRequestError("Connection setup changed. Refresh the connection before testing again.");
    }
    const metadata = metadataObject(connection.metadata);
    const auth = metadataObject(metadata.providerAuthorization);
    const strings = (value: unknown): string[] => Array.isArray(value)
      ? value.filter((name): name is string => typeof name === "string") : [];
    const pending = new Set(strings(auth.pendingTools));
    const verified = new Set(strings(auth.verifiedTools));
    if (required) { pending.add(toolName); verified.delete(toolName); }
    else { pending.delete(toolName); verified.add(toolName); }
    const result = await repository.updateConnectionStatus(organizationId, id, {
      status: pending.size ? "AUTH_REQUIRED" : "CONNECTED",
      setupUrl: null,
      metadata: { ...metadata,
        lastSyncError: pending.size ? "Provider authorization is required. Use Test access to complete setup." : null,
        providerAuthorization: {
          pendingTools: [...pending], verifiedTools: [...verified], checkedAt: new Date().toISOString(),
        },
      },
    }, connection.updatedAt);
    if (result.count) return;
  }
  throw new BadRequestError("Connection setup changed concurrently. Please run the test again.");
}
