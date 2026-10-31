import test from 'node:test';
import assert from 'node:assert/strict';
import { walkForward } from '../backtest.js';
import { settings } from '../config.js';
import { NOW, bar } from './helpers.js';
test('walk-forward yalnız geçmiş kapalı veriyi görür; ayrık dönemler ve boş örnek oranı', () => {
  const seconds = Array.from({ length: 4000 }, (_, i) => bar(NOW + i * 1000));
  const minutes = Array.from({ length: 150 }, (_, i) => bar(NOW - 40 * 60000 + i * 60000));
  let called = 0;
  const r = walkForward({ kind: 'historical-observations', source: 'SYNTHETIC TEST FIXTURE ONLY', seconds, minutes }, settings({ horizonMinutes: 1 }), input => {
    called++; assert(input.seconds.every(c => c.time + 1000 <= input.now));
    assert(input.minutes.every(c => c.time + 60000 <= input.seconds[0].time));
    return { ready: false };
  });
  assert(called > 0); assert.equal(r.folds.length, 3); assert.equal(r.folds[0].end, r.folds[1].start);
  for (const fold of r.folds) { assert.equal(fold.sampleRatePct, null); assert.equal(fold.reliable, false); }
  assert.equal(r.fittedParameters, false);
});
test('gerçek kaynak bilgisi olmadan örnek başarı oranı üretilmez', () => {
  assert.throws(() => walkForward({ seconds: [], minutes: [] }), /Kaynak/);
});
test('sonuç pencereleri dönemler arasında sızmaz; işlem defteri yoksa net getiri uydurulmaz', () => {
  const seconds = Array.from({ length: 4000 }, (_, i) => bar(NOW + i * 1000, 102));
  const minutes = Array.from({ length: 150 }, (_, i) => bar(NOW - 40 * 60000 + i * 60000, 100));
  const r = walkForward({ kind: 'historical-observations', source: 'SYNTHETIC TEST FIXTURE ONLY', seconds, minutes }, settings({ horizonMinutes: 1 }));
  assert(r.folds.some(f => f.signals > 0));
  for (const f of r.folds) {
    for (const trade of f.trades) assert(trade.time + 60000 <= f.end);
    assert.equal(f.netReturns.length, 0); assert.equal(f.nonExecutable, f.wins + f.failed);
  }
});
