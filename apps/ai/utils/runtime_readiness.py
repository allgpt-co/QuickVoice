from __future__ import annotations

import asyncio
import inspect
import json
import os
import uuid
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from utils.billing_mode import resolve_billing_mode


RUNTIME_PROTOCOL_VERSION = 1
DEFAULT_HANDSHAKE_TIMEOUT_SECONDS = 2.0
DEFAULT_STARTUP_ATTEMPTS = 8
DEFAULT_STARTUP_BACKOFF_SECONDS = 0.5
MAX_STARTUP_ATTEMPTS = 60
MAX_STARTUP_BACKOFF_SECONDS = 5.0
EPHEMERAL_QUEUE_ROOTS = (Path("/tmp"), Path("/var/tmp"), Path("/dev/shm"))

RuntimeResponse = dict[str, Any]
GetJson = Callable[
    [str, dict[str, str], float],
    Awaitable[RuntimeResponse] | RuntimeResponse,
]
QueueProbe = Callable[[Path], str | None]


def _check(
    status: str,
    *,
    required: bool,
    message: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {"status": status, "required": required}
    if message:
        result["message"] = message
    return result


def _server_url_check(raw_url: str, *, required: bool) -> dict[str, Any]:
    if not raw_url:
        return _check(
            "not_configured" if required else "skipped",
            required=required,
            message=(
                "SERVER_API_URL is required for hosted billing mode"
                if required
                else None
            ),
        )
    parsed = urlparse(raw_url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        return _check(
            "error",
            required=required,
            message=(
                "SERVER_API_URL must be an absolute HTTP(S) URL without "
                "credentials, query, or fragment"
            ),
        )
    return _check("ok", required=required)


def _queue_check(
    raw_queue_dir: str,
    *,
    required: bool,
    queue_probe: QueueProbe,
) -> dict[str, Any]:
    if not raw_queue_dir:
        return _check(
            "not_configured" if required else "skipped",
            required=required,
            message=(
                "AI_BILLING_USAGE_QUEUE_DIR is required for hosted billing mode"
                if required
                else None
            ),
        )

    directory = Path(raw_queue_dir)
    if not directory.is_absolute():
        return _check(
            "error",
            required=required,
            message="AI_BILLING_USAGE_QUEUE_DIR must be an absolute path",
        )

    resolved = directory.resolve(strict=False)
    if any(
        resolved == root or resolved.is_relative_to(root)
        for root in EPHEMERAL_QUEUE_ROOTS
    ):
        return _check(
            "error",
            required=required,
            message="AI_BILLING_USAGE_QUEUE_DIR must not use a temporary filesystem",
        )

    probe_error = queue_probe(resolved)
    if probe_error:
        return _check("error", required=required, message=probe_error)
    return _check("ok", required=required)


def _probe_writable_queue(directory: Path) -> str | None:
    probe_path = directory / f".quickvoice-readiness-{uuid.uuid4().hex}"
    file_descriptor: int | None = None
    try:
        directory.mkdir(parents=True, exist_ok=True)
        if not directory.is_dir():
            return "AI_BILLING_USAGE_QUEUE_DIR must reference a directory"
        file_descriptor = os.open(
            probe_path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )
        os.write(file_descriptor, b"ready")
        os.fsync(file_descriptor)
        return None
    except OSError:
        return "AI_BILLING_USAGE_QUEUE_DIR is not writable"
    finally:
        if file_descriptor is not None:
            os.close(file_descriptor)
        try:
            probe_path.unlink(missing_ok=True)
        except OSError:
            pass


def evaluate_local_runtime_config(
    environ: Mapping[str, str] | None = None,
    *,
    queue_probe: QueueProbe = _probe_writable_queue,
) -> dict[str, Any]:
    env = os.environ if environ is None else environ
    raw_server_url = str(env.get("SERVER_API_URL", "")).strip()
    raw_internal_key = str(env.get("INTERNAL_API_KEY", "")).strip()
    raw_queue_dir = str(env.get("AI_BILLING_USAGE_QUEUE_DIR", "")).strip()

    try:
        billing_mode = resolve_billing_mode(env)
        mode_check = _check("ok", required=True)
    except ValueError as error:
        billing_mode = "invalid"
        mode_check = _check("error", required=True, message=str(error))

    hosted = billing_mode == "hosted"
    server_connection_required = hosted or bool(raw_server_url)
    checks = {
        "billingMode": mode_check,
        "serverApiUrl": _server_url_check(
            raw_server_url,
            required=server_connection_required,
        ),
        "internalApiKey": (
            _check("ok", required=server_connection_required)
            if raw_internal_key
            else _check(
                "not_configured" if server_connection_required else "skipped",
                required=server_connection_required,
                message=(
                    "INTERNAL_API_KEY is required to verify the server billing mode"
                    if server_connection_required
                    else None
                ),
            )
        ),
        "billingUsageQueue": _queue_check(
            raw_queue_dir,
            required=hosted,
            queue_probe=queue_probe,
        ),
    }
    ready = all(
        not check["required"] or check["status"] == "ok"
        for check in checks.values()
    )
    return {
        "ok": ready,
        "service": "ai",
        "billingMode": billing_mode,
        "checks": checks,
    }


async def get_runtime_readiness(
    environ: Mapping[str, str] | None = None,
    *,
    get_json: GetJson | None = None,
    queue_probe: QueueProbe = _probe_writable_queue,
    timeout_seconds: float = DEFAULT_HANDSHAKE_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    env = os.environ if environ is None else environ
    readiness = evaluate_local_runtime_config(env, queue_probe=queue_probe)
    checks = readiness["checks"]
    raw_server_url = str(env.get("SERVER_API_URL", "")).strip()
    raw_internal_key = str(env.get("INTERNAL_API_KEY", "")).strip()
    handshake_required = readiness["billingMode"] == "hosted" or bool(
        raw_server_url
    )

    if not handshake_required:
        checks["serverBillingMode"] = _check(
            "skipped",
            required=False,
            message="No server runtime connection is configured",
        )
    elif (
        checks["serverApiUrl"]["status"] != "ok"
        or checks["internalApiKey"]["status"] != "ok"
    ):
        checks["serverBillingMode"] = _check(
            "not_configured",
            required=True,
            message=(
                "Server billing mode cannot be verified until its URL and "
                "internal key are valid"
            ),
        )
    else:
        try:
            response_or_awaitable = (get_json or _get_json)(
                _runtime_mode_url(raw_server_url),
                {
                    "Accept": "application/json",
                    "Authorization": f"Bearer {raw_internal_key}",
                },
                max(0.1, float(timeout_seconds)),
            )
            response = (
                await response_or_awaitable
                if inspect.isawaitable(response_or_awaitable)
                else response_or_awaitable
            )
            remote = response.get("data", response)
            if not isinstance(remote, Mapping):
                raise ValueError("invalid runtime response")
            protocol_version = remote.get("runtimeProtocolVersion")
            remote_mode = str(remote.get("billingMode", "")).strip()
            if protocol_version != RUNTIME_PROTOCOL_VERSION:
                checks["serverBillingMode"] = _check(
                    "error",
                    required=True,
                    message="Server runtime-mode protocol is incompatible",
                )
            elif remote_mode not in {"hosted", "self_hosted"}:
                checks["serverBillingMode"] = _check(
                    "error",
                    required=True,
                    message="Server returned an invalid billing mode",
                )
            elif remote_mode != readiness["billingMode"]:
                checks["serverBillingMode"] = _check(
                    "error",
                    required=True,
                    message=(
                        "AI/server billing mode mismatch: "
                        f"AI is {readiness['billingMode']}, server is {remote_mode}"
                    ),
                )
            else:
                checks["serverBillingMode"] = _check("ok", required=True)
        except Exception as error:
            checks["serverBillingMode"] = _check(
                "error",
                required=True,
                message=(
                    "Server runtime-mode check failed "
                    f"({type(error).__name__})"
                ),
            )

    readiness["ok"] = all(
        not check["required"] or check["status"] == "ok"
        for check in checks.values()
    )
    return readiness


async def wait_for_runtime_readiness(
    *,
    attempts: int | None = None,
    backoff_seconds: float | None = None,
    readiness_getter: Callable[[], Awaitable[dict[str, Any]]] | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> dict[str, Any]:
    total_attempts = _bounded_int(
        attempts,
        env_name="AI_RUNTIME_MODE_HANDSHAKE_ATTEMPTS",
        default=DEFAULT_STARTUP_ATTEMPTS,
        minimum=1,
        maximum=MAX_STARTUP_ATTEMPTS,
    )
    initial_backoff = _bounded_float(
        backoff_seconds,
        env_name="AI_RUNTIME_MODE_HANDSHAKE_BACKOFF_SECONDS",
        default=DEFAULT_STARTUP_BACKOFF_SECONDS,
        minimum=0.0,
        maximum=MAX_STARTUP_BACKOFF_SECONDS,
    )
    getter = readiness_getter or get_runtime_readiness
    last_result: dict[str, Any] | None = None

    for attempt in range(total_attempts):
        last_result = await getter()
        if last_result.get("ok") is True:
            return last_result
        if attempt + 1 < total_attempts:
            await sleep(
                min(
                    MAX_STARTUP_BACKOFF_SECONDS,
                    initial_backoff * (2**attempt),
                )
            )

    failed_checks = [
        name
        for name, check in (last_result or {}).get("checks", {}).items()
        if check.get("required") and check.get("status") != "ok"
    ]
    suffix = ", ".join(failed_checks) or "unknown runtime check"
    raise RuntimeError(f"AI runtime readiness failed: {suffix}")


def validate_runtime_startup() -> dict[str, Any]:
    return asyncio.run(wait_for_runtime_readiness())


def _runtime_mode_url(server_api_url: str) -> str:
    base_url = server_api_url.rstrip("/")
    if not base_url.endswith("/api/v1"):
        base_url = f"{base_url}/api/v1"
    return f"{base_url}/system/runtime-mode"


async def _get_json(
    url: str,
    headers: dict[str, str],
    timeout_seconds: float,
) -> RuntimeResponse:
    def fetch() -> RuntimeResponse:
        request = Request(url, method="GET", headers=headers)
        with urlopen(request, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("runtime response must be an object")
        return payload

    return await asyncio.to_thread(fetch)


def _bounded_int(
    explicit: int | None,
    *,
    env_name: str,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    raw: Any = os.getenv(env_name) if explicit is None else explicit
    try:
        value = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        value = default
    return min(maximum, max(minimum, value))


def _bounded_float(
    explicit: float | None,
    *,
    env_name: str,
    default: float,
    minimum: float,
    maximum: float,
) -> float:
    raw: Any = os.getenv(env_name) if explicit is None else explicit
    try:
        value = float(raw) if raw is not None else default
    except (TypeError, ValueError):
        value = default
    return min(maximum, max(minimum, value))
