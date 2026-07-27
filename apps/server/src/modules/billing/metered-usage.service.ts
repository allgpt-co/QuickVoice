import prisma from "../../config/prisma.js";

type ReportCallUsageArgs = {
  organizationId: string;
  callId: string;
  durationSeconds: number;
  timestamp?: Date;
};

export function buildCallMeterEvent(
  args: ReportCallUsageArgs,
  eventName: string,
  stripeCustomerId: string,
) {
  const billableMinutes = Math.max(1, Math.ceil(args.durationSeconds / 60));
  return {
    params: {
      event_name: eventName,
      identifier: `call:${args.callId}`,
      timestamp: Math.floor((args.timestamp?.getTime() ?? Date.now()) / 1000),
      payload: {
        stripe_customer_id: stripeCustomerId,
        value: String(billableMinutes),
        organization_id: args.organizationId,
        call_id: args.callId,
      },
    },
    requestOptions: {
      idempotencyKey: `quickvoice-call:${args.callId}`,
    },
    billableMinutes,
  };
}

export async function reportCallMinutesUsage(args: ReportCallUsageArgs) {
  const eventName = process.env.STRIPE_CALL_MINUTES_METER_EVENT_NAME;
  if (!eventName)
    return { skipped: true, reason: "meter_event_not_configured" };
  if (args.durationSeconds <= 0)
    return { skipped: true, reason: "zero_duration" };

  const organization = await prisma.organization.findUnique({
    where: { id: args.organizationId },
    select: { stripeCustomerId: true },
  });
  if (!organization?.stripeCustomerId) {
    return { skipped: true, reason: "stripe_customer_not_found" };
  }

  const { stripeClient } = await import("../../config/stripe.js");
  const event = buildCallMeterEvent(
    args,
    eventName,
    organization.stripeCustomerId,
  );
  await stripeClient.billing.meterEvents.create(
    event.params,
    event.requestOptions,
  );

  return { skipped: false, value: event.billableMinutes };
}
