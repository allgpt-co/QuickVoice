import { isIP } from "node:net";

// Trust only operator-confirmed proxy addresses, never arbitrary forwarded headers.
export function trustedProxies(value = process.env.TRUSTED_PROXY_CIDRS): false | string[] {
  if (!value?.trim()) return false;
  const entries = value.split(",").map((entry) => entry.trim());
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split("/");
    const version = isIP(address ?? "");
    if (!version || extra !== undefined || (prefix !== undefined && (
      !/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)
    ))) {
      throw new Error("TRUSTED_PROXY_CIDRS must contain explicit proxy IPs or non-global CIDRs");
    }
  }
  return entries;
}
