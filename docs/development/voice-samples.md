# Voice samples in Models & Voices

**Preview voice** generates a fixed, translated sentence using the form's current
language, TTS model, and voice. Changes do not need to be saved first. The catalog
includes `sample_text` for each supported language; the UI displays that sentence.
The server rejects custom text and arbitrary provider URLs.

The console calls `POST /api/v1/agents/:agentId/voice-sample` with:

```json
{
  "language": "hi",
  "ttsModel": "elevenlabs/eleven_flash_v2_5",
  "voiceId": "UgBBYS2sOqTuMpoF3BR0"
}
```

The route checks authentication, `agentPreview:create` permission, and agent
ownership before calling the internal AI endpoint `/voice/sample`. AI validates
the selection against the runtime catalog and uses the same TTS adapter as calls.
Audio returns as a bounded base64 WAV response. STT, LLM, LiveKit rooms, and carrier
calls are not involved. Samples consume provider TTS quota; they do not create a
call or debit a call-billing session. The `voice_sample_generated` metric records
the provider, model, and character count for each uncached generation.

## Limits and lifecycle

- 10 requests per minute per user or API key, and 100 per rolling 24 hours per
  organization. The existing rate-limit store shares counters across API replicas
  when Redis is configured. A sample-specific 429 leaves other console APIs usable.
- AI permits two concurrent generations per HTTP process and bounds each request
  to 15 seconds, 15 seconds of audio, and 1 MiB of PCM audio.
- AI caches up to 16 samples per process for one hour, keyed by catalog version,
  resolved TTS settings, language, and sentence. Cache reuse across replicas is
  best effort. Replaying audio still loaded in the card makes no HTTP request.
- Stop, selection changes, and leaving the card cancel requests, pause playback,
  and release audio URLs. Client disconnection cancels AI generation and closes
  provider resources. Provider errors appear next to the preview button.

## Deployment and verification

Deploy AI, then API server, then console. Reuse the existing AI-service
`ELEVENLABS_API_KEY` and/or `DEEPGRAM_API_KEY`, server `AI_API_URL`, and shared
`INTERNAL_API_KEY`. No new environment variables or database migrations are needed.
The AI catalog version is `2026-10-16` and includes `languages[].sample_text`.

1. Open an agent's Models & Voices tab as an owner or admin.
2. Choose Hindi, ElevenLabs Flash v2.5, and Mark without saving. Confirm the card
   displays the Hindi sample. Preview it, stop it, and replay it.
3. Select Sarah or another model and preview again. Confirm the selected voice is
   heard. Change language while loading or playing; the old sample must stop.
4. Test English with Deepgram Aura-2 and a compatible voice.
5. Verify a read-only account/key receives 403 without reaching the TTS provider.
6. Verify provider-key errors are readable and quota errors do not block other
   console pages. Check mobile layout and keyboard operation.
