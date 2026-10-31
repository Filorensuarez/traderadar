import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULTS } from './config.js';
export const HORIZONS = [1, 3, 5, 10, 15, 30, 60];
// Calendar weeks start Monday 00:00 Europe/Istanbul (UTC+3); historical weeks remain stored.
export function weekOf(time) {
  const d = new Date(time + 3 * 3600000);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export function netMove(grossPct, { commissionPct, slippagePct }, spreadPct) {
  if (!Number.isFinite(spreadPct)) return null;
  return ((1 + grossPct / 100) * (1 - slippagePct / 100) * (1 - spreadPct / 200) * (1 - commissionPct / 100) /
    ((1 + slippagePct / 100) * (1 + spreadPct / 200) * (1 + commissionPct / 100)) - 1) * 100;
}
export class History {
  constructor(file = ':memory:') {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS signals(id TEXT PRIMARY KEY, symbol TEXT NOT NULL, time INTEGER NOT NULL, week TEXT NOT NULL, complete INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS signal_weeks ON signals(week,time);
      CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, time INTEGER NOT NULL, symbol TEXT NOT NULL, category TEXT NOT NULL);`);
    this.pending = new Map(this.db.prepare('SELECT id,body FROM signals WHERE complete=0').all().map(x => [x.id, JSON.parse(x.body)]));
    this.dirty = new Map();
    this.lastFlush = 0;
  }
  loadSettings() { const r = this.db.prepare('SELECT body FROM config WHERE id=1').get(); return r ? JSON.parse(r.body) : { ...DEFAULTS }; }
  saveSettings(value) { this.db.prepare('INSERT OR REPLACE INTO config VALUES(1,?)').run(JSON.stringify(value)); }
  put(row) { this.db.prepare('INSERT OR REPLACE INTO signals VALUES(?,?,?,?,?,?)').run(row.id, row.symbol, row.time, weekOf(row.time), Number(row.complete), JSON.stringify(row)); }
  record(symbol, result, config, now) {
    // One active signal episode per symbol. Repeated scans cannot inflate the sample.
    const existing = [...this.pending.values()].find(x => x.symbol === symbol && now < x.time + 3600000);
    if (existing) return existing;
    const id = `${symbol}:${now}`;
    const row = { id, symbol, time: now, price: result.price, category: result.category, score: result.score,
      config: { ...config }, spreadPct: result.spreadPct, maxPrice: result.price, minPrice: result.price,
      maxFavorablePct: 0, maxAdversePct: 0, targetAt: null, complete: false,
      lastEnd: now, coverage: true, checkpoints: {}, outcome: 'PENDING',
      currentPrice: result.price, confirmedIndicators: result.groups };
    this.pending.set(id, row); this.put(row);
    this.notify(id, symbol, row.category, now);
    return row;
  }
  notify(id, symbol, category, time) {
    if (category !== 'ÇOKLU TEYİT') return;
    this.db.prepare('INSERT OR IGNORE INTO notifications VALUES(?,?,?,?)').run(id, time, symbol, category);
  }
  observe(symbol, bar) {
    const end = bar.time + 1000;
    for (const row of this.pending.values()) {
      if (row.symbol !== symbol || end <= row.time || bar.time < row.time || end <= row.lastEnd) continue;
      if (end > row.time + 3600000) continue;
      if (bar.time !== row.lastEnd) row.coverage = false;
      row.lastEnd = end;
      row.maxPrice = Math.max(row.maxPrice, bar.high); row.minPrice = Math.min(row.minPrice, bar.low);
      row.maxFavorablePct = (row.maxPrice / row.price - 1) * 100;
      row.maxAdversePct = (row.minPrice / row.price - 1) * 100;
      row.currentPrice = bar.close;
      if (row.targetAt === null && end <= row.time + row.config.horizonMinutes * 60000 && (bar.high / row.price - 1) * 100 + 1e-10 >= row.config.targetPct) row.targetAt = end;
      for (const m of HORIZONS) {
        if (end === row.time + m * 60000) {
          const grossPct = (bar.close / row.price - 1) * 100;
          row.checkpoints[m] = { time: end, grossPct, netPct: netMove(grossPct, row.config, row.spreadPct),
            coverage: row.coverage, commissionPctPerSide: row.config.commissionPct,
            slippagePctPerSide: row.config.slippagePct, spreadPct: row.spreadPct };
        }
      }
      if (end === row.time + row.config.horizonMinutes * 60000) {
        row.outcome = row.coverage ? (row.targetAt !== null ? 'SUCCESS' : 'FAILED') : 'INSUFFICIENT_DATA';
        row.timeToTargetMs = row.targetAt === null ? null : row.targetAt - row.time;
      }
      if (end === row.time + 3600000) { row.complete = true; this.pending.delete(row.id); }
      this.dirty.set(row.id, row);
    }
  }
  expire(now) {
    for (const row of this.pending.values()) if (now >= row.time + 3600000 + 5000) {
      row.complete = true;
      if (row.outcome === 'PENDING') row.outcome = 'INSUFFICIENT_DATA';
      row.coverage = false; this.put(row); this.pending.delete(row.id);
    }
  }
  flush() {
    if (!this.dirty.size) return;
    this.db.exec('BEGIN');
    try { for (const row of this.dirty.values()) this.put(row); this.db.exec('COMMIT'); this.dirty.clear(); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  liveStatus(symbol, result) {
    for (const row of this.pending.values()) if (row.symbol === symbol) {
      const status = !result?.ready ? 'VERİ KULLANILAMIYOR' : result.category;
      if (row.liveStatus !== status) { row.liveStatus = status; this.dirty.set(row.id, row); }
    }
  }
  list(limit = 100, before = Number.MAX_SAFE_INTEGER) {
    this.flush();
    return this.db.prepare('SELECT body FROM signals WHERE time < ? ORDER BY time DESC,id DESC LIMIT ?').all(before, limit).map(x => JSON.parse(x.body));
  }
  notifications() { return this.db.prepare('SELECT * FROM notifications ORDER BY time DESC LIMIT 100').all(); }
  reports() {
    this.flush();
    const reports = this.db.prepare(`SELECT week, json_extract(body,'$.config.targetPct') targetPct,
      json_extract(body,'$.config.horizonMinutes') horizonMinutes,
      json_extract(body,'$.config.minimumSample') minimumSample,
      COUNT(*) total,
      SUM(json_extract(body,'$.outcome')='SUCCESS') wins,
      SUM(json_extract(body,'$.outcome')='FAILED') failed,
      SUM(json_extract(body,'$.outcome')='INSUFFICIENT_DATA') insufficient,
      SUM(json_extract(body,'$.outcome')='PENDING') pending
      FROM signals GROUP BY week,targetPct,horizonMinutes,minimumSample ORDER BY week DESC`).all();
    return reports.map(r => ({ ...r, evaluated: r.wins + r.failed,
      sampleRatePct: r.wins + r.failed ? r.wins / (r.wins + r.failed) * 100 : null,
      reliable: r.wins + r.failed >= r.minimumSample, calibratedProbability: null,
      definition: `${r.horizonMinutes} dakika içinde brüt +%${r.targetPct}; maliyetler ayrı` }));
  }
  close() { this.flush(); this.db.close(); }
}
