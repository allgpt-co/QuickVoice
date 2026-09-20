#!/usr/bin/env python3
"""Inspect GA4 measurement registration; no administration writes without --apply."""

import argparse
from datetime import datetime, timezone
import json
import os
import urllib.error
import urllib.parse
import urllib.request

EDIT_SCOPE = "https://www.googleapis.com/auth/analytics.edit"
ADMIN = "https://analyticsadmin.googleapis.com/v1beta"
DIMENSIONS = (
    ("cta_type", "CTA type"),
    ("link_location", "Link location"),
    ("form_location", "Form location"),
)


def request_json(url, body=None, token=None, form=False, method=None):
    headers = {"User-Agent": "QuickVoice-Measurement-Setup/1.0"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        data = (urllib.parse.urlencode(body) if form else json.dumps(body)).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=30) as response:
            result = json.load(response)
        if not isinstance(result, dict) or "error" in result:
            raise ValueError("Expected an object")
        return result
    except urllib.error.HTTPError as error:
        # Do not echo URLs, provider bodies, token-bearing requests or OAuth responses.
        raise RuntimeError(f"Google API returned HTTP {error.code}") from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise RuntimeError("Google API request failed or returned invalid JSON") from None


def access_token():
    # An explicitly supplied short-lived administrator credential must not be
    # shadowed by the normal reporting refresh grant in the same environment.
    if os.environ.get("GA_ADMIN_ACCESS_TOKEN"):
        return os.environ["GA_ADMIN_ACCESS_TOKEN"]
    names = ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN")
    if all(os.environ.get(name) for name in names):
        fields = {name.removeprefix("GOOGLE_").lower(): os.environ[name] for name in names}
        fields["grant_type"] = "refresh_token"
        result = request_json("https://oauth2.googleapis.com/token", fields, form=True)
        if isinstance(result.get("access_token"), str) and result["access_token"]:
            return result["access_token"]
        raise RuntimeError("Google OAuth refresh returned no access token")
    if os.environ.get("GA_ACCESS_TOKEN"):
        return os.environ["GA_ACCESS_TOKEN"]
    raise RuntimeError("Provide the existing Google OAuth refresh credentials or GA_ACCESS_TOKEN in the environment")


def token_scopes(token):
    result = request_json("https://oauth2.googleapis.com/tokeninfo?" + urllib.parse.urlencode({"access_token": token}))
    scope = result.get("scope", "")
    if not isinstance(scope, str):
        raise RuntimeError("Google token inspection returned invalid scope metadata")
    return set(scope.split())


def list_resources(url, key, token):
    rows, seen = [], set()
    page_token = None
    while True:
        target = url if page_token is None else url + "?" + urllib.parse.urlencode({"pageToken": page_token})
        result = request_json(target, token=token)
        batch = result.get(key, [])
        if not isinstance(batch, list) or any(not isinstance(row, dict) for row in batch):
            raise RuntimeError("Google Admin API returned an invalid resource list")
        rows.extend(batch)
        page_token = result.get("nextPageToken")
        if not page_token:
            return rows
        if not isinstance(page_token, str) or page_token in seen:
            raise RuntimeError("Google Admin API returned an invalid pagination token")
        seen.add(page_token)


def inspect(property_id, token):
    base = f"{ADMIN}/properties/{property_id}"
    prop = request_json(base, token=token)
    if prop.get("name") != f"properties/{property_id}":
        raise RuntimeError("Google Admin API did not confirm the requested property")
    return {
        "property": {key: prop.get(key) for key in ("name", "displayName", "timeZone", "createTime")},
        "keyEvents": list_resources(base + "/keyEvents", "keyEvents", token),
        "customDimensions": list_resources(base + "/customDimensions", "customDimensions", token),
    }


def registration_plan(state):
    key_event = next((row for row in state["keyEvents"] if row.get("eventName") == "generate_lead"), None)
    plan = [{
        "collection": "keyEvents", "identity": "generate_lead",
        "action": "existing" if key_event else "create",
        "body": {"eventName": "generate_lead", "countingMethod": "ONCE_PER_EVENT"},
        "existing": key_event,
    }]
    for parameter, display in DIMENSIONS:
        existing = next((row for row in state["customDimensions"] if row.get("parameterName") == parameter and row.get("scope") == "EVENT"), None)
        plan.append({
            "collection": "customDimensions", "identity": parameter,
            "action": "existing" if existing else "create",
            "body": {"parameterName": parameter, "displayName": display, "scope": "EVENT"},
            "existing": existing,
        })
    return plan


def configuration_issues(plan):
    """Inspect required semantics without changing an existing registration."""
    issues = []
    event = next(item for item in plan if item["identity"] == "generate_lead")["existing"]
    if event:
        if event.get("countingMethod") != "ONCE_PER_EVENT":
            issues.append({"identity": "generate_lead", "field": "countingMethod",
                           "expected": "ONCE_PER_EVENT", "actual": event.get("countingMethod")})
        if event.get("defaultValue") is not None:
            issues.append({"identity": "generate_lead", "field": "defaultValue",
                           "expected": None, "actual": event["defaultValue"]})
    return issues


