#!/usr/bin/env python3
"""Read-only, dated GSC/GA4 snapshots. Credentials stay in process memory."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request


def comparison_windows(end, days=28):
    if days < 1:
        raise ValueError("days must be positive")
    start = end - timedelta(days=days - 1)
    return {
        "current": {"startDate": start.isoformat(), "endDate": end.isoformat()},
        "previous": {
            "startDate": (start - timedelta(days=days)).isoformat(),
            "endDate": (start - timedelta(days=1)).isoformat(),
        },
    }


def request_json(url, body=None, token=None):
    headers = {"User-Agent": "QuickVoice-SEO-Reporting/1.0"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url, headers=headers, data=json.dumps(body).encode() if body is not None else None
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Never echo token-bearing requests, OAuth responses or raw provider errors.
        raise RuntimeError(f"HTTP {error.code} from {urllib.parse.urlsplit(url).hostname}") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError(f"Network failure for {urllib.parse.urlsplit(url).hostname}") from None
    except ValueError:
        raise RuntimeError(f"Invalid JSON from {urllib.parse.urlsplit(url).hostname}") from None


def access_token():
    names = ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN")
    if any(not os.environ.get(name) for name in names):
        raise RuntimeError("Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN in the process environment")
    fields = {name.removeprefix("GOOGLE_").lower(): os.environ[name] for name in names}
    fields["grant_type"] = "refresh_token"
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=urllib.parse.urlencode(fields).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)["access_token"]
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError):
        raise RuntimeError("Google OAuth refresh failed; reconnect the authorized account") from None


def report_requests(property_id, site, stream_id, windows):
    ga = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
    admin = f"https://analyticsadmin.googleapis.com/v1alpha/properties/{property_id}"
    gsc = "https://www.googleapis.com/webmasters/v3/sites/" + urllib.parse.quote(site, safe="")
    requests = {
        "ga_property": (admin, None),
        "ga_key_events": (admin + "/keyEvents", None),
        "ga_enhanced_measurement": (admin + f"/dataStreams/{stream_id}/enhancedMeasurementSettings", None),
        "gsc_sitemaps": (gsc + "/sitemaps", None),
    }
    for period, window in windows.items():
        for suffix, dimensions in (("totals", []), ("daily", ["date"]), ("pages", ["page"]), ("queries", ["query"])):
            requests[f"gsc_{period}_{suffix}"] = (
                gsc + "/searchAnalytics/query",
                {**window, "type": "web", "dataState": "final", "dimensions": dimensions, "rowLimit": 1000},
            )
        base = {"dateRanges": [window], "limit": 1000}
        for suffix, dimensions in (("totals", []), ("channels", ["sessionDefaultChannelGroup"]), ("sources", ["sessionSource", "sessionMedium"]), ("landing_pages", ["landingPage"])):
            requests[f"ga_{period}_{suffix}"] = (
                ga, {**base, "dimensions": [{"name": item} for item in dimensions],
                     "metrics": [{"name": item} for item in ("sessions", "engagedSessions", "keyEvents")],
                     "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}]},
            )
        requests[f"ga_{period}_leads"] = (
            ga, {**base, "dimensions": [{"name": "eventName"}], "metrics": [{"name": "eventCount"}],
                 "dimensionFilter": {"filter": {"fieldName": "eventName", "stringFilter": {"matchType": "EXACT", "value": "generate_lead"}}}},
        )
    return requests


def run_report(item, token):
    name, (url, body) = item
    try:
        return name, {"status": "ok", "request": body, "response": request_json(url, body, token)}
    except RuntimeError as error:
        return name, {"status": "error", "request": body, "error": str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end", type=date.fromisoformat, required=True, help="Last complete reporting date, YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=28)
    parser.add_argument("--property", default="543950329")
    parser.add_argument("--stream", default="15188028920")
    parser.add_argument("--site", default="sc-domain:quickvoice.co")
    parser.add_argument("--output", type=Path, required=True, help="Private/local output path; do not commit raw reports")
    args = parser.parse_args()
    if not 1 <= args.days <= 365:
        parser.error("--days must be between 1 and 365")
    if args.end >= datetime.now(timezone.utc).date():
        parser.error("--end must precede today; recent GSC final data can still be incomplete")
    if not args.property.isdigit() or not args.stream.isdigit():
        parser.error("property and stream must be numeric IDs")
    windows = comparison_windows(args.end, args.days)
    if args.output.exists():
        parser.error("Output already exists; use a new dated filename to preserve earlier observations")
    token = access_token()
    with ThreadPoolExecutor(max_workers=4) as pool:
        reports = dict(pool.map(lambda item: run_report(item, token), report_requests(args.property, args.site, args.stream, windows).items()))
    result = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "ga_property": args.property, "ga_stream": args.stream, "gsc_property": args.site,
        "windows": windows,
        "definitions": {
            "gsc": "Web search, all countries/devices, final data, PT calendar dates. Dimension rows are top rows and may omit anonymized queries; use the separate totals response.",
            "ga": "All traffic, property timezone returned by GA, no audience filters. Read organic sessions from channel rows. generate_lead eventCount is separate from keyEvents and inbox-verified enquiries.",
            "coverage": "Empty successful responses mean no recorded rows for the request, not proof of no business activity. Errors are retained as errors. Missing daily rows do not establish whether tracking failed or traffic was absent.",
            "limits": "Up to 1000 rows per grouped report. GA response rowCount and metadata retain truncation/thresholding evidence. The GA property creation date and known tracking interruptions constrain comparisons.",
        },
        "reports": reports,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Restrict newly created raw analytics exports to the current operating user.
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
    errors = [name for name, report in reports.items() if report["status"] == "error"]
    print(json.dumps({"output": str(args.output), "reports": len(reports), "errors": errors, "windows": windows}))
    return 1 if errors else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
