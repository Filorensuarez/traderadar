import { performance } from 'node:perf_hooks';
import { analyze } from './analysis.js';
import { settings } from './config.js';
import { BinanceTrProvider, safeError } from './provider.js';

export class ProEngine {
  constructor(history, provider = new BinanceTrProvider()) {
    this.history = history; this.provider = provider; this.config = settings(history.loadSettings());
    this.minuteCache = new Map(); this.results = new Map(); this.processed = new Map(); this.cursor = 0;
    this.metrics = { scans: 0, evaluated: 0, unavailable: 0, lastScanMs: null, p95ScanMs: null, lastScanAt: null, minuteError: null };
    this.durations = []; this.intervals = []; this.running = false; this.refreshing = false;
  }
  update(patch) { const config = settings(patch, this.config); this.history.saveSettings(config); this.config = config; this.results.clear(); return config; }
  async refreshMinute() {
    if (this.refreshing) return;
    const markets = [...this.provider.markets.values()].filter(x => x.streamAvailable);
    if (!markets.length) return;
    const market = markets[this.cursor++ % markets.length];
    if (Date.now() - (this.minuteCache.get(market.symbol)?.at ?? 0) < 30000) return;
    this.refreshing = true;
    try { const bars = await this.provider.minutes(market); this.minuteCache.set(market.symbol, { bars, at: Date.now() }); this.metrics.minuteError = null; }
    catch (e) { this.metrics.minuteError = safeError(e); }
    finally { this.refreshing = false; }
  }
  tick(now = Date.now()) {
    const start = performance.now(); let evaluated = 0, unavailable = 0;
    for (const symbol of this.minuteCache.keys()) if (!this.provider.markets.has(symbol)) this.minuteCache.delete(symbol);
    for (const symbol of this.results.keys()) if (!this.provider.markets.has(symbol)) { this.results.delete(symbol); this.processed.delete(symbol); }
    for (const market of this.provider.markets.values()) {
      const feed = this.provider.feeds.get(market.symbol);
      if (!feed) { this.results.set(market.symbol, { ready: false, reason: market.availability, category: 'KOŞULLAR SAĞLANMIYOR' }); unavailable++; continue; }
      const end = Math.floor(now / 1000) * 1000;
      const previous = this.processed.get(market.symbol) ?? end;
      // Replay only closed observed seconds since last tick; never substitute the latest price for a missed checkpoint.
      for (let time = Math.max(previous, end - 3600000); time < end; time += 1000) {
        const bar = feed.bars.get(time); if (bar) this.history.observe(market.symbol, bar);
      }
      this.processed.set(market.symbol, end);
      const window = feed.seconds(now);
      const result = window.ready ? analyze({ seconds: window.bars, minutes: this.minuteCache.get(market.symbol)?.bars ?? [], now, config: this.config }) :
        { ready: false, reason: window.reason, category: 'KOŞULLAR SAĞLANMIYOR' };
      this.results.set(market.symbol, result);
      this.history.liveStatus(market.symbol, result);
      if (result.ready) evaluated++; else unavailable++;
      if (result.ready && result.category !== 'KOŞULLAR SAĞLANMIYOR') {
        const row = this.history.record(market.symbol, result, this.config, end);
        if (result.category === 'ÇOKLU TEYİT') this.history.notify(row.id, market.symbol, result.category, now);
      }
    }
    this.history.expire(now);
    this.history.flush();
    const duration = performance.now() - start;
    this.durations.push(duration); if (this.durations.length > 300) this.durations.shift();
    const sorted = [...this.durations].sort((a, b) => a - b);
    Object.assign(this.metrics, { scans: this.metrics.scans + 1, evaluated, unavailable, lastScanMs: duration,
      p95ScanMs: sorted[Math.floor((sorted.length - 1) * 0.95)], lastScanAt: now });
  }
  snapshot(now = Date.now()) {
    const rows = [];
    for (const [symbol, result] of this.results) {
      if (!result.ready || result.category === 'KOŞULLAR SAĞLANMIYOR' || now - result.observedAt > this.config.staleMs ||
        this.provider.feeds.get(symbol)?.continuousSince === null) continue;
      const signal = [...this.history.pending.values()].find(x => x.symbol === symbol);
      rows.push({ ...result, symbol, coin: this.provider.markets.get(symbol)?.base, source: 'BINANCE TR',
        signalTime: signal?.time ?? result.observedAt, signalPrice: signal?.price ?? result.price });
    }
    return { now, running: this.running, source: this.provider.snapshot(), metrics: this.metrics,
      memoryBytes: process.memoryUsage().rss, rows, config: this.config,
      rejected: [...this.results].filter(([, r]) => !r.ready).map(([symbol, r]) => ({ symbol, reason: r.reason })),
      formula: '(ortalama(300 kapalı 1s kapanışı) / ortalama(pencere öncesi 30 kapalı 1m kapanışı) − 1) × 100',
      note: 'Analiz ve izleme; emir gönderilmez. Teknik koşul puanı kazanç olasılığı değildir. Canlı veriler backtest sonuçlarından ayrıdır.' };
  }
  chart(symbol, now = Date.now()) {
    if (!this.provider.markets.has(symbol)) return null;
    const feed = this.provider.feeds.get(symbol);
    return { symbol, source: 'BINANCE TR', interval: '1s', bars: feed ? [...feed.bars.values()].filter(x => x.time + 1000 <= now).sort((a, b) => a.time - b.time).slice(-300) : [],
      continuousSince: feed?.continuousSince ?? null, now };
  }
  async start() {
    if (this.running) return; this.running = true;
    const tick = setInterval(() => this.tick(), 1000), refresh = setInterval(() => void this.refreshMinute(), 350);
    tick.unref(); refresh.unref(); this.intervals.push(tick, refresh);
    await this.provider.start();
  }
  stop() { this.running = false; this.intervals.forEach(clearInterval); this.intervals = []; this.provider.stop(); }
}
