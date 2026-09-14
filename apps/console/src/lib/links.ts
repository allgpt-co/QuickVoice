const trimTrailingSlashes = (url: string) => url.replace(/\/+$/, "");

export const SERVER_URL = trimTrailingSlashes(
  process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:5000",
);

export const CONSOLE_URL =
  process.env.NEXT_PUBLIC_CONSOLE_URL === undefined
    ? undefined
    : trimTrailingSlashes(process.env.NEXT_PUBLIC_CONSOLE_URL);

export const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL === undefined
    ? "/"
    : trimTrailingSlashes(process.env.NEXT_PUBLIC_LANDING_URL);

export const API_VERSION = process.env.NEXT_PUBLIC_API_VERSION ?? "v1";

export const apiPath = (path: string) =>
  `${SERVER_URL}/api/${API_VERSION}${path}`;

export const invitationPath = (
  invitationId: string,
  page: "/accept-invitation" | "/login" | "/register" = "/accept-invitation",
) => invitationId ? `${page}?invitationId=${encodeURIComponent(invitationId)}` : page;
