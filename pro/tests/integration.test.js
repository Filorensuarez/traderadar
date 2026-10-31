import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { createApp } from '../server.js';
import { History } from '../history.js';
import { ProEngine } from '../engine.js';
import { BinanceTrProvider } from '../provider.js';
import { TradeCandles } from '../candles.js';
import { NOW, fixture } from './helpers.js';
import express from 'express';
import { legacyStatic } from '../legacy-static.js';
import { readFileSync } from 'node:fs';

test('HTTP API, ayar kaydı, CSRF, girdi doğrulaması ve özel dosya güvenliği', async t => {
  const history = new History(), engine = new ProEngine(history);
  const server = createApp(engine).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); history.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = path => fetch(base + path);
  assert.equal((await get('/')).status, 200); assert.equal((await get('/api/pro/status')).status, 200);
  assert.equal((await get('/api/pro/history?limit=999999')).status, 400);
  assert.equal((await get('/api/pro/chart?symbol=https://evil.test')).status, 400);
  assert.equal((await get('/api/pro/chart?symbol=BTC_TRY')).status, 404);
  for (const path of ['/server.js', '/package.json', '/node_modules/express/package.json', '/data/signals.sqlite', '/.env']) assert.equal((await get(path)).status, 404);
  const { csrf } = await (await get('/api/pro/session')).json();
  const patch = (body, token = csrf, origin = base) => fetch(base + '/api/pro/settings', { method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Pro-CSRF': token, Origin: origin }, body: JSON.stringify(body) });
  assert.equal((await patch({ thresholdPct: 3 }, 'invalid')).status, 403);
  assert.equal((await patch({ thresholdPct: 3 }, csrf, 'https://evil.test')).status, 403);
  assert.equal((await patch({ unknown: 1 })).status, 400);
  assert.equal((await patch({ thresholdPct: 3 })).status, 200);
  assert.equal(history.loadSettings().thresholdPct, 3);
  assert((await get('/')).headers.get('content-security-policy').includes("frame-ancestors 'none'"));
});
test('gerçek yerel WebSocket handshake ve trade aktarımı; internet kaynağıyla karıştırılmaz', async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const provider = new BinanceTrProvider({
    fetchFn: async () => new Response(JSON.stringify({ code: 0, data: { list: [{ symbol: 'BTC_TRY', baseAsset: 'BTC', quoteAsset: 'TRY', type: 1, status: 'TRADING', spotTradingEnable: true }] } })),
    socketFactory: () => new WebSocket(url),
  });
  t.after(() => { provider.stop(); for (const s of server.clients) s.terminate(); server.close(); });
  const tradeReceived = new Promise(resolve => { provider.onTrade = resolve; });
  server.on('connection', ws => ws.send(JSON.stringify({ data: { e: 'trade', s: 'BTCTRY', t: 1, T: Date.now(), p: '100', q: '1', m: false } })));
  await provider.start();
  const market = await Promise.race([tradeReceived, new Promise((_, reject) => { const timeout = setTimeout(() => reject(Error('WebSocket trade timeout')), 3000); timeout.unref(); })]);
  assert.equal(market.symbol, 'BTC_TRY'); assert.equal(provider.snapshot().receivedTrades, 1);
});
test('tarama motoru 1000 pariteyi kesmeden işler, gecikmeyi ölçer ve bayat sinyali çıkarır', () => {
  const h = new History();
  const p = { markets: new Map(), feeds: new Map(), snapshot: () => ({ fresh: true }) };
  const e = new ProEngine(h, p), f = fixture();
  for (let i = 0; i < 1000; i++) {
    const symbol = `COIN${i}_TRY`, feed = new TradeCandles(); feed.connect(NOW - 400000);
    for (const c of f.seconds) feed.bars.set(c.time, c);
    p.markets.set(symbol, { symbol, base: `COIN${i}` }); p.feeds.set(symbol, feed); e.minuteCache.set(symbol, { bars: f.minutes, at: NOW });
  }
  e.tick(NOW); const status = e.snapshot(NOW);
  assert.equal(status.rows.length, 1000); assert.equal(status.metrics.evaluated, 1000);
  assert(status.metrics.lastScanMs < 10000); console.log(JSON.stringify({ benchmark: '1000 synthetic-fixture markets, not live latency', elapsedMs: status.metrics.lastScanMs, rssMiB: process.memoryUsage().rss / 1048576 }));
  assert.equal(e.snapshot(NOW + 10000).rows.length, 0); h.close();
});
test('eski panel statik varlıkları korunur; depo, push kayıtları ve sunucu kaynakları sunulmaz', async t => {
  const app = express(); app.use(legacyStatic(process.cwd()));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const html = readFileSync('index.html', 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)].map(m => m[1]);
  for (const path of [...assets, 'service-worker.js', 'momentum-visibility.js', 'bist-radar.js']) assert.equal((await fetch(base + '/' + path)).status, 200, path);
  for (const path of ['package.json', 'server.js', 'daily-signal-history.json', 'subscriptions.json', 'node_modules/express/package.json', 'data/history.json', 'pro/server.js']) assert.equal((await fetch(base + '/' + path)).status, 404, path);
});
