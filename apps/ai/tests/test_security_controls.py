import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from utils.auth import is_explicit_dev_mode, verify_internal_headers
from utils.logger import redact_sensitive


class SecurityControlsTests(unittest.TestCase):
    def test_internal_auth_fails_closed_when_key_is_missing_outside_dev(self):
        with self.assertRaisesRegex(RuntimeError, "INTERNAL_API_KEY"):
            verify_internal_headers({}, internal_api_key="", allow_dev=False)

    def test_internal_auth_requires_matching_header(self):
        with self.assertRaises(PermissionError):
            verify_internal_headers({"x-internal-key": "wrong"}, internal_api_key="secret")

        verify_internal_headers({"x-internal-key": "secret"}, internal_api_key="secret")

    def test_explicit_dev_mode_requires_named_opt_in(self):
        self.assertFalse(is_explicit_dev_mode({}))
        self.assertFalse(is_explicit_dev_mode({"AI_ENV": "development"}))
        self.assertTrue(is_explicit_dev_mode({"AI_ALLOW_INSECURE_DEV_MODE": "true"}))

    def test_log_phone_masking_handles_supported_formats(self):
        for phone in (
            "1-800-555-0199", "8005550199", "18005550199", "+18005550199",
            "44 20 7946 0958", "0044 20 7946 0958", "(800) 555-0199",
            "800.555.0199", "020 7946 0958", "919876543210",
        ):
            with self.subTest(phone=phone):
                self.assertEqual(redact_sensitive(f"Call {phone} today"), "Call [REDACTED_PHONE] today")
        self.assertEqual(redact_sensitive("Call 1-800-555-0199."), "Call [REDACTED_PHONE].")
        self.assertEqual(
            redact_sensitive({"phoneNumber": 8005550199, "toNumber": "5550199"}),
            {"phoneNumber": "[REDACTED_PHONE]", "toNumber": "[REDACTED_PHONE]"},
        )

    def test_log_masking_preserves_labelled_ids_dates_and_coordinates(self):
        identifiers = {
            "sku": "800-555-0199", "mrn": "12345678901", "orderId": "12345678901",
            "isbn": "978-1-4028-9462-6", "date": "2026-10-01",
            "coordinates": "+40.71281234, -74.00601234",
            "latitude": "40.71281234", "longitude": "-74.00601234",
        }
        self.assertEqual(redact_sensitive(identifiers), identifiers)
        for text in (
            "SKU: 800-555-0199", "MRN: 12345678901", "ISBN: 978-1-4028-9462-6",
            "SKU-800-555-0199", "abc12345678901xyz", "12345678901234567890",
            "2026-10-01", "+40.71281234, -74.00601234",
        ):
            with self.subTest(text=text):
                self.assertEqual(redact_sensitive(text), text)
        self.assertEqual(
            redact_sensitive("SKU: 12345678901; call 1-800-555-0199"),
            "SKU: 12345678901; call [REDACTED_PHONE]",
        )
        self.assertEqual(
            redact_sensitive("Call 8005550199\nCall 18005550199"),
            "Call [REDACTED_PHONE]\nCall [REDACTED_PHONE]",
        )

    def test_redact_sensitive_masks_pii_prompts_headers_and_webhook_urls(self):
        redacted = redact_sensitive(
            {
                "from_number": "+15550001111",
                "toNumber": "+15551230000",
                "system_prompt": "You are collecting SSNs.",
                "Authorization": "Bearer internal-secret",
                "post_call_webhook": {"webhook_url": "https://hooks.example.test/secret"},
                "transcripts": [{"message": "My SSN is 123-45-6789"}],
            }
        )

        serialized = str(redacted)
        self.assertNotIn("+15550001111", serialized)
        self.assertNotIn("internal-secret", serialized)
        self.assertNotIn("collecting SSNs", serialized)
        self.assertNotIn("hooks.example.test/secret", serialized)
        self.assertNotIn("123-45-6789", serialized)


if __name__ == "__main__":
    unittest.main()
