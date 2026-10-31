import test from 'node:test';
import assert from 'node:assert/strict';
import { TradeCandles, closedBars } from '../candles.js';
import { analyze, indicators } from '../analysis.js';
import { settings } from '../config.js';
import { NOW, fixture, bar } from './helpers.js';

test('gerçek işlemlerden OHLC, hacim, taker baskısı, sıra ve tekrar kontrolü', () => {
  const f = new TradeCandles(); f.connect(NOW - 300000);
  const trade = (id, offset, price) => ({ id, time: NOW - 1000 + offset, price, quantity: 2, buy: true });
  assert(f.add(trade(3, 500, 103), NOW)); assert(f.add(trade(1, 100, 101), NOW)); assert(f.add(trade(2, 100, 102), NOW));
  assert.equal(f.add(trade(2, 100, 999), NOW), false);
  const c = f.bars.get(NOW - 1000); assert.equal(c.open, 101); assert.equal(c.close, 103); assert.equal(c.high, 103); assert.equal(c.volume, 6); assert.equal(c.buyQuote, 612);
  assert.equal(f.add({ ...trade(4, 800, 2), quantity: -1 }, NOW), false);
});
test('işlemsiz saniye doldurulmaz ve açık mum kapalı pencereye alınmaz', () => {
  const f = new TradeCandles(); f.connect(NOW - 400000);
  for (let i = 1; i <= 299; i++) f.add({ id: i, time: NOW - i * 1000, price: 100, quantity: 1, buy: false }, NOW);
  f.add({ id: 400, time: NOW, price: 900, quantity: 1, buy: false }, NOW);
  assert.equal(f.seconds(NOW).ready, false);
  f.add({ id: 300, time: NOW - 300000, price: 100, quantity: 1, buy: false }, NOW);
  assert.equal(f.seconds(NOW).ready, true); assert.equal(f.seconds(NOW).bars.at(-1).close, 100);
  f.disconnect(); assert.equal(f.seconds(NOW).ready, false);
  f.connect(NOW); assert.equal(f.seconds(NOW).ready, false);
});
test('%2 ortalama karşılaştırması ve 300 saniye gerçek değişimi farklı ölçülür', () => {
  const result = analyze(fixture()); assert(result.ready); assert(Math.abs(result.gainPct - 2) < 1e-8);
  assert.equal(result.actualChangePct, 0); assert.equal(result.category, 'YAKINDAN TAKİP'); assert.equal(result.spreadPct, null);
  assert.equal(result.referenceMean, 100); assert.equal(result.recentMean, 102);
});
test('referans dakikalar pencereyle örtüşmez; henüz kapanmayan mumlar dışarıda', () => {
  const f = fixture(NOW + 17000);
  f.minutes.push(bar(NOW - 240000, 9000)); f.seconds.push(bar(f.now, 9000));
  const r = analyze(f); assert(r.ready); assert.equal(r.referenceMean, 100); assert.equal(r.recentMean, 102);
  assert(r.referenceEnd <= r.windowStart);
});
test('eksik, eski, geçersiz ve çelişkili OHLC verisinden sinyal çıkmaz', () => {
  const f = fixture(); f.seconds.splice(100, 1); assert.equal(analyze(f).ready, false);
  const old = fixture(); old.now += 2000; assert.equal(analyze(old).ready, false);
  const bad = fixture(); bad.seconds[30].high = 1; assert.equal(analyze(bad).ready, false);
  const gap = fixture(); gap.minutes.splice(2, 1); assert.equal(analyze(gap).ready, false);
  assert.throws(() => closedBars([bar(NOW - 1000), bar(NOW - 1000, 101)], 1000, NOW), /Çelişkili/);
});
test('hacim filtresi varsayılan kapalı; oranlar aynı para birimi / saniyedir', () => {
  const f = fixture(); f.seconds.forEach(c => { c.quoteVolume = 0; c.buyQuote = 0; });
  assert.equal(analyze(f).category, 'YAKINDAN TAKİP');
  assert.equal(analyze({ ...f, config: settings({ volumeFilter: true }) }).category, 'KOŞULLAR SAĞLANMIYOR');
  assert.equal(analyze(fixture()).volumeRatio, 1);
});
test('fiyat göstergeleri tek kanıt grubu; taze spread/derinlik olmadan çoklu teyit yok', () => {
  const f = fixture(), r = analyze(f);
  assert.equal(r.groups.price, true); assert.equal(r.independentGroups, 2); assert.equal(r.category, 'YAKINDAN TAKİP');
  const book = { bid: 101.99, ask: 102.01, depthQuote: 10000, time: NOW };
  assert.equal(analyze({ ...f, book }).category, 'ÇOKLU TEYİT');
  assert.equal(analyze({ ...f, book: { ...book, time: NOW - 10000 } }).category, 'YAKINDAN TAKİP');
  assert.equal(analyze({ ...f, book: { ...book, time: NOW + 1000 } }).spreadPct, null);
});
test('RSI Wilder, EMA ve MACD sabit seride doğru; fiyat kırılımı gelecek mum kullanmaz', () => {
  const result = indicators(Array.from({ length: 100 }, (_, i) => bar(i * 1000)));
  assert.equal(result.ema9, 100); assert.equal(result.ema21, 100); assert.equal(result.rsi14, 50); assert.equal(result.macd.histogram, 0);
});
test('ayar doğrulaması NaN, metin sayılar, prototip ve geçersiz sınırları reddeder', () => {
  for (const patch of [{ thresholdPct: NaN }, { thresholdPct: '2' }, { volumeFilter: 1 }, { minIndependentGroups: 2.5 }, { targetPct: -1 }, { constructor: 1 }]) assert.throws(() => settings(patch));
  assert.equal(settings({ volumeFilter: true }).volumeFilter, true);
});
