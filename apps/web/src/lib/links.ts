export const CONTACT_URL = "/company/contact";
export const DEMO_BOOKING_URL = "https://tidycal.com/team/quickvoice/demo";

export const GITHUB_REPO_URL = "https://github.com/allgpt-co/QuickVoice";
export const GITHUB_DOCS_URL = `${GITHUB_REPO_URL}/tree/main/docs`;
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
export const GITHUB_DISCUSSIONS_URL = `${GITHUB_REPO_URL}/discussions`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const GITHUB_CONTRIBUTING_URL = `${GITHUB_REPO_URL}/blob/main/CONTRIBUTING.md`;
export const GITHUB_LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`;
export const GITHUB_SECURITY_URL = `${GITHUB_REPO_URL}/blob/main/SECURITY.md`;

const DEFAULT_CONSOLE_URL = "https://console.quickvoice.co";
const consoleUrl =
  process.env.NEXT_PUBLIC_CONSOLE_URL?.replace(/\/+$/, "") ||
  DEFAULT_CONSOLE_URL;

const consolePath = (path: string) => `${consoleUrl}${path}`;

export const LOGIN_URL = consolePath("/login");
export const REGISTER_URL = consolePath("/register");

export const CTA_URLS = {
  contact: CONTACT_URL,
  demo: DEMO_BOOKING_URL,
  login: LOGIN_URL,
  register: REGISTER_URL,
} as const;
