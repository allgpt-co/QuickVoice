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
import { cleanupOrganizationBeforeDeletion } from "../modules/organization/organization-cleanup.service.js";

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
      enableSessionForAPIKeys: true,
    }),
    organization({
      ac,
      roles,
      dynamicAccessControl: {
        enabled: true,
      },
      organizationHooks: {
        beforeDeleteOrganization: async ({ organization: org }) => {
          try {
            await cleanupOrganizationBeforeDeletion({
              organizationId: org.id,
              stripeCustomerId:
                typeof org.stripeCustomerId === "string"
                  ? org.stripeCustomerId
                  : null,
            });
          } catch (error) {
            console.error(
              "[organization] external cleanup blocked deletion",
              {
                organizationId: org.id,
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown cleanup error",
              },
            );
            throw new APIError("BAD_REQUEST", {
              message:
                "Organization cleanup failed. No database deletion was performed; retry after checking provider connectivity.",
            });
          }
        },
      },
    }),
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        defaultPlan: "free",
        plans: plans,
        authorizeReference: async ({ user, referenceId }) => {
          const member = await prisma.member.findUnique({
            where: {
              organizationId_userId: {
                organizationId: referenceId,
                userId: user.id,
              },
            },
            select: { id: true },
          });

          return member !== null;
        },
      },
      organization: {
        enabled: true,
      },
    }),
  ],
});
