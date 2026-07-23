# Langfuse demo checklist

1. Start the AI service with the new Langfuse variables configured in apps/ai/.env.dev.
2. Launch the AI API and worker:
   - task ai:api
   - task ai:worker
3. Trigger a voice session through the local broker or a curl request.
4. Open the Langfuse project and verify a trace named quickvoice.voice-session appears.
5. Observe the session_started, user_turn_completed, and session_shutdown events plus any evaluation scores.

Suggested screen recording:
- Show the terminal running task ai:api and task ai:worker.
- Show the curl request to /voice/sessions.
- Switch to the Langfuse dashboard and point out the trace and events.
