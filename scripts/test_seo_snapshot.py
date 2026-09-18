import importlib.util
from datetime import date, timedelta
from pathlib import Path
import tempfile
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

    def test_freshness_uses_incomplete_boundary_and_final_rows(self):
        end, method = snapshot.complete_gsc_end(
            {"metadata": {"firstIncompleteDate": "2026-09-15"}},
            {"rows": [{"keys": ["2026-09-14"]}]}, date(2026, 9, 16))
        self.assertEqual(end, date(2026, 9, 14))
        self.assertIn("firstIncompleteDate", method)

    def test_freshness_without_metadata_is_conservative_and_empty_fails(self):
        end, method = snapshot.complete_gsc_end({}, {"rows": [{"keys": ["2026-09-12"]}]}, date(2026, 9, 16))
        self.assertEqual(end, date(2026, 9, 12))
        self.assertIn("conservative", method)
        with self.assertRaisesRegex(RuntimeError, "No final GSC dates"):
            snapshot.complete_gsc_end({}, {}, date(2026, 9, 16))

    def test_alignment_respects_ga_buffer_and_rejects_incomplete_explicit_end(self):
        self.assertEqual(snapshot.select_end(date(2026, 9, 15), None, date(2026, 9, 16)), date(2026, 9, 14))
        with self.assertRaisesRegex(RuntimeError, "exceeds"):
            snapshot.select_end(date(2026, 9, 14), date(2026, 9, 15), date(2026, 9, 16))
        self.assertEqual(snapshot.select_end(date(2026, 9, 14), date(2026, 9, 10), date(2026, 9, 16)), date(2026, 9, 10))

    def test_us_cohorts_share_brand_regex_and_do_not_filter_total_queries(self):
        requests = snapshot.report_requests("123", "sc-domain:example.com", "456", snapshot.comparison_windows(date(2026, 9, 14)))
        total_filters = requests["gsc_current_us_totals"][1]["dimensionFilterGroups"][0]["filters"]
        self.assertEqual(total_filters, [{"dimension": "country", "operator": "equals", "expression": "usa"}])
        for cohort, operator in (("brand", "includingRegex"), ("nonbrand", "excludingRegex")):
            query_filter = requests[f"gsc_current_us_{cohort}_totals"][1]["dimensionFilterGroups"][0]["filters"][1]
            self.assertEqual(query_filter, {"dimension": "query", "operator": operator, "expression": snapshot.BRAND_REGEX})
        self.assertEqual(requests["gsc_current_us_query_pages"][1]["dimensions"], ["query", "page"])

    def test_ga_organic_country_host_filters_and_separate_events(self):
        requests = snapshot.report_requests("123", "sc-domain:example.com", "456", snapshot.comparison_windows(date(2026, 9, 14)))
        report = requests["ga_current_us_organic_landing_pages"][1]
        filters = report["dimensionFilter"]["andGroup"]["expressions"]
        self.assertEqual([f["filter"]["fieldName"] for f in filters], ["country", "hostName", "sessionDefaultChannelGroup"])
        self.assertEqual(filters[2]["filter"]["stringFilter"]["value"], "Organic Search")
        events = requests["ga_current_us_organic_events"][1]
        self.assertEqual(events["dimensions"], [{"name": "eventName"}])
        self.assertEqual(events["metrics"], [{"name": "eventCount"}])

    def test_cluster_position_is_impression_weighted_and_assignment_unique(self):
        rows = [{"keys": ["ai appointment scheduling"], "clicks": 0, "impressions": 90, "position": 20},
                {"keys": ["ai booking assistant"], "clicks": 1, "impressions": 10, "position": 10},
                {"keys": ["vapi appointment alternative"], "clicks": 0, "impressions": 5, "position": 30}]
        groups = snapshot.cluster_queries(rows)
        self.assertEqual(groups["Appointment scheduling"]["position"], 19)
        self.assertEqual(groups["Appointment scheduling"]["impressions"], 100)
        self.assertEqual(groups["Alternatives and comparisons"]["queries"], 1)
        self.assertEqual(sum(g["impressions"] for g in groups.values()), 105)

    def test_private_files_are_exclusive_and_owner_only(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "raw.json"
            snapshot.write_private(path, "{}\n")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                snapshot.write_private(path, "replacement")
            self.assertEqual(path.read_text(), "{}\n")

    def test_grouped_row_limit_is_flagged_and_api_metadata_preserved(self):
        response = {"rows": [{}, {}], "rowCount": 3, "metadata": {"subjectToThresholding": True}}
        with patch.object(snapshot, "request_json", return_value=response):
            _, report = snapshot.run_report(("test", ("https://example.com", {"limit": 2})), "secret")
        self.assertTrue(report["row_limit_reached"])
        self.assertEqual(report["response"]["metadata"], {"subjectToThresholding": True})

    def test_summary_marks_failures_unknown_and_has_query_coverage_caveat(self):
        result = {"observed_at": "2026-09-16", "freshness": {"gsc_final_end": "2026-09-14", "aligned_end": "2026-09-14"},
                  "windows": snapshot.comparison_windows(date(2026, 9, 14)), "reports": {}}
        summary = snapshot.markdown_summary(result)
        self.assertIn("ERROR", summary)
        self.assertIn("zero reported nonbrand clicks does not mean zero total nonbrand clicks", summary)
        self.assertIn("2026-08-18 through 2026-09-14 (28 days)", summary)
        self.assertIn("not valid growth comparisons", summary)

    def test_summary_does_not_label_pre_creation_window_zero_traffic(self):
        result = {"observed_at": "2026-09-16", "freshness": {"gsc_final_end": "2026-09-14", "aligned_end": "2026-09-14"},
                  "windows": {"previous90": {"startDate": "2026-03-19", "endDate": "2026-06-16"}},
                  "reports": {"ga_property": {"status": "ok", "response": {"createTime": "2026-07-02T11:05:13Z"}},
                              "ga_key_events": {"status": "ok", "response": {"keyEvents": []}},
                              "ga_previous90_us_organic_totals": {"status": "ok", "response": {}}}}
        summary = snapshot.markdown_summary(result)
        self.assertIn("entire window predates GA property creation", summary)
        self.assertNotIn("Sessions: 0", summary)
        self.assertIn("not registered as a GA key event", summary)


if __name__ == "__main__":
    unittest.main()
