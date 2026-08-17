// Authentication middleware.
//
// Three supported caller types:
//   1. Frontend (cookie)          - better-auth session cookie
//   2. External API (api key)     - "x-api-key" header
//   3. Internal server-to-server  - "Authorization: Bearer $INTERNAL_API_KEY"
//      TRUST BOUNDARY: internal callers bypass BOTH authentication and
//      authorization. They must pass userId and organizationId as headers,
//      query params, or in the request body. Use only for trusted
//      server-to-server calls (webhooks, cron).
//
// On success, attaches `req.auth` with userId / activeOrganizationId /
// authMethod / session so downstream middleware and handlers do not need to
// re-query.

import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { UnauthenticatedError } from "../common/errors/unauthenticated.js";
import { recordAuditEvent } from "../modules/audit/audit-log.service.js";
import prisma from "../config/prisma.js";
import { resolveOrganizationApiKeyAuth } from "./api-key-auth.js";

const API_KEY_HEADER = "x-api-key";
const INTERNAL_ORG_HEADER = "x-organization-id";
const INTERNAL_USER_HEADER = "x-user-id";

const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    // 1. Internal server-to-server bypass
    const bearerToken = getBearerToken(req.headers.authorization);
    if (bearerToken) {
      if (matchesInternalApiKey(bearerToken)) {
        // Internal callers must assert who they are acting on behalf of by
        // passing userId and organizationId as headers, query params, or in
        // the request body. We fail fast
        // here so a malformed call gets a clear 401 instead of a downstream
        // Prisma error caused by an undefined userId.
        const internalUserId =
          getHeaderValue(req.headers[INTERNAL_USER_HEADER]) ??
          getStringValue(req.body?.userId) ??
          getStringValue(req.query?.userId);
        const internalOrgId =
          getHeaderValue(req.headers[INTERNAL_ORG_HEADER]) ??
          getStringValue(req.body?.organizationId) ??
          getStringValue(req.query?.organizationId);
        if (!internalUserId || !internalOrgId) {
          throw new UnauthenticatedError(
            "Internal calls must provide x-user-id and x-organization-id",
          );
        }

        req.auth = {
          userId: internalUserId,
          activeOrganizationId: internalOrgId,
          authMethod: "internal",
          session: null,
        };
        return next();
      }
    }

    // 2. API key auth. The plugin-owned referenceId is the sole tenant source.
    // API-key metadata is client controlled and must never provide identity,
    // tenant, or authorization data.
    const apiKeyHeaderValue = getHeaderValue(req.headers[API_KEY_HEADER]);
    if (apiKeyHeaderValue) {
      const verified = await auth.api.verifyApiKey({
        body: { key: apiKeyHeaderValue },
      });

      if (!verified?.valid || !verified.key) {
        throw new UnauthenticatedError("Invalid API key");
      }

      const resolved = await resolveOrganizationApiKeyAuth({
        key: verified.key,
        findOrganizationPrincipal: async (organizationId) => {
          const member = await prisma.member.findFirst({
            where: {
              organizationId,
              role: { in: ["owner", "admin"] },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { userId: true },
          });
          return member?.userId ?? null;
        },
      });

      req.auth = {
        userId: resolved.userId,
        activeOrganizationId: resolved.organizationId,
        authMethod: "apiKey",
        session: null,
        apiKeyId: resolved.apiKeyId,
        apiKeyPermissions: resolved.permissions,
      };
      void recordAuditEvent({
        organizationId: resolved.organizationId,
        userId: resolved.userId,
        action: "api_key.authenticated",
        resourceType: "api_key",
        resourceId: resolved.apiKeyId,
        metadata: {
          method: req.method,
          path: req.originalUrl || req.url,
        },
      });
      return next();
    }

    // 3. Cookie / standard session path - use the org the user picked in the UI.
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      throw new UnauthenticatedError("Unauthorized");
    }

    const sess = (
      session as {
        session?: { activeOrganizationId?: string | null };
      }
    ).session;

    req.auth = {
      userId: (session as { user: { id: string } }).user.id,
      activeOrganizationId: sess?.activeOrganizationId ?? null,
      authMethod: "session",
      session,
    };

    return next();
  } catch (error) {
    next(error);
  }
};

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value)) return getStringValue(value[0]);
  return null;
}

function getBearerToken(value: string | undefined): string | null {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1];
  return token ? token.replace(/^Bearer\s+/i, "").trim() : null;
}

export const requireInternalApiKey = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    // 1. Internal server-to-server bypass
    const bearerToken = getBearerToken(req.headers.authorization);
    if (!bearerToken) {
      throw new UnauthenticatedError("Unauthorized");
    }

    if (!matchesInternalApiKey(bearerToken)) {
      throw new UnauthenticatedError("Unauthorized");
    }

    return next();
  } catch (error) {
    next(error);
  }
};

export function matchesInternalApiKey(supplied: string) {
  const expected = process.env.INTERNAL_API_KEY?.trim();
  if (!expected) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export default authMiddleware;
