import { createHash, randomUUID } from "node:crypto";
import { BadRequestError } from "../../common/errors/badRequest.js";
import { ForbiddenError } from "../../common/errors/forbidden.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import { assertSafeRemoteUrl } from "../../lib/url-safety.js";
import { redactJson } from "../../lib/redaction.js";
import * as repository from "./mcp.repository.js";
import {
  findMcpTool,
  mcpToolRequiresConfirmation,
  normalizeMcpTools,
} from "./mcp-tool-policy.js";
import {
  assertMcpArguments,
  McpToolContractError,
} from "./mcp-tool-contract.js";
import { inspectMcpResult, McpProviderError } from "./mcp-provider-result.js";
import {
  composioRequest,
  composioPages,
  composioTools,
  createComposioSession,
  deleteComposioResource,
  safeComposioSetupUrl,
  ComposioHttpError,
  object,
} from "./composio.client.js";
import type { ConnectMcpInput, ExecuteMcpToolInput } from "./mcp.schema.js";

const LEGACY_MESSAGE =
  "Reconnect this integration through Composio in the marketplace, then attach the new connection to your agents.";
type Connection = Omit<
  NonNullable<Awaited<ReturnType<typeof repository.findConnection>>>,
  "agents"
>;
type CatalogListParams = {
  page: number;
  pageSize: number;
  search?: string;
  verified?: boolean;
  sort: "popular" | "name";
};
const toolkitUrl = (slug: string) =>
  `https://platform.composio.dev/toolkits/${encodeURIComponent(slug)}`;
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const sessionPath = (id: string) =>
  `/tool_router/session/${encodeURIComponent(id)}`;
const accountPath = (id: string) =>
  `/connected_accounts/${encodeURIComponent(id)}`;

let catalogCache:
  | { key: string; expires: number; items: Record<string, any>[] }
  | undefined;
export const listCatalog = async (
  organizationId: string,
  params: CatalogListParams,
) => {
  const key = createHash("sha256")
    .update(process.env.COMPOSIO_API_KEY ?? "")
    .digest("hex");
  if (
    !catalogCache ||
    catalogCache.key !== key ||
    catalogCache.expires < Date.now()
  ) {
    const items = await composioPages(
      "/toolkits?type=native&sort_by=usage&limit=1000",
    );
    catalogCache = {
      key,
      expires: Date.now() + 300_000,
      items: items.filter(
        (item) => item.type === "native" && identifier(item.slug),
      ),
    };
  }
  const term = params.search?.toLowerCase();
  let items = catalogCache.items.filter(
    (item) =>
      !term ||
      `${item.name} ${item.slug} ${object(item.meta).description}`
        .toLowerCase()
        .includes(term),
  );
  if (params.sort === "name")
    items = [...items].sort((a, b) =>
      String(a.name).localeCompare(String(b.name)),
    );
  const connections = await repository.listConnections(organizationId);
  const byToolkit = new Map(
    connections
      .filter((item) => item.provider === "composio")
      .map((item) => [item.toolkitSlug, item]),
  );
  return {
    items: items
      .slice((params.page - 1) * params.pageSize, params.page * params.pageSize)
      .map((item) => {
        const meta = object(item.meta);
        const connection = byToolkit.get(item.slug);
        return {
          slug: item.slug,
          name: item.name,
          description: meta.description ?? "",
          provider: "composio",
          source: "COMPOSIO",
          mcpUrl: toolkitUrl(item.slug),
          authType: item.no_auth ? "none" : "managed",
          verified: true,
          categories: Array.isArray(meta.categories)
            ? meta.categories
                .map((category: unknown) => object(category).name)
                .filter((name: unknown) => typeof name === "string")
            : [],
          toolCount:
            typeof meta.tools_count === "number" ? meta.tools_count : 0,
          iconUrl: typeof meta.logo === "string" ? meta.logo : null,
          qualifiedName: item.slug,
          metadata: object(connection?.metadata),
          mcpConnectionId: connection?.mcpConnectionId ?? null,
          connectionStatus: connection?.status ?? null,
          setupUrl: connection?.setupUrl ?? null,
          connected: connection?.status === "CONNECTED",
        };
      }),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / params.pageSize)),
    },
  };
};

const publicConnection = <
  T extends { provider?: string; tools?: unknown; metadata?: unknown },
