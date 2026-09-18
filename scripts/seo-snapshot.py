#!/usr/bin/env python3
"""Read-only, dated GSC/GA4 snapshots. Credentials stay in process memory."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo


BRAND_REGEX = r"quick\s*voice"
ROW_LIMIT = 25000
GA_ROW_LIMIT = 10000
CLUSTERS = (
    ("Alternatives and comparisons", r"vapi|retell|synthflow|bland|elevenlabs|deepgram"),
    ("Open source", r"open[ -]?source|self[ -]?host"),
    ("Appointment scheduling", r"appointment|schedul|booking|calendar"),
    ("IVR replacement", r"\bivr\b"),
    ("Multilingual", r"multilingual|multi.language|bilingual|mandarin|spanish"),
    ("Automotive", r"automotive|dealership|car dealer"),
    ("Receptionist and answering", r"receptionist|answering"),
    ("Pricing", r"pricing|\bcost\b"),
)


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


def gsc_base(site):
    return "https://www.googleapis.com/webmasters/v3/sites/" + urllib.parse.quote(site, safe="")


def freshness_requests(site, today):
    window = {"startDate": (today - timedelta(days=21)).isoformat(), "endDate": today.isoformat()}
    return {
        f"gsc_freshness_{state}": (gsc_base(site) + "/searchAnalytics/query",
            {**window, "type": "web", "dataState": state, "dimensions": ["date"], "rowLimit": 100})
        for state in ("all", "final")
    }


def complete_gsc_end(all_response, final_response, today):
    """Use Google's incomplete boundary, or conservatively the newest final row."""
    final_dates = [date.fromisoformat(row["keys"][0]) for row in final_response.get("rows", [])]
    if not final_dates:
        raise RuntimeError("No final GSC dates returned; cannot establish a safe reporting end")
    boundary = all_response.get("metadata", {}).get("firstIncompleteDate")
    if boundary:
        end = date.fromisoformat(boundary) - timedelta(days=1)
        method = "Google firstIncompleteDate minus one day"
    else:
        end = max(final_dates)
        method = "Newest observed final row; no incomplete boundary returned (conservative)"
    return min(end, today - timedelta(days=1)), method


def select_end(gsc_end, requested, ga_today, ga_lag_days=2):
    safe_end = min(gsc_end, ga_today - timedelta(days=ga_lag_days))
    if requested and requested > safe_end:
        raise RuntimeError(f"Requested end exceeds aligned safe end {safe_end}; choose an earlier date")
    return requested or safe_end


def ga_filter(country="United States", organic=True):
    expressions = [{"filter": {"fieldName": "country", "stringFilter": {"matchType": "EXACT", "value": country}}},
        {"filter": {"fieldName": "hostName", "inListFilter": {"values": ["quickvoice.co", "www.quickvoice.co"]}}}]
    if organic:
        expressions.append({"filter": {"fieldName": "sessionDefaultChannelGroup", "stringFilter": {"matchType": "EXACT", "value": "Organic Search"}}})
    return {"andGroup": {"expressions": expressions}}


