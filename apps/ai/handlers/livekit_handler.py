from utils.logger import logger, redact_sensitive
from utils.metrics import emit_metric
import asyncio
import os
import time
import uuid
from typing import Any


def recording_path(recording_id):
    return f"Voice-agents/Recordings/{recording_id}.ogg"


def get_recording_storage_config():
    config = {
        "bucket": os.getenv("S3_BUCKET_NAME") or os.getenv("BUCKET"),
        "region": os.getenv("AWS_REGION") or os.getenv("REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1",
    }
    missing = [key for key in ("bucket", "region") if not config[key]]
    if missing:
        raise RuntimeError(f"Missing recording storage env: {', '.join(missing)}")
    access_key = os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ACCESS_KEY")
    secret = os.getenv("AWS_SECRET_ACCESS_KEY") or os.getenv("SECRET_ACCESS_KEY")
    if access_key or secret:
        if not access_key:
            raise RuntimeError("AWS_ACCESS_KEY_ID is required when AWS_SECRET_ACCESS_KEY is set")
        if not secret:
            raise RuntimeError("AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is set")
        config["access_key"] = access_key
        config["secret"] = secret
        session_token = os.getenv("AWS_SESSION_TOKEN")
        if session_token:
            config["session_token"] = session_token
    return config


def get_transcripts(agent):
    
    try:
        messages = agent.chat_ctx.messages
        if callable(messages):
            messages = messages()
        transcript = []
        for msg in messages:
            if getattr(msg, "role", None) in ("user", "assistant"):
                content = getattr(msg, "content", "")
                if isinstance(content, list):
                    content = " ".join(str(c) for c in content if isinstance(c, str))
                transcript.append({"role": msg.role, "content": content,"time": msg.created_at})
        logger.info("[TRANSCRIPT] collected {} messages", len(transcript))
    except Exception as e:
        logger.error("[SHUTDOWN] Transcript read failed: {}", redact_sensitive(str(e)))
        transcript = []
    return transcript

async def start_recording(ctx: Any, *, timeout_seconds: float = 10):
    # ── Recording → S3 Storage ─────────────────────────────────────
    from livekit import api  # type: ignore

    egress_id = None
    recording_active = False
    started_at = time.monotonic()
    recording_id = str(uuid.uuid4())
    rec_api = None
    try:
        storage = get_recording_storage_config()
        s3_upload_kwargs = {
            "bucket": storage["bucket"],
            "region": storage["region"],
        }
        for key in ("access_key", "secret", "session_token"):
            if storage.get(key):
                s3_upload_kwargs[key] = storage[key]
        rec_api = api.LiveKitAPI(
            url=os.environ["LIVEKIT_URL"],
            api_key=os.environ["LIVEKIT_API_KEY"],
            api_secret=os.environ["LIVEKIT_API_SECRET"],
        )
        async with asyncio.timeout(timeout_seconds):
            egress_resp = await rec_api.egress.start_room_composite_egress(
                api.RoomCompositeEgressRequest(
                    room_name=ctx.room.name,
                    audio_only=True,
                    file_outputs=[
                        api.EncodedFileOutput(
                            file_type=api.EncodedFileType.OGG,
                            filepath=recording_path(recording_id),
                            s3=api.S3Upload(**s3_upload_kwargs),
                        )
                    ],
                )
            )
            egress_id = egress_resp.egress_id
            # A successful start RPC can return EGRESS_STARTING, before capture.
            # https://docs.livekit.io/reference/other/egress/api/
            while egress_resp.status != api.EGRESS_ACTIVE:
                if egress_resp.status != api.EGRESS_STARTING:
                    raise RuntimeError("Recording ended before becoming active")
                # ponytail: at most 50 polls at the default deadline; use egress
                # webhooks if recording-start volume outgrows this bounded poll.
                await asyncio.sleep(0.2)
                response = await rec_api.egress.list_egress(api.ListEgressRequest(egress_id=egress_id))
                egress_resp = next((item for item in response.items if item.egress_id == egress_id), egress_resp)
            recording_active = True
        startup_ms = round((time.monotonic() - started_at) * 1000)
        emit_metric("recording_start", status="ok", startup_ms=startup_ms, room=getattr(ctx.room, "name", ""))
        logger.info("[RECORDING] Egress active: {} (startup_ms={})", egress_id, startup_ms)
        return recording_id
    except Exception as e:
        emit_metric("recording_start", status="error", room=getattr(ctx.room, "name", ""))
        logger.warning("[RECORDING] Failed to start recording ({}): {}", type(e).__name__, redact_sensitive(str(e)))
        return None
    finally:
        if rec_api is not None:
            if egress_id and not recording_active:
                try:
                    await asyncio.wait_for(
                        rec_api.egress.stop_egress(api.StopEgressRequest(egress_id=egress_id)),
                        timeout=2,
                    )
                except Exception as stop_error:
                    logger.warning("[RECORDING] Failed to stop pending egress: {}", redact_sensitive(str(stop_error)))
            try:
                await rec_api.aclose()
            except Exception as close_error:
                logger.warning("[RECORDING] Failed to close LiveKit API client: {}", redact_sensitive(str(close_error)))