>(
  connection: T,
) => {
  if (connection.provider === "smithery")
    return {
      ...connection,
      status: "DISCONNECTED",
      setupUrl: null,
      tools: [],
      metadata: {
        ...object(connection.metadata),
        migrationRequired: true,
        lastSyncError: LEGACY_MESSAGE,
      },
    };
  return { ...connection, tools: normalizeMcpTools(connection.tools) };
};
export const listConnections = async (organizationId: string) =>
  (await repository.listConnections(organizationId)).map(publicConnection);
export const listAgentConnections = async (
  organizationId: string,
  agentId: string,
) =>
  (await repository.listAgentConnections(organizationId, agentId)).map(
    (item) => ({
      ...item,
      mcpConnection: publicConnection(item.mcpConnection),
    }),
  );

function requireComposio(connection: Connection) {
  if (connection.provider !== "composio")
    throw new BadRequestError(LEGACY_MESSAGE);
  if (!connection.providerUserId || !connection.toolkitSlug)
    throw new BadRequestError(
      "Integration setup is incomplete. Reconnect it in the marketplace.",
    );
  return { userId: connection.providerUserId, toolkit: connection.toolkitSlug };
}

async function withConnectionSetup<T>(
  connection: Connection,
  operation: () => Promise<T>,
): Promise<T> {
  const until = new Date(Date.now() + 300_000);
  const claimed = await repository.claimConnectionSetup(
    connection.organizationId,
    connection.mcpConnectionId,
    until,
  );
  if (!claimed.count)
    throw new BadRequestError(
      "Integration setup is already in progress. Please refresh shortly.",
    );
  try {
    const fresh = await repository.findConnection(
      connection.organizationId,
      connection.mcpConnectionId,
    );
    if (!fresh) throw new NotFoundError("Integration connection not found");
    Object.assign(connection, fresh);
    return await operation();
  } finally {
    await repository.releaseConnectionSetup(
      connection.organizationId,
      connection.mcpConnectionId,
      until,
    );
  }
}

async function createSetup(connection: Connection): Promise<Connection | null> {
  const { userId, toolkit } = requireComposio(connection);
  let sessionId = connection.providerSessionId;
  if (!sessionId) {
    sessionId = await createComposioSession(userId, toolkit);
    await repository.updateConnectionStatus(
      connection.organizationId,
      connection.mcpConnectionId,
      {
        status: "PENDING",
        providerSessionId: sessionId,
      },
    );
    connection.providerSessionId = sessionId;
  }
  // Recover a grant when the provider succeeded but saving its ID failed. The
  // principal belongs only to this local connection; never search other users.
  const accounts = await composioPages(
    `/connected_accounts?user_ids=${encodeURIComponent(userId)}&toolkit_slugs=${encodeURIComponent(toolkit)}&limit=100`,
  );
  if (accounts.length > 1)
    throw new BadRequestError(
      "Multiple pending provider accounts were found. Disconnect this connection and start setup again.",
    );
  for (const account of accounts) {
    if (
      account.toolkit?.slug !== toolkit ||
      (account.user_id && account.user_id !== userId) ||
      !identifier(account.id)
    )
      throw new McpProviderError("MCP_PROVIDER_ERROR");
    if (account.status === "ACTIVE") {
      await repository.updateConnectionStatus(
        connection.organizationId,
        connection.mcpConnectionId,
        { status: "PENDING", providerAccountId: account.id },
      );
      connection.providerAccountId = account.id;
      return refreshSavedConnection(connection);
    }
    await deleteComposioResource(
      `${accountPath(account.id)}?revoke_on_delete=true`,
    );
  }
  const link = await composioRequest(`${sessionPath(sessionId)}/link`, {
    toolkit,
    alias: connection.mcpConnectionId,
  });
  if (!identifier(link.connected_account_id))
    throw new McpProviderError("MCP_PROVIDER_ERROR");
  const setupUrl = safeComposioSetupUrl(link.redirect_url);
  await repository.updateConnectionStatus(
    connection.organizationId,
    connection.mcpConnectionId,
    {
      status: "AUTH_REQUIRED",
      providerAccountId: link.connected_account_id,
      setupUrl,
      metadata: { ...object(connection.metadata), lastSyncError: null },
    },
  );
  return repository.findConnection(
    connection.organizationId,
    connection.mcpConnectionId,
  );
}

