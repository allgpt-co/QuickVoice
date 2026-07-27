import { z } from "zod";
import { sourceType } from "../../../prisma/generated/prisma/client.js";

export const kbItemApiSchema = z
  .object({
    name: z.string().trim().min(1, "Document name is required").max(200),
    sourceType: z.nativeEnum(sourceType),
    url: z
      .union([
        z.string().max(2_048).url("Invalid URL"),
        z.literal(""),
        z.null(),
        z.undefined(),
      ])
      .optional()
      .nullable(),
    s3Key: z.string().max(1_024).optional().nullable(),
    originalFileName: z.string().max(255).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.sourceType === sourceType.URL) {
      if (!data.url || data.url === "") {
        ctx.addIssue({
          path: ["url"],
          message: "URL is required for URL source",
          code: z.ZodIssueCode.custom,
        });
      }
    } else if (!data.s3Key) {
      ctx.addIssue({
        path: ["s3Key"],
        message: "File is required for this source type",
        code: z.ZodIssueCode.custom,
      });
    }
  });

export const createKbApiSchema = z
  .object({
    agentId: z.string().min(1, "No agent selected").uuid("Invalid agentId"),
    documents: z
      .array(kbItemApiSchema)
      .min(1, "At least one document is required")
      .max(50, "A maximum of 50 documents can be processed at once"),
  })
  .strip()
  .superRefine((data, ctx) => {
    const references = data.documents.map((document) =>
      document.sourceType === sourceType.URL ? document.url : document.s3Key,
    );
    const seen = new Set<string>();
    for (const [index, reference] of references.entries()) {
      if (!reference || !seen.has(reference)) {
        if (reference) seen.add(reference);
        continue;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate document reference",
        path: ["documents", index],
      });
    }
  });

export const updateKbApiSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Document name is required")
      .max(200)
      .optional(),
    agentId: z
      .string()
      .min(1, "No agent selected")
      .uuid("Invalid agentId")
      .optional(),
    url: z.string().trim().url("Enter a valid URL").optional(),
  })
  .strip()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.agentId !== undefined ||
      data.url !== undefined,
    { message: "At least one field must be updated" },
  );

export const kbUploadUrlQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  fileSize: z.coerce.number().int().positive(),
});

export type CreateKbInput = z.infer<typeof createKbApiSchema>;
export type CreateKbArgs = CreateKbInput & {
  organizationId: string;
  userId: string;
};

export type UpdateKbInput = z.infer<typeof updateKbApiSchema>;
export type UpdateKbArgs = UpdateKbInput & {
  organizationId: string;
  kbId: string;
};

export const listKbQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
});
export type ListKbQuery = z.infer<typeof listKbQuerySchema>;
export type ListKbArgs = ListKbQuery & { organizationId: string };
