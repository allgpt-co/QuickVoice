const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, "");

const splitOrigins = (value?: string) =>
  value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

export const serverBaseUrl = trimTrailingSlashes(
  process.env.SERVER_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:5000",
);

export const isSecureServerUrl = serverBaseUrl.startsWith("https://");

export const trustedOrigins = Array.from(
  new Set(
    [
      ...splitOrigins(process.env.CONSOLE_URL),
      ...splitOrigins(process.env.WEB_URL),
      ...splitOrigins(process.env.DOCS_URL),
      ...splitOrigins(process.env.CORS_ORIGINS),
      serverBaseUrl,
    ].map(trimTrailingSlashes),
  ),
);
