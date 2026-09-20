import copy
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location("measurement_setup", Path(__file__).with_name("seo-measurement-setup.py"))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


def state(complete=False):
    result = {"property": {"name": "properties/123"}, "keyEvents": [], "customDimensions": []}
    if complete:
        result["keyEvents"] = [{"eventName": "generate_lead", "countingMethod": "ONCE_PER_EVENT"}]
        result["customDimensions"] = [{"parameterName": name, "scope": "EVENT"} for name, _ in setup.DIMENSIONS]
    return result


class MeasurementSetupTests(unittest.TestCase):
    def test_missing_registration_plan_is_minimal(self):
        plan = setup.registration_plan(state())
        self.assertEqual([item["identity"] for item in plan], ["generate_lead", "cta_type", "link_location", "form_location"])
        self.assertTrue(all(item["action"] == "create" for item in plan))
        self.assertEqual(plan[0]["body"]["countingMethod"], "ONCE_PER_EVENT")
        self.assertNotIn("defaultValue", plan[0]["body"])

    def test_existing_registrations_are_never_changed(self):
        current = state(True)
        current["keyEvents"][0]["countingMethod"] = "ONCE_PER_SESSION"
        original = copy.deepcopy(current)
        plan = setup.registration_plan(current)
        self.assertTrue(all(item["action"] == "existing" for item in plan))
        self.assertEqual(plan[0]["existing"]["countingMethod"], "ONCE_PER_SESSION")
        self.assertEqual(current, original)

    def test_existing_wrong_counting_or_default_value_blocks_even_apply_without_mutation(self):
        for field, value in [("countingMethod", "ONCE_PER_SESSION"),
                             ("defaultValue", {"numericValue": 1, "currencyCode": "USD"}),
                             ("defaultValue", {"numericValue": 0, "currencyCode": "USD"})]:
            for apply in [False, True]:
                with self.subTest(field=field, value=value, apply=apply):
                    current = state(True)
                    current["keyEvents"][0][field] = value
                    # Even another missing registration must not trigger a partial write.
                    current["customDimensions"].pop()
                    with patch.object(setup, "token_scopes", return_value={setup.EDIT_SCOPE}), patch.object(setup, "inspect", return_value=current), patch.object(setup, "request_json") as request:
                        result = setup.configure("123", "secret", apply=apply)
                    self.assertEqual(result["status"], "configuration_mismatch")
                    self.assertEqual(result["configuration_issues"][0]["field"], field)
                    self.assertEqual(result["create_responses_received"], [])
                    request.assert_not_called()

    def test_readback_rejects_unintended_default_value_after_creation(self):
        saved = state(True)
        saved["keyEvents"][0]["defaultValue"] = {"numericValue": 1, "currencyCode": "USD"}
        def created(url, **kwargs):
            return {"name": url.removeprefix(setup.ADMIN + "/") + "/456"}
        with patch.object(setup, "token_scopes", return_value={setup.EDIT_SCOPE}), patch.object(setup, "inspect", side_effect=[state(), saved]), patch.object(setup, "request_json", side_effect=created) as request:
            result = setup.configure("123", "secret", apply=True)
        self.assertEqual(result["status"], "configuration_mismatch")
        self.assertEqual(request.call_count, 4)

    def test_check_returns_nonzero_for_existing_configuration_mismatch(self):
        with patch("sys.argv", ["seo-measurement-setup.py", "--check"]), patch.object(setup, "access_token", return_value="secret"), patch.object(setup, "configure", return_value={"status": "configuration_mismatch"}), patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(setup.main(), 2)

    def test_user_scoped_dimension_does_not_satisfy_event_scope(self):
        current = state(True)
        current["customDimensions"][0]["scope"] = "USER"
        self.assertEqual(setup.registration_plan(current)[1]["action"], "create")

    def test_dry_run_never_posts_even_with_edit_scope(self):
        with patch.object(setup, "token_scopes", return_value={setup.EDIT_SCOPE}), patch.object(setup, "inspect", return_value=state()), patch.object(setup, "request_json") as request:
            result = setup.configure("123", "secret")
        self.assertEqual(result["status"], "changes_pending")
        request.assert_not_called()

    def test_apply_is_blocked_before_mutation_without_scope(self):
        with patch.object(setup, "token_scopes", return_value={"https://www.googleapis.com/auth/analytics.readonly"}), patch.object(setup, "inspect", return_value=state()), patch.object(setup, "request_json") as request:
            result = setup.configure("123", "secret", apply=True)
        self.assertEqual(result["status"], "blocked_missing_edit_scope")
        self.assertEqual(result["create_responses_received"], [])
        self.assertNotIn("secret", str(result))
        request.assert_not_called()

    def test_apply_noop_does_not_require_edit_scope(self):
        with patch.object(setup, "token_scopes", return_value=set()), patch.object(setup, "inspect", return_value=state(True)), patch.object(setup, "request_json") as request:
            result = setup.configure("123", "secret", apply=True)
        self.assertEqual(result["status"], "already_configured")
        request.assert_not_called()

    def test_apply_requires_read_after_write_verification(self):
        def created(url, **kwargs):
            return {"name": url.removeprefix(setup.ADMIN + "/") + "/456"}
        with patch.object(setup, "token_scopes", return_value={setup.EDIT_SCOPE}), patch.object(setup, "inspect", side_effect=[state(), state(True)]) as inspect, patch.object(setup, "request_json", side_effect=created) as request:
            result = setup.configure("123", "secret", apply=True)
        self.assertEqual(result["status"], "verified_configured")
        self.assertEqual(len(result["create_responses_received"]), 4)
        self.assertEqual(request.call_count, 4)
        self.assertEqual(inspect.call_count, 2)

    def test_permission_failure_and_partial_apply_do_not_claim_success(self):
        with patch.object(setup, "token_scopes", return_value={setup.EDIT_SCOPE}), patch.object(setup, "inspect", return_value=state()), patch.object(setup, "request_json", side_effect=[{"name": "properties/123/keyEvents/456"}, RuntimeError("Google API returned HTTP 403")]) as request:
            result = setup.configure("123", "secret", apply=True)
        self.assertEqual(result["status"], "apply_incomplete")
        self.assertEqual(result["create_responses_received"], ["generate_lead"])
        self.assertEqual(result["failed_operation"], "cta_type")
        self.assertEqual(request.call_count, 2)

    def test_unverified_registration_is_not_success(self):
        def created(url, **kwargs):
            return {"name": url.removeprefix(setup.ADMIN + "/") + "/456"}
        with patch.object(setup, "token_scopes", return_value={setup.EDIT_SCOPE}), patch.object(setup, "inspect", return_value=state()), patch.object(setup, "request_json", side_effect=created):
            result = setup.configure("123", "secret", apply=True)
        self.assertEqual(result["status"], "verification_pending")

    def test_pagination_reads_all_resources(self):
        with patch.object(setup, "request_json", side_effect=[{"keyEvents": [{"eventName": "purchase"}], "nextPageToken": "next"}, {"keyEvents": [{"eventName": "generate_lead"}]}]) as request:
            rows = setup.list_resources("https://example.com/keyEvents", "keyEvents", "secret")
        self.assertEqual(len(rows), 2)
        self.assertIn("pageToken=next", request.call_args.args[0])

    def test_invalid_pagination_fails_closed(self):
        with patch.object(setup, "request_json", return_value={"nextPageToken": "loop"}):
            with self.assertRaisesRegex(RuntimeError, "pagination"):
                setup.list_resources("https://example.com/keyEvents", "keyEvents", "secret")

    def test_google_error_messages_cannot_leak_credentials(self):
        error = urllib.error.HTTPError("https://example.com/?access_token=very-secret", 403, "very-secret", {}, io.BytesIO(b"very-secret"))
        with patch.object(setup.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "^Google API returned HTTP 403$"):
                setup.request_json("https://example.com/?access_token=very-secret")

    def test_refresh_does_not_request_new_scopes(self):
        env = {"GOOGLE_CLIENT_ID": "client", "GOOGLE_CLIENT_SECRET": "secret", "GOOGLE_REFRESH_TOKEN": "refresh"}
        with patch.dict(setup.os.environ, env, clear=True), patch.object(setup, "request_json", return_value={"access_token": "access"}) as request:
            self.assertEqual(setup.access_token(), "access")
        self.assertEqual(set(request.call_args.args[1]), {"client_id", "client_secret", "refresh_token", "grant_type"})

    def test_explicit_admin_token_is_not_shadowed_by_reporting_refresh_grant(self):
        env = {"GA_ADMIN_ACCESS_TOKEN": "admin", "GOOGLE_CLIENT_ID": "client", "GOOGLE_CLIENT_SECRET": "secret", "GOOGLE_REFRESH_TOKEN": "readonly"}
        with patch.dict(setup.os.environ, env, clear=True), patch.object(setup, "request_json") as request:
            self.assertEqual(setup.access_token(), "admin")
        request.assert_not_called()

    def test_pageview_dry_run_and_missing_scope_never_patch(self):
        stream = {"name": "properties/123/dataStreams/456", "webStreamData": {"measurementId": "G-SZFBG11VRP"}}
        for apply in [False, True]:
            with patch.object(setup, "request_json", side_effect=[stream, {"streamEnabled": True, "pageChangesEnabled": True}]) as request, patch.object(setup, "token_scopes", return_value=set()):
                result = setup.configure_pageviews("123", "456", "secret", "manual", apply)
            self.assertEqual(request.call_count, 2)
            self.assertEqual(result["status"], "blocked_missing_edit_scope" if apply else "changes_pending")

    def test_pageview_patch_is_narrow_and_requires_readback(self):
        stream = {"name": "properties/123/dataStreams/456", "webStreamData": {"measurementId": "G-SZFBG11VRP"}}
        for verified in [True, False]:
            responses = [stream, {"streamEnabled": True, "pageChangesEnabled": True}, {}, {"streamEnabled": True, "pageChangesEnabled": not verified}]
            with patch.object(setup, "request_json", side_effect=responses) as request, patch.object(setup, "token_scopes", return_value={setup.EDIT_SCOPE}):
                result = setup.configure_pageviews("123", "456", "secret", "manual", True)
            mutation = request.call_args_list[2]
            self.assertTrue(mutation.args[0].endswith("?updateMask=page_changes_enabled"))
            self.assertEqual(mutation.kwargs["body"], {"pageChangesEnabled": False})
            self.assertEqual(mutation.kwargs["method"], "PATCH")
            self.assertEqual(result["status"], "verified_configured" if verified else "verification_pending")

    def test_pageview_wrong_destination_fails_without_mutation(self):
        with patch.object(setup, "request_json", return_value={"name": "properties/123/dataStreams/456", "webStreamData": {"measurementId": "G-OTHER"}}) as request:
            with self.assertRaisesRegex(RuntimeError, "destination"):
                setup.configure_pageviews("123", "456", "secret", "manual", True)
        self.assertEqual(request.call_count, 1)

    def test_pageview_uncertain_patch_is_not_repeated(self):
        stream = {"name": "properties/123/dataStreams/456", "webStreamData": {"measurementId": "G-SZFBG11VRP"}}
        with patch.object(setup, "request_json", side_effect=[stream, {"streamEnabled": True, "pageChangesEnabled": True}, RuntimeError("Google API request failed")]) as request, patch.object(setup, "token_scopes", return_value={setup.EDIT_SCOPE}):
            result = setup.configure_pageviews("123", "456", "secret", "manual", True)
        self.assertEqual(result["status"], "apply_incomplete")
        self.assertEqual(request.call_count, 3)


if __name__ == "__main__":
    unittest.main()
