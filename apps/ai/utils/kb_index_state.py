"""Shared publication pointers fence vector generations and deleted sources.

Redis must persist this small index manifest (AOF/backups), just like the job
queues. A missing manifest permits only legacy vectors, never staged vectors.
"""
import hashlib
import os
import uuid

_CLIENT = None
DELETED = "!deleted"
_PUBLISH = """
local previous = redis.call('HGET', KEYS[1], ARGV[1])
if previous == '!deleted' or (previous or '') ~= ARGV[3] then return {0, previous or ''} end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return {1, previous or ''}
"""

_DELETE = """
local previous = redis.call('HGET', KEYS[1], ARGV[1])
if previous ~= '!deleted' then redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) end
return previous or ''
"""


def _client():
    global _CLIENT
    if _CLIENT is None:
        from redis import Redis
        _CLIENT = Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"),
                                 decode_responses=True, socket_timeout=5, socket_connect_timeout=5)
    return _CLIENT


def _key(namespace):
    return "quickvoice:kb:index:" + hashlib.sha256(namespace.encode()).hexdigest()


# ponytail: the manifest/filter grows with source history; compact tombstones
# only once retired jobs have a durable generation fence outside Redis.
def snapshot(namespace):
    return _client().hgetall(_key(namespace))


def assert_not_deleted(namespace, kb_id):
    previous = _client().hget(_key(namespace), kb_id)
    if previous == DELETED:
        raise RuntimeError("Knowledge source was deleted")
    return previous or ""


def publish(namespace, kb_id, version, expected):
    accepted, previous = _client().eval(_PUBLISH, 1, _key(namespace), kb_id, version, expected)
    return bool(accepted), previous


def delete(namespace, kb_id, *, permanent=True):
    # Reassignment revokes current writers but permits a later move back. An
    # actual source deletion is permanent and can never be downgraded.
    marker = DELETED if permanent else "!revoked:" + uuid.uuid4().hex
    return _client().eval(_DELETE, 1, _key(namespace), kb_id, marker)
