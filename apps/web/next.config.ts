import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const DEFAULT_CONSOLE_URL = "https://console.quickvoice.co";
const monorepoRoot = fileURLToPath(new URL("../..", import.meta.url));
const consoleUrl =
  process.env.NEXT_PUBLIC_CONSOLE_URL?.replace(/\/+$/, "") ||
  DEFAULT_CONSOLE_URL;

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "d35j3mps666d98.cloudfront.net",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.quickvoice.co" }],
        destination: "https://quickvoice.co/:path*",
        permanent: true,
      },
      {
        source: "/register",
        destination: `${consoleUrl}/register`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
