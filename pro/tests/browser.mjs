import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createApp } from '../server.js';
import { ProEngine } from '../engine.js';
import { History } from '../history.js';
import { analyze } from '../analysis.js';
import { fixture } from './helpers.js';
import { existsSync } from 'node:fs';

const history = new History(), engine = new ProEngine(history);
const server = createApp(engine).listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
const errors = [];
try {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath());
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForSelector('#setting-fields input');
  assert.match(await page.locator('#confirmed').textContent(), /sinyal yok/);
  await page.locator('[name=thresholdPct]').fill('3'); await page.getByRole('button', { name: 'Ayarları kaydet' }).click();
  await page.waitForFunction(() => document.querySelector('#settings-note').textContent.includes('kaydedildi'));
  assert.equal(engine.config.thresholdPct, 3);
  const now = Math.floor(Date.now() / 60000) * 60000;
  const f = fixture(now), r = analyze({ ...f, book: { bid: 101.99, ask: 102.01, depthQuote: 10000, time: now } });
  // Explicit UI-only fixtures; no synthetic data is inserted into the running application or its database.
  await page.route('**/api/pro/status', route => {
    const status = engine.snapshot();
    status.rows = [{ ...r, symbol: 'BTC_TRY', source: 'UI TEST FIXTURE', signalTime: now, signalPrice: 102 },
      { ...r, category: 'YAKINDAN TAKİP', symbol: 'ETH_TRY', source: 'UI TEST FIXTURE', signalTime: now, signalPrice: 102 }];
    return route.fulfill({ json: status });
  });
  await page.waitForSelector('#confirmed .card');
  assert.equal(await page.locator('#confirmed .card').count(), 1);
  assert.equal(await page.locator('#watch .card').count(), 1);
  await page.locator('#search').fill('ETH'); assert.equal(await page.locator('#confirmed .card').count(), 0);
  assert.equal(await page.locator('#watch .card').count(), 1);
  await page.locator('#search').fill('');
  await page.route('**/api/pro/chart?*', route => route.fulfill({ json: { symbol: 'BTC_TRY', source: 'UI TEST FIXTURE', bars: f.seconds, now } }));
  await page.locator('#chart-symbol').fill('BTC_TRY'); await page.locator('#load-chart').click();
  await page.waitForFunction(() => document.querySelector('#chart-note').textContent.includes('300 gerçek'));
  await page.screenshot({ path: '/tmp/traderadar-pro-desktop.png', fullPage: true });
  const mobile = await browser.newPage({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(base); await mobile.waitForSelector('#setting-fields input');
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'Mobil sayfa yatay taşmamalı');
  await mobile.locator('a[href="#settings"]').click(); await mobile.locator('[name=volumeFilter]').check();
  await mobile.getByRole('button', { name: 'Ayarları kaydet' }).click();
  await mobile.waitForFunction(() => document.querySelector('#settings-note').textContent.includes('kaydedildi'));
  assert.equal(engine.config.volumeFilter, true);
  await mobile.screenshot({ path: '/tmp/traderadar-pro-mobile.png', fullPage: true });
  const native = await browser.newPage({ viewport: { width: 393, height: 851 }, userAgent: 'Chromium TradeRadarNative/1' });
  native.on('pageerror', e => errors.push(e.message));
  let nativeHttpCalls = 0;
  native.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/pro/')) nativeHttpCalls++; });
  await native.addInitScript(snapshot => {
    function request(path, method, body) {
      const name = path.split('?')[0];
      if (name === 'session') return JSON.stringify({ canEdit: true, csrf: '' });
      if (name === 'status') return JSON.stringify(snapshot);
      if (name === 'settings' && method === 'PATCH') { Object.assign(snapshot.config, JSON.parse(body)); return JSON.stringify(snapshot.config); }
      if (['history', 'reports', 'notifications'].includes(name)) return '[]';
      return JSON.stringify({ error: 'Fixture route unavailable' });
    }
    let active;
    const timer = setInterval(() => {
      active?.close(); const channel = new MessageChannel(); active = channel.port1;
      active.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'ready') { clearInterval(timer); return; }
        active.postMessage(JSON.stringify({ id: data.id, result: JSON.parse(request(data.path, data.method, data.body)) }));
      };
      window.postMessage(JSON.stringify({ type: 'TRADERADAR_NATIVE_PORT', version: 1 }), location.origin, [channel.port2]);
    }, 100);
  }, engine.snapshot());
  await native.goto(base); await native.waitForSelector('#setting-fields input');
  assert.match(await native.locator('#settings-note').textContent(), /Android cihazında/);
  assert.equal(await native.locator('#enable-notifications').isVisible(), false);
  assert.equal(nativeHttpCalls, 0, 'Native bridge UI must not request a server API');
  await native.locator('[name=thresholdPct]').fill('4'); await native.getByRole('button', { name: 'Ayarları kaydet' }).click();
  await native.waitForFunction(() => document.querySelector('#settings-note').textContent.includes('kaydedildi'));
  assert.equal(engine.config.thresholdPct, 3, 'Native fixture settings must not mutate the web backend');
  assert.deepEqual(errors, []);
  console.log('PASS: desktop, mobile 393px, filters/chart/settings and origin-bound message-port contract fixture without backend HTTP. No browser errors. Not an Android WebView/device test.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); history.close();
}
