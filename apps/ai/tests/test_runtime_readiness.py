import os
import sys
import unittest
from pathlib import Path


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from utils.runtime_readiness import (  # noqa: E402
    evaluate_local_runtime_config,
    get_runtime_readiness,
    wait_for_runtime_readiness,
)


class RuntimeConfigTests(unittest.TestCase):
    def test_hosted_mode_requires_server_key_and_durable_queue(self):
        result = evaluate_local_runtime_config(
            {"QUICKVOICE_BILLING_MODE": "hosted"},
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["billingMode"], "hosted")
        for name in ("serverApiUrl", "internalApiKey", "billingUsageQueue"):
            self.assertTrue(result["checks"][name]["required"])
            self.assertEqual(
                result["checks"][name]["status"],
                "not_configured",
            )

    def test_hosted_queue_must_be_absolute_non_temporary_and_writable(self):
        base_env = {
            "QUICKVOICE_BILLING_MODE": "hosted",
            "SERVER_API_URL": "https://api.quickvoice.example/api/v1",
            "INTERNAL_API_KEY": "internal-secret",
        }

        relative = evaluate_local_runtime_config(
            {**base_env, "AI_BILLING_USAGE_QUEUE_DIR": "billing-queue"},
        )
        temporary = evaluate_local_runtime_config(
            {**base_env, "AI_BILLING_USAGE_QUEUE_DIR": "/tmp/billing-queue"},
        )
        unwritable = evaluate_local_runtime_config(
            {
                **base_env,
                "AI_BILLING_USAGE_QUEUE_DIR": "/var/lib/quickvoice/billing-queue",
            },
            queue_probe=lambda _path: "AI_BILLING_USAGE_QUEUE_DIR is not writable",
        )

        self.assertEqual(
            relative["checks"]["billingUsageQueue"]["status"], "error"
        )
        self.assertEqual(
            temporary["checks"]["billingUsageQueue"]["status"], "error"
        )
        self.assertEqual(
            unwritable["checks"]["billingUsageQueue"]["status"], "error"
        )


class RuntimeHandshakeTests(unittest.IsolatedAsyncioTestCase):
    async def test_matching_hosted_modes_are_ready(self):
        requests = []

        async def get_json(url, headers, timeout):
            requests.append((url, headers, timeout))
            return {
                "success": True,
                "data": {
                    "service": "server",
                    "runtimeProtocolVersion": 1,
                    "billingMode": "hosted",
                },
            }

        result = await get_runtime_readiness(
            {
                "QUICKVOICE_BILLING_MODE": "hosted",
                "SERVER_API_URL": "https://api.quickvoice.example/api/v1",
                "INTERNAL_API_KEY": "internal-secret",
                "AI_BILLING_USAGE_QUEUE_DIR": "/var/lib/quickvoice/billing-queue",
            },
            get_json=get_json,
            queue_probe=lambda path: (
                None
                if path == Path("/var/lib/quickvoice/billing-queue")
                else "unexpected path"
            ),
        )

        self.assertTrue(result["ok"])
        self.assertEqual(
            result["checks"]["serverBillingMode"]["status"], "ok"
        )
        self.assertEqual(
            requests[0][0],
            "https://api.quickvoice.example/api/v1/system/runtime-mode",
        )
        self.assertEqual(
            requests[0][1]["Authorization"], "Bearer internal-secret"
        )

    async def test_self_hosted_ai_rejects_a_hosted_server(self):
        async def get_json(_url, _headers, _timeout):
            return {
                "data": {
                    "runtimeProtocolVersion": 1,
                    "billingMode": "hosted",
                }
            }

        result = await get_runtime_readiness(
            {
                "QUICKVOICE_BILLING_MODE": "self_hosted",
                "SERVER_API_URL": "https://api.quickvoice.example/api/v1",
                "INTERNAL_API_KEY": "internal-secret",
            },
            get_json=get_json,
        )

        self.assertFalse(result["ok"])
        self.assertEqual(
            result["checks"]["serverBillingMode"]["status"], "error"
        )
        self.assertIn(
            "mismatch",
            result["checks"]["serverBillingMode"]["message"],
        )

    async def test_startup_handshake_retries_a_bounded_number_of_times(self):
        calls = 0
        sleeps = []

        async def readiness_getter():
            nonlocal calls
            calls += 1
            return {
                "ok": calls == 3,
                "billingMode": "hosted",
                "checks": {
                    "serverBillingMode": {
                        "status": "ok" if calls == 3 else "error",
                        "required": True,
                    }
                },
            }

        async def sleep(delay):
            sleeps.append(delay)

        result = await wait_for_runtime_readiness(
            attempts=3,
            backoff_seconds=0.25,
            readiness_getter=readiness_getter,
            sleep=sleep,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(calls, 3)
        self.assertEqual(sleeps, [0.25, 0.5])


if __name__ == "__main__":
    unittest.main()
