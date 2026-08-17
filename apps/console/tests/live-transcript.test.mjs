import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

test("live calls are mounted once in the authenticated application layout", () => {
  const layout = read("src/app/(app)/layout.tsx");
  assert.match(
    layout,
    /<LiveCallsProvider[\s\S]*organizationId=\{session\.activeOrganizationId\}/
  );
  assert.match(layout, /LiveCallsDock organizationId=\{session\.activeOrganizationId\}/);
});

test("socket events update only the authenticated organization cache", () => {
  const provider = read("src/providers/live-calls-provider.tsx");
  assert.match(provider, /withCredentials:\s*true/);
  assert.match(provider, /event, organizationId/);
  assert.match(provider, /queryKeys\.calls\.live\(\)/);
  assert.match(provider, /"live-call:started"/);
  assert.match(provider, /"live-call:updated"/);
  assert.match(provider, /"live-call:ended"/);
  assert.match(
    provider,
    /item\.callId === call\.callId \|\| item\.roomName === call\.roomName/
  );
  assert.match(
    provider,
    /call\.callId !== event\.callId && call\.roomName !== event\.roomName/
  );
});

test("watching a call replays, validates, deduplicates, and unwatches transcripts", () => {
  const hook = read("src/hooks/use-live-transcript.ts");
  const types = read("src/lib/live-calls/types.ts");
  assert.match(hook, /"live-call:watch"/);
  assert.match(hook, /acknowledgement\.messages/);
  assert.match(hook, /acknowledgement\.status === "ended"/);
  assert.match(hook, /"live-call:unwatch"/);
  assert.match(hook, /\.on\("connect", watch\)/);
  assert.match(hook, /\.off\("connect", watch\)/);
  assert.match(types, /new Map<string, LiveTranscriptMessage>/);
  assert.match(types, /byMessageId\.set\(message\.messageId/);
  assert.match(types, /isSyntheticMessage/);
  assert.match(types, /streamIdParts/);
  assert.match(types, /message\.organizationId !== organizationId/);
  assert.match(types, /status: "active" \| "ended"/);
});

test("live transcript UI restores selection and preserves reader scroll position", () => {
  const dock = read("src/components/calls/LiveCallsDock.tsx");
  const transcriptRow = dock.slice(
    dock.indexOf("function TranscriptRow"),
    dock.indexOf("function ConnectionStatus")
  );
  assert.match(dock, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(dock, /window\.localStorage\.setItem\(storageKey, call\.callId\)/);
  assert.match(dock, /distanceFromBottom < 96/);
  assert.match(dock, /new \{unseenMessages === 1 \? "message" : "messages"\}/);
  assert.doesNotMatch(transcriptRow, /padStart/);
  assert.match(dock, /End this live call\?/);
  assert.match(dock, /canEndCall && !transcript\.isEnded/);
  assert.match(dock, /fromNumber/);
  assert.match(dock, /toNumber/);
  assert.match(
    dock,
    /existing\.callId === call\.callId \|\| existing\.roomName === call\.roomName/
  );
  assert.match(dock, /call\.roomName === selectedCall\.roomName/);
});

test("console declares the matching Socket.IO client dependency", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.dependencies["socket.io-client"], "^4.8.1");
});
