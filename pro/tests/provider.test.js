import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BinanceTrProvider, discoverMarkets, parseTrade, parseBook, safeError } from '../provider.js';
import { NOW } from './helpers.js';

const catalog = n => ({ code: 0, data: { list: Array.from({ length: n }, (_, i) => ({ symbol: `COIN${i}_TRY`, quoteAsset: 'TRY', baseAsset: `COIN${i}`, status: 'TRADING', spotTradingEnable: true, type: 1 })) } });
test('tüm aktif spot pariteler keşfedilir; sabit coin limiti ve sabit parite yok', () => {
  const data = catalog(1400); data.data.list.push({ ...data.data.list[0], symbol: 'DEAD_TRY', baseAsset: 'DEAD', status: 'BREAK' });
  assert.equal(discoverMarkets(data).length, 1400);
  delete data.data.list[0].status; assert.equal(discoverMarkets(data).length, 1399);
  assert.throws(() => discoverMarkets({ code: 0, data: [] }));
});
test('gerçek trade şeması ve zaman damgası doğrulanır; alış yönü uydurulmaz', () => {
  const event = { e: 'trade', s: 'BTCTRY', t: 4, T: NOW - 100, p: '100', q: '2', m: false };
  assert.equal(parseTrade(event, NOW).buy, true);
  for (const patch of [{ T: NOW + 2000 }, { T: NOW - 40000 }, { m: undefined }, { p: 'Infinity' }, { q: '0' }]) assert.throws(() => parseTrade({ ...event, ...patch }, NOW));
});
test('WebSocket abonelikleri bütün evreni kapsar; tekrar bağlantı ısınmayı sıfırlar', async () => {
  const sockets = [];
  const p = new BinanceTrProvider({ verified: true, fetchFn: async () => new Response(JSON.stringify(catalog(161))), clock: () => NOW,
    socketFactory: url => { const s = new EventEmitter(); s.url = url; s.readyState = 1; s.terminate = () => s.emit('close'); s.ping = () => s.emit('pong'); sockets.push(s); return s; } });
  await p.start(); assert.equal(sockets.length, 3); assert.equal(p.markets.size, 161);
  for (const s of sockets) s.emit('open');
  sockets[0].emit('message', JSON.stringify({ data: { e: 'trade', s: 'COIN0TRY', t: 1, T: NOW - 10, p: '100', q: '1', m: false } }));
  assert.equal(p.snapshot().receivedTrades, 1); assert.equal(p.feeds.get('COIN0_TRY').lastTradeAt, NOW - 10);
  sockets[0].emit('close'); assert.equal(p.feeds.get('COIN0_TRY').continuousSince, null); p.stop();
});
test('merkezi istek önbelleği eşzamanlı indirmeyi birleştirir; 429 tekrar deneme süresine uyar', async () => {
  let count = 0;
  const p = new BinanceTrProvider({ fetchFn: async () => { count++; return new Response('{"ok":true}'); } }); p.stopped = false;
  await Promise.all([p.request('https://example.test/'), p.request('https://example.test/')]); assert.equal(count, 1);
  await p.request('https://example.test/'); assert.equal(count, 1); p.stop();
  const limited = new BinanceTrProvider({ clock: () => NOW, fetchFn: async () => new Response('{}', { status: 429, headers: { 'retry-after': '600' } }) }); limited.stopped = false;
  await assert.rejects(limited.request('https://example.test/')); assert.equal(limited.state.waitUntil, NOW + 600000); limited.stop();
});
test('hata kayıtları proxy parolalarını ve ham uzak yanıtı ifşa etmez', () => {
  assert(!safeError(Error('https://user:secret@proxy/?token=abc')).includes('secret'));
});
test('emir defteri spread ve iki yönlü derinliği doğrular; bulunmayan likidite sıfırla taklit edilmez', () => {
  const body = { code: 0, data: { bids: [['99', '2']], asks: [['101', '3']] } };
  assert.equal(parseBook(body, NOW).depthQuote, 198); assert.equal(parseBook(body, NOW).bid, 99);
  assert.throws(() => parseBook({ code: 0, data: { bids: [], asks: [] } }, NOW));
  assert.throws(() => parseBook({ code: 0, data: { bids: [['102', '2']], asks: [['101', '1']] } }, NOW));
});
test('resmî sözleşme doğrulanmadan üretim adaptörü istek veya sahte sinyal üretmez', async () => {
  let calls = 0;
  const p = new BinanceTrProvider({ fetchFn: async () => { calls++; throw Error('must not fetch'); } });
  await p.start(); assert.equal(calls, 0); assert.equal(p.snapshot().adapterEnabled, false);
  assert.equal(p.snapshot().receivedTrades, 0); assert.match(p.snapshot().error, /doğrulanana kadar/); p.stop();
});