export const connect = async (
  organizationId: string,
  userId: string | null,
  input: ConnectMcpInput,
) => {
  let toolkit: string;
  let name: string;
  let noAuth: boolean;
  let mcpUrl: string;
  let custom = false;
  let connectionKey: string;
  if (input.customUrl) {
    await assertSafeRemoteUrl(input.customUrl);
    if (input.discoveryUrl) await assertSafeRemoteUrl(input.discoveryUrl);
    // Project-owned custom toolkits are never listed globally. Include the full
    // tenant identity in the registration key to prevent cross-workspace reuse.
    connectionKey = createHash("sha256")
      .update(
        JSON.stringify([
          organizationId,
          input.customUrl,
          input.authMode,
          input.discoveryUrl,
        ]),
      )
      .digest("hex");
    toolkit = `CUSTOM_QV_${connectionKey.toUpperCase()}`;
    name = input.displayName || new URL(input.customUrl).hostname;
    noAuth = input.authMode === "none";
    mcpUrl = input.customUrl;
    custom = true;
  } else {
    if (
      !identifier(input.catalogSlug) ||
      input.catalogSlug.startsWith("CUSTOM_")
    )
      throw new NotFoundError("Integration not found");
    const item = await composioRequest(
      `/toolkits/${encodeURIComponent(input.catalogSlug)}`,
    );
    if (item.type !== "native" || item.slug !== input.catalogSlug)
      throw new NotFoundError("Integration not found");
    toolkit = item.slug;
    name = input.displayName || item.name;
    noAuth = item.no_auth === true;
    mcpUrl = toolkitUrl(toolkit);
    connectionKey = toolkit;
  }
  // Persist a stable identity before creating any remote grant. Retries and all
  // future calls use this same connection principal, never the phone caller.
  const connection = await repository.upsertConnection({
    organizationId,
    userId,
    connectionKey,
    displayName: name,
    mcpUrl,
    toolkitSlug: toolkit,
    providerUserId: `qv:${organizationId}:${randomUUID()}`,
    metadata: {
      noAuth,
      custom,
      catalogSlug: custom ? null : toolkit,
      authMode: input.authMode ?? null,
    },
  });
  return withConnectionSetup(connection, async () => {
    if (connection.providerAccountId) {
      const refreshed = await refreshSavedConnection(connection);
      if (
        refreshed?.status !== "AUTH_REQUIRED" ||
        refreshed?.setupUrl ||
        !object(refreshed?.metadata).authorizationRequired
      )
        return refreshed;
      // An expired/revoked account needs fresh consent. Remove its old grant first.
      await deleteComposioResource(
        `${accountPath(connection.providerAccountId)}?revoke_on_delete=true`,
      );
      if (connection.providerSessionId)
        await deleteComposioResource(sessionPath(connection.providerSessionId));
      await repository.updateConnectionStatus(
        organizationId,
        connection.mcpConnectionId,
        {
          status: "PENDING",
          providerAccountId: null,
          providerSessionId: null,
          setupUrl: null,
          metadata: {
            ...object(connection.metadata),
            runtimeSession: false,
            authorizationRequired: false,
          },
        },
      );
      connection.providerAccountId = null;
      connection.providerSessionId = null;
      connection.metadata = {
        ...object(connection.metadata),
        runtimeSession: false,
        authorizationRequired: false,
      };
    }
    try {
      if (custom) {
        const auth =
          input.authMode === "none"
            ? { mode: "NO_AUTH" }
            : input.authMode === "api_key"
              ? {
                  mode: "API_KEY",
                  headers: { Authorization: "Bearer {{generic_api_key}}" },
                }
              : { mode: "DCR_OAUTH", discovery_url: input.discoveryUrl };
        const registered = await composioRequest("/custom/toolkits/upsert", {
          slug: toolkit.replace(/^CUSTOM_/, ""),
          toolkit_config: { name, app_url: mcpUrl, auth_schemes: [auth] },
        });
        if (registered.slug !== toolkit)
          throw new McpProviderError("MCP_PROVIDER_ERROR");
      }
      if (noAuth) return refreshSavedConnection(connection);
      return await createSetup(connection);
    } catch (error) {
      await repository.updateConnectionStatus(
        organizationId,
        connection.mcpConnectionId,
        {
          status: "ERROR",
          metadata: {
            ...object(connection.metadata),
            lastSyncError:
              "Could not complete integration setup. Retry from the marketplace.",
          },
        },
      );
      throw error;
    }
  });
};

