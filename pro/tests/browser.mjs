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
  assert.deepEqual(errors, []);
  console.log('PASS: desktop empty state, settings, signal categories, search, real-data chart rendering; mobile 393px layout and settings; no browser errors. UI fixture data only.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); history.close();
}
