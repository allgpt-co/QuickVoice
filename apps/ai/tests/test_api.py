import os
import sys
import unittest
import warnings
from unittest.mock import patch

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


@unittest.skipIf(TestClient is None, "fastapi test client is not installed")
class ApiTests(unittest.TestCase):
    def test_non_health_routes_require_internal_auth(self):
        import api

        with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}, clear=False):
            with TestClient(api.app) as client:
                self.assertEqual(client.get("/health").status_code, 200)
                self.assertEqual(client.get("/agents/agent_123/config").status_code, 401)
                response = client.post("/flows/simulate", json={"config": {}, "messages": []})
                self.assertEqual(response.status_code, 401)

    def test_flow_simulate_returns_selected_path(self):
        import api

        config = {
            "flow": {
                "compiled": {
                    "startNodeId": "start",
                    "nodesById": {
                        "start": {"id": "start", "type": "start", "data": {"agentId": "agent-root"}},
                        "returns": {"id": "returns", "type": "agent", "data": {"agentId": "agent-returns"}},
                    },
                    "outgoingByNodeId": {
                        "start": [
                            {
                                "id": "route-returns",
                                "source": "start",
                                "target": "returns",
                                "type": "llm_condition",
                                "data": {"condition": "Customer wants to return an order"},
                            }
                        ]
                    },
                    "agentsByNodeId": {
                        "start": {"agentId": "agent-root"},
                        "returns": {"agentId": "agent-returns"},
                    },
                }
            }
        }

        with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}, clear=False):
            with TestClient(api.app) as client:
                response = client.post(
                    "/flows/simulate",
                    headers={"x-internal-key": "internal-secret"},
                    json={"config": config, "messages": [{"role": "user", "content": "I need to return my order"}]},
                )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["selectedRoutes"][0]["routeId"], "route-returns")
        self.assertEqual(body["path"][-1]["nodeId"], "returns")

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
            with patch.dict(os.environ, {"INTERNAL_API_KEY": "internal-secret"}, clear=False):
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
