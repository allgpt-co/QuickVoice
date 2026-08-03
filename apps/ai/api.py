from contextlib import asynccontextmanager
from typing import Any, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from handlers.config_handler import get_config
from handlers import kb_handler
from handlers.voice_catalog import load_voice_catalog
from handlers.voice_config_resolution import VoiceConfigValidationError, resolve_voice_config
from handlers.voice_session_broker import VoiceSessionBroker, VoiceSessionBrokerError
from utils.auth import verify_internal_headers
from utils.runtime_readiness import (
    evaluate_local_runtime_config,
    get_runtime_readiness,
)


def _verify_internal(request: Request) -> None:
    """Reject requests that don't carry the correct internal API key."""
    try:
        verify_internal_headers(request.headers)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail="Unauthorized")


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Keep the HTTP process alive when deployment configuration is incomplete
    # so orchestration receives a diagnostic 503 from /health. All non-health
    # routes continue to fail closed in the authentication middleware.
    _app.state.startup_runtime_config = evaluate_local_runtime_config()
    yield


app = FastAPI(title="QuickVoice AI", lifespan=_lifespan)


@app.middleware("http")
async def _internal_auth_middleware(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    try:
        _verify_internal(request)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


# ── health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    readiness = await get_runtime_readiness()
    return JSONResponse(
        status_code=200 if readiness["ok"] else 503,
        content=readiness,
    )


# ── agent config ──────────────────────────────────────────────────────────────

@app.get("/agents/{agent_id}/config")
async def read_agent_config(agent_id: str, request: Request):
    _verify_internal(request)
    return await get_config(agent_id)


# ── voice runtime ─────────────────────────────────────────────────────────────

@app.get("/voice/catalog", tags=["Voice"])
async def read_voice_catalog(request: Request):
    _verify_internal(request)
    return load_voice_catalog()


@app.post("/voice/config/resolve", tags=["Voice"])
async def resolve_voice_config_route(payload: dict[str, Any], request: Request):
    _verify_internal(request)
    try:
        return {"config": resolve_voice_config(payload, load_voice_catalog())}
    except VoiceConfigValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/voice/sessions", tags=["Voice"])
async def create_voice_session(payload: dict[str, Any], request: Request):
    _verify_internal(request)
    try:
        return await VoiceSessionBroker(catalog_loader=load_voice_catalog).create_session(payload)
    except VoiceConfigValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except VoiceSessionBrokerError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ── KB processing ─────────────────────────────────────────────────────────────

class KbDocument(BaseModel):
    kbId: str
    name: str
    sourceType: str
    url: Optional[str] = None
    presignedUrl: Optional[str] = None
    originalFileName: Optional[str] = None


class KbProcessRequest(BaseModel):
    agentId: str
    organizationId: str
    documents: List[KbDocument]
    budgets: Optional[dict[str, Any]] = None


def _kb_http_exception(exc: kb_handler.KbJobValidationError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.to_detail())


def _kb_not_found(job_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "code": "KB_JOB_NOT_FOUND",
            "userMessage": "This knowledge processing job could not be found.",
            "retryable": False,
            "details": {"jobId": job_id},
        },
    )


@app.post("/kb/process", status_code=202, tags=["Knowledge Base"], summary="Start a knowledge ingestion job")
async def process_kb(
    payload: KbProcessRequest,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
):
    _verify_internal(request)
    try:
        job = kb_handler.create_kb_job(payload.model_dump(exclude_none=True))
    except kb_handler.KbJobValidationError as exc:
        raise _kb_http_exception(exc) from exc

    response.headers["Location"] = job["statusUrl"]
    background_tasks.add_task(kb_handler.run_kb_job, job["jobId"])
    return {"success": True, **job}


@app.get("/kb/jobs/{job_id}", tags=["Knowledge Base"], summary="Read knowledge ingestion job status")
async def read_kb_job(job_id: str, request: Request):
    _verify_internal(request)
    try:
        return kb_handler.get_kb_job(job_id)
    except KeyError as exc:
        raise _kb_not_found(job_id) from exc


@app.delete("/kb/jobs/{job_id}", tags=["Knowledge Base"], summary="Cancel a queued or running knowledge ingestion job")
async def cancel_kb_job(job_id: str, request: Request):
    _verify_internal(request)
    try:
        return kb_handler.cancel_kb_job(job_id)
    except KeyError as exc:
        raise _kb_not_found(job_id) from exc


@app.post("/kb/jobs/{job_id}/retry", status_code=202, tags=["Knowledge Base"], summary="Retry failed documents from a knowledge ingestion job")
async def retry_kb_job(job_id: str, request: Request, response: Response, background_tasks: BackgroundTasks):
    _verify_internal(request)
    try:
        job = kb_handler.retry_kb_job(job_id)
    except KeyError as exc:
        raise _kb_not_found(job_id) from exc
    except kb_handler.KbJobValidationError as exc:
        raise _kb_http_exception(exc) from exc

    response.headers["Location"] = job["statusUrl"]
    background_tasks.add_task(kb_handler.run_kb_job, job["jobId"])
    return {"success": True, **job}


@app.delete("/kb/{agent_id}/{kb_id}")
async def delete_kb(agent_id: str, kb_id: str, request: Request):
    _verify_internal(request)
    kb_handler.delete_kb_vectors(namespace=agent_id, kb_id=kb_id)
    return {"success": True, "agentId": agent_id, "kbId": kb_id}
