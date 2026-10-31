// Never carry a close forward into a second in which no trade was observed.
// Disconnects invalidate continuity even if later trades fill the same second.
export class TradeCandles {
  constructor({ retentionMs = 40 * 60000 } = {}) {
    this.retentionMs = retentionMs;
    this.bars = new Map();
    this.ids = new Map();
    this.lastTradeAt = 0;
    this.rejected = 0;
    this.continuousSince = null;
  }
  connect(now) { this.continuousSince = now; }
  disconnect() { this.continuousSince = null; }
  add(trade, now = Date.now()) {
    const { id, time, price, quantity, buy } = trade;
    if (!['string', 'number'].includes(typeof id) || !String(id).length ||
      !Number.isSafeInteger(time) || time < now - this.retentionMs || time > now + 1000 ||
      !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 ||
      typeof buy !== 'boolean') { this.rejected++; return false; }
    if (this.ids.has(String(id))) return false;
    this.ids.set(String(id), time);
    const key = Math.floor(time / 1000) * 1000;
    const bar = this.bars.get(key) || { time: key, open: price, high: price, low: price, close: price,
      volume: 0, quoteVolume: 0, buyQuote: 0, trades: 0, first: time, last: time, firstId: String(id), lastId: String(id) };
    // Timestamp ties use numeric trade IDs; ordering is deterministic across deliveries.
    const compareId = (a, b) => /^\d+$/.test(a) && /^\d+$/.test(b) ? (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0) : a.localeCompare(b);
    if (time < bar.first || (time === bar.first && compareId(String(id), bar.firstId) < 0)) { bar.open = price; bar.first = time; bar.firstId = String(id); }
    if (time > bar.last || (time === bar.last && compareId(String(id), bar.lastId) > 0)) { bar.close = price; bar.last = time; bar.lastId = String(id); }
    bar.high = Math.max(bar.high, price); bar.low = Math.min(bar.low, price);
    bar.volume += quantity; bar.quoteVolume += price * quantity;
    bar.buyQuote += buy ? price * quantity : 0; bar.trades++;
    this.bars.set(key, bar); this.lastTradeAt = Math.max(time, this.lastTradeAt);
    return true;
  }
  prune(now) {
    for (const [key] of this.bars) if (key < now - this.retentionMs) this.bars.delete(key);
    for (const [id, time] of this.ids) if (time < now - this.retentionMs) this.ids.delete(id);
  }
  seconds(now = Date.now(), count = 300) {
    this.prune(now);
    const end = Math.floor(now / 1000) * 1000, start = end - count * 1000;
    if (this.continuousSince === null || this.continuousSince > start) return { ready: false, reason: 'Kesintisiz akış ısınması gerekli', bars: [] };
    const bars = [];
    for (let time = start; time < end; time += 1000) {
      const bar = this.bars.get(time);
      if (!bar) return { ready: false, reason: 'İşlemsiz veya eksik saniye; mum üretilmedi', bars: [] };
      bars.push({ ...bar });
    }
    return { ready: true, bars };
  }
}

export function closedBars(raw, intervalMs, now) {
  if (!Array.isArray(raw)) throw Error('Mum dizisi gerekli');
  const map = new Map();
  for (const c of raw) {
    if (!c || !Number.isSafeInteger(c.time) || c.time % intervalMs !== 0 || c.time + intervalMs > now) continue;
    if (![c.open, c.high, c.low, c.close, c.volume, c.quoteVolume].every(Number.isFinite) ||
      Math.min(c.open, c.high, c.low, c.close) <= 0 || c.high < Math.max(c.open, c.close) ||
      c.low > Math.min(c.open, c.close) || c.high < c.low || c.volume < 0 || c.quoteVolume < 0) throw Error('Geçersiz OHLCV');
    if (map.has(c.time) && JSON.stringify(map.get(c.time)) !== JSON.stringify(c)) throw Error('Çelişkili tekrar mum');
    map.set(c.time, c);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}
export function contiguous(bars, ms) { return bars.every((b, i) => i === 0 || b.time - bars[i - 1].time === ms); }
