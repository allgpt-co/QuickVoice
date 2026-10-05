"""Local-only tests: all Redis/vector operations use in-memory doubles."""
import asyncio, sys, threading, unittest
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from utils import kb_index_state
from handlers import vector_provider_adapters as module
class Redis:
 def __init__(self):self.data={};self.lock=threading.Lock();self.barrier=None
 def hgetall(self,key):
  with self.lock:return dict(self.data.get(key,{}))
 def hget(self,key,field):return self.hgetall(key).get(field)
 def hset(self,key,field,value):
  with self.lock:self.data.setdefault(key,{})[field]=value
 def eval(self,script,num,key,field,value,*expected):
  if self.barrier:self.barrier.wait(3)
  with self.lock:
   old=self.data.setdefault(key,{}).get(field,'')
   if not expected:
    if old!=kb_index_state.DELETED:self.data[key][field]=value
    return old
   if old==kb_index_state.DELETED or old!=expected[0]:return [0,old]
   self.data[key][field]=value;return [1,old]
def matches(payload,condition):
 if hasattr(condition,'must'):
  return all(matches(payload,c) for c in condition.must or []) and (not condition.should or any(matches(payload,c) for c in condition.should)) and not any(matches(payload,c) for c in condition.must_not or [])
 if getattr(condition,'is_empty',None) is not None:return payload.get(condition.is_empty.key) is None
 match=condition.match
 if hasattr(match,'any'):return payload.get(condition.key) in match.any
 return payload.get(condition.key)==match.value
class Qdrant:
 def __init__(self):self.points={};self.lock=threading.Lock();self.query_hook=None;self.fail=False;self.barrier=None
 def upsert(self,*,points,**kwargs):
  with self.lock:
   if self.fail:raise RuntimeError('failed batch')
   for point in points:self.points[point.id]=dict(point.payload)
  if self.barrier:self.barrier.wait(3)
 def set_payload(self,*,payload,points,**kwargs):
  with self.lock:
   for value in self.points.values():
    if matches(value,points):value.update(payload)
 def delete(self,*,points_selector,**kwargs):
  with self.lock:
   self.points={k:v for k,v in self.points.items() if not matches(v,points_selector)}
 def query_points(self,*,query_filter,**kwargs):
  if self.query_hook:hook=self.query_hook;self.query_hook=None;hook()
  with self.lock:return SimpleNamespace(points=[SimpleNamespace(id=k,payload=v,score=1) for k,v in self.points.items() if matches(v,query_filter)])
