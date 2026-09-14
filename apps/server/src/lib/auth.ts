import { APIError, betterAuth } from "better-auth";
import {
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { stripe } from "@better-auth/stripe";
import bcrypt from "bcryptjs";

import prisma from "../config/prisma.js";
import { stripeClient } from "../config/stripe.js";
import { sendEmail } from "./mailer.js";
import { ac, roles } from "./permissions.js";

import { plans } from "../../data/plans.js";
import {
  consoleBaseUrl,
  isSecureServerUrl,
  serverBaseUrl,
  trustedOrigins,
} from "../config/origins.js";
import { cleanupOrganizationDeletionHook } from "../modules/organization/organization-cleanup.service.js";
import { ensureBillingAccount } from "../modules/billing/wallet-ledger.service.js";
import { maybeGrantSignupCredit } from "../modules/billing/signup-credit.service.js";
import { ORGANIZATION_API_KEY_PERMISSIONS } from "../middleware/api-key-auth.js";
import { isHostedBilling } from "../config/billing-mode.js";

// ─── Better Auth server instance ────────────────────────────────────────────
export const auth = betterAuth({
  baseURL: serverBaseUrl,
  basePath: `/api/${process.env.API_VERSION! || "v1"}/auth`,
  trustedOrigins,
  advanced: {
    useSecureCookies: isSecureServerUrl,
    crossSubDomainCookies: {
      enabled: !!process.env.COOKIE_DOMAIN,
      domain: process.env.COOKIE_DOMAIN,
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/verify-email") {
        const callbackURL = ctx.query?.callbackURL;
        if (
          callbackURL &&
          !ctx.context.isTrustedOrigin(callbackURL, {
            allowRelativePaths: true,
          })
        ) {
          throw new APIError("FORBIDDEN", {
            code: "INVALID_CALLBACK_URL",
            message: "Invalid callback URL",
          });
        }

        // Email links run on the API origin; relative callbacks belong to the console.
        const destination = new URL(callbackURL || "/orgs", consoleBaseUrl);
        destination.searchParams.delete("verified");
        destination.searchParams.delete("error");
        return {
          context: {
            query: { ...ctx.query, callbackURL: destination.toString() },
          },
        };
      }

      if (
        ctx.path !== "/sign-up/email" ||
        typeof ctx.body?.email !== "string"
      ) {
        return;
      }

      // Match Better Auth's email normalization before its generic duplicate response.
      const existingUser = await prisma.user.findUnique({
        where: { email: ctx.body.email.toLowerCase() },
        select: { id: true },
      });
      if (existingUser) {
        throw new APIError("BAD_REQUEST", {
          message: "An account with this email address already exists",
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/verify-email") return;
      const result = ctx.context.returned;
      const location = ctx.context.responseHeaders?.get("location");
      const callbackURL = ctx.query?.callbackURL;
      if (
        !isAPIError(result) ||
        result.status !== "FOUND" ||
        !location ||
        !callbackURL
      )
        return;

      if (location !== callbackURL) {
        // Better Auth appends errors to the callback, even when it has a fragment.
        const error = new URLSearchParams(
          location.slice(callbackURL.length),
        ).get("error");
        if (error) {
          const destination = new URL("/login", consoleBaseUrl);
          destination.searchParams.set("error", error);
          throw ctx.redirect(destination.toString());
        }
        return;
      }

      const session = ctx.context.newSession ?? (await getSessionFromCtx(ctx));
      const destination = new URL(callbackURL);
      if (destination.origin === new URL(consoleBaseUrl).origin) {
        if (!session) {
          // Reused links do not create another session in Better Auth.
          destination.pathname = "/login";
        } else if (
          ["/", "/login", "/verify", "/dashboard"].includes(
            destination.pathname,
          )
        ) {
          destination.pathname = session.session.activeOrganizationId
            ? "/dashboard"
            : "/orgs";
        }
      }
      destination.searchParams.set("verified", "true");
      // Redirect after Better Auth has verified the token and set the session cookie.
      throw ctx.redirect(destination.toString());
    }),
  },
  databaseHooks: {
    user: {
      update: {
        after: async (user) => {
          if (user.emailVerified) {
            await maybeGrantSignupCredit({ userId: user.id });
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    password: {
      hash: async (password) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }) => {
        return await bcrypt.compare(password, hash);
      },
    },
    async sendResetPassword({ user, url }) {
      await sendEmail("resetPassword", user.email, url, user.name);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await sendEmail("verifyEmail", user.email, url, user.name);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    admin(),
    apiKey({
      references: "organization",
      enableSessionForAPIKeys: false,
      enableMetadata: false,
      permissions: {
        defaultPermissions: ORGANIZATION_API_KEY_PERMISSIONS,
      },
    }),
    organization({
      ac,
      roles,
      dynamicAccessControl: {
        enabled: true,
      },
      organizationHooks: {
        afterCreateOrganization: async ({ organization: org, user }) => {
          await ensureBillingAccount(org.id);
          await maybeGrantSignupCredit({
            userId: user.id,
            organizationId: org.id,
          });
        },
        beforeDeleteOrganization: async ({ organization: org }) => {
          try {
            await cleanupOrganizationDeletionHook(org);
          } catch (error) {
            console.error("[organization] external cleanup blocked deletion", {
              organizationId: org.id,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown cleanup error",
            });
            throw new APIError("BAD_REQUEST", {
              message:
                "Organization deletion did not complete. Cleanup is retry-safe and may already have released provider resources; retry after checking provider connectivity.",
            });
          }
        },
      },
    }),
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: false,
      subscription: {
        enabled: true,
        defaultPlan: "free",
        plans: plans,
        authorizeReference: async ({ user, referenceId, action }) => {
          // Prepaid wallets replace new plan purchases. Keep the plugin active
          // only so existing subscriptions can be viewed and sunset cleanly.
          if (
            action === "upgrade-subscription" ||
            action === "restore-subscription" ||
            action === "billing-portal"
          ) {
            return false;
          }
          const member = await prisma.member.findUnique({
            where: {
              organizationId_userId: {
                organizationId: referenceId,
                userId: user.id,
              },
            },
            select: { role: true },
          });
          if (action === "list-subscription") return member !== null;
          return member?.role === "owner" || member?.role === "admin";
        },
      },
      organization: isHostedBilling ? { enabled: true } : undefined,
    }),
  ],
});
