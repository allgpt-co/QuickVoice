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
});

export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;
