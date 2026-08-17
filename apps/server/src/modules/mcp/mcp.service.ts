import { randomUUID } from "node:crypto";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { assertSafeRemoteUrl } from "../../lib/url-safety.js";
import { redactJson } from "../../lib/redaction.js";
import { findCuratedMcp, curatedMcpCatalog } from "./mcp.catalog.js";
import * as repository from "./mcp.repository.js";
import { resolveSmitheryNamespace } from "./smithery-namespace.js";
import type { ConnectMcpInput, ExecuteMcpToolInput } from "./mcp.schema.js";

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
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || "MCP tool execution failed");
  }
  return result;
};

const checkGoogleDriveScopes = async (namespace: string, connectionId: string) => {
  if (!connectionId.toLowerCase().includes("googledrive")) {
    return { ok: true, error: null };
  }

  const result = await callSmitheryTool(namespace, connectionId, "list_files", { pageSize: 1 });
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
  });

  const body = await response.json().catch(() => ({}));
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
    throw new BadRequestError(
      message
        ? `Could not connect to the MCP endpoint: ${message}`
        : "Could not connect to the MCP endpoint. Confirm that it is the full public HTTPS MCP URL."
    );
  }
  return body;
};

const disconnectSmitheryConnection = async (namespace: string, connectionId: string) => {
  const key = process.env.SMITHERY_API_KEY;
  if (!key) return;

  const response = await fetch(connectionApiUrl(namespace, connectionId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!response.ok && ![404, 405].includes(response.status)) {
    const body = await response.json().catch(() => ({}));
    throw new BadRequestError(body?.message || "Could not disconnect Smithery connection");
  }
};

const syncTools = async (namespace: string, connectionId: string) => {
  const response = await fetch(
    `${SMITHERY_API_BASE_URL.replace(/\/$/, "")}/connect/${encodeURIComponent(namespace)}/${encodeURIComponent(connectionId)}/.tools`,
    {
      headers: { Authorization: `Bearer ${getSmitheryApiKey()}` },
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BadRequestError(result?.message || "Could not list MCP tools");
  }

  const tools = Array.isArray(result.tools) ? result.tools : [];
  return tools.map((tool: { name: string; description?: string; title?: string; inputSchema?: unknown }) => ({
    name: tool.name,
    description: tool.description ?? tool.title ?? "",
    inputSchema: tool.inputSchema ?? null,
  }));
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

export const listConnections = (organizationId: string) =>
  repository.listConnections(organizationId);

export const listAgentConnections = async (organizationId: string, agentId: string) =>
  repository.listAgentConnections(organizationId, agentId);

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

  const smithery = await upsertSmitheryConnection({
    namespace: smitheryNamespace,
    connectionId: smitheryConnectionId,
    displayName,
    mcpUrl,
    organizationId,
    userId,
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
    tools = await syncTools(smitheryNamespace, smitheryConnectionId).catch(() => []);
    if (isGoogleDriveMcp(mcpUrl)) {
      const scopeCheck = await checkGoogleDriveScopes(smitheryNamespace, smitheryConnectionId).catch((err) => ({
        ok: false,
        error: err instanceof Error ? err.message : "Could not verify Google Drive access",
      }));
      metadata.lastScopeCheckAt = new Date().toISOString();
      metadata.lastProviderMethod = "google.apps.drive.v3.DriveFiles.List";
      if (!scopeCheck.ok) {
        status = "AUTH_REQUIRED";
        setupUrl = setupUrl ?? smitherySetupUrl(smitheryNamespace, smitheryConnectionId);
        metadata.scopeIssue = "missing_google_drive_scope";
        metadata.lastScopeError = scopeCheck.error;
      } else {
        metadata.scopeIssue = null;
        metadata.lastScopeError = null;
        lastSyncedAt = new Date();
      }
    } else {
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

  try {
    tools = await syncTools(connection.smitheryNamespace, connection.smitheryConnectionId);
    if (isGoogleDriveMcp(connection.mcpUrl)) {
      const scopeCheck = await checkGoogleDriveScopes(connection.smitheryNamespace, connection.smitheryConnectionId).catch((err) => ({
        ok: false,
        error: err instanceof Error ? err.message : "Could not verify Google Drive access",
      }));
      metadata.lastScopeCheckAt = new Date().toISOString();
      metadata.lastProviderMethod = "google.apps.drive.v3.DriveFiles.List";
      if (!scopeCheck.ok) {
        status = "AUTH_REQUIRED";
        error = scopeCheck.error;
        setupUrl = connection.setupUrl ?? smitherySetupUrl(connection.smitheryNamespace, connection.smitheryConnectionId);
        metadata.scopeIssue = "missing_google_drive_scope";
        metadata.lastScopeError = scopeCheck.error;
      } else {
        metadata.scopeIssue = null;
        metadata.lastScopeError = null;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not sync MCP tools";
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

  await repository.updateConnectionStatus(organizationId, mcpConnectionId, {
    status,
    tools,
    setupUrl: status === "CONNECTED" ? null : setupUrl,
    metadata: { ...metadata, lastSyncError: error, smitheryStatus },
    lastSyncedAt: status === "CONNECTED" ? new Date() : connection.lastSyncedAt,
  });

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
  return result;
};

export const detach = async (organizationId: string, agentId: string, mcpConnectionId: string) => {
  const result = await repository.detachConnection(organizationId, agentId, mcpConnectionId);
  if (result.count === 0) throw new NotFoundError("Agent MCP connection not found");
};

export const disconnect = async (organizationId: string, mcpConnectionId: string) => {
  const connection = await repository.findConnection(organizationId, mcpConnectionId);
  if (!connection) throw new NotFoundError("MCP connection not found");

  await disconnectSmitheryConnection(connection.smitheryNamespace, connection.smitheryConnectionId).catch(() => undefined);
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
  input: ExecuteMcpToolInput
) => {
  const connection = input.agentId
    ? await repository.findConnectionForAgent(organizationId, input.agentId, mcpConnectionId)
    : await repository.findConnection(organizationId, mcpConnectionId);

  if (!connection) throw new NotFoundError("MCP connection not attached to this agent");
  if (connection.status !== "CONNECTED") {
    throw new BadRequestError("MCP connection is not connected");
  }

  const startedAt = Date.now();
  try {
    const result = await callSmitheryTool(
      connection.smitheryNamespace,
      connection.smitheryConnectionId,
      toolName,
      input.arguments as Record<string, unknown>
    );
    if (isGoogleDriveMcp(connection.mcpUrl) && isInsufficientGoogleScope(result)) {
      throw new Error("Google Drive access was not granted during OAuth setup.");
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
    const message = err instanceof Error ? err.message : "MCP tool execution failed";
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
    throw new BadRequestError(message);
  }
};
