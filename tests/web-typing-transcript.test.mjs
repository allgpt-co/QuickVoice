import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("marketing typing transcript attaches to the audio element even when parent play state is stale", async () => {
  const source = await readFile(new URL("../apps/web/src/components/TypingTranscript.tsx", import.meta.url), "utf8");

  assert.match(source, /const \[audioIsPlaying, setAudioIsPlaying\]/);
  assert.match(source, /audio\.addEventListener\("play", onPlay\)/);
  assert.match(source, /audio\.addEventListener\("timeupdate", onTimeUpdate\)/);
  assert.match(source, /const poll = setInterval/);
  assert.match(source, /const playbackActive = isPlaying \|\| audioIsPlaying/);
  assert.match(source, /clearTypingIntervals/);
  assert.match(source, /aria-live="polite"/);
});
