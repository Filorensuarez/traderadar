import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOkxTrInstruments, parseOkxTrTrade, parseOkxTrMinuteCandles, parseOkxTrBook } from './okx-tr-schema.js';
test('accept only active OKX TR spot instruments', () => {
  const rows = [
    {instType:'SPOT',state:'live',instId:'BTC-TRY',baseCcy:'BTC',quoteCcy:'TRY'},
    {instType:'SPOT',state:'suspend',instId:'ETH-TRY',baseCcy:'ETH',quoteCcy:'TRY'},
    {instType:'SWAP',state:'live',instId:'BTC-USDT-SWAP',baseCcy:'BTC',quoteCcy:'USDT'}
  ];
  assert.deepEqual(parseOkxTrInstruments({code:'0',data:rows}).map(x=>x.symbol),['BTC_TRY']);
  assert.throws(()=>parseOkxTrInstruments({code:'1',data:rows}));
});
test('validate trades and reject stale timestamps', () => {
  const now=1760000000000;
  assert.equal(parseOkxTrTrade({instId:'BTC-TRY',tradeId:'123',ts:String(now),px:'100',sz:'2',side:'buy'},now).buy,true);
  assert.throws(()=>parseOkxTrTrade({instId:'BTC-TRY',tradeId:'123',ts:String(now-40000),px:'100',sz:'2',side:'buy'},now));
});
test('reject missing minute candle intervals', () => {
  const now=1760000400000;
  const candle=t=>[String(t),'10','11','9','10','2','20','20','1'];
  const t= Math.floor((now-180000)/60000)*60000;
  assert.equal(parseOkxTrMinuteCandles({code:'0',data:[candle(t),candle(t+60000)]},now).length,2);
  assert.throws(()=>parseOkxTrMinuteCandles({code:'0',data:[candle(t),candle(t+120000)]},now));
});
test('parse read-only order book with valid spread',()=>{
  const ts=Date.now();
  const book={code:'0',data:[{ts:String(ts),bids:[['99','2']],asks:[['101','3']]}]};
  assert.equal(parseOkxTrBook(book,ts).bid,99);
  assert.throws(()=>parseOkxTrBook({code:'0',data:[{ts:String(ts),bids:[['102','2']],asks:[['101','3']]}]},ts));
});

test('reject stale and future OKX TR order book snapshots',()=>{
  const now=1760000400000;
  const row=ts=>({code:'0',data:[{ts:String(ts),bids:[['99','2']],asks:[['101','3']]}]});
  assert.equal(parseOkxTrBook(row(now-2000),now).time,now-2000);
  assert.throws(()=>parseOkxTrBook(row(now-6000),now));
  assert.throws(()=>parseOkxTrBook(row(now+2000),now));
});

test('reject zero depth and numeric overflow in OKX TR order book',()=>{
  const now=1760000400000;
  const book=(bidSize,askSize)=>({code:'0',data:[{ts:String(now),bids:[['99',bidSize]],asks:[['101',askSize]]}]});
  assert.throws(()=>parseOkxTrBook(book('0','0'),now),/depth/);
  assert.throws(()=>parseOkxTrBook(book('1e308','1e308'),now),/overflow/);
});