def configure(property_id, token, apply=False):
    scopes = token_scopes(token)
    state = inspect(property_id, token)
    plan = registration_plan(state)
    pending = [item for item in plan if item["action"] == "create"]
    issues = configuration_issues(plan)
    result = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "mode": "apply" if apply else "dry_run",
        "property": state["property"], "has_analytics_edit_scope": EDIT_SCOPE in scopes,
        "status": "configuration_mismatch" if issues else "changes_pending" if pending else "already_configured",
        "configuration_issues": issues,
        "plan": plan, "create_responses_received": [],
        "note": "Registration is not evidence of browser collection, delivery, bookings or sales qualification. Existing registrations are never modified or deleted.",
    }
    if issues:
        result["apply_blocker"] = "An existing registration differs from the required settings. Have an authorized administrator correct that entry and recheck. No registration was created, modified or deleted."
        return result
    if not pending or not apply:
        if pending and EDIT_SCOPE not in scopes:
            result["apply_blocker"] = "Existing OAuth grant lacks analytics.edit; an authorized property administrator must provide an appropriate grant or register these items in GA4. This tool never starts OAuth or changes scopes."
        return result
    if EDIT_SCOPE not in scopes:
        result["status"] = "blocked_missing_edit_scope"
        return result
    base = f"{ADMIN}/properties/{property_id}"
    for item in pending:
        try:
            created = request_json(base + "/" + item["collection"], body=item["body"], token=token)
            if not str(created.get("name", "")).startswith(base.removeprefix(ADMIN + "/") + "/" + item["collection"] + "/"):
                raise RuntimeError("Google Admin API did not confirm a created resource")
            result["create_responses_received"].append(item["identity"])
        except RuntimeError as error:
            result.update(status="apply_incomplete", failed_operation=item["identity"], error=str(error))
            result["note"] += " A failed request can have an uncertain outcome. No automatic retry was made; rerun a dry-run before retrying. Earlier operations may have succeeded."
            return result
    try:
        result["verified_plan"] = registration_plan(inspect(property_id, token))
        result["configuration_issues"] = configuration_issues(result["verified_plan"])
        result["status"] = "configuration_mismatch" if result["configuration_issues"] else "verified_configured" if all(item["action"] == "existing" for item in result["verified_plan"]) else "verification_pending"
    except RuntimeError as error:
        result.update(status="verification_failed", error=str(error))
    return result


def configure_pageviews(property_id, stream_id, token, mode, apply=False):
    """Change only browser-history views; web rollout remains a separate step."""
    if mode not in {"manual", "automatic"}:
        raise ValueError("Unsupported pageview mode")
    base = f"https://analyticsadmin.googleapis.com/v1alpha/properties/{property_id}/dataStreams/{stream_id}"
    stream = request_json(base, token=token)
    if (stream.get("name") != f"properties/{property_id}/dataStreams/{stream_id}" or
            stream.get("webStreamData", {}).get("measurementId") != "G-SZFBG11VRP"):
        raise RuntimeError("Stream is not the verified QuickVoice web measurement destination")
    settings_url = base + "/enhancedMeasurementSettings"
    settings = request_json(settings_url, token=token)
    if settings.get("streamEnabled") is not True:
        raise RuntimeError("Enhanced measurement is disabled; inspect settings before changing pageview mode")
    current = settings.get("pageChangesEnabled", False)
    if not isinstance(current, bool):
        raise RuntimeError("Invalid browser-history pageview setting")
    desired = mode == "automatic"
    result = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "mode": "apply" if apply else "dry_run", "pageview_mode": mode,
        "stream": stream["name"], "measurement_id": "G-SZFBG11VRP",
        "page_changes_enabled_before": current, "page_changes_enabled_requested": desired,
        "status": "already_configured" if current == desired else "changes_pending",
        "note": "This changes only the GA history setting. Enable manual web views after preparing manual mode; disable manual web views before restoring automatic mode. Verify live collection separately.",
    }
    if current == desired:
        return result
    has_edit = EDIT_SCOPE in token_scopes(token)
    result["has_analytics_edit_scope"] = has_edit
    if not apply:
        return result
    if not has_edit:
        result["status"] = "blocked_missing_edit_scope"
        return result
    try:
        request_json(settings_url + "?updateMask=page_changes_enabled",
                     body={"pageChangesEnabled": desired}, token=token, method="PATCH")
        saved = request_json(settings_url, token=token)
        result["status"] = "verified_configured" if saved.get("pageChangesEnabled", False) is desired and saved.get("streamEnabled") is True else "verification_pending"
    except RuntimeError as error:
        result.update(status="apply_incomplete", error=str(error))
        result["note"] += " The setting may have changed. Inspect it before retrying; no mutation was repeated."
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--property", default="543950329")
    parser.add_argument("--stream", default="15188028920")
    parser.add_argument("--pageviews", choices=("manual", "automatic"), help="Inspect/prepare only the GA history setting instead of event registrations")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Create missing registrations using existing authorized edit access; never modify existing entries")
    mode.add_argument("--check", action="store_true", help="Read-only; exit 2 for missing or mismatched configuration")
    args = parser.parse_args()
    if not args.property.isdigit() or not args.stream.isdigit():
        parser.error("--property and --stream must be numeric IDs")
    try:
        token = access_token()
        result = configure_pageviews(args.property, args.stream, token, args.pageviews, args.apply) if args.pageviews else configure(args.property, token, args.apply)
    except RuntimeError as error:
        print(json.dumps({"status": "error", "error": str(error)}))
        return 1
    print(json.dumps(result, indent=2))
    if args.check and result["status"] in {"changes_pending", "configuration_mismatch"}:
        return 2
    if result["status"] not in {"changes_pending", "already_configured", "verified_configured"}:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
