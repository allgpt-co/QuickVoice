from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import (
    AgentSession,
    Agent,
    JobContext,
    LanguageCode,
    TurnHandlingOptions,
    function_tool,
    inference,
    room_io,
)
from livekit.agents.beta.tools import send_dtmf_events
from livekit.plugins import noise_cancellation, silero
from handlers.call_metadata_collector import CallMetadataCollector, build_metadata_collection_instructions
from handlers.calllog_handler import flush_call_log_queue
from handlers.config_handler import get_config
from handlers.finalization_handler import CallFinalizer
from handlers.livekit_handler import recording_path as build_recording_path, start_recording
from handlers.live_transcript_publisher import LiveTranscriptPublisher
from handlers.http_tool_handler import build_http_tool_instructions, call_http_tool, parse_http_tool_arguments
from handlers.mcp_handler import build_mcp_tool_instructions, call_mcp_tool, parse_arguments_json
from handlers.privacy_handler import should_store_call_audio
from handlers.rag_handler import RagRetrievalError, get_rag_context
from handlers.transcript_collector import TranscriptCollector
from handlers.worker_handler import (
    PREVIEW_TRANSCRIPT_TOPIC,
    apply_initiation_webhook_metadata,
    apply_metadata_overrides,
    build_call_context,
    consume_preview_user_transcript_stream,
    parse_preview_user_transcript_packet,
    parse_metadata,
    speak_first_message,
)
from handlers.voice_catalog import load_voice_catalog
from handlers.voice_config_resolution import resolve_voice_config
from handlers.voice_provider_adapters import ProviderAdapterError, build_voice_provider_adapters
from handlers.voice_worker_metadata import is_voice_session_metadata, parse_voice_session_metadata
from utils.logger import logger
from utils.logger import redact_sensitive
import asyncio
import json
from datetime import datetime, timezone
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

APP_DIR = Path(__file__).resolve().parent
load_dotenv(APP_DIR / ".env")

API_PORT = int(os.getenv("AI_API_PORT", "5555"))
DEFAULT_SYSTEM_PROMPT = (
    "You are a friendly, reliable voice assistant that answers questions, "
    "explains topics, and completes tasks with available tools."
)
RAG_TOOL_INSTRUCTIONS = (
    "\n\nKnowledge base search is available through search_knowledge_base. "
    "When a user asks about company policies, uploaded documents, FAQs, "
    "pricing, procedures, or any answer that may depend on the configured "
    "knowledge base, call search_knowledge_base with the user's question "
    "before answering. Use retrieved context as the source of truth, and say "
    "when the knowledge base does not contain the answer."
)
IVR_TOOL_INSTRUCTIONS = (
    "\n\nIVR navigation is available through send_dtmf_events. "
    "This is for outbound calls where you, the AI agent, call a phone system "
    "and the remote side plays an automated menu. Listen to the full menu "
    "or enough of it to know the mapping, for example appointments equals 1, "
    "orders equals 2, returns equals 3. If the human says their goal before "
    "the menu finishes, remember it while you listen for the matching option. "
    "When the human tells you their goal, such as I want appointments, match "
    "that goal to the menu option and call "
    "send_dtmf_events with only the matching digit, star, or pound. Do not ask "
    "the human to press the key. Do not wait for the human to press digits. "
    "If the menu option is clear, send the tone immediately. If the mapping is "
    "not clear yet, keep listening until it is clear. Never send tones when you "
    "are unsure which menu option applies."
)


def _config_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def ivr_navigation_enabled(config: dict, call_context: dict | None = None) -> bool:
    for key in ("ivr_navigation_enabled", "enable_ivr_navigation", "ivr_detection"):
        if key in config:
            return _config_bool(config.get(key))
    return (call_context or {}).get("direction") == "outbound"


def build_agent_tools(config: dict, call_context: dict | None = None) -> list:
    if not ivr_navigation_enabled(config, call_context):
        return []
    return [send_dtmf_events]