class Checks(unittest.TestCase):
 def setUp(self):
  self.redis=Redis();self.patch=patch.object(kb_index_state,'_CLIENT',self.redis);self.patch.start();self.addCleanup(self.patch.stop)
  self.client=Qdrant();self.adapter=module.QdrantVectorStoreAdapter();self.adapter._client=self.client;self.adapter._collection_vector_size=1
 def write(self,text='new'):self.adapter.upsert(namespace='agent',kb_id='kb',doc_name='doc',chunks=[text],embeddings=[[1.]])
 def read(self):return asyncio.run(self.adapter.query(namespace='agent',vector=[1.]))
 def test_overlapping_publications_keep_one_complete_generation(self):
  self.write('old');self.client.barrier=threading.Barrier(2)
  with ThreadPoolExecutor(2) as pool:
   tasks=[pool.submit(self.write,str(i)) for i in range(2)]
   failures=0
   for task in tasks:
    try:task.result()
    except module.VectorAdapterError:failures+=1
   self.assertEqual(failures,1)
  self.client.barrier=None
  self.assertEqual(len(self.read()),1)
  self.assertEqual(len(self.client.points),1)
 def test_deletion_fences_late_indexing(self):
  self.write();self.adapter.delete_by_kb(namespace='agent',kb_id='kb')
  with self.assertRaisesRegex(RuntimeError,'deleted'):self.write('late')
  self.assertEqual(self.read(),[])
 def test_failure_preserves_published_vectors(self):
  self.write('old');self.client.fail=True
  with self.assertRaises(RuntimeError):self.write()
  self.assertEqual([p.text for p in self.read()],['old'])
 def test_query_retries_if_publication_changes_snapshot(self):
  self.write('old');self.client.query_hook=lambda:self.write('new')
  self.assertEqual([p.text for p in self.read()],['new'])

 def test_deleted_during_staging_never_publishes(self):
  original = self.redis.eval
  def delete_then_publish(script, num, key, field, value, *expected):
   if expected:
    self.redis.eval = original
    self.adapter.delete_by_kb(namespace='agent', kb_id='kb')
   return original(script, num, key, field, value, *expected)
  self.redis.eval = delete_then_publish
  with self.assertRaisesRegex(RuntimeError, 'deleted'):self.write()
  self.assertEqual(self.read(), [])
 def test_ambiguous_publication_does_not_delete_a_committed_generation(self):
  self.write('old');original = self.redis.eval
  def commit_then_disconnect(*args):
   original(*args)
   raise ConnectionError('response lost after commit')
  self.redis.eval = commit_then_disconnect
  with self.assertRaises(ConnectionError):self.write('new')
  self.assertEqual([p.text for p in self.read()], ['new'])
 def test_missing_redis_fails_closed(self):
  self.write('old')
  self.redis.hgetall = lambda key: (_ for _ in ()).throw(ConnectionError('offline'))
  with self.assertRaises(ConnectionError):self.read()

 def test_reassignment_permits_moving_document_back(self):
  self.write('old')
  self.adapter.delete_by_kb(namespace='agent', kb_id='kb', permanent=False)
  self.assertEqual(self.read(), [])
  self.write('moved back')
  self.assertEqual([p.text for p in self.read()], ['moved back'])
 def test_reassignment_cannot_downgrade_permanent_deletion(self):
  self.write()
  self.adapter.delete_by_kb(namespace='agent', kb_id='kb')
  self.adapter.delete_by_kb(namespace='agent', kb_id='kb', permanent=False)
  with self.assertRaisesRegex(RuntimeError,'deleted'):self.write('late')
 def test_inflight_writer_cannot_publish_after_reassignment(self):
  self.write('old');original = self.redis.eval
  def revoke_then_publish(script, num, key, field, value, *expected):
   if expected:
    self.redis.eval = original
    self.adapter.delete_by_kb(namespace='agent', kb_id='kb', permanent=False)
   return original(script, num, key, field, value, *expected)
  self.redis.eval = revoke_then_publish
  with self.assertRaisesRegex(module.VectorAdapterError, 'changed'):self.write('stale')
  self.assertEqual(self.read(), [])
  self.write('fresh')
  self.assertEqual([p.text for p in self.read()], ['fresh'])

def pc_matches(payload, condition):
 for key, query in condition.items():
  if key == '$or':
   if not any(pc_matches(payload, child) for child in query): return False
  else:
   for op, val in query.items():
    if op == '$eq' and payload.get(key) != val: return False
    if op == '$nin' and payload.get(key) in val: return False
    if op == '$exists' and (key in payload) != val: return False
 return True
class Pinecone(Qdrant):
 def upsert(self,*,vectors,**kwargs):
  return super().upsert(points=[SimpleNamespace(id=v['id'],payload=v['metadata']) for v in vectors])
 def delete(self,*,filter,**kwargs):
  with self.lock:self.points={k:v for k,v in self.points.items() if not pc_matches(v,filter)}
 def query(self,*,filter,**kwargs):
  if self.query_hook:hook=self.query_hook;self.query_hook=None;hook()
  with self.lock:return {'matches':[{'id':k,'metadata':v,'score':1} for k,v in self.points.items() if pc_matches(v,filter)]}
class PineconeChecks(Checks):
 def setUp(self):
  super().setUp();self.client=Pinecone();self.adapter=module.PineconeVectorStoreAdapter();self.adapter._index=lambda:self.client
if __name__=='__main__':unittest.main()
