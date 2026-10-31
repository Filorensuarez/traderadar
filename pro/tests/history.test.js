import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { History, weekOf, netMove } from '../history.js';
import { DEFAULTS, settings } from '../config.js';
import { NOW, bar } from './helpers.js';
const result = { price: 100, category: 'ÇOKLU TEYİT', score: 75, spreadPct: 0.1, groups: { price: true } };
test('yedi zaman aralığı, hedef süresi ve maliyetler gerçek gözlemle kaydedilir', () => {
  const h = new History(); h.record('BTC_TRY', result, DEFAULTS, NOW);
  for (let i = 0; i < 3600; i++) h.observe('BTC_TRY', bar(NOW + i * 1000, i >= 59 ? 103 : 100));
  const row = h.list()[0]; assert.equal(Object.keys(row.checkpoints).length, 7); assert.equal(row.outcome, 'SUCCESS');
  assert.equal(row.timeToTargetMs, 60000); assert.equal(row.maxFavorablePct.toFixed(2), '3.00');
  assert(row.checkpoints[1].netPct < row.checkpoints[1].grossPct); assert.equal(h.notifications().length, 1); h.close();
});
test('eksik gözlem başarısız sayılmaz; gecikmiş fiyat ölçüm yerine konmaz', () => {
  const h = new History(); h.record('A_TRY', result, DEFAULTS, NOW);
  h.observe('A_TRY', bar(NOW + 899000, 100)); h.expire(NOW + 3606000);
  const row = h.list()[0]; assert.equal(row.outcome, 'INSUFFICIENT_DATA'); assert.equal(row.checkpoints[1], undefined);
  assert.equal(h.reports()[0].sampleRatePct, null); h.close();
});
test('aynı sinyal tek örnek ve tek alarm; ayar değişiklikleri geçmiş tanımı değiştirmez', () => {
  const h = new History(); const row = h.record('A_TRY', result, DEFAULTS, NOW);
  assert.equal(h.record('A_TRY', result, DEFAULTS, NOW + 1000).id, row.id);
  h.saveSettings(settings({ targetPct: 5 })); h.notify(row.id, 'A_TRY', 'ÇOKLU TEYİT', NOW + 1000);
  assert.equal(h.list().length, 1); assert.equal(h.list()[0].config.targetPct, 2); assert.equal(h.notifications().length, 1); h.close();
});
test('haftalık sınır İstanbul pazartesi; geçmiş haftalar ve SQLite yeniden başlatma korunur', () => {
  assert.equal(weekOf(Date.UTC(2026, 10, 1, 20, 59)), '2026-10-26');
  assert.equal(weekOf(Date.UTC(2026, 10, 1, 21)), '2026-11-02');
  const dir = mkdtempSync(join(tmpdir(), 'pro-history-')), file = join(dir, 'db.sqlite');
  let h = new History(file); h.record('A_TRY', result, DEFAULTS, NOW); h.record('B_TRY', result, DEFAULTS, NOW + 7 * 86400000); h.close();
  h = new History(file); assert.equal(h.list().length, 2); assert.equal(h.reports().length, 2); assert.equal(h.pending.size, 2); h.close(); rmSync(dir, { recursive: true });
});
test('başarı örnek yüzdesi olasılık değildir; maliyet eksikliği sıfıra dönüştürülmez', () => {
  assert.equal(netMove(2, DEFAULTS, null), null);
  assert(netMove(0, DEFAULTS, 0.1) < -0.4);
  const h = new History(); h.record('A_TRY', result, DEFAULTS, NOW);
  assert.equal(h.reports()[0].reliable, false); assert.equal(h.reports()[0].calibratedProbability, null); h.close();
});
