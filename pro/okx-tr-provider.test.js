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

test('reject unverified live startup without any network call',async()=>{
  let requests=0, sockets=0;
  const provider=new OkxTrProvider({fetchFn:()=>{requests++;throw Error('Unexpected request');},
    socketFactory:()=>{sockets++;throw Error('Unexpected socket');}});
  await provider.start();
  assert.equal(requests,0);
  assert.equal(sockets,0);
  assert.equal(provider.snapshot().adapterEnabled,false);
});
test('read-only REST minute and book endpoints use OKX TR only',async()=>{
  const seen=[];
  const now=1760000400000;
  const market={symbol:'BTC_TRY',wireSymbol:'BTC-TRY'};
  const provider=new OkxTrProvider({verified:true,clock:()=>now,fetchFn:async url=>{
    seen.push(url);
    const body=url.includes('/candles?')
      ? {code:'0',data:[[String(Math.floor((now-120000)/60000)*60000),'10','11','9','10','2','20','20','1']]}
      : {code:'0',data:[{ts:String(now),bids:[['9','2']],asks:[['11','3']]}]};
    return {ok:true,body:new ReadableStream({start(controller){
      controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));controller.close();
    }})};
  }});
  provider.stopped=false;
  provider.markets.set(market.symbol,market);
  assert.equal((await provider.minutes(market)).length,1);
  assert.equal((await provider.book(market)).bid,9);
  assert.equal(seen.length,2);
  assert.ok(seen.every(url=>url.startsWith('https://tr.okx.com/api/v5/market/')));
  provider.stop();
});

test('retired socket close cannot disconnect a replacement feed',()=>{
  const EventEmitter=MockEmitter;
  const sockets=[];
  const provider=new OkxTrProvider({verified:true,socketFactory:()=>{
    const socket=new EventEmitter();
    socket.readyState=1;socket.send=()=>{};socket.terminate=()=>{};
    sockets.push(socket);return socket;
  }});
  provider.stopped=false;
  const market={symbol:'BTC_TRY',wireSymbol:'BTC-TRY',streamAvailable:false};
  provider.markets.set(market.symbol,market);
  provider.reconnect();
  sockets[0].emit('open');
  sockets[0].emit('message',JSON.stringify({event:'subscribe',arg:{channel:'trades',instId:'BTC-TRY'}}));
  assert.equal(market.streamAvailable,true);
  provider.reconnect();
  sockets[1].emit('open');
  sockets[1].emit('message',JSON.stringify({event:'subscribe',arg:{channel:'trades',instId:'BTC-TRY'}}));
  assert.equal(market.streamAvailable,true);
  sockets[0].emit('close');
  assert.equal(market.streamAvailable,true);
  assert.notEqual(provider.feeds.get(market.symbol).continuousSince,null);
  provider.stop();
});
class MockEmitter{
  constructor(){this.handlers=new Map();}
  on(event,callback){this.handlers.set(event,callback);return this;}
  emit(event,...args){this.handlers.get(event)?.(...args);}
}

test('in-flight REST response from stopped session cannot be reused',async()=>{
  let resolveResponse;
  const provider=new OkxTrProvider({verified:true,fetchFn:()=>new Promise(resolve=>{resolveResponse=resolve;})});
  provider.stopped=false;
  const pending=provider.request('/api/v5/public/instruments?instType=SPOT');
  for(let i=0;i<20&&!resolveResponse;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof resolveResponse,'function');
  provider.stop();
  resolveResponse({ok:true,body:new ReadableStream({start(controller){
    controller.enqueue(new TextEncoder().encode('{"code":"0","data":[]}'));controller.close();
  }})});
  await assert.rejects(pending,/Stopped/);
});

test('rejected OKX TR websocket subscription terminates socket',()=>{
  const sockets=[];
  const provider=new OkxTrProvider({verified:true,socketFactory:()=>{
    const socket=new MockEmitter();socket.readyState=1;socket.send=()=>{};
    socket.terminated=false;socket.terminate=()=>{socket.terminated=true;};
    sockets.push(socket);return socket;
  }});
  provider.stopped=false;
  provider.markets.set('BTC_TRY',{symbol:'BTC_TRY',wireSymbol:'BTC-TRY',streamAvailable:false});
  provider.reconnect();
  sockets[0].emit('open');
  sockets[0].emit('message',JSON.stringify({event:'error',code:'60018'}));
  assert.equal(sockets[0].terminated,true);
  assert.equal(provider.markets.get('BTC_TRY').streamAvailable,false);
  provider.stop();
});
