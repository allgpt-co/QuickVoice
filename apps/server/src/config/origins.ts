const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, "");

const splitOrigins = (value?: string) =>
  value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

export const buildTrustedOrigins = (env: NodeJS.ProcessEnv = process.env) => {
  const origins = [
    ...splitOrigins(env.CONSOLE_URL),
    ...splitOrigins(env.WEB_URL),
    env.SERVER_URL ?? env.BETTER_AUTH_URL ?? "http://localhost:5000",
  ].map(trimTrailingSlashes);

  return Array.from(new Set(origins));
};

export const serverBaseUrl = trimTrailingSlashes(
  process.env.SERVER_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:5000",
);

export const isSecureServerUrl = serverBaseUrl.startsWith("https://");

export const trustedOrigins = buildTrustedOrigins();
