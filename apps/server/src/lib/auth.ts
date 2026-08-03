import { APIError, betterAuth } from "better-auth";
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
