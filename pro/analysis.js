import { DEFAULTS, settings } from './config.js';
import { closedBars, contiguous } from './candles.js';
export const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
export function ema(values, period) {
  if (values.length < period) return [];
  let value = mean(values.slice(0, period)); const out = [value], k = 2 / (period + 1);
  for (const x of values.slice(period)) { value += (x - value) * k; out.push(value); }
  return out;
}
export function indicators(bars) {
  const prices = bars.map(c => c.close), n = prices.length;
  const ema9 = ema(prices, 9).at(-1) ?? null, ema21 = ema(prices, 21).at(-1) ?? null;
  let rsi14 = null;
  if (n >= 15) {
    const delta = prices.slice(1).map((p, i) => p - prices[i]);
    let gain = mean(delta.slice(0, 14).map(x => Math.max(0, x))), loss = mean(delta.slice(0, 14).map(x => Math.max(0, -x)));
    for (const d of delta.slice(14)) { gain = (gain * 13 + Math.max(0, d)) / 14; loss = (loss * 13 + Math.max(0, -d)) / 14; }
    rsi14 = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  }
  const fast = ema(prices, 12), slow = ema(prices, 26);
  const line = slow.map((v, i) => fast[i + 14] - v), signal = ema(line, 9).at(-1) ?? null;
  const macd = { line: line.at(-1) ?? null, signal, histogram: signal === null ? null : line.at(-1) - signal };
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const average = returns.length ? mean(returns) : 0;
  const prior = bars.slice(0, -1);
  return { ema9, ema21, rsi14, macd,
    trend: ema9 !== null && ema21 !== null ? (ema9 > ema21 ? 'YUKARI' : ema9 < ema21 ? 'AŞAĞI' : 'YATAY') : 'BİLİNMİYOR',
    volatilityPct: returns.length ? Math.sqrt(mean(returns.map(x => (x - average) ** 2))) * 100 : null,
    support: prior.length ? Math.min(...prior.map(c => c.low)) : null,
    resistance: prior.length ? Math.max(...prior.map(c => c.high)) : null };
}

export function analyze({ seconds, minutes, book = null, now = Date.now(), config = DEFAULTS }) {
  config = settings(config);
  const unavailable = reason => ({ ready: false, category: 'KOŞULLAR SAĞLANMIYOR', score: null, reason });
  let s, m;
  try { s = closedBars(seconds, 1000, now).slice(-300); } catch (e) { return unavailable(e.message); }
  const end = Math.floor(now / 1000) * 1000;
  if (s.length !== 300 || !contiguous(s, 1000) || s.at(-1).time !== end - 1000) return unavailable('300 güncel ve ardışık kapalı saniye gerekli');
  const start = s[0].time;
  try { m = closedBars(minutes, 60000, start).slice(-30); } catch (e) { return unavailable(e.message); }
  if (m.length !== 30 || !contiguous(m, 60000) || m.at(-1).time + 60000 !== Math.floor(start / 60000) * 60000) return unavailable('300 saniye penceresinden önce 30 ardışık kapalı dakika gerekli');
  if (now - (s.at(-1).last ?? s.at(-1).time + 999) > config.staleMs) return unavailable('İşlem verisi eski');
  const recentMean = mean(s.map(c => c.close)), referenceMean = mean(m.map(c => c.close));
  const gainPct = (recentMean / referenceMean - 1) * 100;
  const actualChangePct = (s.at(-1).close / s[0].open - 1) * 100;
  const quoteVolume = s.reduce((v, c) => v + c.quoteVolume, 0);
  const baselinePerSecond = m.reduce((v, c) => v + c.quoteVolume, 0) / 1800;
  const volumeRatio = baselinePerSecond > 0 ? (quoteVolume / 300) / baselinePerSecond : null;
  const hasPressure = s.every(c => Number.isFinite(c.buyQuote) && c.buyQuote >= 0 && c.buyQuote <= c.quoteVolume);
  const buyShare = hasPressure && quoteVolume > 0 ? s.reduce((v, c) => v + c.buyQuote, 0) / quoteVolume : null;
  const technical = indicators(s);
  const bookFresh = book && Number.isSafeInteger(book.time) && book.time <= now && now - book.time <= config.staleMs &&
    Number.isFinite(book.bid) && Number.isFinite(book.ask) && book.bid > 0 && book.ask >= book.bid;
  const spreadPct = bookFresh ? (book.ask - book.bid) / ((book.ask + book.bid) / 2) * 100 : null;
  const depthQuote = bookFresh && Number.isFinite(book.depthQuote) && book.depthQuote > 0 ? book.depthQuote : null;
  const pricePass = gainPct + 1e-10 >= config.thresholdPct;
  const volumePass = !config.volumeFilter || (volumeRatio !== null && volumeRatio >= config.minVolumeRatio);
  // Price-derived metrics form ONE evidence group; EMA, RSI and MACD never count independently.
  const groups = {
    price: pricePass,
    volume: volumeRatio !== null && volumeRatio >= config.minVolumeRatio,
    orderFlow: buyShare !== null && buyShare >= config.minBuyShare,
    liquidity: spreadPct !== null && spreadPct <= config.maxSpreadPct && depthQuote !== null,
  };
  const independentGroups = Object.values(groups).filter(Boolean).length;
  const eligible = pricePass && volumePass;
  const category = !eligible ? 'KOŞULLAR SAĞLANMIYOR' :
    independentGroups >= config.minIndependentGroups && groups.liquidity ? 'ÇOKLU TEYİT' : 'YAKINDAN TAKİP';
  return { ready: true, category, score: Object.values(groups).filter(Boolean).length * 25,
    scoreMeaning: 'Teknik koşul puanı; kazanç olasılığı değildir',
    price: s.at(-1).close, gainPct, actualChangePct, referenceMean, recentMean,
    windowStart: start, windowEnd: end, referenceEnd: m.at(-1).time + 60000,
    quoteVolume, volumeRatio, buyShare, spreadPct, depthQuote, groups, independentGroups,
    indicators: { ...technical, breakout: s.at(-1).close > technical.resistance },
    risk: spreadPct === null || spreadPct > config.maxSpreadPct || depthQuote === null ? 'YÜKSEK / LİKİDİTE BELİRSİZ' : 'ÖLÇÜLEN · FİYAT RİSKİ SÜRER',
    observedAt: now };
}
