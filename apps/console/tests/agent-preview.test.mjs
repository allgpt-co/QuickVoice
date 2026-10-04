import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("agent preview API and hook are wired", () => {
  const types = read("src/lib/api/types.ts");
  const agentsResource = read("src/lib/api/resources/agents.ts");
  const hooks = read("src/hooks/queries/agents.ts");
  const queryKeys = read("src/lib/query-keys.ts");

  assert.match(types, /interface AgentPreviewSession/);
  assert.match(agentsResource, /createPreviewSession/);
  assert.ok(agentsResource.includes("`/agents/${id}/preview-session`"));
  assert.match(agentsResource, /interface CreatePreviewSessionInput/);
  assert.match(agentsResource, /dynamicVariables\?: Record<string, string>/);
  assert.match(
    agentsResource,
    /apiClient\.post<ApiEnvelope<AgentPreviewSession>>\(\s*`\/agents\/\$\{id\}\/preview-session`,\s*input \?\? \{\}/s,
  );
  assert.match(hooks, /useCreateAgentPreviewSession/);
  assert.match(hooks, /mutationFn: \(input\?: CreatePreviewSessionInput\)/);
  assert.match(queryKeys, /previewSession/);
});

test("agent preview panel uses LiveKit microphone flow and is available on the agent page", () => {
  const panel = read("src/components/agents/AgentPreviewPanel.tsx");
  const page = read("src/app/(app)/agents/[id]/page.tsx");
  const packageJson = read("package.json");

  assert.match(packageJson, /"livekit-client"/);
  assert.ok(panel.includes("new Room("));
  assert.ok(panel.includes("createLocalAudioTrack"));
  assert.ok(panel.includes("Agent preview"));
  assert.ok(panel.includes("DynamicVariableInputs"));
  assert.ok(panel.includes("Preview variables"));
  assert.ok(panel.includes("useAgentConfig(agentId)"));
  assert.ok(panel.includes("dynamicVariablePayload("));
  assert.match(panel, /createPreview\.mutateAsync\(\{\s*dynamicVariables:/s);
  assert.ok(panel.includes("dark:"));
  assert.ok(panel.includes("bg-background"));
  assert.match(panel, /Mute|Unmute/);
  assert.match(page, /AgentPreviewPanel/);
  assert.ok(page.includes("Preview"));
});

test("agent preview renders a conversation view with LiveKit transcript hooks", () => {
  const panel = read("src/components/agents/AgentPreviewPanel.tsx");

  assert.match(panel, /Conversation/);
  assert.match(panel, /Call started/);
  assert.match(panel, /conversationMessages/);
  assert.doesNotMatch(panel, /SpeechRecognition/);
  assert.doesNotMatch(panel, /webkitSpeechRecognition/);
  assert.doesNotMatch(panel, /quickvoice\.preview\.transcript/);
  assert.doesNotMatch(panel, /preview_user_transcript/);
  assert.doesNotMatch(panel, /lk\.chat/);
  assert.match(panel, /handleLiveKitTranscript/);
  assert.match(panel, /handleLiveKitData/);
  assert.match(panel, /TextDecoder/);
  assert.match(panel, /TranscriptionReceived/);
  assert.match(panel, /DataReceived/);
});

test("agent preview cancels in-flight microphone acquisition and stops every acquired track", () => {
  const panel = read("src/components/agents/AgentPreviewPanel.tsx");

  assert.match(panel, /previewAttemptRef\.current \+= 1/);
  assert.match(panel, /const wasCancelled = \(\) =>/);
  assert.match(panel, /if \(!open\) disconnectPreview\(\)/);
  assert.match(
    panel,
    /const localTrack = await createLocalAudioTrack[\s\S]*if \(wasCancelled\(\)\) \{[\s\S]*localTrack\.stop\(\)/,
  );
  assert.match(
    panel,
    /RoomEvent\.Disconnected[\s\S]*localTrackRef\.current\?\.stop\(\)/,
  );
});
