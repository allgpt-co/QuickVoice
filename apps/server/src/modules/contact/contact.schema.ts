import { z } from "zod";

// A single mailbox only: never accept display names, address lists or headers.
export const contactEmailAddressSchema = z.string().trim().max(254).email();

export const contactSubmissionSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: contactEmailAddressSchema.transform((value) => value.toLowerCase()),
  company: z.string().trim().max(160),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine(
      (value) => !value || /^[+]?[1-9][\d\s().-]{3,24}$/.test(value),
      "Invalid phone number",
    ),
  lookingFor: z.string().trim().min(1).max(120),
  message: z.string().trim().min(10).max(5000),
  source: z.literal("quickvoice-web-contact"),
  submittedAt: z.iso.datetime(),
  // Optional for API-first rollout; legacy web deployments remain compatible.
  submissionId: z.uuid({ version: "v4" }).optional(),
  formLocation: z.enum(["homepage", "contact_page"]).optional(),
  attribution: z.strictObject({
    landingPage: z.string().max(180).regex(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/),
    source: z.enum(["google", "bing", "duckduckgo", "github", "linkedin", "chatgpt", "perplexity", "referral", "direct", "unknown"]),
    medium: z.enum(["organic", "paid", "referral", "ai_assistant", "direct", "unknown"]),
    method: z.literal("browser_observed"),
  }).optional(),
});

export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;
