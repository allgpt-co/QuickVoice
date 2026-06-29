import os
from contextlib import asynccontextmanager
from typing import Any, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from handlers.config_handler import get_config
from handlers.flow_handler import simulate_flow_messages
from handlers import kb_handler
from utils.auth import is_explicit_dev_mode, verify_internal_headers


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
    if not os.environ.get("INTERNAL_API_KEY") and not is_explicit_dev_mode():
        raise RuntimeError("INTERNAL_API_KEY is required for QuickVoice AI API startup")
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
    return {"ok": True, "service": "ai"}


# ── agent config ──────────────────────────────────────────────────────────────

@app.get("/agents/{agent_id}/config")
async def read_agent_config(agent_id: str, request: Request):
    _verify_internal(request)
    return await get_config(agent_id)


# ── Flow simulation ──────────────────────────────────────────────────────────

class FlowSimulationMessage(BaseModel):
    role: str
    content: str


class FlowSimulationRequest(BaseModel):
    config: dict[str, Any]
    messages: list[FlowSimulationMessage]


@app.post("/flows/simulate")
async def simulate_flow(payload: FlowSimulationRequest, request: Request):
    _verify_internal(request)
    return simulate_flow_messages(payload.config, [message.model_dump() for message in payload.messages])


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
