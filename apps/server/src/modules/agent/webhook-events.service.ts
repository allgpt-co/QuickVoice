import prisma from "../../config/prisma.js";
import { NotFoundError } from "../../common/errors/notFound.js";
import * as agentRepository from "./agent.repository.js";

export type WebhookEvent = {
  organizationId: string;
  phase: "initiation" | "post_call";
  status: "delivered" | "retrying" | "failed";
  errorCode?: "timeout" | "http_error" | "invalid_response" | "delivery_error";
};

export async function recordWebhookEvent(agentId: string, event: WebhookEvent) {
  if (!await agentRepository.findByIdForOrg(event.organizationId, agentId)) {
    throw new NotFoundError("Agent not found");
  }
  await prisma.auditLog.create({
    data: {
      organizationId: event.organizationId,
      action: `agent_webhook.${event.phase}.${event.status}`,
      resourceType: "agent_webhook",
      resourceId: agentId,
      metadata: event.errorCode ? { errorCode: event.errorCode } : {},
    },
  });
}

export async function listWebhookEvents(organizationId: string, agentId: string) {
  if (!await agentRepository.findByIdForOrg(organizationId, agentId)) {
    throw new NotFoundError("Agent not found");
  }
  const rows = await prisma.auditLog.findMany({
    where: { organizationId, resourceType: "agent_webhook", resourceId: agentId },
    orderBy: [{ createdAt: "desc" }, { auditLogId: "desc" }],
    take: 10,
    select: { action: true, metadata: true, createdAt: true },
  });
  return rows.map((row) => ({
    phase: row.action.split(".")[1],
    status: row.action.split(".")[2],
    errorCode: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as { errorCode?: string }).errorCode ?? null : null,
    createdAt: row.createdAt.toISOString(),
  }));
}
