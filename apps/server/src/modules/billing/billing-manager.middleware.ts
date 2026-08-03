import type { NextFunction, Request, Response } from "express";

import prisma from "../../config/prisma.js";
import { ForbiddenError } from "../../common/errors/forbidden.js";

/**
 * Money-moving UI operations are reserved for the built-in owner/admin roles.
 * Internal callers remain inside the documented server trust boundary. API
 * keys are organization credentials without a human principal and can never
 * perform wallet, payment-method, or number ownership mutations.
 */
export async function requireBuiltInBillingManager(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (req.auth?.authMethod === "internal") {
      return next();
    }
    if (req.auth?.authMethod === "apiKey") {
      throw new ForbiddenError(
        "API keys cannot perform billing or phone-number ownership changes",
      );
    }
    const organizationId = req.auth?.activeOrganizationId;
    const userId = req.auth?.userId;
    if (!organizationId || !userId) {
      throw new ForbiddenError("No active organization for this request");
    }
    const membership = await prisma.member.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      select: { role: true },
    });
    if (membership?.role !== "owner" && membership?.role !== "admin") {
      throw new ForbiddenError(
        "Only organization owners and admins can manage billing",
      );
    }
    return next();
  } catch (error) {
    next(error);
  }
}
