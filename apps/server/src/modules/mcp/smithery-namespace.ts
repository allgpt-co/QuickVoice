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

const responseMessage = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  return typeof body?.message === "string" ? body.message : "";
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
  });

  if (!listResponse.ok) {
    throw configurationError();
  }

  const listBody = await listResponse.json().catch(() => ({}));
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
      }
    );
    if (createPreferredResponse.ok) {
      return preferred;
    }

    // A configured name may already be owned by another Smithery account.
    // In that case, let Smithery generate a namespace for this API key.
    if (![409, 422].includes(createPreferredResponse.status)) {
      const message = await responseMessage(createPreferredResponse);
      if (/credential|token|unauthor|forbidden/i.test(message)) {
        throw configurationError();
      }
    }
  }

  const createResponse = await fetcher(apiUrl(apiBaseUrl, "/namespaces"), {
    method: "POST",
    headers: authorization,
  });
  if (!createResponse.ok) {
    throw configurationError();
  }

  const createBody = await createResponse.json().catch(() => ({}));
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
