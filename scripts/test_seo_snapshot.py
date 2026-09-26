import importlib.util
from datetime import date, timedelta
from pathlib import Path
import re
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

    def property_requests(self):
        return snapshot.report_requests("543950329", "sc-domain:quickvoice.co", "15188028920", snapshot.comparison_windows(date(2026, 9, 23)))

    def test_property_page_cohort_matches_only_seven_exact_canonical_urls(self):
        self.assertEqual(len(snapshot.PROPERTY_MANAGEMENT_PATHS), 7)
        pattern = re.compile(snapshot.PROPERTY_MANAGEMENT_PAGE_REGEX)
        for url in snapshot.PROPERTY_MANAGEMENT_URLS:
            self.assertIsNotNone(pattern.fullmatch(url))
        for url in ["https://quickvoice.co/industries", "https://quickvoice.co/blog/property-management", "https://quickvoice.co/blog/ai-voice-agents-property-management-extra", "https://www.quickvoice.co/industries/real-estate", "https://quickvoice.co/industries/real-estate?test=1", "https://quickvoice.co/industries/real-estate/", "https://evil.test/industries/real-estate"]:
            self.assertIsNone(pattern.fullmatch(url))

    def test_property_gsc_page_totals_do_not_silently_exclude_anonymous_queries(self):
        requests = self.property_requests()
        total = requests["gsc_current_us_property_management_totals"][1]
        filters = total["dimensionFilterGroups"][0]["filters"]
        self.assertEqual(total["dimensions"], [])
        self.assertEqual([item["dimension"] for item in filters], ["country", "page"])
        self.assertEqual(filters[0]["expression"], "usa")
        self.assertEqual(filters[1]["expression"], snapshot.PROPERTY_MANAGEMENT_PAGE_REGEX)
        nonbrand = requests["gsc_current_us_property_management_nonbrand_totals"][1]
        self.assertEqual(nonbrand["dimensionFilterGroups"][0]["filters"][-1], {"dimension": "query", "operator": "excludingRegex", "expression": snapshot.BRAND_REGEX})
        self.assertEqual(requests["gsc_current_us_property_management_nonbrand_query_pages"][1]["dimensions"], ["query", "page"])
        self.assertEqual(len(filters), 2)  # Building the subset did not mutate the total.

    def test_property_ga_is_a_us_organic_landing_session_cohort_not_event_page_filter(self):
        requests = self.property_requests()
        sessions = requests["ga_current_us_organic_property_management_totals"][1]
        events = requests["ga_current_us_organic_property_management_events"][1]
        self.assertEqual(sessions["dimensionFilter"], events["dimensionFilter"])
        filters = sessions["dimensionFilter"]["andGroup"]["expressions"]
        self.assertEqual([item["filter"]["fieldName"] for item in filters], ["country", "hostName", "sessionDefaultChannelGroup", "landingPage"])
        self.assertEqual(filters[-1]["filter"]["inListFilter"]["values"], list(snapshot.PROPERTY_MANAGEMENT_PATHS))
        self.assertEqual(events["dimensions"], [{"name": "eventName"}])
        self.assertEqual(events["metrics"], [{"name": "eventCount"}])
        self.assertEqual(sessions["dimensions"], [])

    def test_property_inspections_are_read_only_once_per_url_not_per_period(self):
        requests = self.property_requests()
        inspections = [item for name, item in requests.items() if name.startswith("gsc_property_management_inspection_")]
        self.assertEqual(len(inspections), 7)
        self.assertEqual({body["inspectionUrl"] for _, body in inspections}, set(snapshot.PROPERTY_MANAGEMENT_URLS))
        for url, body in inspections:
            self.assertEqual(url, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect")
            self.assertEqual(body["siteUrl"], "sc-domain:quickvoice.co")
        self.assertTrue(all("publish" not in url and "submit" not in url for url, _ in requests.values()))

    def test_quickvoice_cohort_is_not_accidentally_applied_to_another_site_or_property(self):
        for property_id, site in [("123", "sc-domain:quickvoice.co"), ("543950329", "sc-domain:example.com")]:
            requests = snapshot.report_requests(property_id, site, "456", snapshot.comparison_windows(date(2026, 9, 23)))
            self.assertFalse(any("property_management" in name for name in requests))

    def test_property_summary_keeps_failed_queries_sessions_events_unknown(self):
        reports = {"gsc_current_us_property_management_totals": {"status": "error", "error": "HTTP 403"}}
        result = "\n".join(snapshot.property_management_summary(reports, "current"))
        self.assertIn("ERROR", result)
        self.assertIn("sessions unavailable; not zero", result)
        self.assertIn("events unavailable; not zero", result)
        self.assertNotIn("sessions landing on cohort pages: 0", result)

    def test_property_summary_exposes_unknown_query_identity_without_claiming_nonbrand(self):
        reports = {
            "gsc_current_us_property_management_totals": {"status": "ok", "response": {"rows": [{"clicks": 5, "impressions": 100, "ctr": .05, "position": 10}]}},
            "gsc_current_us_property_management_queries": {"status": "ok", "response": {"rows": [{"keys": ["property management"], "clicks": 1, "impressions": 20}]}},
            "gsc_current_us_property_management_nonbrand_totals": {"status": "ok", "response": {}},
            "ga_current_us_organic_property_management_totals": {"status": "ok", "response": {}},
            "ga_current_us_organic_property_management_events": {"status": "ok", "response": {}, "row_limit_reached": True},
        }
        result = "\n".join(snapshot.property_management_summary(reports, "current"))
        self.assertIn("1 of 5 cohort clicks", result)
        self.assertIn("remainder is not classified as nonbrand", result)
        self.assertIn("unknown (row limit)", result)
        self.assertIn("not independently verified sales outcomes", result)
        pre_creation = "\n".join(snapshot.property_management_summary(reports, "current", before_creation=True))
        self.assertIn("predates property creation", pre_creation)
        self.assertNotIn("sessions landing on cohort pages: 0", pre_creation)

    def test_index_inspection_failure_or_empty_snapshot_does_not_claim_indexing(self):
        reports = {
            "gsc_property_management_inspection_1": {"status": "error", "request": {"inspectionUrl": snapshot.PROPERTY_MANAGEMENT_URLS[0]}},
            "gsc_property_management_inspection_2": {"status": "ok", "request": {"inspectionUrl": snapshot.PROPERTY_MANAGEMENT_URLS[1]}, "response": {}},
        }
        result = "\n".join(snapshot.inspection_summary(reports))
        self.assertIn("ERROR; index state unknown", result)
        self.assertIn('"lastCrawlTime": "not returned"', result)
        self.assertIn("not a live test or an indexing request", result)

    def test_property_query_cluster_is_not_a_page_membership_filter(self):
        rows = [{"keys": ["property management answering service"], "clicks": 1, "impressions": 5, "position": 11},
                {"keys": ["retell property management"], "clicks": 0, "impressions": 2, "position": 14}]
        result = snapshot.cluster_queries(rows)
        self.assertEqual(result["Property management"]["clicks"], 1)
        self.assertEqual(result["Alternatives and comparisons"]["impressions"], 2)

    def test_inspection_http_error_is_sanitized_and_never_treated_as_an_empty_success(self):
        error = snapshot.urllib.error.HTTPError("https://searchconsole.googleapis.com/?secret=private-token", 403, "private-token", {}, None)
        with patch.object(snapshot.urllib.request, "urlopen", side_effect=error):
            _, report = snapshot.run_report(("inspection", ("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {"inspectionUrl": snapshot.PROPERTY_MANAGEMENT_URLS[0]})), "private-token")
        self.assertEqual(report["status"], "error")
        self.assertNotIn("private-token", str(report))
        self.assertNotIn("response", report)


if __name__ == "__main__":
    unittest.main()
