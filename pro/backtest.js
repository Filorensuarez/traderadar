import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { analyze } from './analysis.js';
import { closedBars } from './candles.js';
import { DEFAULTS, settings } from './config.js';
import { netMove } from './history.js';

// Replay supplied historical observations. No random prices, no fitted thresholds,
// no probability estimates. Every feature sees only data available at signal time.
export function walkForward(dataset, config = DEFAULTS, evaluate = analyze) {
  config = settings(config);
  if (!dataset || dataset.kind !== 'historical-observations' || typeof dataset.source !== 'string' || !dataset.source.trim() ||
    !Array.isArray(dataset.seconds) || dataset.seconds.length < 3600 || !Array.isArray(dataset.minutes)) throw Error('Kaynak bilgili en az 3600 gerçek gözlemli saniye ve dakika verisi gerekli');
  const seconds = closedBars(dataset.seconds, 1000, Number.MAX_SAFE_INTEGER);
  const minutes = closedBars(dataset.minutes, 60000, Number.MAX_SAFE_INTEGER);
  const start = seconds[0].time, end = seconds.at(-1).time + 1000, duration = end - start;
  const bounds = [start, Math.floor((start + duration * 0.6) / 1000) * 1000, Math.floor((start + duration * 0.8) / 1000) * 1000, end];
  const horizon = config.horizonMinutes * 60000, all = [];
  for (let fold = 0; fold < 3; fold++) {
    const report = { period: ['TRAINING', 'VALIDATION', 'OUT_OF_SAMPLE'][fold], start: bounds[fold], end: bounds[fold + 1],
      signals: 0, wins: 0, failed: 0, incomplete: 0, nonExecutable: 0, netReturns: [], trades: [] };
    let nextSignalAt = 0;
    for (let i = 299; i < seconds.length; i++) {
      const now = seconds[i].time + 1000;
      // Purge outcome windows crossing a fold boundary; split by time, not shuffled rows.
      if (now < report.start || now + horizon > report.end || now < nextSignalAt) continue;
      const visible = seconds.slice(i - 299, i + 1), cutoff = visible[0].time;
      const reference = minutes.filter(c => c.time + 60000 <= cutoff).slice(-30);
      const book = (dataset.books || []).filter(b => b.time <= now).at(-1) ?? null;
      const result = evaluate({ seconds: visible, minutes: reference, book, now, config });
      if (!result.ready || result.category === 'KOŞULLAR SAĞLANMIYOR') continue;
      report.signals++; nextSignalAt = now + horizon;
      const future = seconds.slice(i + 1).filter(c => c.time < now + horizon);
      const full = future.length === horizon / 1000 && future.every((c, j) => c.time === now + j * 1000);
      if (!full) { report.incomplete++; continue; }
      const won = future.some(c => (c.high / result.price - 1) * 100 + 1e-10 >= config.targetPct);
      won ? report.wins++ : report.failed++;
      const grossPct = (future.at(-1).close / result.price - 1) * 100;
      // Exit liquidity is checked at the outcome time, separate from signal features.
      const exitTime = now + horizon;
      const exitBook = (dataset.books || []).filter(b => b.time <= exitTime && exitTime - b.time <= config.staleMs).at(-1);
      const executable = result.depthQuote !== null && result.depthQuote >= (dataset.notional ?? 1000) && exitBook &&
        Number.isFinite(exitBook.depthQuote) && exitBook.depthQuote >= (dataset.notional ?? 1000) && exitBook.bid > 0 && exitBook.ask >= exitBook.bid;
      let netPct = null;
      if (executable) {
        const exitSpread = (exitBook.ask - exitBook.bid) / ((exitBook.ask + exitBook.bid) / 2) * 100;
        netPct = netMove(grossPct, config, (result.spreadPct + exitSpread) / 2);
        report.netReturns.push(netPct);
      } else report.nonExecutable++;
      report.trades.push({ time: now, price: result.price, grossPct, netPct, won,
        volatilityPct: result.indicators.volatilityPct, trend: result.indicators.trend,
        maxFavorablePct: (Math.max(...future.map(c => c.high)) / result.price - 1) * 100,
        maxAdversePct: (Math.min(...future.map(c => c.low)) / result.price - 1) * 100 });
    }
    const evaluated = report.wins + report.failed;
    report.sampleRatePct = evaluated ? report.wins / evaluated * 100 : null;
    report.reliable = evaluated >= config.minimumSample;
    report.calibratedProbability = null;
    all.push(report);
  }
  return { kind: 'BACKTEST', source: dataset.source, provenance: 'Kullanıcı tarafından sağlandı; özgünlük bağımsız doğrulanmadı',
    config, folds: all, fittedParameters: false, leakageProtection: 'Kapalı mum, geçmiş özellikler, zaman sıralı %60/%20/%20 ve sınırda sonuç penceresi temizleme',
    limitations: 'İşlem defteri derinliği dolumu garanti etmez; ücret, spread ve kayma modellenir. Farklı piyasa rejimleri trade kayıtlarında ayrı değerlendirilmelidir. Canlı performansla birleştirilmez.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3]) throw Error('Kullanım: node pro/backtest.js gerçek-veri.json rapor.json');
  const dataset = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const result = walkForward(dataset);
  await writeFile(process.argv[3], JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log('Backtest raporu yazıldı; gerçek veri kaynağını ayrıca doğrulayın.');
}