export const refreshConnection = async (
  organizationId: string,
  mcpConnectionId: string,
) => {
  const connection = await repository.findConnection(
    organizationId,
    mcpConnectionId,
  );
  if (!connection) throw new NotFoundError("Integration connection not found");
  return withConnectionSetup(connection, () =>
    refreshSavedConnection(connection),
  );
};

async function refreshSavedConnection(
  connection: Connection,
): Promise<Connection | null> {
  const { organizationId, mcpConnectionId } = connection;
  const { userId, toolkit } = requireComposio(connection);
  const metadata = object(connection.metadata);
  try {
    if (metadata.authorizationRequired) return connection;
    if (!metadata.noAuth) {
      if (!connection.providerAccountId) return await createSetup(connection);
      const account = await composioRequest(
        accountPath(connection.providerAccountId),
      );
      if (
        account.toolkit?.slug !== toolkit ||
        (account.user_id && account.user_id !== userId)
      )
        throw new McpProviderError("MCP_PROVIDER_ERROR");
      if (account.status !== "ACTIVE") {
        const pending = ["INITIALIZING", "INITIATED"].includes(account.status);
        await repository.updateConnectionStatus(
          organizationId,
          mcpConnectionId,
          {
            status: "AUTH_REQUIRED",
            tools: [],
            setupUrl: pending ? connection.setupUrl : null,
            metadata: {
              ...metadata,
              authorizationRequired: !pending || !connection.setupUrl,
              lastSyncError: pending
                ? connection.setupUrl
                  ? "Complete authorization in your browser."
                  : "Authorization link is unavailable. Reconnect from the marketplace."
                : "Authorization expired or was revoked. Reconnect from the marketplace.",
            },
          },
        );
        return repository.findConnection(organizationId, mcpConnectionId);
      }
    }
    if (metadata.custom)
      await composioRequest("/custom/toolkits/sync", {
        slug: toolkit,
        ...(connection.providerAccountId
          ? { connected_account_id: connection.providerAccountId }
          : {}),
      });
    // A runtime session pins exactly the account authorized in this workspace.
    let sessionId =
      metadata.runtimeSession === true ? connection.providerSessionId : null;
    if (!sessionId)
      sessionId = await createComposioSession(
        userId,
        toolkit,
        connection.providerAccountId,
      );
    try {
      let tools;
      try {
        tools = await composioTools(sessionId, toolkit);
      } catch (error) {
        if (
          !(error instanceof ComposioHttpError) ||
          ![404, 410].includes(error.status)
        )
          throw error;
        sessionId = await createComposioSession(
          userId,
          toolkit,
          connection.providerAccountId,
        );
        tools = await composioTools(sessionId, toolkit);
      }
      if (!tools.length)
        throw new BadRequestError(
          "No tools are available yet. Refresh this connection after provider setup finishes.",
        );
      await repository.updateConnectionStatus(organizationId, mcpConnectionId, {
        status: "CONNECTED",
        tools,
        setupUrl: null,
        providerSessionId: sessionId,
        lastSyncedAt: new Date(),
        metadata: {
          ...metadata,
          lastSyncError: null,
          providerAuthorization: null,
          runtimeSession: true,
        },
      });
    } catch (error) {
      if (sessionId !== connection.providerSessionId)
        await deleteComposioResource(sessionPath(sessionId)).catch(() => {});
      throw error;
    }
    if (
      connection.providerSessionId &&
      connection.providerSessionId !== sessionId
    ) {
      await deleteComposioResource(
        sessionPath(connection.providerSessionId),
      ).catch(() => {});
    }
  } catch (error) {
    const missingAccount =
      error instanceof ComposioHttpError && error.status === 404;
    await repository.updateConnectionStatus(organizationId, mcpConnectionId, {
      status: missingAccount ? "AUTH_REQUIRED" : "ERROR",
      tools: [],
      setupUrl: missingAccount ? null : connection.setupUrl,
      metadata: {
        ...metadata,
        authorizationRequired: missingAccount,
        lastSyncError: missingAccount
          ? "Reconnect from the marketplace."
          : "Could not sync integration tools. Refresh to retry.",
      },
    });
    if (error instanceof BadRequestError && !process.env.COMPOSIO_API_KEY)
      throw error;
  }
  return repository.findConnection(organizationId, mcpConnectionId);
}

