import asyncio
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.livekit_handler import get_recording_storage_config, recording_path, start_recording


class LiveKitHandlerTests(unittest.TestCase):
    def test_recording_path_uses_shared_s3_recording_prefix(self):
        self.assertEqual(
            recording_path("recording-123"),
            "Voice-agents/Recordings/recording-123.ogg",
        )

    def test_recording_storage_config_includes_static_credentials_when_provided(self):
        with patch.dict(
            os.environ,
            {
                "AWS_ACCESS_KEY_ID": "aws-access",
                "AWS_SECRET_ACCESS_KEY": "aws-secret",
                "AWS_SESSION_TOKEN": "aws-session-token",
                "AWS_REGION": "us-west-2",
                "S3_BUCKET_NAME": "quickvoice-recordings",
                "ACCESS_KEY": "legacy-access",
                "SECRET_ACCESS_KEY": "legacy-secret",
                "REGION": "legacy-region",
            },
            clear=True,
        ):
            config = get_recording_storage_config()

        self.assertEqual(config["region"], "us-west-2")
        self.assertEqual(config["bucket"], "quickvoice-recordings")
        self.assertEqual(config["access_key"], "aws-access")
        self.assertEqual(config["secret"], "aws-secret")
        self.assertEqual(config["session_token"], "aws-session-token")

    def test_recording_storage_config_allows_ecs_role_without_static_credentials(self):
        with patch.dict(
            os.environ,
            {
                "AWS_REGION": "us-west-2",
                "S3_BUCKET_NAME": "quickvoice-recordings",
            },
            clear=True,
        ):
            config = get_recording_storage_config()

        self.assertEqual(config["region"], "us-west-2")
        self.assertEqual(config["bucket"], "quickvoice-recordings")
        self.assertNotIn("access_key", config)
        self.assertNotIn("secret", config)
        self.assertNotIn("session_token", config)

    def test_recording_storage_config_rejects_partial_static_credentials(self):
        with patch.dict(
            os.environ,
            {
                "AWS_REGION": "us-west-2",
                "S3_BUCKET_NAME": "quickvoice-recordings",
                "AWS_ACCESS_KEY_ID": "aws-access",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "AWS_SECRET_ACCESS_KEY"):
                get_recording_storage_config()

    def test_start_recording_passes_static_credentials_to_livekit_s3_upload(self):
        from livekit import api

        class FakeEgress:
            def __init__(self):
                self.request = None

            async def start_room_composite_egress(self, request):
                self.request = request
                return SimpleNamespace(egress_id="egress-123", status=api.EGRESS_ACTIVE)

        class FakeLiveKitAPI:
            instance = None

            def __init__(self, *args, **kwargs):
                self.egress = FakeEgress()
                FakeLiveKitAPI.instance = self

            async def aclose(self):
                pass

        with patch.dict(
            os.environ,
            {
                "LIVEKIT_URL": "wss://livekit.example.com",
                "LIVEKIT_API_KEY": "livekit-key",
                "LIVEKIT_API_SECRET": "livekit-secret",
                "AWS_REGION": "us-west-2",
                "S3_BUCKET_NAME": "quickvoice-recordings",
                "AWS_ACCESS_KEY_ID": "aws-access",
                "AWS_SECRET_ACCESS_KEY": "aws-secret",
                "AWS_SESSION_TOKEN": "aws-session-token",
            },
            clear=True,
        ):
            with patch("livekit.api.LiveKitAPI", FakeLiveKitAPI):
                recording_id = asyncio.run(
                    start_recording(SimpleNamespace(room=SimpleNamespace(name="room-123")))
                )

        self.assertIsNotNone(recording_id)
        s3_upload = FakeLiveKitAPI.instance.egress.request.file_outputs[0].s3
        self.assertEqual(s3_upload.bucket, "quickvoice-recordings")
        self.assertEqual(s3_upload.region, "us-west-2")
        self.assertEqual(s3_upload.access_key, "aws-access")
        self.assertEqual(s3_upload.secret, "aws-secret")
        self.assertEqual(s3_upload.session_token, "aws-session-token")

    def test_recording_storage_config_requires_an_explicit_bucket(self):
        with patch.dict(
            os.environ,
            {
                "AWS_ACCESS_KEY_ID": "aws-access",
                "AWS_SECRET_ACCESS_KEY": "aws-secret",
                "AWS_REGION": "us-west-2",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "Missing recording storage env: bucket",
            ):
                get_recording_storage_config()


class RecordingStartupTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        from livekit import api
        self.api = api
        self.ctx = SimpleNamespace(room=SimpleNamespace(name="room-123"))
        self.egress = SimpleNamespace(
            start_room_composite_egress=AsyncMock(return_value=api.EgressInfo(
                egress_id="egress-123", status=api.EGRESS_STARTING,
            )),
            list_egress=AsyncMock(return_value=api.ListEgressResponse(items=[api.EgressInfo(
                egress_id="egress-123", status=api.EGRESS_ACTIVE,
            )])),
            stop_egress=AsyncMock(),
        )
        self.client = SimpleNamespace(egress=self.egress, aclose=AsyncMock())
        env = patch.dict(os.environ, {
            "LIVEKIT_URL": "wss://livekit.example.com", "LIVEKIT_API_KEY": "key",
            "LIVEKIT_API_SECRET": "secret", "S3_BUCKET_NAME": "recordings",
        }, clear=True)
        env.start()
        self.addCleanup(env.stop)
        client = patch("livekit.api.LiveKitAPI", return_value=self.client)
        client.start()
        self.addCleanup(client.stop)

    async def test_waits_for_active_instead_of_treating_acceptance_as_ready(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def poll(_request):
            if self.egress.list_egress.await_count == 1:
                return self.api.ListEgressResponse()
            if self.egress.list_egress.await_count == 2:
                return self.api.ListEgressResponse(items=[self.api.EgressInfo(
                    egress_id="egress-123", status=self.api.EGRESS_STARTING,
                )])
            entered.set()
            await release.wait()
            return self.api.ListEgressResponse(items=[self.api.EgressInfo(
                egress_id="egress-123", status=self.api.EGRESS_ACTIVE,
            )])
        self.egress.list_egress.side_effect = poll
        startup = asyncio.create_task(start_recording(self.ctx))
        try:
            await asyncio.wait_for(entered.wait(), timeout=2)
            self.assertFalse(startup.done())
        finally:
            release.set()
            recording_id = await startup
        self.assertIsNotNone(recording_id)
        self.assertEqual(self.egress.list_egress.await_count, 3)
        self.egress.list_egress.assert_awaited_with(
            self.api.ListEgressRequest(egress_id="egress-123"),
        )
        self.egress.stop_egress.assert_not_called()
        self.client.aclose.assert_awaited_once()

    async def test_hung_start_request_has_a_deadline_and_closes_client(self):
        async def hang(_request):
            await asyncio.Future()
        self.egress.start_room_composite_egress.side_effect = hang
        self.assertIsNone(await start_recording(self.ctx, timeout_seconds=0.01))
        self.egress.stop_egress.assert_not_called()
        self.client.aclose.assert_awaited_once()

    async def test_startup_timeout_stops_pending_egress_and_closes_client(self):
        recording_id = await start_recording(self.ctx, timeout_seconds=0.01)
        self.assertIsNone(recording_id)
        self.egress.stop_egress.assert_awaited_once_with(
            self.api.StopEgressRequest(egress_id="egress-123"),
        )
        self.client.aclose.assert_awaited_once()

    async def test_failed_egress_is_not_reported_as_a_recording(self):
        self.egress.start_room_composite_egress.return_value.status = self.api.EGRESS_FAILED
        self.assertIsNone(await start_recording(self.ctx))
        self.egress.stop_egress.assert_awaited_once()
        self.client.aclose.assert_awaited_once()

    async def test_cancellation_stops_pending_egress_and_closes_client(self):
        entered = asyncio.Event()
        async def poll(_request):
            entered.set()
            await asyncio.Future()
        self.egress.list_egress.side_effect = poll
        startup = asyncio.create_task(start_recording(self.ctx))
        await asyncio.wait_for(entered.wait(), timeout=1)
        startup.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await startup
        self.egress.stop_egress.assert_awaited_once()
        self.client.aclose.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
