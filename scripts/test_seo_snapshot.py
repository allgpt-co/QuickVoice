import importlib.util
from datetime import date, timedelta
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("snapshot", Path(__file__).with_name("seo-snapshot.py"))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SnapshotTests(unittest.TestCase):
    def test_comparison_is_inclusive_equal_length_without_overlap(self):
        windows = snapshot.comparison_windows(date(2026, 9, 3))
        self.assertEqual(windows["current"], {"startDate": "2026-08-07", "endDate": "2026-09-03"})
        self.assertEqual(windows["previous"], {"startDate": "2026-07-10", "endDate": "2026-08-06"})
        for window in windows.values():
            self.assertEqual(date.fromisoformat(window["endDate"]) - date.fromisoformat(window["startDate"]), timedelta(days=27))

    def test_leap_day_and_single_day_windows(self):
        self.assertEqual(snapshot.comparison_windows(date(2024, 3, 1), 1)["previous"]["endDate"], "2024-02-29")
        with self.assertRaises(ValueError):
            snapshot.comparison_windows(date(2026, 9, 3), 0)

    def test_totals_do_not_sum_incomplete_query_rows(self):
        requests = snapshot.report_requests("123", "sc-domain:example.com", "456", snapshot.comparison_windows(date(2026, 9, 3)))
        self.assertEqual(requests["gsc_current_totals"][1]["dimensions"], [])
        self.assertEqual(requests["gsc_current_queries"][1]["dataState"], "final")
        self.assertIn("sc-domain%3Aexample.com", requests["gsc_current_totals"][0])
        self.assertEqual(requests["ga_current_leads"][1]["metrics"], [{"name": "eventCount"}])

    def test_report_errors_remain_errors_instead_of_zero_activity(self):
        with patch.object(snapshot, "request_json", side_effect=RuntimeError("HTTP 403")):
            _, report = snapshot.run_report(("test", ("https://example.com", {})), "private-token")
        self.assertEqual(report["status"], "error")
        self.assertNotIn("response", report)
        self.assertNotIn("private-token", str(report))

    def test_empty_success_remains_a_successful_empty_response(self):
        with patch.object(snapshot, "request_json", return_value={}):
            _, report = snapshot.run_report(("test", ("https://example.com", {})), "private-token")
        self.assertEqual(report["status"], "ok")
        self.assertEqual(report["response"], {})


if __name__ == "__main__":
    unittest.main()
