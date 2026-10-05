import os
import sys
import threading
import unittest
from urllib.request import Request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from utils.safe_http import UnsafeRemoteRequestError, safe_https_request


class FakeSocket:
    def __init__(self, peer_address="93.184.216.34"):
        self.peer_address = peer_address

    def getpeername(self):
        return (self.peer_address, 443)


class FakeResponse:
    def __init__(self, *, status=200, body=b"ok", headers=None):
        self.status = status
        self.body = body
        self.headers = headers or {}
        self.read_limit = None

    def getheader(self, name, default=None):
        return self.headers.get(name.lower(), default)

    def read(self, limit):
        self.read_limit = limit
        return self.body[:limit]


class FakeConnection:
    def __init__(self, response=None, *, peer_address="93.184.216.34"):
        self.sock = FakeSocket(peer_address)
        self.response = response or FakeResponse()
        self.requests = []
        self.closed = False

    def request(self, method, target, *, body, headers):
        self.requests.append((method, target, body, headers))

    def getresponse(self):
        return self.response

    def close(self):
        self.closed = True


class SafeHttpTests(unittest.TestCase):
    def _request(self, url="https://example.com/resource?item=1#ignored", **kwargs):
        return Request(url, **kwargs)

    def test_rejects_private_dns_resolution_before_connecting(self):
        connected = False

        def connect(*_args):
            nonlocal connected
            connected = True

        with self.assertRaisesRegex(UnsafeRemoteRequestError, "Private or local"):
            safe_https_request(
                self._request(),
                timeout=4,
                max_response_bytes=100,
                resolver=lambda _host, _port: ["169.254.169.254"],
                connection_factory=connect,
            )

        self.assertFalse(connected)

    def test_rejects_private_connected_peer_before_sending_request(self):
        connection = FakeConnection(peer_address="172.18.0.2")

        with self.assertRaisesRegex(UnsafeRemoteRequestError, "connected to a private"):
            safe_https_request(
                self._request(),
                timeout=4,
                max_response_bytes=100,
                resolver=lambda _host, _port: ["93.184.216.34"],
                connection_factory=lambda *_args: connection,
            )

        self.assertEqual(connection.requests, [])
        self.assertTrue(connection.closed)

    def test_rejects_redirects_without_following_location(self):
        response = FakeResponse(
            status=302,
            headers={"location": "http://169.254.169.254/latest/meta-data/"},
        )
        connection = FakeConnection(response)

        with self.assertRaisesRegex(UnsafeRemoteRequestError, "redirects"):
            safe_https_request(
                self._request(),
                timeout=4,
                max_response_bytes=100,
                resolver=lambda _host, _port: ["93.184.216.34"],
                connection_factory=lambda *_args: connection,
            )

        self.assertEqual(len(connection.requests), 1)
        self.assertTrue(connection.closed)

    def test_rejects_response_body_over_limit(self):
        response = FakeResponse(body=b"123456")
        connection = FakeConnection(response)

        with self.assertRaisesRegex(UnsafeRemoteRequestError, "too large"):
            safe_https_request(
                self._request(),
                timeout=4,
                max_response_bytes=5,
                resolver=lambda _host, _port: ["93.184.216.34"],
                connection_factory=lambda *_args: connection,
            )

        self.assertEqual(response.read_limit, 6)
        self.assertTrue(connection.closed)

    def test_returns_bounded_response_and_strips_unsafe_headers(self):
        response = FakeResponse(
            body=b'{"ok":true}',
            headers={"content-type": "application/json", "content-length": "11"},
        )
        connection = FakeConnection(response)

        result = safe_https_request(
            self._request(headers={"Host": "internal.service", "X-Test": "allowed"}),
            timeout=4,
            max_response_bytes=100,
            resolver=lambda _host, _port: ["93.184.216.34"],
            connection_factory=lambda *_args: connection,
        )

        self.assertEqual(result.body, b'{"ok":true}')
        self.assertEqual(result.content_type, "application/json")
        method, target, _body, headers = connection.requests[0]
        self.assertEqual(method, "GET")
        self.assertEqual(target, "/resource?item=1")
        self.assertNotIn("Host", headers)
        self.assertEqual(headers["X-test"], "allowed")

    def test_cancellation_stops_request_before_waiting_for_response(self):
        cancellation_event = threading.Event()

        class CancellingConnection(FakeConnection):
            def request(self, method, target, *, body, headers):
                super().request(method, target, body=body, headers=headers)
                cancellation_event.set()

        connection = CancellingConnection()
        with self.assertRaisesRegex(RuntimeError, "cancelled"):
            safe_https_request(
                self._request(),
                timeout=4,
                max_response_bytes=100,
                resolver=lambda _host, _port: ["93.184.216.34"],
                connection_factory=lambda *_args: connection,
                cancellation_event=cancellation_event,
            )

        self.assertTrue(connection.closed)


if __name__ == "__main__":
    unittest.main()

class DeadlineTests(unittest.TestCase):
    def test_whole_response_deadline_closes_a_trickling_connection(self):
        import time
        class Trickle(FakeConnection):
            def getresponse(self):
                connection = self
                class Response(FakeResponse):
                    def read(self, limit):
                        while not connection.closed:
                            time.sleep(0.005)
                        raise TimeoutError("closed by total deadline")
                return Response()
        connection = Trickle()
        started = time.monotonic()
        with self.assertRaises(TimeoutError):
            safe_https_request(Request("https://example.com"), timeout=0.04, max_response_bytes=100,
                resolver=lambda *_: ["93.184.216.34"], connection_factory=lambda *_: connection)
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertTrue(connection.closed)

class TlsContextTests(unittest.TestCase):
    def test_requests_reuse_only_tls_context_not_connections_or_host_identity(self):
        from unittest.mock import Mock, patch
        from utils.safe_http import _open_pinned_https_connection
        context = Mock()
        with patch("utils.safe_http.ssl.create_default_context", side_effect=AssertionError("must not build context per request")), \
             patch("utils.safe_http._TLS_CONTEXT", context), \
             patch("utils.safe_http.socket.create_connection", side_effect=[Mock(), Mock()]):
            first = _open_pinned_https_connection("one.example", 443, ["93.184.216.34"], 1)
            second = _open_pinned_https_connection("two.example", 443, ["93.184.216.34"], 1)
        self.assertIsNot(first, second)
        self.assertEqual([call.kwargs["server_hostname"] for call in context.wrap_socket.call_args_list], ["one.example", "two.example"])
