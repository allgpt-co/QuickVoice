#!/usr/bin/env python3
"""Reconcile a private, non-PII CSV of verified business outcomes; no network calls."""

import argparse
import csv
from datetime import date, datetime, timezone
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

FIELDS = ("prospect_id", "event_id", "event_kind", "status", "occurred_at", "updated_at", "is_test", "is_us", "attribution", "landing_page")
KINDS = ("enquiry", "booking", "qualified", "opportunity")
OPAQUE_ID = re.compile(r"(?:[pe]_[0-9a-f]{16,64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\Z")
PAGE_PATH = re.compile(r"/(?:[a-z0-9-]+(?:/[a-z0-9-]+)*)?\Z")


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc)
    except (ValueError, AttributeError):
        raise ValueError("timestamps must be ISO 8601 with an explicit timezone") from None


def read_events(path):
    events = []
    with path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source, strict=True)
        if reader.fieldnames is None or len(reader.fieldnames) != len(FIELDS) or set(reader.fieldnames) != set(FIELDS):
            raise ValueError("CSV must contain exactly the documented headers; names, email, phone and extra columns are not accepted")
        for line, row in enumerate(reader, 2):
            try:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError("row does not match the CSV header")
                row = {key: value.strip() for key, value in row.items()}
                if not all(OPAQUE_ID.fullmatch(row[key]) for key in ("prospect_id", "event_id")):
                    raise ValueError("IDs must be opaque UUIDs or p_/e_ plus 16–64 lowercase hexadecimal characters")
                if row["event_kind"] not in KINDS:
                    raise ValueError("event_kind must be enquiry, booking, qualified or opportunity")
                if row["status"] not in {"confirmed", "cancelled", "rescheduled"}:
                    raise ValueError("status must be confirmed, cancelled or rescheduled")
                if row["status"] == "rescheduled" and row["event_kind"] != "booking":
                    raise ValueError("only a booking can be rescheduled")
                if row["is_test"] not in {"true", "false"} or row["is_us"] not in {"true", "false", "unknown"}:
                    raise ValueError("is_test must be true/false and is_us true/false/unknown")
                if row["attribution"] not in {"organic_search", "other", "unknown"}:
                    raise ValueError("attribution must be organic_search, other or unknown")
                if row["landing_page"] and (len(row["landing_page"]) > 300 or not PAGE_PATH.fullmatch(row["landing_page"])):
                    raise ValueError("landing_page must be a normalized public path without a query, fragment or personal data")
                row["occurred_at"] = timestamp(row["occurred_at"])
                row["updated_at"] = timestamp(row["updated_at"])
                if row["updated_at"] < row["occurred_at"]:
                    raise ValueError("updated_at cannot precede occurred_at")
                events.append(row)
            except ValueError as error:
                # Validation messages never reproduce a row or identifier.
                raise ValueError(f"CSV row {line}: {error}") from None
    return events


def reconcile(events, as_of):
    latest, immutable, test_prospects = {}, {}, set()
    for event in events:
        if event["updated_at"] > as_of:
            continue
        identity = event["event_id"]
        invariant = (event["prospect_id"], event["event_kind"], event["occurred_at"])
        if identity in immutable and immutable[identity] != invariant:
            raise ValueError("One event_id has conflicting prospect, event kind or original occurrence time")
        immutable[identity] = invariant
        if event["is_test"] == "true":
            test_prospects.add(event["prospect_id"])
        previous = latest.get(identity)
        if previous and previous["updated_at"] == event["updated_at"] and previous != event:
            raise ValueError("Conflicting versions share an event_id and updated_at; resolve the source export")
        if previous is None or previous["updated_at"] < event["updated_at"]:
            latest[identity] = event
    return list(latest.values()), test_prospects


def counts(events):
    return {kind: len({event["prospect_id"] for event in events if event["event_kind"] == kind}) for kind in KINDS}


def scorecard(events, start, end, as_of, calendar="America/Los_Angeles"):
    if start > end:
        raise ValueError("start must not follow end")
    zone = ZoneInfo(calendar)
    latest, tests = reconcile(events, as_of)
    in_period = [event for event in latest if start <= event["occurred_at"].astimezone(zone).date() <= end]
    eligible = [event for event in in_period if event["prospect_id"] not in tests and event["status"] != "cancelled"]
    credited = [event for event in eligible if event["is_us"] == "true" and event["attribution"] == "organic_search"]
    unknown = [event for event in eligible if event["is_us"] == "unknown" or event["attribution"] == "unknown"]
    pages = sorted({event["landing_page"] or "(unknown)" for event in credited})
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "timezone": calendar},
        "as_of": as_of.isoformat(),
        "unique_prospects_by_stage": {
            "all_verified_sources": counts(eligible),
            "verified_us_organic_search": counts(credited),
            "unknown_country_or_attribution": counts(unknown),
        },
        "us_organic_by_landing_page": {
            page: counts([event for event in credited if (event["landing_page"] or "(unknown)") == page]) for page in pages
        },
        "reconciliation": {
            "input_rows": len(events), "distinct_event_records_as_of": len(latest),
            "cancelled_event_records_in_period": sum(event["status"] == "cancelled" for event in in_period),
            "excluded_test_prospects_in_period": len({event["prospect_id"] for event in in_period if event["prospect_id"] in tests}),
        },
        "definitions": [
            "Counts are distinct prospects per stage, not event totals, sessions, revenue or a conversion rate. A prospect may appear in several stages; never add stages together.",
            "Confirmed means externally verified received enquiry, booking confirmation, sales-approved qualification or accepted sales opportunity, respectively. This tool does not verify CRM evidence itself.",
            "An event's most recent status at as_of is used; reschedules retain the original event_id and occurred_at. Cancellations remove that event only, not other stages.",
            "A test flag on any supplied history excludes that entire prospect. Unknown-source bookings receive no organic credit, even when another stage for that prospect has organic attribution.",
            "Attribution and country must be verified for each stage; GA geography or a URL alone does not establish a US-qualified business enquiry. Preserve the same verified acquisition context when progressing a prospect.",
            "Landing-page rows and stages are non-additive because a prospect can occur in multiple rows. Historical counts may change as cancellations/corrections are supplied; preserve dated exports.",
            "An empty input means no supplied evidence, not proof of zero business outcomes. Omitted or unknown-source records cannot be inferred from GA4 clicks.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Private CSV; never commit prospect-level records")
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument("--as-of", type=timestamp, default=None, help="Use only export versions updated at or before this timezone-aware timestamp")
    parser.add_argument("--timezone", default="America/Los_Angeles")
    args = parser.parse_args()
    try:
        result = scorecard(read_events(args.input), args.start, args.end, args.as_of or datetime.now(timezone.utc), args.timezone)
    except (ValueError, ZoneInfoNotFoundError) as error:
        # ZoneInfo's default error embeds supplied values; do not echo them.
        parser.exit(1, ("Unknown reporting timezone" if isinstance(error, ZoneInfoNotFoundError) else str(error)) + "\n")
    except (OSError, UnicodeError, csv.Error):
        parser.exit(1, "Unable to read the private CSV; check file access and UTF-8 CSV format\n")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
