import { z } from "zod";
import { TelephonyProvider } from "../../../prisma/generated/prisma/client.js";

const providerSchema = z.preprocess((value) => {
  if (typeof value === "string") return value.toUpperCase();
  return value;
}, z.nativeEnum(TelephonyProvider));

// Query params for GET /numbers/search. Parsed directly in the controller
// against req.query because the existing validate middleware only parses
// req.body.
export const searchNumbersSchema = z.object({
  provider: providerSchema,
  country: z
    .string()
    .length(2, "country must be an ISO-3166 alpha-2 code (e.g. 'US')"),
  areaCode: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
export type SearchNumbersInput = z.infer<typeof searchNumbersSchema>;

// Body for POST /numbers. `phoneNumber` is the E.164 that was picked from a
// prior search result.
export const buyNumberSchema = z.object({
  provider: providerSchema,
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, "phoneNumber must be E.164 format (e.g. +14155551234)"),
  quoteId: z.string().min(1).max(4096).optional(),
});
export type BuyNumberInput = z.infer<typeof buyNumberSchema>;
export type BuyNumberArgs = BuyNumberInput & {
  organizationId: string;
  userId: string;
};

// Body for PATCH /numbers/:phId. `agentId: null` unlinks; a uuid links to that
// agent. `agentId` must be explicitly present — partial update surface
// deliberately narrow for v1.
export const updateNumberSchema = z.object({
  agentId: z.string().uuid("Invalid agent ID").nullable(),
});
export type UpdateNumberInput = z.infer<typeof updateNumberSchema>;
export type UpdateNumberArgs = UpdateNumberInput & {
  organizationId: string;
  phId: string;
};
