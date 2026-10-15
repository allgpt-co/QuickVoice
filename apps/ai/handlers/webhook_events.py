"""Report webhook outcomes without exposing request bodies, URLs, or secrets."""

import asyncio
import json
import os
from urllib.parse import quote
from urllib.request import Request, urlopen

from handlers.calllog_handler import _api_base_url
from utils.logger import logger, redact_sensitive


def webhook_error_code(error: Exception) -> str:
    if isinstance(error, (TimeoutError, asyncio.TimeoutError)):
        return "timeout"
    if isinstance(error, json.JSONDecodeError):
        return "invalid_response"
    if str(error).startswith("HTTP "):
        return "http_error"
    return "delivery_error"


async def report_webhook_event(config: dict, phase: str, status: str,
                               error_code: str | None = None) -> None:
    agent_id = config.get("agent_id")
    organization_id = config.get("organization_id")
    base_url = _api_base_url(os.getenv("SERVER_API_URL") or "")
    api_key = os.getenv("INTERNAL_API_KEY")
    if not all((agent_id, organization_id, base_url, api_key)):
        return
    data = {"organizationId": organization_id, "phase": phase, "status": status}
    if error_code:
        data["errorCode"] = error_code
    try:
        request = Request(
            f"{base_url}/agents/{quote(str(agent_id), safe='')}/webhook-events",
            data=json.dumps(data).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        await asyncio.to_thread(_send_event, request)
    except Exception as error:
        logger.warning("[webhook] could not record delivery status: {}", redact_sensitive(str(error)))


def _send_event(request: Request) -> None:
    with urlopen(request, timeout=2) as response:
        response.read(1)
