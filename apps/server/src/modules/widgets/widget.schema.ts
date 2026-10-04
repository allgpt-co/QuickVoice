import { z } from "zod";

export const widgetPositionSchema = z.enum([
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
]);
export const widgetLauncherSizeSchema = z.enum([
  "compact",
  "comfortable",
  "large",
]);

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a 6-digit hex color");

const optionalImageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .nullable()
  .transform((value) => {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  });

const defaultWidgetTheme = {
  primaryColor: "#002FA7",
  accentColor: "#0F172A",
  surfaceColor: "#FFFFFF",
  textColor: "#111827",
  mutedTextColor: "#667085",
  buttonTextColor: "#FFFFFF",
  borderColor: "#DADDE3",
  position: "bottom-right" as const,
  launcherSize: "comfortable" as const,
  panelWidth: 340,
  borderRadius: 16,
  defaultOpen: false,
  showAvatar: true,
  avatarImageUrl: null,
  avatarOrbColor1: "#002FA7",
  avatarOrbColor2: "#00F0FF",
  brandName: "QuickVoice",
  actionText: "Talk to us",
  welcomeText: "Talk with our voice agent.",
  startButtonText: "Start call",
  endButtonText: "End call",
  connectingText: "Connecting",
  listeningText: "Listening",
  speakingText: "Assistant speaking",
  endedText: "Call ended",
  whiteLabel: false,
};

export const widgetThemeSchema = z
  .object({
    primaryColor: hexColorSchema.default("#002FA7"),
    accentColor: hexColorSchema.default("#0F172A"),
    surfaceColor: hexColorSchema.default("#FFFFFF"),
    textColor: hexColorSchema.default("#111827"),
    mutedTextColor: hexColorSchema.default("#667085"),
    buttonTextColor: hexColorSchema.default("#FFFFFF"),
    borderColor: hexColorSchema.default("#DADDE3"),
    position: widgetPositionSchema.default("bottom-right"),
    launcherSize: widgetLauncherSizeSchema.default("comfortable"),
    panelWidth: z.coerce.number().int().min(280).max(420).default(340),
    borderRadius: z.coerce.number().int().min(0).max(32).default(16),
    defaultOpen: z.boolean().default(false),
    showAvatar: z.boolean().default(true),
    avatarImageUrl: optionalImageUrlSchema.default(null),
    avatarOrbColor1: hexColorSchema.default("#002FA7"),
    avatarOrbColor2: hexColorSchema.default("#00F0FF"),
    brandName: z.string().trim().min(1).max(80).default("QuickVoice"),
    actionText: z.string().trim().min(1).max(60).default("Talk to us"),
    welcomeText: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .default("Talk with our voice agent."),
    startButtonText: z.string().trim().min(1).max(40).default("Start call"),
    endButtonText: z.string().trim().min(1).max(40).default("End call"),
    connectingText: z.string().trim().min(1).max(40).default("Connecting"),
    listeningText: z.string().trim().min(1).max(40).default("Listening"),
    speakingText: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .default("Assistant speaking"),
    endedText: z.string().trim().min(1).max(40).default("Call ended"),
    whiteLabel: z.boolean().default(false),
  })
  .default(defaultWidgetTheme);

const originInputSchema = z.string().trim().min(1).max(255);

export const createAgentWidgetSchema = z.object({
  name: z.string().trim().min(2).max(80),
  enabled: z.boolean().default(false),
  allowedOrigins: z.array(originInputSchema).max(20).default([]),
  theme: widgetThemeSchema,
  consentRequired: z.boolean().default(true),
  consentText: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .default("This voice call may be recorded and transcribed."),
});

export const updateAgentWidgetSchema = createAgentWidgetSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const createPublicWidgetSessionSchema = z
  .object({
    visitorId: z.string().trim().max(120).optional(),
  })
  .strict()
  .default({});

export const endPublicWidgetSessionSchema = z.object({
  endToken: z.string().trim().min(20).max(256),
});

export type WidgetTheme = z.infer<typeof widgetThemeSchema>;
export type CreateAgentWidgetInput = z.infer<typeof createAgentWidgetSchema>;
export type UpdateAgentWidgetInput = z.infer<typeof updateAgentWidgetSchema>;
export type CreatePublicWidgetSessionInput = z.infer<
  typeof createPublicWidgetSessionSchema
>;
export type EndPublicWidgetSessionInput = z.infer<
  typeof endPublicWidgetSessionSchema
>;
