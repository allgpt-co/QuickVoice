from __future__ import annotations

import os
from collections.abc import Mapping


def resolve_billing_mode(environ: Mapping[str, str] | None = None) -> str:
    env = os.environ if environ is None else environ
    configured = str(env.get("QUICKVOICE_BILLING_MODE", "")).strip().lower()
    if configured == "hosted":
        return "hosted"
    if configured in {"self_hosted", "self-hosted"}:
        return "self_hosted"
    if configured:
        raise ValueError(
            "QUICKVOICE_BILLING_MODE must be either 'hosted' or 'self_hosted'"
        )
    return (
        "hosted"
        if str(env.get("NODE_ENV", "")).strip().lower() == "production"
        else "self_hosted"
    )


def hosted_billing_required(environ: Mapping[str, str] | None = None) -> bool:
    return resolve_billing_mode(environ) == "hosted"
