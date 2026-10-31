import test from 'node:test';
import assert from 'node:assert/strict';
import { ProEngine } from './engine.js';
import { OkxTrProvider } from './okx-tr-provider.js';

test('default Pro engine is OKX TR and remains stopped until verification',async()=>{
  const history={loadSettings:()=>({})};
  const engine=new ProEngine(history);
  assert.ok(engine.provider instanceof OkxTrProvider);
  await engine.start();
  assert.equal(engine.running,false);
  assert.equal(engine.provider.snapshot().adapterEnabled,false);
  assert.equal(engine.intervals.length,0);
  engine.stop();
});
