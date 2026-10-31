import CustomApiError from "../../common/errors/customApiError.js";

const authorizationHosts = new Set([
  "accounts.google.com", "cloud.arcade.dev", "auth.arcade.dev",
  "connect.composio.dev", "app.composio.dev", "backend.composio.dev",
  "api.arcade.dev", "connect.smithery.ai", "smithery.run",
]);

export class McpProviderError extends CustomApiError {
  constructor(
    code: "MCP_AUTH_REQUIRED" | "MCP_PROVIDER_ERROR" | "MCP_TOOL_ERROR",
    readonly authorizationUrl: string | null = null,
    providerStatus?: number,
  ) {
    super(
      code === "MCP_AUTH_REQUIRED"
        ? "This connection needs authorization from your workspace administrator."
        : "The connected service could not complete this request. Please try again later.",
      code === "MCP_AUTH_REQUIRED" ? 409 : 502,
      { code, details: providerStatus ? { providerStatus } : undefined },
    );
  }
}

/** OAuth challenges are not successful tool data, even when delivered as HTTP 200.
 * https://docs.arcade.dev/en/build/create-tools/tool-basics/create-tool-auth
 */
export function inspectMcpResult(result: unknown, httpStatus = 200): McpProviderError | null {
  let authRequired = false;
  let toolError = false;
  let authorizationUrl: string | null = null;
  let remaining = 256;
  function visit(value: unknown, depth = 0): void {
    if (depth > 8 || remaining-- <= 0) return;
    if (typeof value === "string") {
      if (value.length > 65_536) return;
      try { visit(JSON.parse(value), depth + 1); return; } catch { /* Plain MCP text. */ }
      if (/auth(?:orization|entication)?\s+(?:is\s+)?(?:required|pending|not completed)|requires?\s+(?:user\s+)?auth|authoriz(?:e|ation)[\s\S]{0,120}(?:https:|url)/i.test(value)) {
        authRequired = true;
        for (const match of value.matchAll(/https:\/\/[^\s<>"']+/g)) {
          rememberUrl(match[0].replace(/[),.]+$/, ""));
        }
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.isError === true || node.success === false || node.successful === false) toolError = true;
    if (node.authorizationRequired === true || node.auth_required === true ||
        ["auth_required", "authorization_required"].includes(String(node.code ?? node.error ?? node.status ?? node.type).toLowerCase())) {
      authRequired = true;
    }
    for (const key of ["authorization", "auth"]) {
      const auth = node[key] as Record<string, unknown> | undefined;
      if (auth && ["pending", "not_started", "required"].includes(String(auth.status).toLowerCase())) authRequired = true;
    }
    // Restrict traversal to response envelopes, not arbitrary calendar/document data.
    for (const key of ["authorization", "auth", "error", "data", "output", "value", "structuredContent", "content", "message", "text", "details", "detail"]) {
      if (node[key] !== undefined) visit(node[key], depth + 1);
    }
    for (const key of ["authorizationUrl", "authorization_url", "authUrl", "url"]) {
      if (typeof node[key] === "string") rememberUrl(node[key] as string);
    }
  }
  function rememberUrl(raw: string): void {
    try {
      const url = new URL(raw);
      if (raw.length <= 8192 && url.protocol === "https:" && !url.username && !url.password &&
          !url.port && authorizationHosts.has(url.hostname) &&
          (url.hostname !== "accounts.google.com" || url.pathname.startsWith("/o/oauth2/"))) {
        authorizationUrl = url.href;
      }
    } catch { /* Untrusted or malformed links never become console actions. */ }
  }
  visit(result);
  if (authRequired) return new McpProviderError("MCP_AUTH_REQUIRED", authorizationUrl, httpStatus);
  if (httpStatus < 200 || httpStatus >= 300) return new McpProviderError("MCP_PROVIDER_ERROR", null, httpStatus);
  if (toolError) return new McpProviderError("MCP_TOOL_ERROR");
  return null;
}

export function withoutMcpAuthorizationLinks(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s"<>]+/g, "[authorization link withheld]");
  }
  if (Array.isArray(value)) return value.map(withoutMcpAuthorizationLinks);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withoutMcpAuthorizationLinks(child)]));
}
