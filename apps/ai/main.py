from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import (
    AgentSession,
    Agent,
    JobContext,
    LanguageCode,
    TurnHandlingOptions,
    function_tool,
    get_job_context,
    inference,
    room_io,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from handlers.calllog_handler import flush_call_log_queue
from handlers.config_handler import get_config
from handlers.finalization_handler import CallFinalizer
from handlers.flow_handler import (
    build_flow_transfer_instructions,
    get_current_node_id,
    merge_agent_config_for_node,
    resolve_transfer_target,
)
from handlers.livekit_handler import get_transcripts, recording_path as build_recording_path, start_recording
from handlers.mcp_handler import build_mcp_tool_instructions, call_mcp_tool, parse_arguments_json
from handlers.privacy_handler import should_store_call_audio
from handlers.rag_handler import RagRetrievalError, get_rag_context
from handlers.worker_handler import (
    apply_metadata_overrides,
    build_call_context,
    parse_metadata,
    speak_first_message,
)
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


def build_agent_instructions(config: dict, node_id: str | None = None) -> str:
    instructions = config.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
    if config.get("use_rag"):
        instructions += RAG_TOOL_INSTRUCTIONS
    instructions += build_mcp_tool_instructions(config.get("mcp_connections") or [])
    if config.get("flow") and node_id:
        instructions += build_flow_transfer_instructions(config, node_id)
    return instructions


def build_agent_pipeline_kwargs(config: dict) -> dict:
    language = LanguageCode(config.get("agent_language", "en-US"))
    return {
        "stt": inference.STT(
            model=config.get("stt_model", "deepgram/nova-3"),
            language=language,
        ),
        "llm": inference.LLM(
            model=config.get("llm_model", "google/gemini-2.5-flash"),
            provider=config.get("llm_provider", "google"),
        ),
        "tts": inference.TTS(
            model=config.get("tts_model", "deepgram/aura-2"),
            voice=config.get("voice", "aura-2-asteria-en"),
            language=language,
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
    def __init__(self, system_prompt: str, config: dict, call_context: dict, **kwargs):
        super().__init__(instructions=system_prompt, **kwargs)
        self._config = config
        self._call_context = call_context

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


class FlowAssistant(Assistant):
    def __init__(
        self,
        system_prompt: str,
        config: dict,
        call_context: dict,
        node_id: str,
        **kwargs,
    ):
        super().__init__(
            system_prompt=system_prompt,
            config=config,
            call_context=call_context,
            **kwargs,
        )
        self._node_id = node_id

    @function_tool
    async def transfer_to_flow_agent(self, route_id: str, reason: str = ""):
        """
        Transfer this conversation to the next configured agent flow node.

        Args:
            route_id: The exact route_id from the available flow routes.
            reason: A short explanation of why the route matches the user request.
        """
        target = resolve_transfer_target(self._config, self._node_id, route_id)
        if not target:
            logger.warning(
                "[flow] rejected unknown route={} from node={}",
                redact_sensitive(route_id),
                redact_sensitive(self._node_id),
            )
            return "No matching flow route is available."

        logger.info(
            "[flow] transfer route={} from node={} to node={} agent={} reason={}",
            redact_sensitive(route_id),
            redact_sensitive(self._node_id),
            redact_sensitive(target.get("targetNodeId")),
            redact_sensitive(target.get("agentId")),
            redact_sensitive(reason),
        )

        transfer_message = target.get("transferMessage")
        if transfer_message:
            await self.session.say(transfer_message, allow_interruptions=False)

        target_node = target.get("node") or {}
        if target_node.get("type") == "end":
            session = self.session
            job_ctx = get_job_context(required=False)

            if job_ctx:
                def _on_session_close(_event):
                    async def _delete_room_on_shutdown():
                        await job_ctx.delete_room()

                    job_ctx.add_shutdown_callback(_delete_room_on_shutdown)
                    job_ctx.shutdown(reason="flow_end")

                session.once("close", _on_session_close)

            session.shutdown(drain=True)
            return None

        child_config = merge_agent_config_for_node(self._config, target["targetNodeId"])
        child_context = {
            **self._call_context,
            "agent_id": child_config.get("agent_id") or self._call_context.get("agent_id"),
        }
        child_prompt = build_agent_instructions(child_config, node_id=target["targetNodeId"])

        kwargs = {}
        chat_ctx = getattr(self, "chat_ctx", None)
        if chat_ctx is not None:
            kwargs["chat_ctx"] = chat_ctx.copy(exclude_instructions=True)

        return FlowAssistant(
            system_prompt=child_prompt,
            config=child_config,
            call_context=child_context,
            node_id=target["targetNodeId"],
            **build_agent_pipeline_kwargs(child_config),
            **kwargs,
        )


async def entrypoint(ctx: JobContext):
    logger.info("Entrypoint called with room: {}", redact_sensitive(ctx.room.name))

    await ctx.connect()
    metadata = parse_metadata(ctx.job.metadata or "")
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
    config = apply_metadata_overrides(config, metadata)
    logger.info("Config loaded for agent: {}", redact_sensitive(config.get("agent_id")))

    try:
        await flush_call_log_queue()
    except Exception as error:
        logger.warning("[CALL_LOG] queued delivery retry failed: {}", redact_sensitive(str(error)))

    if not call_context.get("agent_id") and config.get("agent_id"):
        call_context["agent_id"] = config["agent_id"]
    if not call_context.get("provider") and config.get("provider"):
        call_context["provider"] = config["provider"]

    session = AgentSession(
        **build_agent_pipeline_kwargs(config),
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(turn_detection=MultilingualModel()),
        preemptive_generation=config.get("preemptive_generation", True),
    )
    flow_node_id = get_current_node_id(config)
    system_prompt = build_agent_instructions(config, node_id=flow_node_id)
    if flow_node_id:
        agent = FlowAssistant(
            system_prompt=system_prompt,
            config=config,
            call_context=call_context,
            node_id=flow_node_id,
        )
    else:
        agent = Assistant(
            system_prompt=system_prompt,
            config=config,
            call_context=call_context,
        )
    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )
    speak_first_message(session, config)

    call_start_time = datetime.now(timezone.utc)
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
        transcript_reader=lambda: get_transcripts(session.current_agent),
    )

    async def unified_shutdown_hook():
        try:
            await call_finalizer.finalize()
        except Exception as error:
            logger.error("[CALL_LOG] Failed to finalize completed call: {}", redact_sensitive(str(error)))

    if hasattr(ctx, "add_shutdown_callback"):
        ctx.add_shutdown_callback(unified_shutdown_hook)

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        nonlocal shutdown_started
        logger.info("[HANGUP] Participant disconnected: {}", redact_sensitive(getattr(participant, "identity", "")))
        if shutdown_started:
            return
        shutdown_started = True
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
            agent_name=os.getenv("LIVEKIT_AGENT_NAME", "QuickVoice"),
        )
    )
