import http.client
import ipaddress
import socket
import ssl
import threading
import time
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request


_TLS_CONTEXT = ssl.create_default_context()
_TLS_CONTEXT.set_alpn_protocols(["http/1.1"])

REDIRECT_STATUSES = {301, 302, 303, 307, 308}
FORBIDDEN_REQUEST_HEADERS = {
    "connection",
    "host",
    "proxy-authorization",
    "proxy-connection",
    "transfer-encoding",
    "upgrade",
}


class UnsafeRemoteRequestError(RuntimeError):
    pass


@dataclass(frozen=True)
class SafeHttpResponse:
    status: int
    content_type: str
    body: bytes


def safe_https_request(
    request: Request,
    *,
    timeout: float,
    max_response_bytes: int,
    resolver: Callable[[str, int], list[str]] | None = None,
    connection_factory: Callable[
        [str, int, list[str], float], http.client.HTTPSConnection
    ]
    | None = None,
    cancellation_event: threading.Event | None = None,
    connection_observer: Callable[[http.client.HTTPSConnection], None] | None = None,
) -> SafeHttpResponse:
    deadline = time.monotonic() + timeout
    _raise_if_cancelled(cancellation_event)
    parsed = urlsplit(request.full_url)
    hostname = _validated_hostname(parsed)
    try:
        port = parsed.port or 443
    except ValueError as error:
        raise UnsafeRemoteRequestError("Remote URL port is invalid") from error

    addresses = (resolver or _resolve_public_addresses)(hostname, port)
    _raise_if_cancelled(cancellation_event)
    if not addresses or any(not _is_public_address(address) for address in addresses):
        raise UnsafeRemoteRequestError("Private or local remote URLs are not allowed")

    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Remote request timed out")
    connection = (connection_factory or _open_pinned_https_connection)(
        hostname, port, addresses, remaining,
    )
    if connection_observer is not None:
        connection_observer(connection)
    target = urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
    def abort_connection():
        if connection.sock is not None:
            try:
                connection.sock.shutdown(socket.SHUT_RDWR)
            except (OSError, AttributeError):
                pass
        connection.close()

    deadline_timer = threading.Timer(max(0, deadline - time.monotonic()), abort_connection)
    deadline_timer.daemon = True
    deadline_timer.start()
    try:
        _raise_if_cancelled(cancellation_event)
        peer_address = _peer_address(connection)
        if not peer_address or not _is_public_address(peer_address):
            raise UnsafeRemoteRequestError(
                "Remote server connected to a private or local address"
            )
        headers = {
            key: value
            for key, value in request.header_items()
            if key.lower() not in FORBIDDEN_REQUEST_HEADERS
        }
        connection.request(
            request.get_method(),
            target,
            body=request.data,
            headers=headers,
        )
        _raise_if_cancelled(cancellation_event)
        response = connection.getresponse()
        _raise_if_cancelled(cancellation_event)
        if response.status in REDIRECT_STATUSES:
            raise UnsafeRemoteRequestError("Remote redirects are not allowed")
        if response.status >= 400:
            raise RuntimeError(f"HTTP {response.status}")

        content_length = response.getheader("Content-Length")
        if content_length is not None:
            try:
                if int(content_length) > max_response_bytes:
                    raise UnsafeRemoteRequestError("Remote response is too large")
            except ValueError as error:
                raise UnsafeRemoteRequestError(
                    "Remote response has an invalid Content-Length"
                ) from error

        body = response.read(max_response_bytes + 1)
        if time.monotonic() >= deadline:
            raise TimeoutError("Remote request timed out")
        _raise_if_cancelled(cancellation_event)
        if len(body) > max_response_bytes:
            raise UnsafeRemoteRequestError("Remote response is too large")
        return SafeHttpResponse(
            status=response.status,
            content_type=response.getheader("Content-Type", ""),
            body=body,
        )
    finally:
        deadline_timer.cancel()
        connection.close()


def _raise_if_cancelled(cancellation_event: threading.Event | None) -> None:
    if cancellation_event is not None and cancellation_event.is_set():
        raise RuntimeError("Remote request was cancelled")


def _validated_hostname(parsed) -> str:
    if parsed.scheme.lower() != "https":
        raise UnsafeRemoteRequestError("Only HTTPS remote URLs are allowed")
    if parsed.username or parsed.password:
        raise UnsafeRemoteRequestError("Remote URL credentials are not allowed")
    if not parsed.hostname:
        raise UnsafeRemoteRequestError("Remote URL hostname is required")

    hostname = parsed.hostname.rstrip(".").encode("idna").decode("ascii").lower()
    if (
        hostname == "localhost"
        or hostname.endswith(".localhost")
        or hostname.endswith(".local")
    ):
        raise UnsafeRemoteRequestError("Private or local remote URLs are not allowed")
    return hostname


def _resolve_public_addresses(hostname: str, port: int) -> list[str]:
    try:
        results = socket.getaddrinfo(
            hostname,
            port,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except OSError as error:
        raise UnsafeRemoteRequestError("Remote hostname could not be resolved") from error

    addresses = list(dict.fromkeys(result[4][0] for result in results))
    if not addresses:
        raise UnsafeRemoteRequestError("Remote hostname could not be resolved")
    return addresses


def _is_public_address(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return address.is_global


def _open_pinned_https_connection(
    hostname: str,
    port: int,
    addresses: list[str],
    timeout: float,
) -> http.client.HTTPSConnection:
    context = _TLS_CONTEXT
    last_error: OSError | ssl.SSLError | None = None
    deadline = time.monotonic() + timeout
    for address in addresses:
        raw_socket = None
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Remote connection timed out")
            raw_socket = socket.create_connection((address, port), timeout=remaining)
            raw_socket.settimeout(max(0.001, deadline - time.monotonic()))
            tls_socket = context.wrap_socket(raw_socket, server_hostname=hostname)
            connection = http.client.HTTPSConnection(
                hostname,
                port,
                timeout=timeout,
                context=context,
            )
            connection.sock = tls_socket
            return connection
        except (OSError, ssl.SSLError) as error:
            last_error = error
            if raw_socket is not None:
                raw_socket.close()
    raise UnsafeRemoteRequestError("Remote HTTPS connection failed") from last_error


def _peer_address(connection: http.client.HTTPSConnection) -> str | None:
    if connection.sock is None:
        return None
    peer = connection.sock.getpeername()
    return str(peer[0]) if isinstance(peer, tuple) and peer else None
