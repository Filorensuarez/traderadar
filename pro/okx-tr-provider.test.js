import test from 'node:test';
import assert from 'node:assert/strict';
import { OkxTrProvider } from './okx-tr-provider.js';

test('live adapter remains disabled without verified source',async()=>{
  const provider=new OkxTrProvider({fetchFn:()=>{throw Error('Network should not be used');}});
  await provider.start();
  assert.equal(provider.snapshot().adapterEnabled,false);
  assert.equal(provider.snapshot().receivedTrades,0);
  assert.equal(provider.markets.size,0);
});
test('stop is idempotent',()=>{
  const provider=new OkxTrProvider();
  provider.stop();provider.stop();
  assert.equal(provider.snapshot().connected,false);
});
