"""Full-conversation analysis, with no provider calls or credentials."""
import asyncio
import copy
import json
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from unittest.mock import AsyncMock, Mock, patch
from datetime import datetime, timezone
from types import SimpleNamespace

from handlers.finalization_handler import CallFinalizer

from handlers.post_call_metadata import analyze_call


class PostCallAnalysisTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.config = {
            "voice_config": {"llm": {"provider": "bedrock", "model": "test-model"}},
            "timezone": "Asia/Kolkata", "agent_language": "en",
            "data_needed": [
                {"id": "name", "name": "Caller name", "type": "string"},
                {"id": "urgency", "name": "Urgency", "type": "choice", "options": ["urgent", "routine"]},
                {"id": "issue", "name": "Issue summary", "type": "string"},
                {"id": "date", "name": "Appointment date", "type": "date"},
                {"id": "reference", "name": "Reference", "type": "string"},
            ],
        }
        self.payload = {
            "callId": "test-call", "startTime": "2026-10-26T08:00:00Z",
            "endTime": "2026-10-26T08:02:04Z", "durationSeconds": 124,
            "metadata": {"terminationReason": "participant_disconnected", "summary": "", "intent": ""},
            "transcripts": [
                {"role": "agent", "message": "How can I help?"},
                {"role": "user", "message": "My name is Avery. I want to book an assessment for November 5, 2026."},
                {"role": "user", "message": "Give me a moment."},
                {"role": "user", "message": "This is urgent. Correction: cancel my assessment for November 6, 2026."},
                {"role": "agent", "message": "I cannot cancel it here. I can pass your request to the team."},
            ],
            "extractedData": [{"name": "Issue summary", "type": "string", "description": "", "value": "book assessment"}],
        }
        self.result = {
            "summary": "Avery urgently requested cancellation of the November 6 assessment. No cancellation was confirmed.",
            "intent": "Cancel assessment", "reason": "Urgent assessment cancellation", "username": "Avery",
            "fields": {
                "0": {"value": "Avery", "evidence": "My name is Avery."},
                "1": {"value": "urgent", "evidence": "This is urgent."},
                "2": {"value": "Urgent cancellation of assessment", "evidence": "This is urgent. Correction: cancel my assessment for November 6, 2026."},
                "3": {"value": "2026-11-06", "evidence": "cancel my assessment for November 6, 2026."},
                "4": None,
            },
        }

    async def test_complete_transcript_and_corrections_replace_stale_live_fields(self):
        generate = AsyncMock(return_value=json.dumps(self.result))
        with patch("handlers.post_call_metadata._generate_analysis", generate):
            await analyze_call(self.config, self.payload)
        request = json.loads(generate.call_args.args[1])
        self.assertEqual(request["transcript"], self.payload["transcripts"])
        self.assertEqual(request["timezone"], "Asia/Kolkata")
        self.assertEqual(request["callStartedAt"], self.payload["startTime"])
        self.assertEqual(request["fields"]["1"]["options"], ["urgent", "routine"])
        values = {item["name"]: item["value"] for item in self.payload["extractedData"]}
        self.assertEqual(values["Issue summary"], "Urgent cancellation of assessment")
        self.assertEqual(values["Appointment date"], "2026-11-06")
        self.assertNotIn("Reference", values)
        self.assertEqual(self.payload["metadata"]["summary"], self.result["summary"])
        self.assertEqual(self.payload["metadata"]["analysisStatus"], "completed")
        self.assertEqual(self.payload["metadata"]["terminationReason"], "participant_disconnected")
        self.assertEqual(self.payload["durationSeconds"], 124)

    async def test_finalizer_sends_same_analysis_to_call_log_and_webhook_once(self):
        config = {**self.config, "agent_id": "agent-1", "organization_id": "org-1",
                  "post_call_webhook": {"webhook_url": "https://example.com/hook"}}
        posted, queued = [], []
        async def post(payload):
            posted.append(copy.deepcopy(payload))
        finalizer = CallFinalizer(
            config=config, call_context={"call_id": "call-1"},
            started_at=datetime(2026, 10, 26, tzinfo=timezone.utc), recording_path=None,
            transcript_reader=lambda: self.payload["transcripts"],
            post_call_log=post, enqueue_webhook=queued.append,
        )
        generate = AsyncMock(return_value=json.dumps(self.result))
        with patch("handlers.post_call_metadata._generate_analysis", generate):
            await asyncio.gather(finalizer.finalize(), finalizer.finalize())
        generate.assert_awaited_once()
        self.assertEqual(len(posted), 1)
        self.assertEqual(len(queued), 1)
        self.assertEqual(posted[0]["metadata"]["summary"], self.result["summary"])
        self.assertEqual(posted[0]["extractedData"], queued[0]["extractedData"])
        self.assertEqual(posted[0]["metadata"], queued[0]["metadata"])

    async def test_finalizer_still_delivers_when_analysis_provider_fails(self):
        post = AsyncMock()
        finalizer = CallFinalizer(
            config={**self.config, "agent_id": "agent-1", "organization_id": "org-1"},
            call_context={"call_id": "call-1"},
            started_at=datetime(2026, 10, 26, tzinfo=timezone.utc), recording_path=None,
            transcript_reader=lambda: self.payload["transcripts"], post_call_log=post,
        )
        with patch("handlers.post_call_metadata._generate_analysis", AsyncMock(side_effect=RuntimeError("offline"))):
            await finalizer.finalize()
        post.assert_awaited_once()
        payload = post.call_args.args[0]
        self.assertEqual(payload["metadata"]["analysisStatus"], "unavailable")
        self.assertEqual(payload["metadata"]["summary"], "")
        self.assertEqual(len(payload["transcripts"]), 5)

    async def test_generation_uses_only_structured_output_tool_and_closes_model(self):
        from handlers.post_call_metadata import _generate_analysis, ANALYSIS_INSTRUCTIONS
        class Stream:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *_args):
                pass
            async def __aiter__(self):
                yield SimpleNamespace(delta=SimpleNamespace(content="Submitting analysis.", tool_calls=[]), usage=None)
                yield SimpleNamespace(delta=SimpleNamespace(content=None, tool_calls=[SimpleNamespace(
                    name="record_call_analysis", arguments='{"summary":"Done"}')]), usage=None)
        model = SimpleNamespace(chat=Mock(return_value=Stream()), aclose=AsyncMock())
        with patch("handlers.voice_provider_adapters._build_llm", return_value=model) as factory:
            raw = await _generate_analysis(self.config["voice_config"]["llm"], '{"transcript":[]}')
        self.assertEqual(raw, '{"summary":"Done"}')
        factory.assert_called_once_with(self.config["voice_config"]["llm"], max_output_tokens=4096)
        from livekit.agents import llm
        tools = model.chat.call_args.kwargs["tools"]
        self.assertEqual(len(tools), 1)
        self.assertEqual(model.chat.call_args.kwargs["tool_choice"], "required")
        schema = llm.ToolContext(tools).parse_function_tools("aws")[0]["toolSpec"]
        self.assertEqual(schema["name"], "record_call_analysis")
        self.assertIn("summary", schema["inputSchema"]["json"]["required"])
        self.assertEqual(model.chat.call_args.kwargs["conn_options"].max_retry, 0)
        messages = model.chat.call_args.kwargs["chat_ctx"].items
        self.assertEqual(messages[0].text_content, ANALYSIS_INSTRUCTIONS)
        model.aclose.assert_awaited_once()

    async def test_bedrock_wire_stream_returns_structured_arguments_not_surrounding_text(self):
        from livekit.plugins import aws
        from handlers.post_call_metadata import _generate_analysis, _validate_analysis

        raw = json.dumps(self.result)
        async def events():
            yield {"contentBlockDelta": {"delta": {"text": "Here is the analysis:"}}}
            yield {"contentBlockStart": {"start": {"toolUse": {
                "toolUseId": "tool-result-1", "name": "record_call_analysis",
            }}}}
            yield {"contentBlockDelta": {"delta": {"toolUse": {"input": raw[:80]}}}}
            yield {"contentBlockDelta": {"delta": {"toolUse": {"input": raw[80:]}}}}
            yield {"contentBlockStop": {}}
            yield {"metadata": {"usage": {"inputTokens": 200, "outputTokens": 100}}}

        client = SimpleNamespace(converse_stream=AsyncMock(return_value={
            "ResponseMetadata": {"RequestId": "offline", "HTTPStatusCode": 200},
            "stream": events(),
        }))
        context = AsyncMock()
        context.__aenter__.return_value = client
        from aiobotocore.session import AioSession
        model = aws.LLM(model="us.anthropic.claude-haiku-4-5-20251001-v1:0",
                        session=Mock(spec=AioSession, create_client=Mock(return_value=context)))
        fields = {str(i): target for i, target in enumerate(self.config["data_needed"])}
        with patch("handlers.voice_provider_adapters._build_llm", return_value=model):
            generated = await _generate_analysis(self.config["voice_config"]["llm"], json.dumps({"fields": fields}))
        self.assertEqual(generated, raw)
        result, extracted = _validate_analysis(generated, fields, self.payload["transcripts"])
        self.assertEqual(result["summary"], self.result["summary"])
        self.assertEqual(len(extracted), 4)
        wire = client.converse_stream.call_args.kwargs["toolConfig"]
        self.assertEqual(wire["toolChoice"], {"any": {}})
        schema = wire["tools"][0]["toolSpec"]["inputSchema"]["json"]
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(schema["properties"]["fields"]["required"], list(fields))
        context.__aexit__.assert_awaited_once()

    async def test_complete_markdown_json_wrapper_is_accepted_without_repairing_data(self):
        for raw in (json.dumps(self.result), "```json\n" + json.dumps(self.result) + "\n```", "```\n" + json.dumps(self.result) + "\n```"):
            payload = copy.deepcopy(self.payload)
            with patch("handlers.post_call_metadata._generate_analysis", AsyncMock(return_value=raw)):
                await analyze_call(self.config, payload)
            self.assertEqual(payload["metadata"]["analysisStatus"], "completed")

    async def test_parse_failures_have_safe_diagnostics_without_raw_model_output(self):
        for raw in ("", "```json\n" + json.dumps(self.result)[:-5] + "\n```", "Private response: " + json.dumps(self.result)):
            payload = copy.deepcopy(self.payload)
            with patch("handlers.post_call_metadata._generate_analysis", AsyncMock(return_value=raw)), patch("handlers.post_call_metadata.emit_metric") as metric:
                await analyze_call(self.config, payload)
            self.assertEqual(payload["metadata"]["analysisStatus"], "unavailable")
            self.assertEqual(metric.call_args.kwargs["failure_stage"], "validation")
            self.assertEqual(metric.call_args.kwargs["error_code"], "invalid_json")
            self.assertNotIn("Avery", str(metric.call_args))

    async def test_invalid_results_never_partially_replace_live_data(self):
        invalid_results = ["not json"]
        for field, value in [("1", "made-up-choice"), ("3", "2026-02-30")]:
            invalid = copy.deepcopy(self.result)
            invalid["fields"][field]["value"] = value
            invalid_results.append(json.dumps(invalid))
        for mutate in (
            lambda r: r["fields"].pop("4"),
            lambda r: r["fields"].update({"unexpected": None}),
            lambda r: r["fields"]["0"].update(evidence="The caller never said this"),
            lambda r: r["fields"]["0"].update(evidence="How can I help?"),
        ):
            invalid = copy.deepcopy(self.result)
            mutate(invalid)
            invalid_results.append(json.dumps(invalid))
        for raw in invalid_results:
            with self.subTest(raw=raw):
                payload = copy.deepcopy(self.payload)
                with patch("handlers.post_call_metadata._generate_analysis", AsyncMock(return_value=raw)):
                    await analyze_call(self.config, payload)
                self.assertEqual(payload["extractedData"], self.payload["extractedData"])
                self.assertEqual(payload["metadata"]["summary"], "")
                self.assertEqual(payload["metadata"]["analysisStatus"], "unavailable")

    async def test_timeout_preserves_call_and_cancels_request(self):
        cancelled = asyncio.Event()
        async def hang(*_args):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        with patch("handlers.post_call_metadata._generate_analysis", hang), patch("handlers.post_call_metadata.ANALYSIS_TIMEOUT_SECONDS", 0.01):
            await analyze_call(self.config, self.payload)
        self.assertTrue(cancelled.is_set())
        self.assertEqual(self.payload["metadata"]["analysisStatus"], "unavailable")
        self.assertEqual(len(self.payload["transcripts"]), 5)

    async def test_zero_retention_empty_and_oversized_calls_do_not_send_data(self):
        for case in ("private", "empty", "oversized"):
            with self.subTest(case=case):
                config, payload = copy.deepcopy(self.config), copy.deepcopy(self.payload)
                if case == "private":
                    config["zero_pii_retention"] = True
                elif case == "empty":
                    payload["transcripts"] = []
                else:
                    payload["transcripts"][-1]["message"] = "x" * 130_000
                with patch("handlers.post_call_metadata._generate_analysis", AsyncMock()) as generate:
                    await analyze_call(config, payload)
                generate.assert_not_called()
                self.assertNotEqual(payload["metadata"].get("analysisStatus"), "completed")

    async def test_provider_error_preserves_call(self):
        with patch("handlers.post_call_metadata._generate_analysis", AsyncMock(side_effect=RuntimeError("provider offline"))):
            await analyze_call(self.config, self.payload)
        self.assertEqual(self.payload["metadata"]["analysisStatus"], "unavailable")
        self.assertEqual(self.payload["callId"], "test-call")


if __name__ == "__main__":
    unittest.main()
