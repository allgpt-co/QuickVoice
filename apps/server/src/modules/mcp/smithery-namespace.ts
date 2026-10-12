import { BadRequestError } from "../../common/errors/badRequest.js";

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type ResolveSmitheryNamespaceOptions = {
  apiBaseUrl: string;
  apiKey: string;
  preferredNamespace?: string;
  fetcher?: Fetcher;
};

const namespacePattern = /^[a-z0-9](?:[a-z0-9-]{1,37}[a-z0-9])?$/;

const apiUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/$/, "")}${path}`;

export const readSmitheryJson = async (response: Response): Promise<Record<string, any>> => {
  if (!response.body) throw new BadRequestError("MCP provider returned an empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_048_576) {
        await reader.cancel();
        throw new BadRequestError("MCP provider response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const result = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid JSON");
    return result;
  } catch {
    throw new BadRequestError("MCP provider returned invalid JSON");
  }
};

const configurationError = () =>
  new BadRequestError(
    "MCP connections are not configured correctly. Ask an administrator to verify the Smithery API key."
  );

/**
 * Resolve a namespace that the configured Smithery API key can actually use.
 *
 * Namespace names are globally unique, so a product-wide default such as
 * "quickvoice" is not safe. Prefer the configured namespace when it belongs to
 * the API key, otherwise reuse the first accessible namespace or create one.
 */
export async function resolveSmitheryNamespace({
  apiBaseUrl,
  apiKey,
  preferredNamespace,
  fetcher = fetch,
}: ResolveSmitheryNamespaceOptions) {
  const authorization = { Authorization: `Bearer ${apiKey}` };
  const listResponse = await fetcher(apiUrl(apiBaseUrl, "/namespaces"), {
    headers: authorization,
    signal: AbortSignal.timeout(10_000),
  });

  if (!listResponse.ok) {
    throw configurationError();
  }

  const listBody = await readSmitheryJson(listResponse);
  const namespaces = Array.isArray(listBody?.namespaces)
    ? listBody.namespaces
        .map((item: unknown) =>
          item && typeof item === "object" && "name" in item
            ? String(item.name)
            : ""
        )
        .filter(Boolean)
    : [];
  const preferred = preferredNamespace?.trim().toLowerCase();

  if (preferred && namespaces.includes(preferred)) {
    return preferred;
  }
  if (namespaces[0]) {
    return namespaces[0];
  }

  if (preferred && namespacePattern.test(preferred)) {
    const createPreferredResponse = await fetcher(
      apiUrl(apiBaseUrl, `/namespaces/${encodeURIComponent(preferred)}`),
      {
        method: "PUT",
        headers: authorization,
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (createPreferredResponse.ok) {
      return preferred;
    }

    // A configured name may already be owned by another Smithery account.
    // In that case, let Smithery generate a namespace for this API key.
    if (![409, 422].includes(createPreferredResponse.status)) {
      if ([401, 403].includes(createPreferredResponse.status)) {
        throw configurationError();
      }
    }
  }

  const createResponse = await fetcher(apiUrl(apiBaseUrl, "/namespaces"), {
    method: "POST",
    headers: authorization,
    signal: AbortSignal.timeout(10_000),
  });
  if (!createResponse.ok) {
    throw configurationError();
  }

  const createBody = await readSmitheryJson(createResponse);
  const createdName =
    typeof createBody?.name === "string"
      ? createBody.name
      : typeof createBody?.namespace?.name === "string"
        ? createBody.namespace.name
        : "";
  if (!createdName) {
    throw configurationError();
  }
  return createdName;
}