def build_agent_instructions(config: dict) -> str:
    instructions = config.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
    if config.get("use_rag"):
        instructions += RAG_TOOL_INSTRUCTIONS
    if ivr_navigation_enabled(config):
        instructions += IVR_TOOL_INSTRUCTIONS
    metadata_instructions = build_metadata_collection_instructions(config)
    if metadata_instructions:
        instructions += f"\n\n{metadata_instructions}"
    instructions += build_http_tool_instructions(config.get("tools") or [])
    instructions += build_mcp_tool_instructions(config.get("mcp_connections") or [])
    return instructions



def build_room_options() -> room_io.RoomOptions:
    enable_noise_cancellation = os.getenv("LIVEKIT_ENABLE_NOISE_CANCELLATION", "").lower() in {
        "1",
        "true",
        "yes",
    }
    noise_cancellation_selector = None
    if enable_noise_cancellation:
        noise_cancellation_selector = lambda params: (
            noise_cancellation.BVCTelephony()
            if params.participant.kind
            == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
            else noise_cancellation.BVC()
        )

    return room_io.RoomOptions(
        audio_input=room_io.AudioInputOptions(
            noise_cancellation=noise_cancellation_selector,
        ),
        text_output=room_io.TextOutputOptions(sync_transcription=False),
    )


def _transcription_chunk_text(chunk) -> str:
    text = getattr(chunk, "text", None)
    if text is not None:
        return str(text)
    return str(chunk or "")


def provider_section(value: str | None):
    if not value or "/" not in value:
        return None
    provider, model = value.split("/", 1)
    if provider in {"deepgram", "sarvam", "bedrock", "elevenlabs"}:
        return {"provider": provider, "model": model}
    return None


def attach_resolved_voice_config(config: dict) -> dict:
    if isinstance(config.get("voice_config"), dict):
        return config

    tts_section = provider_section(config.get("tts_model"))
    if tts_section is not None:
        tts_section = {**tts_section, "voice": config.get("voice")}
    try:
        voice_config = resolve_voice_config(
            {
                "language": str(config.get("agent_language", "en-US")).split("-", 1)[0],
                "timezone": config.get("timezone"),
                "stt": provider_section(config.get("stt_model")),
                "llm": provider_section(config.get("llm_model")),
                "tts": tts_section,
            },
            load_voice_catalog(),
        )
    except Exception:
        return config

    updated = dict(config)
    updated["voice_config"] = voice_config
    return updated


def build_session_provider_kwargs(config: dict) -> dict:
    voice_config = config.get("voice_config")
    if isinstance(voice_config, dict):
        adapters = build_voice_provider_adapters(voice_config)
        logger.info("Voice provider adapters: {}", redact_sensitive(adapters.summary))
        return {"stt": adapters.stt, "llm": adapters.llm, "tts": adapters.tts}

    return {
        "stt": inference.STT(
            model=config.get("stt_model", "deepgram/nova-3"),
            language=LanguageCode(config.get("agent_language", "en-US")),
        ),
        "llm": inference.LLM(
            model=config.get("llm_model", "google/gemini-2.5-flash"),
            provider=config.get("llm_provider", "google"),
        ),
        "tts": inference.TTS(
            model=config.get("tts_model", "deepgram/aura-2"),
            voice=config.get("voice", "aura-2-asteria-en"),
            language=LanguageCode(config.get("agent_language", "en-US")),
        ),
    }


def run_combined_server() -> int:
    commands = {
        "api": [sys.executable, str(APP_DIR / "main.py"), "api"],
        "worker": [sys.executable, str(APP_DIR / "main.py"), "start"],
    }
    processes: dict[str, subprocess.Popen] = {}
    shutting_down = False

    def stop_children() -> None:
        nonlocal shutting_down
        if shutting_down:
            return
        shutting_down = True

        for name, process in processes.items():
            if process.poll() is None:
                logger.info(f"Stopping {name} process")
                process.terminate()

        deadline = time.monotonic() + 10
        for name, process in processes.items():
            while process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.2)
            if process.poll() is None:
                logger.warning(f"Killing unresponsive {name} process")
                process.kill()

    def handle_signal(signum, _frame) -> None:
        logger.info(f"Received signal {signum}; shutting down AI services")
        stop_children()

    for handled_signal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(handled_signal, handle_signal)

    try:
        for name, command in commands.items():
            logger.info(f"Starting {name}: {' '.join(command)}")
            processes[name] = subprocess.Popen(command, cwd=APP_DIR)

        while True:
            for name, process in processes.items():
                return_code = process.poll()
                if return_code is not None:
                    logger.error(f"{name} process exited with code {return_code}")
                    stop_children()
                    return return_code or 1
            time.sleep(1)
    finally:
        stop_children()