export const attach = async (
  organizationId: string,
  agentId: string,
  mcpConnectionId: string,
  enabled = true,
) => {
  const connection = await repository.findConnection(
    organizationId,
    mcpConnectionId,
  );
  if (!connection) throw new NotFoundError("Integration connection not found");
  if (enabled) {
    requireComposio(connection);
    if (
      connection.status !== "CONNECTED" ||
      !normalizeMcpTools(connection.tools).length
    )
      throw new BadRequestError(
        "Complete integration setup before attaching it.",
      );
  }
  const result = await repository.attachConnection(
    organizationId,
    agentId,
    mcpConnectionId,
    enabled,
  );
  if (!result)
    throw new NotFoundError("Agent or integration connection not found");
  return result;
};
export const detach = async (
  organizationId: string,
  agentId: string,
  mcpConnectionId: string,
) => {
  const result = await repository.detachConnection(
    organizationId,
    agentId,
    mcpConnectionId,
  );
  if (!result.count)
    throw new NotFoundError("Agent integration connection not found");
};

// Kept solely for retiring old grants. No discovery, authorization, or execution
// path uses Smithery. An unavailable legacy provider must not block local removal.
export const disconnectSmitheryConnection = async (
  namespace: string,
  connectionId: string,
) => {
  const key = process.env.SMITHERY_API_KEY;
  if (!key) return;
  const response = await fetch(
    `https://api.smithery.ai/connect/${encodeURIComponent(namespace)}/${encodeURIComponent(connectionId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok && ![404, 410].includes(response.status))
    throw new BadRequestError("Could not disconnect Smithery connection");
};

export async function revokeMcpConnection(
  connection: Pick<
    Connection,
    | "provider"
    | "providerUserId"
    | "providerAccountId"
    | "providerSessionId"
    | "toolkitSlug"
    | "metadata"
    | "smitheryNamespace"
    | "smitheryConnectionId"
  >,
) {
  if (connection.provider === "composio") {
    if (
      !connection.providerAccountId &&
      !object(connection.metadata).noAuth &&
      connection.providerUserId &&
      connection.toolkitSlug
    ) {
      const accounts = await composioPages(
        `/connected_accounts?user_ids=${encodeURIComponent(connection.providerUserId)}&toolkit_slugs=${encodeURIComponent(connection.toolkitSlug)}&limit=100`,
      );
      for (const account of accounts) {
        if (
          !identifier(account.id) ||
          account.toolkit?.slug !== connection.toolkitSlug ||
          (account.user_id && account.user_id !== connection.providerUserId)
        )
          throw new McpProviderError("MCP_PROVIDER_ERROR");
        await deleteComposioResource(
          `${accountPath(account.id)}?revoke_on_delete=true`,
        );
      }
    }
    if (connection.providerAccountId)
      await deleteComposioResource(
        `${accountPath(connection.providerAccountId)}?revoke_on_delete=true`,
      );
    if (connection.providerSessionId)
      await deleteComposioResource(sessionPath(connection.providerSessionId));
    if (object(connection.metadata).custom && connection.toolkitSlug)
      await deleteComposioResource(
        `/custom/toolkits/${encodeURIComponent(connection.toolkitSlug)}`,
      );
  } else if (connection.smitheryNamespace && connection.smitheryConnectionId) {
    await disconnectSmitheryConnection(
      connection.smitheryNamespace,
      connection.smitheryConnectionId,
    ).catch(() => {
      console.warn(
        "[mcp] legacy provider unavailable; revoke the old grant at the connected app",
      );
    });
  }
}
export const disconnect = async (
  organizationId: string,
  mcpConnectionId: string,
) => {
  const connection = await repository.findConnection(
    organizationId,
    mcpConnectionId,
  );
  if (!connection) throw new NotFoundError("Integration connection not found");
  await withConnectionSetup(connection, async () => {
    // Stop new invocations before revocation; keep failed cleanup retryable.
    await repository.updateConnectionStatus(organizationId, mcpConnectionId, {
      status: "DISCONNECTED",
      tools: [],
      setupUrl: null,
    });
    await revokeMcpConnection(connection);
    await repository.deleteConnection(organizationId, mcpConnectionId);
  });
};

const preview = (value: unknown) => {
  const redacted = redactJson(value ?? null);
  const serialized = JSON.stringify(redacted);
  return serialized.length <= 2000
    ? redacted
    : { truncated: true, text: serialized.slice(0, 2000) };
};

export const executeTool = async (
  organizationId: string,
  mcpConnectionId: string,
  toolName: string,
  input: ExecuteMcpToolInput,
  context: { autonomous?: boolean; providerSetup?: boolean } = {},
) => {
  const connection = input.agentId
    ? await repository.findConnectionForAgent(
        organizationId,
        input.agentId,
        mcpConnectionId,
      )
    : await repository.findConnection(organizationId, mcpConnectionId);
  if (!connection)
    throw new NotFoundError("MCP connection not attached to this agent");
  requireComposio(connection);
  if (context.autonomous && !input.agentId)
    throw new ForbiddenError(
      "Agent identity is required to execute integration tools",
    );
  if (connection.status === "AUTH_REQUIRED")
    throw new McpProviderError(
      "MCP_AUTH_REQUIRED",
      context.providerSetup ? connection.setupUrl : null,
    );
  if (connection.status !== "CONNECTED" || !connection.providerSessionId)
    throw new BadRequestError("MCP connection is not connected");
  const tool = findMcpTool(connection.tools, toolName);
  if (!tool)
    throw new NotFoundError("MCP tool is not available on this connection");
  if (
    (context.autonomous || context.providerSetup) &&
    mcpToolRequiresConfirmation(tool)
  )
    throw new ForbiddenError(
      "MCP tool requires trusted user confirmation before execution",
    );
  const startedAt = Date.now();
  try {
    assertMcpArguments(tool.inputSchema, input.arguments ?? {});
    const result = await composioRequest(
      `${sessionPath(connection.providerSessionId)}/execute`,
      {
        tool_slug: toolName,
        arguments: input.arguments,
        ...(connection.providerAccountId
          ? { account: connection.providerAccountId }
          : {}),
      },
    );
    // Successful HTTP transport is not proof of successful execution. Do not
    // expose pending consent links, helper actions, or credentials to callers.
    const providerError = inspectMcpResult(result);
    if (providerError) throw providerError;
    if (
      result.result_type !== "completed" ||
      result.error ||
      result.successful === false
    )
      throw new McpProviderError("MCP_TOOL_ERROR");
    await repository.createExecutionLog({
      organizationId,
      agentId: input.agentId,
      mcpConnectionId,
      toolName,
      callId: input.callId,
      status: "success",
      latencyMs: Date.now() - startedAt,
      argumentsPreview: preview(input.arguments),
      resultPreview: preview(result.data),
    });
    return result.data;
  } catch (error) {
    if (
      error instanceof ComposioHttpError &&
      [404, 410].includes(error.status)
    ) {
      // A missing session or tool needs a refresh, not an automatic replay of
      // an operation that may have side effects. Keep the account for recovery.
      await repository.updateConnectionStatus(
        organizationId,
        mcpConnectionId,
        {
          status: "ERROR",
          tools: [],
          metadata: {
            ...object(connection.metadata),
            lastSyncError:
              "The integration session or tool is unavailable. Refresh this connection before retrying.",
          },
        },
        connection.updatedAt,
      );
    }
    if (
      error instanceof McpProviderError &&
      error.code === "MCP_AUTH_REQUIRED"
    ) {
      await repository.updateConnectionStatus(
        organizationId,
        mcpConnectionId,
        {
          status: "AUTH_REQUIRED",
          setupUrl: null,
          metadata: {
            ...object(connection.metadata),
            authorizationRequired: true,
            lastSyncError:
              "Reconnect this integration from the marketplace to renew authorization.",
          },
        },
        connection.updatedAt,
      );
    }
    const failure =
      error instanceof McpToolContractError || error instanceof McpProviderError
        ? error
        : new McpProviderError("MCP_PROVIDER_ERROR");
    await repository.createExecutionLog({
      organizationId,
      agentId: input.agentId,
      mcpConnectionId,
      toolName,
      callId: input.callId,
      status:
        failure instanceof McpToolContractError
          ? "validation_error"
          : failure.code === "MCP_AUTH_REQUIRED"
            ? "auth_required"
            : "error",
      latencyMs: Date.now() - startedAt,
      argumentsPreview: preview(input.arguments),
      error: failure.code,
    });
    throw failure;
  }
};
