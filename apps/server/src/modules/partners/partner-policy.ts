export type PartnerRelationshipState = "invited" | "active" | "suspended" | "revoked" | "transferred";
export type PartnerRole = "partner_billing" | "partner_deployment" | "partner_support" | "partner_template_publisher" | "partner_health_reader" | "client_admin";

export type DelegatedPartnerContext = {
  partnerOrganizationId: string;
  clientOrganizationId: string;
  actorUserId: string;
  reason: string;
  scope: PartnerRole[];
  expiresAt?: Date | string | null;
};

export type BrandingValidationResult = {
  valid: boolean;
  errors: string[];
  contrastRatio?: number;
};

const REQUIRED_NOTICE_SURFACES = ["security", "consent", "provider", "incident"] as const;

export function buildDelegatedAuditContext(context: DelegatedPartnerContext) {
  if (context.partnerOrganizationId === context.clientOrganizationId) {
    throw new Error("partner and client organizations must be different");
  }
  if (!context.reason.trim()) throw new Error("delegated access reason is required");

  return {
    partnerOrganizationId: context.partnerOrganizationId,
    clientOrganizationId: context.clientOrganizationId,
    actorUserId: context.actorUserId,
    reason: context.reason,
    scope: [...context.scope].sort(),
    expiresAt: context.expiresAt ? new Date(context.expiresAt).toISOString() : null,
  };
}

export function isDelegatedAccessActive({
  state,
  expiresAt,
  now = new Date(),
}: {
  state: PartnerRelationshipState;
  expiresAt?: Date | string | null;
  now?: Date;
}) {
  if (state !== "active") return false;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > now.getTime();
}

export function validatePartnerBranding({
  foreground,
  background,
  preservedNoticeSurfaces,
}: {
  foreground: string;
  background: string;
  preservedNoticeSurfaces: string[];
}): BrandingValidationResult {
  const errors: string[] = [];
  const contrastRatio = contrast(foreground, background);
  if (contrastRatio < 4.5) errors.push("brand foreground/background contrast must meet WCAG AA text contrast");

  for (const surface of REQUIRED_NOTICE_SURFACES) {
    if (!preservedNoticeSurfaces.includes(surface)) {
      errors.push(`mandatory ${surface} notice surface must remain branded as QuickVoice/system content`);
    }
  }

  return { valid: errors.length === 0, errors, contrastRatio };
}

function contrast(leftHex: string, rightHex: string) {
  const left = luminance(parseHex(leftHex));
  const right = luminance(parseHex(rightHex));
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function parseHex(value: string): [number, number, number] {
  const match = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`invalid hex color: ${value}`);
  const raw = match[1];
  if (!raw) throw new Error(`invalid hex color: ${value}`);
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

function luminance(rgb: [number, number, number]) {
  const normalize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const r = normalize(rgb[0]);
  const g = normalize(rgb[1]);
  const b = normalize(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
