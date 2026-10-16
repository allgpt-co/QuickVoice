import asyncio
import os
import sys
import unittest
import warnings
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

try:
    warnings.filterwarnings(
        "ignore",
        message="Using `httpx` with `starlette.testclient` is deprecated.*",
    )
    from fastapi.testclient import TestClient  # type: ignore
except Exception:
    TestClient = None


class FakeRedis:
    def __init__(self):
        self.values = {}

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, ex=None):
        self.values[key] = value
        return True


@unittest.skipIf(TestClient is None, "fastapi test client is not installed")
class ApiTests(unittest.TestCase):
    def test_non_health_routes_require_internal_auth(self):
        import api

        with patch.dict(
            os.environ,
            {
                "INTERNAL_API_KEY": "internal-secret",
                "QUICKVOICE_BILLING_MODE": "self_hosted",
            },
            clear=True,
        ):
            with TestClient(api.app) as client:
                self.assertEqual(client.get("/health").status_code, 200)
                self.assertEqual(client.get("/agents/agent_123/config").status_code, 401)

    def test_health_is_cheap_and_does_not_disclose_runtime_configuration(self):
        import api

        with patch.dict(
            os.environ,
            {"QUICKVOICE_BILLING_MODE": "hosted"},
            clear=True,
        ), patch.object(
            api,
            "get_runtime_readiness",
            new=AsyncMock(side_effect=AssertionError("health ran readiness checks")),
        ):
            with TestClient(api.app) as client:
                response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "service": "ai"})

    def test_detailed_readiness_requires_authentication(self):
        import api

        with patch.dict(
            os.environ,
            {
                "INTERNAL_API_KEY": "internal-secret",
                "QUICKVOICE_BILLING_MODE": "hosted",
            },
            clear=True,
        ):
            with TestClient(api.app) as client:
                unauthorized = client.get("/ready")
                response = client.get(
                    "/ready",
                    headers={"x-internal-key": "internal-secret"},
                )

        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertFalse(body["ok"])
        self.assertEqual(body["billingMode"], "hosted")
        self.assertEqual(
            body["checks"]["serverApiUrl"]["status"],
            "not_configured",
        )
        self.assertEqual(
            body["checks"]["internalApiKey"]["status"],
            "ok",
        )
        self.assertEqual(
            body["checks"]["billingUsageQueue"]["status"],
            "not_configured",
        )
        self.assertEqual(
            body["checks"]["callLogQueue"]["status"],
            "not_configured",
        )

    def test_voice_catalog_requires_internal_auth(self):
        import api

        with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}, clear=False):
            with TestClient(api.app) as client:
                response = client.get("/voice/catalog")

        self.assertEqual(response.status_code, 401)

    def test_voice_catalog_returns_options_with_internal_auth(self):
        import api

        with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}, clear=False):
            with TestClient(api.app) as client:
                response = client.get(
                    "/voice/catalog",
                    headers={"x-internal-key": "internal-secret"},
                )

        self.assertEqual(response.status_code, 200)
        self.assertIn("stt_models", response.json())

    def test_voice_config_resolve_returns_resolved_config(self):
        import api

        with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}, clear=False):
            with TestClient(api.app) as client:
                response = client.post(
                    "/voice/config/resolve",
                    headers={"x-internal-key": "internal-secret"},
                    json={"language": "hi", "tts": {"provider": "elevenlabs", "model": "eleven_flash_v2_5", "voice": "EXAVITQu4vr4xnSDxMaL"}},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["config"]["language"], "hi")
        self.assertEqual(response.json()["config"]["tts"]["provider"], "elevenlabs")

    def test_voice_sample_requires_internal_auth_and_fixed_content(self):
        import api
        payload = {"language": "hi", "ttsModel": "elevenlabs/eleven_flash_v2_5", "voiceId": "UgBBYS2sOqTuMpoF3BR0"}
        sample = {"audioBase64": "test", "contentType": "audio/wav", "sampleText": "नमस्ते!"}
        with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}), patch.object(
            api, "synthesize_voice_sample", new=AsyncMock(return_value=sample),
        ) as synthesize:
            with TestClient(api.app) as client:
                self.assertEqual(client.post("/voice/sample", json=payload).status_code, 401)
                headers = {"x-internal-key": "internal-secret"}
                self.assertEqual(client.post("/voice/sample", json={**payload, "text": "arbitrary"}, headers=headers).status_code, 422)
                response = client.post("/voice/sample", json=payload, headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), sample)
            self.assertEqual(synthesize.await_count, 1)
            self.assertEqual(synthesize.call_args.args[0], payload)

    def test_voice_sample_disconnect_cancels_generation(self):
        import api

        async def exercise_disconnect():
            started, closed = asyncio.Event(), asyncio.Event()

            async def synthesize(*_args):
                started.set()
                try:
                    await asyncio.sleep(30)
                finally:
                    closed.set()

            async def receive():
                await started.wait()
                return {"type": "http.disconnect"}

            request = SimpleNamespace(headers={"x-internal-key": "internal-secret"}, receive=receive)
            payload = api.VoiceSampleRequest(language="hi", ttsModel="elevenlabs/eleven_flash_v2_5", voiceId="UgBBYS2sOqTuMpoF3BR0")
            with patch.object(api, "synthesize_voice_sample", new=synthesize):
                with self.assertRaises(api.HTTPException) as caught:
                    await asyncio.wait_for(api.create_voice_sample(payload, request), timeout=1)
            self.assertEqual(caught.exception.status_code, 499)
            self.assertTrue(closed.is_set())

        with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}):
            asyncio.run(exercise_disconnect())

    def test_kb_process_returns_accepted_job_and_status_exposes_results(self):
        import api

        async def fake_process_documents(_payload, progress=None, should_cancel=None):
            if progress:
                await progress({"kbId": "kb_ok", "status": "running", "stage": "extracting"})
            return [
                {"kbId": "kb_ok", "status": "ok", "stage": "indexed", "chunks": 2},
                {
                    "kbId": "kb_bad",
                    "status": "error",
                    "stage": "failed",
                    "code": "KB_EMPTY_TEXT",
                    "userMessage": "No readable text was found in this knowledge source.",
                    "retryable": False,
                    "error": "No readable text was found in this knowledge source.",
                },
            ]

        original_process_documents = api.kb_handler.process_documents
        try:
            api.kb_handler.process_documents = fake_process_documents
            with (
                patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}, clear=False),
                patch.object(api.kb_handler, "_KB_REDIS_CLIENT", FakeRedis()),
            ):
                with TestClient(api.app) as client:
                    response = client.post(
                        "/kb/process",
                        headers={"x-internal-key": "internal-secret"},
                        json={
                            "agentId": "agent_123",
                            "organizationId": "org_123",
                            "documents": [
                                {"kbId": "kb_ok", "name": "OK", "sourceType": "URL", "url": "https://example.com"},
                                {"kbId": "kb_bad", "name": "Bad", "sourceType": "URL", "url": "https://example.com"},
                            ],
                        },
                    )
                    status_response = client.get(
                        response.json()["statusUrl"],
                        headers={"x-internal-key": "internal-secret"},
                    )
        finally:
            api.kb_handler.process_documents = original_process_documents

        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["status"], "queued")
        self.assertIn("jobId", body)
        self.assertEqual(body["progress"]["total"], 2)
        self.assertEqual(body["progress"]["processed"], 0)

        self.assertEqual(status_response.status_code, 200)
        job = status_response.json()
        self.assertEqual(job["jobId"], body["jobId"])
        self.assertEqual(job["status"], "partial_failed")
        self.assertEqual(job["progress"]["processed"], 2)
        self.assertEqual(job["progress"]["succeeded"], 1)
        self.assertEqual(job["progress"]["failed"], 1)
        self.assertEqual(job["progress"]["percent"], 100)
        self.assertEqual(job["documents"][0]["stage"], "indexed")
        self.assertEqual(job["documents"][1]["code"], "KB_EMPTY_TEXT")
        self.assertFalse(job["documents"][1]["retryable"])

    def test_kb_process_returns_413_for_document_budget_overflow(self):
        import api

        original_max_documents = api.kb_handler.MAX_DOCUMENTS_PER_JOB
        try:
            api.kb_handler.MAX_DOCUMENTS_PER_JOB = 1
            with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}, clear=False):
                with TestClient(api.app, raise_server_exceptions=False) as client:
                    response = client.post(
                        "/kb/process",
                        headers={"x-internal-key": "internal-secret"},
                        json={
                            "agentId": "agent_123",
                            "organizationId": "org_123",
                            "documents": [
                                {"kbId": "kb_1", "name": "One", "sourceType": "URL", "url": "https://example.com/1"},
                                {"kbId": "kb_2", "name": "Two", "sourceType": "URL", "url": "https://example.com/2"},
                            ],
                        },
                    )
        finally:
            api.kb_handler.MAX_DOCUMENTS_PER_JOB = original_max_documents

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["detail"]["code"], "KB_DOCUMENT_LIMIT_EXCEEDED")


if __name__ == "__main__":
    unittest.main()
