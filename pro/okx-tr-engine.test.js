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

test('reconnected stream invalidates stale minute and depth caches',()=>{
  const history={loadSettings:()=>({}),liveStatus:()=>{},expire:()=>{},flush:()=>{},statistics:()=>[],pending:new Map()};
  const provider={markets:new Map(),feeds:new Map(),snapshot:()=>({source:'OKX TR'})};
  const market={symbol:'BTC_TRY',base:'BTC'};
  provider.markets.set(market.symbol,market);
  const engine=new ProEngine(history,provider);
  const original={continuousSince:1,seconds:()=>({ready:false,reason:'warming'})};
  const replacement={continuousSince:2,seconds:()=>({ready:false,reason:'warming'})};
  provider.feeds.set(market.symbol,original);
  engine.feedIdentity.set(market.symbol,original);
  engine.minuteCache.set(market.symbol,{bars:[{time:1}],at:1});
  engine.books.set(market.symbol,{time:1,bid:1,ask:2});
  provider.feeds.set(market.symbol,replacement);
  engine.tick(1000000);
  assert.equal(engine.minuteCache.has(market.symbol),false);
  assert.equal(engine.books.has(market.symbol),false);
  assert.equal(engine.feedIdentity.get(market.symbol),replacement);
});
