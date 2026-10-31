// OKX TR read-only public market data parsers.
// Source: https://tr.okx.com/docs-v5/en/
// These functions do not enable live scanning; network and stream verification are separate.
const idPattern = /^[A-Z0-9]{1,24}-[A-Z0-9]{1,12}$/;
const positive = x => Number.isFinite(Number(x)) && Number(x) > 0;
const integerTime = x => /^\d{13}$/.test(String(x)) && Number.isSafeInteger(Number(x));
function envelope(body) {
  if (body?.code !== '0' || !Array.isArray(body.data)) throw Error('OKX TR response schema invalid');
  return body.data;
}
export function parseOkxTrInstruments(body) {
  const markets = new Map();
  for (const row of envelope(body)) {
    if (row?.instType !== 'SPOT' || row.state !== 'live' || !idPattern.test(row.instId ?? '')) continue;
    const [base, quote] = row.instId.split('-');
    if (row.baseCcy !== base || row.quoteCcy !== quote) continue;
    const symbol = base + '_' + quote;
    if (markets.has(symbol)) throw Error('Duplicate OKX TR instrument');
    markets.set(symbol, { symbol, base, quote, wireSymbol: row.instId, type: 1,
      streamAvailable: false, availability: 'WebSocket abonelik onayı bekleniyor' });
  }
  if (!markets.size) throw Error('No verified live OKX TR spot instruments');
  return [...markets.values()];
}
export function parseOkxTrTrade(row, now = Date.now()) {
  if (!row || !idPattern.test(row.instId ?? '') || !/^\d+$/.test(String(row.tradeId ?? '')) ||
    !integerTime(row.ts) || !positive(row.px) || !positive(row.sz) ||
    !['buy', 'sell'].includes(row.side)) throw Error('OKX TR trade schema invalid');
  const time = Number(row.ts);
  if (time > now + 1000 || time < now - 30000) throw Error('OKX TR trade stale');
  return { id: String(row.tradeId), time, price: Number(row.px), quantity: Number(row.sz),
    buy: row.side === 'buy' };
}
export function parseOkxTrMinuteCandles(body, now = Date.now()) {
  const rows = envelope(body);
  const bars = rows.filter(x => Array.isArray(x) && x.length >= 9 && x[8] === '1').map(x => {
    if (!integerTime(x[0]) || ![1,2,3,4,5,7].every(i => Number.isFinite(Number(x[i]))) ||
      ![1,2,3,4].every(i => positive(x[i])) || Number(x[5]) < 0 || Number(x[7]) < 0) {
      throw Error('OKX TR minute candle schema invalid');
    }
    const time = Number(x[0]);
    if (time % 60000 !== 0 || time + 60000 > now) throw Error('OKX TR minute candle incomplete');
    return { time, open: Number(x[1]), high: Number(x[2]), low: Number(x[3]),
      close: Number(x[4]), volume: Number(x[5]), quoteVolume: Number(x[7]) };
  }).sort((a,b) => a.time-b.time);
  for (let i=1;i<bars.length;i++) if (bars[i].time-bars[i-1].time !== 60000)
    throw Error('OKX TR minute candles not consecutive');
  return bars;
}
export function parseOkxTrBook(body, requestedAt) {
  const [book] = envelope(body);
  if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks) ||
    !book.bids.length || !book.asks.length || !integerTime(book.ts)) throw Error('OKX TR order book invalid');
  const levels = xs => xs.slice(0,5).map(x => {
    if (!Array.isArray(x) || !positive(x[0]) || !Number.isFinite(Number(x[1])) || Number(x[1]) < 0)
      throw Error('OKX TR order book level invalid');
    return { price: Number(x[0]), value: Number(x[0])*Number(x[1]) };
  });
  const bids=levels(book.bids).sort((a,b)=>b.price-a.price);
  const asks=levels(book.asks).sort((a,b)=>a.price-b.price);
  if (bids[0].price >= asks[0].price || Number(book.ts) > Date.now()+1000)
    throw Error('OKX TR crossed or future order book');
  return { time: Math.min(requestedAt, Number(book.ts)), bid: bids[0].price,
    ask: asks[0].price, depthQuote: Math.min(bids.reduce((s,x)=>s+x.value,0),asks.reduce((s,x)=>s+x.value,0)) };
}
