export type CollaborationResourceType =
  | "agent"
  | "workflow"
  | "campaign"
  | "integration"
  | "evaluation_suite"
  | "deployment";

export type ReviewDecision = "approved" | "rejected" | "changes_requested";
export type ReviewStatus = "pending" | ReviewDecision | "expired" | "invalidated";
export type NotificationChannel = "in_app" | "email" | "webhook" | "slack" | "teams";

export type CollaborationDiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
  redacted: boolean;
};

const SECRET_FIELD_PATTERN = /(secret|token|password|credential|api[-_]?key|auth|signature|private[-_]?key)/i;
const REDACTED = "[redacted]";

export function actionNeedsAcknowledgement(action: string) {
  return ["review_requested", "changes_requested", "approval_expiring", "incident_assigned"].includes(action);
}

export function canReviewerDecide({
  authorUserId,
  reviewerUserId,
  authorSeparationRequired = true,
}: {
  authorUserId: string;
  reviewerUserId: string;
  authorSeparationRequired?: boolean;
}) {
  if (!authorSeparationRequired) return true;
  return authorUserId !== reviewerUserId;
}

export function resolveReviewStatus({
  status,
  expiresAt,
  now = new Date(),
}: {
  status: ReviewStatus;
  expiresAt?: Date | string | null;
  now?: Date;
}): ReviewStatus {
  if (status !== "pending" || !expiresAt) return status;
  return new Date(expiresAt).getTime() <= now.getTime() ? "expired" : status;
}

export function buildNotificationDeduplicationKey({
  eventId,
  recipientUserId,
  channel,
}: {
  eventId: string;
  recipientUserId: string;
  channel: NotificationChannel;
}) {
  return `${eventId}:${recipientUserId}:${channel}`;
}

export function redactConfigDiff(before: unknown, after: unknown) {
  const entries: CollaborationDiffEntry[] = [];
  collectDiff(entries, [], before, after);
  return entries;
}

function collectDiff(entries: CollaborationDiffEntry[], path: string[], before: unknown, after: unknown) {
  if (stableValue(before) === stableValue(after)) return;

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      collectDiff(entries, [...path, key], before[key], after[key]);
    }
    return;
  }

  const fieldPath = path.join(".") || "value";
  const redacted = SECRET_FIELD_PATTERN.test(fieldPath);
  entries.push({
    path: fieldPath,
    before: redacted ? REDACTED : before,
    after: redacted ? REDACTED : after,
    redacted,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function stableValue(value: unknown) {
  if (isPlainObject(value)) {
    return JSON.stringify(
      Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
    );
  }
  return JSON.stringify(value);
}
