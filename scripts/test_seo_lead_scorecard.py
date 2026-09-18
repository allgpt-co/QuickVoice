import csv
from datetime import date
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("lead_scorecard", Path(__file__).with_name("seo-lead-scorecard.py"))
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)


def event(**overrides):
    result = {
        "prospect_id": "p_0123456789abcdef", "event_id": "e_0123456789abcdef",
        "event_kind": "enquiry", "status": "confirmed",
        "occurred_at": score.timestamp("2026-09-10T12:00:00Z"),
        "updated_at": score.timestamp("2026-09-10T12:00:00Z"),
        "is_test": "false", "is_us": "true", "attribution": "organic_search",
        "landing_page": "/solutions/ai-receptionist",
    }
    result.update(overrides)
    return result


def report(events, **overrides):
    args = {"start": date(2026, 9, 1), "end": date(2026, 9, 30), "as_of": score.timestamp("2026-10-01T12:00:00Z")}
    args.update(overrides)
    return score.scorecard(events, **args)


class LeadScorecardTests(unittest.TestCase):
    def test_duplicate_exports_and_multiple_enquiries_count_one_prospect(self):
        original = event()
        result = report([original, original.copy(), event(event_id="e_1111111111111111")])
        self.assertEqual(result["unique_prospects_by_stage"]["verified_us_organic_search"]["enquiry"], 1)
        self.assertEqual(result["reconciliation"]["distinct_event_records_as_of"], 2)

    def test_booking_reschedule_retains_original_period_and_cancellation_removes_only_booking(self):
        booking = event(event_kind="booking")
        rescheduled = event(event_kind="booking", status="rescheduled", updated_at=score.timestamp("2026-10-01T08:00:00Z"))
        enquiry = event(event_id="e_1111111111111111")
        self.assertEqual(report([booking, rescheduled])["unique_prospects_by_stage"]["verified_us_organic_search"]["booking"], 1)
        cancelled = event(event_kind="booking", status="cancelled", updated_at=score.timestamp("2026-10-01T09:00:00Z"))
        result = report([booking, rescheduled, enquiry, cancelled])
        self.assertEqual(result["unique_prospects_by_stage"]["verified_us_organic_search"], {"enquiry": 1, "booking": 0, "qualified": 0, "opportunity": 0})

    def test_unknown_booking_never_inherits_organic_credit(self):
        result = report([event(), event(event_id="e_1111111111111111", event_kind="booking", attribution="unknown")])
        self.assertEqual(result["unique_prospects_by_stage"]["all_verified_sources"]["booking"], 1)
        self.assertEqual(result["unique_prospects_by_stage"]["verified_us_organic_search"]["booking"], 0)
        self.assertEqual(result["unique_prospects_by_stage"]["unknown_country_or_attribution"]["booking"], 1)

    def test_test_flag_excludes_all_stages_even_if_later_flag_is_cleared(self):
        test = event(is_test="true")
        corrected = event(updated_at=score.timestamp("2026-09-11T12:00:00Z"))
        qualified = event(event_id="e_1111111111111111", event_kind="qualified")
        result = report([test, corrected, qualified])
        self.assertEqual(sum(result["unique_prospects_by_stage"]["all_verified_sources"].values()), 0)
        self.assertEqual(result["reconciliation"]["excluded_test_prospects_in_period"], 1)

    def test_us_and_source_are_both_required(self):
        result = report([event(is_us="unknown"), event(event_id="e_1111111111111111", prospect_id="p_1111111111111111", is_us="false"), event(event_id="e_2222222222222222", prospect_id="p_2222222222222222", attribution="other")])
        self.assertEqual(result["unique_prospects_by_stage"]["all_verified_sources"]["enquiry"], 3)
        self.assertEqual(result["unique_prospects_by_stage"]["verified_us_organic_search"]["enquiry"], 0)

    def test_as_of_replays_only_known_updates(self):
        later = event(status="cancelled", updated_at=score.timestamp("2026-09-20T12:00:00Z"))
        result = report([event(), later], as_of=score.timestamp("2026-09-15T12:00:00Z"))
        self.assertEqual(result["unique_prospects_by_stage"]["verified_us_organic_search"]["enquiry"], 1)

    def test_date_window_uses_property_calendar_not_utc(self):
        near_midnight = event(occurred_at=score.timestamp("2026-10-01T03:00:00Z"), updated_at=score.timestamp("2026-10-01T03:00:00Z"))
        self.assertEqual(report([near_midnight])["unique_prospects_by_stage"]["verified_us_organic_search"]["enquiry"], 1)
        self.assertEqual(report([near_midnight], calendar="UTC")["unique_prospects_by_stage"]["verified_us_organic_search"]["enquiry"], 0)

    def test_conflicting_same_version_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Conflicting versions"):
            report([event(), event(status="cancelled")])

    def test_event_identity_cannot_move_to_another_prospect(self):
        with self.assertRaisesRegex(ValueError, "conflicting prospect"):
            report([event(), event(prospect_id="p_1111111111111111", updated_at=score.timestamp("2026-09-11T12:00:00Z"))])

    def test_original_occurrence_cannot_change_on_reschedule(self):
        with self.assertRaisesRegex(ValueError, "original occurrence"):
            report([event(event_kind="booking"), event(event_kind="booking", occurred_at=score.timestamp("2026-09-12T12:00:00Z"), updated_at=score.timestamp("2026-09-12T12:00:00Z"))])

    def test_output_contains_no_identifiers(self):
        output = json.dumps(report([event()]))
        self.assertNotIn("0123456789abcdef", output)

    def csv_events(self, rows, fields=score.FIELDS):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "events.csv"
            with path.open("w", newline="") as output:
                writer = csv.DictWriter(output, fieldnames=fields)
                writer.writeheader()
                for row in rows:
                    writer.writerow({key: value.isoformat() if hasattr(value, "isoformat") else value for key, value in row.items()})
            return score.read_events(path)

    def test_csv_accepts_valid_opaque_records_and_header_only_template(self):
        self.assertEqual(self.csv_events([event()]), [event()])
        self.assertEqual(self.csv_events([]), [])
        self.assertEqual(report([])["reconciliation"]["input_rows"], 0)

    def test_csv_rejects_pii_columns_without_repeating_values(self):
        with self.assertRaisesRegex(ValueError, "exactly the documented headers") as error:
            self.csv_events([{**event(), "email": "private@example.com"}], fields=(*score.FIELDS, "email"))
        self.assertNotIn("private@example.com", str(error.exception))

    def test_csv_rejects_email_ids_queries_bad_booleans_and_naive_dates(self):
        for changes in [{"prospect_id": "private@example.com"}, {"landing_page": "/?email=private@example.com"}, {"landing_page": "https://quickvoice.co/"}, {"is_test": "no"}, {"occurred_at": "2026-09-10T12:00:00"}, {"status": "rescheduled"}, {"updated_at": "2026-09-09T12:00:00Z"}]:
            with self.subTest(changes=tuple(changes)):
                with self.assertRaises(ValueError) as error:
                    self.csv_events([event(**changes)])
                self.assertNotIn("private@example.com", str(error.exception))

    def test_distinct_stages_are_not_summed_or_inferred(self):
        result = report([event(event_kind="qualified")])
        self.assertEqual(result["unique_prospects_by_stage"]["verified_us_organic_search"], {"enquiry": 0, "booking": 0, "qualified": 1, "opportunity": 0})


if __name__ == "__main__":
    unittest.main()
