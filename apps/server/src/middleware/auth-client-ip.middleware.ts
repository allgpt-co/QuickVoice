import { isIP } from "node:net";
import type { RequestHandler } from "express";

export const AUTH_CLIENT_IP_HEADER = "x-quickvoice-client-ip";

export const AUTH_IP_ADDRESS_OPTIONS = {
  ipAddressHeaders: [AUTH_CLIENT_IP_HEADER],
  // Express already resolved the chain. Filtering this single client address
  // again can discard LAN/VPN/CDN IPs and collapse them into a shared bucket.
  trustedProxies: [] as string[],
};

// Better Auth cannot inspect the socket peer. Resolve proxy trust in Express
// and overwrite the private header before any auth handler/session lookup.
export const authClientIpMiddleware: RequestHandler = (req, res, next) => {
  const resolved = req.ip;
  const ip = resolved && isIP(resolved) ? resolved : req.socket.remoteAddress;
  if (!ip || !isIP(ip)) {
    res.status(400).json({ message: "Unable to determine client IP" });
    return;
  }
  req.headers[AUTH_CLIENT_IP_HEADER] = ip;
  next();
};
