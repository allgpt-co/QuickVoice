// Seed script — populates an organization with agents, phone numbers, call
// logs, transcripts, and knowledge sources so the console UI has something to
// show.
//
// Usage (from repo root):
//   pnpm --filter server seed -- --email you@example.com
//   pnpm --filter server seed -- --org-slug my-workspace
//
// Safe to run multiple times — existing rows are not deleted, new rows are
// appended. Re-running will add more call logs, so run once per org unless
// you want to pile up data.

import "dotenv/config";
import { randomUUID } from "node:crypto";
import prisma from "../src/config/prisma.js";
import type { CallStatus } from "./generated/prisma/enums.js";

// -------- CLI parsing ---------------------------------------------------
function parseArgs() {
  const args: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (!flag?.startsWith("--")) continue;
    const key = flag.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

// -------- Random helpers ------------------------------------------------
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function range(n: number) {
  return Array.from({ length: n }, (_, i) => i);
}
function randomPhone() {
  const area = 200 + Math.floor(Math.random() * 800);
  const exch = 200 + Math.floor(Math.random() * 800);
  const sub = String(1000 + Math.floor(Math.random() * 9000));
  return `+1${area}${exch}${sub}`;
}
function daysAgo(days: number, hours = 0, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  d.setMinutes(d.getMinutes() - minutes);
  return d;
}
function hoursAgo(hours: number, minutes = 0) {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  d.setMinutes(d.getMinutes() - minutes);
  return d;
}

// -------- Fixtures ------------------------------------------------------
const AGENT_FIXTURES = [
  {
    name: "Sales Qualifier",
    slug: "sales-qualifier",
    isActive: true,
    isConfigured: true,
    systemPrompt:
      "You are a friendly sales development rep qualifying inbound leads for QuickVoice. Ask about team size, use case, and timeline. Keep turns under 20 seconds.",
    firstMessage:
      "Hey, thanks for reaching out to QuickVoice! Mind if I ask a few quick questions to point you to the right product?",
    voiceId: "aura-2-asteria-en",
  },
  {
    name: "Support Intake",
    slug: "support-intake",
    isActive: true,
    isConfigured: true,
    systemPrompt:
      "You are a polite support agent. Collect the caller's email, account ID, and a one-sentence summary of the issue. Confirm before hanging up.",
    firstMessage:
      "Hi, you've reached QuickVoice support. Can I get your email and a quick description of what's going on?",
    voiceId: "aura-2-hera-en",
  },
  {
    name: "Appointment Setter",
    slug: "appointment-setter",
    isActive: false,
    isConfigured: false,
    systemPrompt:
      "You confirm appointments the day before. Greet by first name, read back the time, and offer to reschedule.",
    firstMessage: "Hi, this is QuickVoice calling to confirm your appointment tomorrow.",
    voiceId: "aura-2-zeus-en",
  },
] as const;

const KB_FIXTURES = [
  { name: "Pricing FAQ", url: "https://example.com/pricing-faq.pdf", type: "PDF" as const },
  { name: "Product handbook", url: "https://example.com/handbook.pdf", type: "PDF" as const },
  { name: "Refund policy", url: "https://example.com/refund-policy", type: "URL" as const },
];

const CALL_STATUSES: CallStatus[] = [
  "COMPLETED",
  "COMPLETED",
  "COMPLETED",
  "COMPLETED",
  "NOT_ANSWERED",
  "FAILED",
  "IN_PROGRESS",
];

const CALLER_INTROS = [
  "Hi, I'd like to know more about your pricing.",
  "Hello, is anyone there? I'm having trouble with my account.",
  "Yeah, I'm interested in the enterprise plan.",
  "Hey there, I got your voicemail about the renewal.",
  "Hi, I want to cancel my subscription please.",
];

const AGENT_RESPONSES = [
  "Of course — happy to help. May I get your name and email so I can pull up your account?",
  "Absolutely. Our starter plan is forty-nine dollars per month and includes two hundred forty-five minutes.",
  "I'm sorry to hear that. Can you tell me what error message you're seeing?",
  "Great to hear. Before I transfer you, what's the team size you're hoping to roll this out to?",
  "Let me check on that. Can I put you on hold for about thirty seconds?",
];

// -------- Main ----------------------------------------------------------
async function main() {
  const args = parseArgs();
  const email = args.email;
  const orgSlug = args["org-slug"];

  if (!email && !orgSlug) {
    console.error(
      "Usage: pnpm --filter server seed -- --email you@example.com\n" +
        "   or: pnpm --filter server seed -- --org-slug my-workspace"
    );
    process.exit(1);
  }

  // Resolve target user + org.
  let user = null;
  if (email) {
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No user found with email "${email}"`);
      process.exit(1);
    }
  }

  let organization;
  if (orgSlug) {
    organization = await prisma.organization.findUnique({
      where: { slug: orgSlug },
    });
  } else if (user) {
    const member = await prisma.member.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });
    organization = member?.organization ?? null;
  }

  if (!organization) {
    console.error(
      `No organization found (email=${email ?? "—"}, slug=${orgSlug ?? "—"}).`
    );
    process.exit(1);
  }

  // If we only had orgSlug, pick any member user to attach rows to.
  if (!user) {
    const member = await prisma.member.findFirst({
      where: { organizationId: organization.id },
      include: { user: true },
    });
    if (!member) {
      console.error(`Organization has no members — cannot seed without a user.`);
      process.exit(1);
    }
    user = member.user;
  }

  console.log(
    `\n▸ Seeding organization "${organization.name}" (${organization.id}) for user ${user.email}\n`
  );

  // -------- Agents + configurations ------------------------------------
  const agents: { agentId: string; name: string }[] = [];
  for (const fx of AGENT_FIXTURES) {
    const agent = await prisma.agent.upsert({
      where: {
        organizationId_agentSlug: {
          organizationId: organization.id,
          agentSlug: fx.slug,
        },
      },
      create: {
        agentSlug: fx.slug,
        organizationId: organization.id,
        userId: user.id,
        name: fx.name,
        isActive: fx.isActive,
        isConfigured: fx.isConfigured,
      },
      update: { isActive: fx.isActive, isConfigured: fx.isConfigured },
    });

    if (fx.isConfigured) {
      await prisma.agentConfiguration.upsert({
        where: { agentId: agent.agentId },
        create: {
          agentId: agent.agentId,
          systemPrompt: fx.systemPrompt,
          firstMessage: fx.firstMessage,
          voiceId: fx.voiceId,
          concurrent_calls_limit: 10,
          daily_calls_limit: 500,
          max_conversation_duration_seconds: 600,
          silence_end_call_timeout_seconds: 8,
          turn_timeout_seconds: 30,
          user_input_audio_format: "pcm16",
          voice_similarity_boost: 0.75,
          voice_speed: 1.0,
          voice_stability: 0.5,
          llmModel: "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0",
          sttModel: "deepgram/nova-3",
          ttsModel: "deepgram/aura-2",
          agent_language: "en",
          timezone: "UTC",
        },
        update: {},
      });
    }

    agents.push({ agentId: agent.agentId, name: agent.name });
    console.log(`  ✓ agent: ${agent.name}`);
  }

  // -------- Phone numbers ----------------------------------------------
  const numberFixtures = [
    {
      number: "+14155550101",
      friendlyName: "Main line",
      provider: "TWILIO" as const,
      agentId: agents[0]?.agentId ?? null,
    },
    {
      number: "+14155550102",
      friendlyName: "Support line",
      provider: "TELNYX" as const,
      agentId: agents[1]?.agentId ?? null,
    },
  ];

  const numbers: { phId: string; number: string }[] = [];
  for (const n of numberFixtures) {
    const phone = await prisma.phoneNumber.upsert({
      where: { number: n.number },
      create: {
        number: n.number,
        organizationId: organization.id,
        userId: user.id,
        agentId: n.agentId,
        sid: `SEED${randomUUID().replace(/-/g, "").slice(0, 28).toUpperCase()}`,
        friendlyName: n.friendlyName,
        provider: n.provider,
      },
      update: { agentId: n.agentId },
    });
    numbers.push({ phId: phone.phId, number: phone.number });
    console.log(`  ✓ number: ${phone.number} (${phone.friendlyName})`);
  }

  // -------- Call logs + transcripts ------------------------------------
  console.log(`  ... generating dashboard call history (this may take a moment)`);
  const recentCalls = range(42).map((i) => ({
    startTime: hoursAgo(Math.floor(i / 2), (i * 11) % 60),
    weight: "recent",
  }));
  const weekCalls = range(54).map((i) => ({
    startTime: daysAgo(1 + (i % 6), Math.floor((i * 5) % 18), (i * 7) % 60),
    weight: "week",
  }));
  const monthCalls = range(64).map((i) => ({
    startTime: daysAgo(7 + (i % 23), Math.floor((i * 3) % 20), (i * 13) % 60),
    weight: "month",
  }));
  const callFixtures = [...recentCalls, ...weekCalls, ...monthCalls].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );

  for (let i = 0; i < callFixtures.length; i++) {
    const agent = agents[i % agents.length]!;
    const fixture = callFixtures[i]!;
    const status: CallStatus =
      i % 13 === 0
        ? "FAILED"
        : i % 9 === 0
          ? "NOT_ANSWERED"
          : i % 17 === 0
            ? "IN_PROGRESS"
            : pick(CALL_STATUSES);
    const direction = i % 4 === 0 ? "outbound" : "inbound";
    const durationSec =
      status === "COMPLETED"
        ? 55 + ((i * 37) % 320)
        : status === "NOT_ANSWERED"
          ? 0
          : 18 + ((i * 19) % 80);
    const startTime = fixture.startTime;
    const endTime =
      durationSec > 0 ? new Date(startTime.getTime() + durationSec * 1000) : null;

    const call = await prisma.callLog.create({
      data: {
        organizationId: organization.id,
        agentId: agent.agentId,
        userId: user.id,
        startTime,
        endTime,
        durationSeconds: durationSec || null,
        status,
        callerId: randomPhone(),
        direction,
        audioRecordingPath: null,
        metadata: {
          seedWeight: fixture.weight,
          source: "dashboard-seed",
          intent: pick(["pricing", "support", "qualification", "reschedule"]),
        },
        callCostCents:
          status === "COMPLETED"
            ? Math.max(1, Math.round((durationSec / 60) * 5))
            : null,
        dataExtracted:
          status === "COMPLETED" && Math.random() < 0.5
            ? [
                {
                  id: randomUUID(),
                  type: "text",
                  name: "caller_email",
                  value: `user${i}@example.com`,
                },
                {
                  id: randomUUID(),
                  type: "text",
                  name: "team_size",
                  value: String(5 + Math.floor(Math.random() * 45)),
                },
              ]
            : [],
        dataEvaluation:
          status === "COMPLETED" && Math.random() < 0.3
            ? [
                {
                  id: randomUUID(),
                  name: "qualified",
                  criteria: "Prospect confirmed budget and timeline",
                  result: Math.random() < 0.6 ? "pass" : "fail",
                },
              ]
            : [],
      },
    });

    // Transcripts only for completed calls to keep the seed fast.
    if (status === "COMPLETED" && durationSec > 0) {
      const turns = 4 + Math.floor(Math.random() * 6);
      const transcripts = range(turns).map((t) => {
        const isAgent = t % 2 === 0;
        return {
          callLogId: call.callId,
          speaker: isAgent ? "agent" : "user",
          messageText: isAgent ? pick(AGENT_RESPONSES) : pick(CALLER_INTROS),
          timestamp: new Date(
            startTime.getTime() + (t * durationSec * 1000) / turns
          ),
          confidenceScore: 0.8 + Math.random() * 0.2,
          isPiiRedacted: false,
          sentimentScore: -0.2 + Math.random() * 0.8,
        };
      });
      await prisma.callTranscript.createMany({ data: transcripts });
    }
  }
  console.log(`  ✓ call logs: ${callFixtures.length} created`);

  // Denormalized counters on agents.
  for (const a of agents) {
    const count = await prisma.callLog.count({
      where: { agentId: a.agentId, organizationId: organization.id },
    });
    await prisma.agent.update({
      where: { agentId: a.agentId },
      data: { callLogsCount: count, phoneNumbersCount: 1 },
    });
  }

  // -------- Knowledge sources ------------------------------------------
  for (const kb of KB_FIXTURES) {
    const existing = await prisma.knowledgeSource.findFirst({
      where: { organizationId: organization.id, name: kb.name },
    });
    if (existing) continue;
    await prisma.knowledgeSource.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        agentId: agents[0]?.agentId ?? null,
        name: kb.name,
        originalFileName: kb.type === "URL" ? null : `${kb.name}.pdf`,
        storagePath: kb.url,
        sourceType: kb.type,
        status: "ACTIVE",
        lastIndexedAt: daysAgo(Math.floor(Math.random() * 14)),
      },
    });
    console.log(`  ✓ kb: ${kb.name}`);
  }

  // Update agent kb counts.
  for (const a of agents) {
    const kbCount = await prisma.knowledgeSource.count({
      where: { agentId: a.agentId },
    });
    await prisma.agent.update({
      where: { agentId: a.agentId },
      data: { knowledgeSourcesCount: kbCount },
    });
  }

  console.log(`\n✓ Seed complete.\n`);
}

main()
  .catch((err) => {
    console.error("\n✗ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