class Assistant(Agent):
    def __init__(
        self,
        system_prompt: str,
        config: dict,
        call_context: dict,
        transcript_collector: TranscriptCollector | None = None,
    ):
        super().__init__(
            instructions=system_prompt,
            tools=build_agent_tools(config, call_context),
        )
        self._config = config
        self._call_context = call_context
        self._metadata_collector = CallMetadataCollector(config)
        self._transcript_collector = transcript_collector

    def _rag_enabled(self) -> bool:
        return bool(self._config.get("use_rag"))

    def _agent_id(self) -> str:
        return (
            self._config.get("agent_id")
            or self._call_context.get("agent_id")
            or ""
        )

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        if not self._rag_enabled():
            return

        agent_id = self._agent_id()
        if not agent_id:
            logger.warning("[rag] skipped retrieval because agent_id is missing")
            return

        query = new_message.text_content if hasattr(new_message, "text_content") else ""
        if callable(query):
            query = query()
        query = str(query or "").strip()
        if not query:
            return

        try:
            context = await get_rag_context(agent_id=agent_id, query=query)
        except RagRetrievalError:
            turn_ctx.add_message(
                role="system",
                content=(
                    "Knowledge base retrieval failed for the user's latest question. "
                    "Tell the user the knowledge base is temporarily unavailable and do not invent an answer."
                ),
            )
            logger.warning("[rag] injected unavailable signal for agent={}", redact_sensitive(agent_id))
            return

        if not context:
            logger.info(f"[rag] no context returned for agent={agent_id}")
            return

        turn_ctx.add_message(
            role="system",
            content=(
                "Relevant knowledge base context for the user's latest question. "
                "Use this context to answer accurately. If it does not contain the answer, "
                "say you do not have that information in the knowledge base.\n\n"
                f"{context}"
            ),
        )
        logger.info(f"[rag] injected context for agent={agent_id}")

    async def transcription_node(self, text, model_settings):
        chunks: list[str] = []
        output = Agent.default.transcription_node(self, text, model_settings)
        if output is None:
            return
        async for chunk in output:
            chunk_text = _transcription_chunk_text(chunk)
            if chunk_text:
                chunks.append(chunk_text)
            yield chunk
        if self._transcript_collector is not None:
            self._transcript_collector.on_agent_transcription_final(
                "".join(chunks),
                datetime.now(timezone.utc),
            )

    @function_tool
    async def record_call_extracted_data(self, field: str, value: str) -> str:
        """
        Record a configured data field collected from the caller during this call.

        Args:
            field: The configured data field id or name.
            value: The value the caller provided for that field.
        """
        return self._metadata_collector.record_extracted_data(field, value)

    @function_tool
    async def record_call_evaluation(self, identifier: str, value: str) -> str:
        """
        Record a configured call evaluation result when the conversation provides enough evidence.

        Args:
            identifier: The configured evaluation id or name.
            value: The evaluation result, such as true, false, yes, no, or a short label.
        """
        return self._metadata_collector.record_evaluation(identifier, value)

    @function_tool
    async def search_knowledge_base(self, query: str, top_k: int = 5) -> str:
        """
        Search the configured agent knowledge base for relevant context.

        Args:
            query: The user question or the topic to search for.
            top_k: Maximum number of matching chunks to retrieve.
        """
        if not self._rag_enabled():
            return "Knowledge base search is disabled for this agent."

        agent_id = self._agent_id()
        if not agent_id:
            return "Knowledge base search is unavailable because this call has no agent_id."

        normalized_query = (query or "").strip()
        if not normalized_query:
            return "A search query is required."

        try:
            context = await get_rag_context(str(agent_id), normalized_query, top_k=top_k)
        except RagRetrievalError:
            return "Knowledge base search is temporarily unavailable. Please try again later."
        return context or "No matching knowledge base context found."

    @function_tool
    async def call_http_tool(self, tool_name: str, arguments_json: str = "{}") -> str:
        """
        Call an attached HTTP tool configured for this agent.

        Args:
            tool_name: The exact HTTP tool name from the attached HTTP tools list.
            arguments_json: A JSON object string containing the tool arguments.
        """
        arguments = parse_http_tool_arguments(arguments_json)
        result = await call_http_tool(
            tool_name=tool_name,
            arguments=arguments,
            config=self._config,
            call_context=self._call_context,
        )
        return json.dumps(result.get("data", result), ensure_ascii=False)

    @function_tool
    async def call_mcp_tool(self, connection_id: str, tool_name: str, arguments_json: str = "{}") -> str:
        """
        Call an attached MCP tool using a connected MCP connection.

        Args:
            connection_id: The MCP connection ID from the connected tools list.
            tool_name: The exact MCP tool name to execute.
            arguments_json: A JSON object string containing the tool arguments.
        """
        arguments = parse_arguments_json(arguments_json)
        result = await call_mcp_tool(
            connection_id=connection_id,
            tool_name=tool_name,
            arguments=arguments,
            config=self._config,
            call_context=self._call_context,
        )
        return json.dumps(result.get("data", result), ensure_ascii=False)


