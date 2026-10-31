import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { TradeCandles } from './candles.js';

export const SOURCE = 'BINANCE TR';
// These routes exist in the legacy repository. Current official support MUST be
// revalidated before production; never silently fall back to Binance Global.
export const CATALOG = 'https://www.binance.tr/open/v1/common/symbols';
export function discoverMarkets(body) {
  if (body?.code !== 0 || !Array.isArray(body.data?.list)) throw Error('Binance TR katalog şeması doğrulanamadı');
  const result = new Map();
  for (const row of body.data.list) {
    const symbol = String(row.symbol || '').toUpperCase();
    const quote = String(row.quoteAsset || '').toUpperCase();
    const base = String(row.baseAsset || symbol.split('_')[0]).toUpperCase();
    // Unknown status is not proof of an active market. Explicit enablement is required.
    const enabled = row.spotTradingEnable === true || row.spotTradingEnable === 1;
    const active = row.status === 'TRADING' || row.status === 1 || row.status === '1';
    if (!enabled || !active || !/^[A-Z0-9]{1,24}$/.test(base) || !/^[A-Z0-9]{1,12}$/.test(quote) ||
      !new RegExp(`^${base}_?${quote}$`).test(symbol) || ![1, 3].includes(Number(row.type))) continue;
    const canonical = `${base}_${quote}`;
    if (result.has(canonical)) throw Error('Tekrarlı piyasa kimliği');
    result.set(canonical, { symbol: canonical, base, quote, type: Number(row.type),
      wireSymbol: Number(row.type) === 1 ? symbol.replaceAll('_', '') : canonical,
      streamAvailable: Number(row.type) === 1,
      availability: Number(row.type) === 1 ? 'ISINMA' : 'Bu piyasa türünün işlem akışı doğrulanmadı' });
  }
  if (!result.size) throw Error('Açık aktif/spot durumuyla doğrulanan piyasa yok; durum şemasını resmî dokümandan doğrulayın');
  return [...result.values()];
}
export function parseTrade(event, now) {
  if (!event || event.e !== 'trade' || typeof event.s !== 'string' || !/^[A-Z0-9]{2,36}$/.test(event.s) ||
      !Number.isSafeInteger(event.T) || !Number.isSafeInteger(event.t) || typeof event.m !== 'boolean') throw Error('İşlem şeması geçersiz');
  const price = Number(event.p), quantity = Number(event.q);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 ||
      event.T > now + 1000 || event.T < now - 30000) throw Error('İşlem gecikmiş veya geçersiz');
  return { id: event.t, time: event.T, price, quantity, buy: !event.m };
}
export function parseBook(body, time) {
  if (body?.code !== 0 || !Array.isArray(body.data?.bids) || !Array.isArray(body.data?.asks) ||
    !body.data.bids.length || !body.data.asks.length) throw Error('Emir defteri şeması doğrulanamadı');
  const side = levels => levels.slice(0, 5).map(row => {
    const price = Number(row[0]), quantity = Number(row[1]);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity < 0) throw Error('Emir defteri şeması doğrulanamadı');
    return { price, value: price * quantity };
  });
  const bids = side(body.data.bids).sort((a, b) => b.price - a.price), asks = side(body.data.asks).sort((a, b) => a.price - b.price);
  if (asks[0].price < bids[0].price) throw Error('Emir defteri şeması doğrulanamadı');
  return { time, bid: bids[0].price, ask: asks[0].price,
    depthQuote: Math.min(bids.reduce((n, x) => n + x.value, 0), asks.reduce((n, x) => n + x.value, 0)) };
}
export class BinanceTrProvider {
  constructor({ fetchFn = fetch, socketFactory = (url, options) => new WebSocket(url, options), clock = Date.now, onTrade = () => {} } = {}) {
    Object.assign(this, { fetchFn, socketFactory, clock, onTrade });
    this.markets = new Map(); this.feeds = new Map(); this.sockets = new Set();
    this.timers = new Set(); this.cache = new Map(); this.inflight = new Map();
    this.state = { source: SOURCE, sourceVerification: 'GÜNCEL RESMÎ DESTEK DOĞRULANMADI', connected: false,
      lastMessageAt: null, catalogAt: null, error: null, requests: 0, errors: 0, rejected: 0,
      waitUntil: 0, receivedTrades: 0, lastLatencyMs: null };
    this.stopped = true; this.queue = Promise.resolve(); this.nextRequest = 0;
  }
  delay(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.stopped) fn(); }, ms);
    t.unref?.(); this.timers.add(t); return t;
  }
  request(url, ttl = 30000) {
    const cached = this.cache.get(url);
    if (cached && this.clock() - cached.time < ttl) return Promise.resolve(cached.body);
    if (this.inflight.has(url)) return this.inflight.get(url);
    const work = this.queue.then(async () => {
      const wait = Math.max(0, this.nextRequest - this.clock(), this.state.waitUntil - this.clock());
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      if (this.stopped) throw Error('Veri servisi durduruldu');
      this.nextRequest = this.clock() + 300;
      this.state.requests++;
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
      if ([418, 429].includes(response.status)) {
        const header = response.headers.get('retry-after');
        const seconds = header === null ? NaN : Number(header);
        const until = Number.isFinite(seconds) ? this.clock() + seconds * 1000 : Date.parse(header || '');
        this.state.waitUntil = Math.max(this.clock() + 180000, Number.isFinite(until) ? until : 0);
        throw Error('API hız sınırı; Retry-After süresince bekleniyor');
      }
      if (!response.ok) throw Error(`Binance TR HTTP ${response.status}`);
      // Bound JSON response size before decoding untrusted external data.
      const reader = response.body?.getReader(); let body;
      if (reader) {
        let total = 0; const chunks = [];
        for (;;) { const { done, value } = await reader.read(); if (done) break;
          total += value.byteLength; if (total > 8 * 1024 * 1024) { await reader.cancel(); throw Error('API yanıtı aşırı büyük'); } chunks.push(Buffer.from(value)); }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } else body = await response.json();
      this.cache.set(url, { time: this.clock(), body });
      for (const [key, value] of this.cache) if (this.clock() - value.time > 120000) this.cache.delete(key);
      return body;
    }).catch(e => { this.state.errors++; this.state.error = safeError(e); throw e; }).finally(() => this.inflight.delete(url));
    this.inflight.set(url, work); this.queue = work.catch(() => {}); return work;
  }
  async refresh() {
    const list = discoverMarkets(await this.request(CATALOG, 0));
    const next = new Map(list.map(x => [x.symbol, x]));
    const changed = [...next.keys()].join() !== [...this.markets.keys()].join() || list.some(x => x.type !== this.markets.get(x.symbol)?.type);
    this.markets = next; this.state.catalogAt = this.clock(); this.state.error = null;
    for (const key of this.feeds.keys()) if (!next.has(key)) this.feeds.delete(key);
    if (changed || !this.sockets.size) this.connectAll();
  }
  connectAll() {
    for (const ws of this.sockets) { ws.retired = true; ws.terminate(); }
    this.sockets.clear();
    for (const feed of this.feeds.values()) feed.disconnect();
    const all = [...this.markets.values()].filter(x => x.streamAvailable);
    // Batch transport subscriptions, without truncating the universe.
    for (let i = 0; i < all.length; i += 80) this.connectBatch(all.slice(i, i + 80), 0);
  }
  connectBatch(batch, attempt) {
    if (this.stopped) return;
    const agent = process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : undefined;
    const ws = this.socketFactory('wss://stream-cloud.binance.tr/stream?streams=' + batch.map(x => x.wireSymbol.toLowerCase() + '@trade').join('/'),
      { agent, handshakeTimeout: 12000, maxPayload: 1024 * 1024 });
    this.sockets.add(ws); const byWire = new Map(batch.map(x => [x.wireSymbol, x]));
    let alive = true;
    ws.on('open', () => { attempt = 0; for (const m of batch) {
      const feed = this.feeds.get(m.symbol) || new TradeCandles(); feed.connect(this.clock()); this.feeds.set(m.symbol, feed);
    } });
    ws.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; if (ws.readyState === WebSocket.OPEN) ws.ping(); }, 30000);
    heartbeat.unref?.();
    ws.on('message', raw => {
      try {
        const payload = JSON.parse(String(raw)), event = payload.data ?? payload;
        const market = byWire.get(event.s); if (!market) throw Error('Abone olunmayan piyasa');
        const now = this.clock(), trade = parseTrade(event, now), feed = this.feeds.get(market.symbol);
        if (!feed || !feed.add(trade, now)) return;
        this.state.receivedTrades++; this.state.lastMessageAt = now;
        this.state.lastLatencyMs = now - trade.time; this.onTrade(market, trade);
      } catch { this.state.rejected++; }
    });
    ws.on('error', e => { this.state.errors++; this.state.error = safeError(e); });
    ws.on('close', () => {
      clearInterval(heartbeat); this.sockets.delete(ws);
      if (!ws.retired) for (const m of batch) this.feeds.get(m.symbol)?.disconnect();
      if (this.stopped || ws.retired) return;
      const backoff = Math.min(300000, 5000 * 2 ** Math.min(attempt, 6)) + Math.floor(Math.random() * 1000);
      this.delay(() => this.connectBatch(batch.filter(m => this.markets.has(m.symbol)), attempt + 1), backoff);
    });
  }
  async minutes(market) {
    const base = market.type === 1 ? 'https://api.binance.me' : 'https://cloudme-tr.2meta.app';
    const body = await this.request(`${base}/api/v1/klines?symbol=${encodeURIComponent(market.wireSymbol)}&interval=1m&limit=40`, 30000);
    if (body?.code !== 0 || !Array.isArray(body.data)) throw Error('Binance TR dakika şeması doğrulanamadı');
    return body.data.map(x => ({ time: Number(x[0]), open: Number(x[1]), high: Number(x[2]), low: Number(x[3]),
      close: Number(x[4]), volume: Number(x[5]), quoteVolume: Number(x[7]) }));
  }
  async book(market) {
    const base = market.type === 1 ? 'https://api.binance.me' : 'https://cloudme-tr.2meta.app';
    const started = this.clock();
    const body = await this.request(`${base}/api/v1/depth?symbol=${encodeURIComponent(market.wireSymbol)}&limit=5`, 2000);
    // Use request start, not response receipt, so network delay cannot make an old snapshot fresh.
    return parseBook(body, started);
  }
  snapshot() {
    const now = this.clock();
    return { ...this.state, connected: [...this.sockets].some(x => x.readyState === WebSocket.OPEN),
      socketCount: this.sockets.size, eligibleMarkets: this.markets.size,
      streamSupportedMarkets: [...this.markets.values()].filter(x => x.streamAvailable).length,
      fresh: this.state.lastMessageAt !== null && now - this.state.lastMessageAt <= 5000,
      errorRate: this.state.requests ? this.state.errors / this.state.requests : null };
  }
  async start() {
    if (!this.stopped) return; this.stopped = false;
    const cycle = async () => { try { await this.refresh(); } catch (e) { this.state.error = safeError(e); }
      if (!this.stopped) this.delay(cycle, Math.max(60000, this.state.waitUntil - this.clock(), this.markets.size ? 900000 : 60000)); };
    await cycle();
  }
  stop() {
    this.stopped = true; for (const t of this.timers) clearTimeout(t); this.timers.clear();
    for (const feed of this.feeds.values()) feed.disconnect();
    for (const ws of this.sockets) { ws.retired = true; ws.terminate(); } this.sockets.clear();
  }
}
export function safeError(e) {
  // Never expose remote response bodies, URLs with credentials, or SDK headers.
  const message = String(e?.message || 'Bilinmeyen hata');
  if (/HTTP \d{3}|şema|katalog|piyasa|hız sınırı|durduruldu|aşırı büyük/.test(message) && !/https?:|token|secret|key=/i.test(message)) return message.slice(0, 160);
  return 'Veri bağlantısı başarısız; ağ, kaynak desteği ve erişim izinlerini kontrol edin';
}