def report_requests(property_id, site, stream_id, windows, brand_regex=BRAND_REGEX):
    ga = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
    admin = f"https://analyticsadmin.googleapis.com/v1alpha/properties/{property_id}"
    gsc = gsc_base(site)
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
                {**window, "type": "web", "dataState": "final", "dimensions": dimensions, "rowLimit": ROW_LIMIT},
            )
        for cohort, query_operator in (("us", None), ("us_brand", "includingRegex"), ("us_nonbrand", "excludingRegex")):
            filters = [{"dimension": "country", "operator": "equals", "expression": "usa"}]
            if query_operator:
                filters.append({"dimension": "query", "operator": query_operator, "expression": brand_regex})
            dimensions = (("totals", []), ("queries", ["query"]))
            if cohort == "us":
                dimensions += (("pages", ["page"]), ("query_pages", ["query", "page"]), ("daily", ["date"]), ("devices", ["device"]))
            for suffix, dims in dimensions:
                requests[f"gsc_{period}_{cohort}_{suffix}"] = (gsc + "/searchAnalytics/query",
                    {**window, "type": "web", "dataState": "final", "dimensions": dims, "rowLimit": ROW_LIMIT,
                     "dimensionFilterGroups": [{"filters": filters}]})
        base = {"dateRanges": [window], "limit": GA_ROW_LIMIT}
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
        for cohort, organic in (("us_all", False), ("us_organic", True)):
            filtered = {**base, "dimensionFilter": ga_filter(organic=organic)}
            for suffix, dims in (("totals", []), ("daily", ["date"]), ("landing_pages", ["landingPage"])):
                requests[f"ga_{period}_{cohort}_{suffix}"] = (ga,
                    {**filtered, "dimensions": [{"name": dim} for dim in dims],
                     "metrics": [{"name": item} for item in ("sessions", "engagedSessions", "keyEvents")],
                     "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}]})
            requests[f"ga_{period}_{cohort}_events"] = (ga,
                {**filtered, "dimensions": [{"name": "eventName"}], "metrics": [{"name": "eventCount"}],
                 "orderBys": [{"metric": {"metricName": "eventCount"}, "desc": True}]})
    return requests


def run_report(item, token):
    name, (url, body) = item
    try:
        response = request_json(url, body, token)
        report = {"status": "ok", "endpoint": url, "request": body, "response": response}
        if body and "rowLimit" in body:
            report["row_limit_reached"] = len(response.get("rows", [])) >= body["rowLimit"]
        elif body and "limit" in body:
            report["row_limit_reached"] = response.get("rowCount", 0) > int(body["limit"])
        return name, report
    except RuntimeError as error:
        return name, {"status": "error", "endpoint": url, "request": body, "error": str(error)}


def response_rows(reports, name):
    report = reports.get(name, {})
    return report.get("response", {}).get("rows", []) if report.get("status") == "ok" else None


def cluster_queries(rows):
    """Sum query-only rows, never query-page pairs or hidden-query estimates."""
    result = {}
    for row in rows:
        query = row["keys"][0]
        name = next((name for name, pattern in CLUSTERS if re.search(pattern, query, re.I)), "Other / review intent")
        group = result.setdefault(name, {"queries": 0, "clicks": 0, "impressions": 0, "position_sum": 0})
        group["queries"] += 1
        group["clicks"] += row["clicks"]
        group["impressions"] += row["impressions"]
        group["position_sum"] += row["position"] * row["impressions"]
    for group in result.values():
        weighted = group.pop("position_sum")
        group["position"] = weighted / group["impressions"] if group["impressions"] else None
    return dict(sorted(result.items(), key=lambda item: -item[1]["impressions"]))


def ga_values(response):
    headers = [h["name"] for h in response.get("dimensionHeaders", [])] + [h["name"] for h in response.get("metricHeaders", [])]
    return [dict(zip(headers, [v["value"] for v in row.get("dimensionValues", [])] + [v["value"] for v in row.get("metricValues", [])])) for row in response.get("rows", [])]


def markdown_summary(result):
    reports = result["reports"]
    property_created = reports.get("ga_property", {}).get("response", {}).get("createTime", "")[:10]
    lines = ["# QuickVoice US SEO snapshot", "", f"Observed: {result['observed_at']}",
        f"GSC latest safe final date: {result['freshness']['gsc_final_end']}; aligned report end: {result['freshness']['aligned_end']}.",
        "", "US = GSC country `usa`; GA United States + production hostname. GA organic = Organic Search (all search engines).",
        "**Reported nonbrand queries omit anonymized queries; zero reported nonbrand clicks does not mean zero total nonbrand clicks.**",
        "GA has no final-data certificate. Its property-timezone lag buffer and matching calendar labels do not make GA/GSC metrics interchangeable.",
        "Historical comparisons crossing the known Aug 12–Sep 5, 2026 GA measurement interruption are not valid growth comparisons.", ""]
    if property_created:
        lines += [f"GA property created: {property_created}. Dates before creation are unmeasured, not zero demand.", ""]
    registration = reports.get("ga_key_events", {})
    if registration.get("status") == "ok":
        registered = [event["eventName"] for event in registration["response"].get("keyEvents", [])]
        if "generate_lead" not in registered:
            lines += ["**`generate_lead` is not registered as a GA key event at collection time. Its raw event count is still reported separately.**", ""]
    for period, window in result["windows"].items():
        days = (date.fromisoformat(window["endDate"]) - date.fromisoformat(window["startDate"])).days + 1
        lines += [f"## {period}: {window['startDate']} through {window['endDate']} ({days} days)", "",
            "| GSC cohort | Clicks | Impressions | CTR | Avg position |", "|---|---:|---:|---:|---:|"]
        for suffix, label in (("totals", "Global (context)"), ("us_totals", "US total"), ("us_brand_totals", "US reported brand"), ("us_nonbrand_totals", "US reported nonbrand")):
            rows = response_rows(reports, f"gsc_{period}_{suffix}")
            if rows is None:
                lines.append(f"| {label} | ERROR | — | — | — |")
            else:
                r = rows[0] if rows else {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}
                pos = f"{r['position']:.2f}" if r["impressions"] else "—"
                lines.append(f"| {label} | {r['clicks']} | {r['impressions']} | {r['ctr']:.2%} | {pos} |")
        queries = response_rows(reports, f"gsc_{period}_us_queries")
        totals = response_rows(reports, f"gsc_{period}_us_totals")
        if queries is not None and totals:
            lines += ["", f"Returned US query rows cover {sum(r['clicks'] for r in queries)} of {totals[0]['clicks']} total clicks and {sum(r['impressions'] for r in queries)} of {totals[0]['impressions']} impressions. Missing coverage is not assigned to either brand cohort."]
        lines += ["", "### US organic GA (recorded activity, not qualified opportunities)", ""]
        ga_report = reports.get(f"ga_{period}_us_organic_totals", {})
        before_creation = bool(property_created and window["endDate"] < property_created)
        if before_creation:
            lines.append("Unavailable: this entire window predates GA property creation; no traffic or conversion inference is possible.")
        elif ga_report.get("status") == "ok":
            values = ga_values(ga_report["response"])
            r = values[0] if values else {}
            lines.append(f"Sessions: {r.get('sessions', '0')}; engaged sessions: {r.get('engagedSessions', '0')}; all key events: {r.get('keyEvents', '0')}.")
            if property_created and window["startDate"] < property_created:
                lines.append("Partial measurement: this window starts before GA property creation.")
        else:
            lines.append("ERROR: GA organic totals unavailable; not zero.")
        events = reports.get(f"ga_{period}_us_organic_events", {})
        if before_creation:
            pass
        elif events.get("status") == "ok":
            counts = {r["eventName"]: r["eventCount"] for r in ga_values(events["response"])}
            missing = "unknown (row limit)" if events.get("row_limit_reached") else "0"
            lines.append("Event counts: " + "; ".join(f"`{name}` = {counts.get(name, missing)}" for name in ("generate_lead", "qualify_lead", "close_convert_lead")) + ".")
        else:
            lines.append("ERROR: GA organic events unavailable; not zero.")
        rows = response_rows(reports, f"gsc_{period}_us_nonbrand_queries")
        if rows is not None:
            lines += ["", "### Reported nonbrand query clusters", "", "| Cluster | Queries | Clicks | Impressions | Weighted position |", "|---|---:|---:|---:|---:|"]
            for name, group in cluster_queries(rows).items():
                pos = f"{group['position']:.2f}" if group["position"] is not None else "—"
                lines.append(f"| {name} | {group['queries']} | {group['clicks']} | {group['impressions']} | {pos} |")
        lines.append("")
    lines += ["## Collection warnings", ""]
    for name, report in reports.items():
        if report.get("status") == "error":
            lines.append(f"- {name}: {report['error']}")
        if report.get("row_limit_reached"):
            lines.append(f"- {name}: configured row limit reached; report is truncated.")
        metadata = report.get("response", {}).get("metadata", {})
        if metadata.get("subjectToThresholding") or metadata.get("samplingMetadatas") or metadata.get("dataLossFromOtherRow"):
            lines.append(f"- {name}: GA reports thresholding, sampling, or other-row loss; inspect raw metadata.")
    lines += ["- Query clusters are heuristic, mutually exclusive labels; inspect the raw query-page rows for intent and page ownership. No cannibalization or traffic forecast is inferred.",
        "- GSC row limits can omit data below the cap; use separate totals. Sitemap `indexed` is deprecated and not an index count.",
        "- Missing GA daily rows cannot distinguish no traffic from absent tracking. Qualified enquiries require inbox/CRM verification; keyEvents are not a lead total."]
    return "\n".join(lines) + "\n"


def write_private(path, contents):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(contents)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end", type=date.fromisoformat, help="Optional inclusive end; rejected if newer than the probed safe date")
    parser.add_argument("--days", type=int, default=28)
    parser.add_argument("--long-days", type=int, default=90, help="Also compare this longer period (default: 90)")
    parser.add_argument("--ga-lag-days", type=int, default=2, help="Minimum property-calendar reporting lag; not a GA finality guarantee")
    parser.add_argument("--brand-regex", default=BRAND_REGEX, help="GSC RE2 brand expression; applied identically to include/exclude cohorts")
    parser.add_argument("--property", default="543950329")
    parser.add_argument("--stream", default="15188028920")
    parser.add_argument("--site", default="sc-domain:quickvoice.co")
    parser.add_argument("--output", type=Path, required=True, help="Private/local output path; do not commit raw reports")
    parser.add_argument("--summary", type=Path, help="Optional private Markdown summary path; defaults to output filename with .md")
    args = parser.parse_args()
    if not all(1 <= days <= 240 for days in (args.days, args.long_days)):
        parser.error("--days and --long-days must be between 1 and 240 (GSC retains about 16 months)")
    if args.ga_lag_days < 2:
        parser.error("--ga-lag-days must be at least 2")
    if not args.brand_regex.strip():
        parser.error("--brand-regex must not be empty")
    if not args.property.isdigit() or not args.stream.isdigit():
        parser.error("property and stream must be numeric IDs")
    summary_path = args.summary or args.output.with_suffix(".md")
    if args.output.resolve() == summary_path.resolve():
        parser.error("Raw output and Markdown summary must have different paths")
    if args.output.exists() or summary_path.exists():
        parser.error("Output already exists; use a new dated filename to preserve earlier observations")
    token = access_token()
    observed = datetime.now(timezone.utc)
    today = observed.astimezone(ZoneInfo("America/Los_Angeles")).date()
    probes = freshness_requests(args.site, today)
    probes["ga_property"] = (f"https://analyticsadmin.googleapis.com/v1alpha/properties/{args.property}", None)
    with ThreadPoolExecutor(max_workers=3) as pool:
        preliminary = dict(pool.map(lambda item: run_report(item, token), probes.items()))
    # Without metadata, do not silently guess dates or turn API errors into zero activity.
    failures = [name for name, report in preliminary.items() if report["status"] != "ok"]
    if failures:
        write_private(args.output, json.dumps({"observed_at": observed.isoformat(), "reports": preliminary,
            "status": "freshness_error", "errors": failures}, indent=2) + "\n")
        raise RuntimeError("Freshness/property probe failed; raw error statuses saved, no comparison generated")
    final_end, method = complete_gsc_end(preliminary["gsc_freshness_all"]["response"], preliminary["gsc_freshness_final"]["response"], today)
    ga_timezone = preliminary["ga_property"]["response"].get("timeZone")
    if not ga_timezone:
        raise RuntimeError("GA property timezone unavailable; refusing to assume calendar alignment")
    end = select_end(final_end, args.end, observed.astimezone(ZoneInfo(ga_timezone)).date(), args.ga_lag_days)
    windows = comparison_windows(end, args.days)
    if args.long_days != args.days:
        windows.update({f"{period}{args.long_days}": window for period, window in comparison_windows(end, args.long_days).items()})
    if args.property == "543950329" and date(2026, 9, 6) <= end < date(2026, 12, 5):
        windows["post_recovery"] = {"startDate": "2026-09-06", "endDate": end.isoformat()}
    with ThreadPoolExecutor(max_workers=4) as pool:
        requests = report_requests(args.property, args.site, args.stream, windows, args.brand_regex)
        requests.pop("ga_property")
        reports = {**preliminary, **dict(pool.map(lambda item: run_report(item, token), requests.items()))}
    result = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "ga_property": args.property, "ga_stream": args.stream, "gsc_property": args.site,
        "windows": windows,
        "freshness": {"gsc_final_end": final_end.isoformat(), "gsc_end_method": method,
            "aligned_end": end.isoformat(), "ga_timezone": ga_timezone, "ga_lag_days": args.ga_lag_days,
            "ga_finality": "No GA final-data flag; lag buffer is conservative, and historical reports can be revised"},
        "filters": {"gsc_country": "usa", "brand_regex": args.brand_regex,
            "ga_country": "United States", "ga_organic_channel": "Organic Search",
            "ga_hostnames": ["quickvoice.co", "www.quickvoice.co"]},
        "definitions": {
            "gsc": "Web search, final data, PT calendar dates. Global context plus US total/brand/nonbrand. Query filters omit anonymized queries; unknown queries are never assigned to brand or nonbrand. Query/page rows do not replace separate totals.",
            "ga": "All-traffic context plus US production-host all-traffic and Organic Search cohorts, using property timezone. Organic includes all search engines. Event counts, all keyEvents, and inbox/CRM-qualified enquiries are distinct measures.",
            "coverage": "Empty successful responses mean no recorded rows for the request, not proof of no business activity. Errors are retained as errors. Missing daily rows do not establish whether tracking failed or traffic was absent.",
            "limits": f"Up to {ROW_LIMIT} top GSC rows and {GA_ROW_LIMIT} GA rows per grouped report; no exhaustive-row claim. GA rowCount and metadata retain truncation/thresholding evidence. GSC sitemap indexed field is deprecated.",
            "known_measurement_gap": "GA daily rows were absent 2026-08-12 through 2026-09-05 and live tag was absent at the Sep 6 pre-repair audit; collection resumed Sep 6. Do not interpret comparisons spanning this interruption as growth. Missing rows alone do not prove tracking failure.",
        },
        "reports": reports,
    }
    write_private(args.output, json.dumps(result, indent=2) + "\n")
    write_private(summary_path, markdown_summary(result))
    errors = [name for name, report in reports.items() if report["status"] == "error"]
    print(json.dumps({"output": str(args.output), "summary": str(summary_path), "reports": len(reports), "errors": errors, "windows": windows, "freshness": result["freshness"]}))
    return 1 if errors else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