async def entrypoint(ctx: JobContext):
    logger.info("Entrypoint called with room: {}", redact_sensitive(ctx.room.name))

    await ctx.connect()
    raw_metadata = ctx.job.metadata or ""
    if is_voice_session_metadata(raw_metadata):
        voice_metadata = parse_voice_session_metadata(raw_metadata)
        metadata = {**voice_metadata.client_metadata, "mode": voice_metadata.mode}
        preview_mode = voice_metadata.mode == "preview"
        call_context = build_call_context(ctx.room.name, metadata)
        if not call_context.get("agent_id") and metadata.get("agent_id"):
            call_context["agent_id"] = metadata["agent_id"]
        config = await get_config(
            call_context.get("agent_id"),
            agent_number=call_context.get("agent_number"),
            allow_default_config=True,
        )
        metadata = await apply_initiation_webhook_metadata(config, metadata, call_context)
        config = apply_metadata_overrides(config, metadata)
        config["voice_config"] = voice_metadata.config
        config["agent_language"] = voice_metadata.config["language"]
    else:
        metadata = parse_metadata(raw_metadata)
        preview_mode = False
        try:
            participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=10)
            participant_attributes = getattr(participant, "attributes", {}) or {}
            metadata.update(participant_attributes)
        except asyncio.TimeoutError:
            logger.warning("Timed out waiting for room participant before loading config")
        except RuntimeError as error:
            logger.warning(f"Could not read room participant before loading config: {error}")

        call_context = build_call_context(ctx.room.name, metadata)
        logger.info("Call context: {}", redact_sensitive(call_context))

        config = await get_config(
            call_context.get("agent_id"),
            agent_number=call_context.get("agent_number"),
        )
        metadata = await apply_initiation_webhook_metadata(config, metadata, call_context)
        config = apply_metadata_overrides(config, metadata)
        config = attach_resolved_voice_config(config)
    logger.info("Config loaded for agent: {}", redact_sensitive(config.get("agent_id")))

    try:
        await flush_call_log_queue()
    except Exception as error:
        logger.warning("[CALL_LOG] queued delivery retry failed: {}", redact_sensitive(str(error)))

    if not call_context.get("agent_id") and config.get("agent_id"):
        call_context["agent_id"] = config["agent_id"]
    if not call_context.get("provider") and config.get("provider"):
        call_context["provider"] = config["provider"]

    try:
        provider_kwargs = build_session_provider_kwargs(config)
    except ProviderAdapterError as error:
        logger.error("Voice provider adapter error: {}", redact_sensitive(str(error)))
        ctx.shutdown(reason=f"provider adapter error: {error}")
        return

    config["ivr_navigation_enabled"] = ivr_navigation_enabled(config, call_context)
    logger.info(
        "[IVR] navigation state: {}",
        redact_sensitive(
            {
                "enabled": config["ivr_navigation_enabled"],
                "direction": call_context.get("direction"),
                "agent_id": call_context.get("agent_id") or config.get("agent_id"),
            }
        ),
    )
    session = AgentSession(
        **provider_kwargs,
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
        ),
        ivr_detection=config["ivr_navigation_enabled"],
    )
    call_start_time = datetime.now(timezone.utc)
    live_transcript_publisher = LiveTranscriptPublisher(
        config=config,
        call_context=call_context,
        room_name=ctx.room.name,
    )
    if not preview_mode:
        await live_transcript_publisher.start(call_start_time)
    transcript_collector = TranscriptCollector(
        on_item=live_transcript_publisher.publish_transcript
    ).attach(session)
    system_prompt = build_agent_instructions(config)
    agent = Assistant(
        system_prompt=system_prompt,
        config=config,
        call_context=call_context,
        transcript_collector=transcript_collector,
    )

    @ctx.room.on("data_received")
    def on_data_received(data_packet):
        participant = getattr(data_packet, "participant", None)
        text = parse_preview_user_transcript_packet(
            getattr(data_packet, "data", b""),
            topic=getattr(data_packet, "topic", None),
            participant_identity=getattr(participant, "identity", None),
            preview_mode=preview_mode,
        )
        if not text:
            return

        logger.info(
            "[preview] received browser transcript from {}",
            redact_sensitive(getattr(participant, "identity", "")),
        )
        session.generate_reply(user_input=text, allow_interruptions=True)

    def on_preview_text_stream(reader, participant_identity):
        asyncio.create_task(
            consume_preview_user_transcript_stream(
                reader,
                participant_identity=participant_identity,
                preview_mode=preview_mode,
                generate_reply=lambda text: session.generate_reply(
                    user_input=text,
                    allow_interruptions=True,
                ),
            )
        )

    if hasattr(ctx.room, "register_text_stream_handler"):
        ctx.room.register_text_stream_handler(
            PREVIEW_TRANSCRIPT_TOPIC,
            on_preview_text_stream,
        )

    try:
        await session.start(
            room=ctx.room,
            agent=agent,
            room_options=build_room_options(),
        )
    except Exception:
        await live_transcript_publisher.close(reason="session_start_failed")
        raise
    speak_first_message(session, config)

    recording_id = None
    if should_store_call_audio(config):
        recording_id = await start_recording(ctx)
    else:
        logger.info("[RECORDING] skipped by agent privacy controls")
    recording_path = build_recording_path(recording_id) if recording_id else None
    shutdown_started = False

    call_finalizer = CallFinalizer(
        config=config,
        call_context=call_context,
        started_at=call_start_time,
        recording_path=recording_path,
        transcript_reader=transcript_collector.read,
    )
    shutdown_reason = "session_shutdown"

    async def unified_shutdown_hook():
        try:
            await live_transcript_publisher.close(reason=shutdown_reason)
        except Exception as error:
            logger.warning(
                "[LIVE_TRANSCRIPT] Failed to close publisher: {}",
                redact_sensitive(str(error)),
            )
        if preview_mode:
            return
        try:
            await call_finalizer.finalize()
        except Exception as error:
            logger.error("[CALL_LOG] Failed to finalize completed call: {}", redact_sensitive(str(error)))

    if hasattr(ctx, "add_shutdown_callback"):
        ctx.add_shutdown_callback(unified_shutdown_hook)

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        nonlocal shutdown_started, shutdown_reason
        logger.info("[HANGUP] Participant disconnected: {}", redact_sensitive(getattr(participant, "identity", "")))
        if shutdown_started:
            return
        shutdown_started = True
        shutdown_reason = "participant_disconnected"
        asyncio.create_task(unified_shutdown_hook())


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        raise SystemExit(run_combined_server())

    if len(sys.argv) > 1 and sys.argv[1] == "api":
        import uvicorn

        uvicorn.run(
            "api:app",
            host=os.getenv("AI_API_HOST", "0.0.0.0"),
            port=API_PORT,
            reload=os.getenv("AI_API_RELOAD", "false").lower() == "true",
        )
        raise SystemExit(0)

    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("LIVEKIT_AGENT_NAME", "quickvoice-voice-agent"),
        )
    )
