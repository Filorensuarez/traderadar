#!/usr/bin/env node
// Read-only OKX TR REST connectivity diagnostic. Never uses API keys or places orders.
// Run locally: node scripts/check-okxtr.mjs
const base = 'https://tr.okx.com';
const paths = [
  '/api/v5/public/instruments?instType=SPOT',
  '/api/v5/market/tickers?instType=SPOT'
];
const timeoutMs = 12000;
let failed = false;
for (const path of paths) {
  try {
    const response = await fetch(base + path, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
      redirect: 'error'
    });
    if (!response.ok) {
      console.log(JSON.stringify({ endpoint: path.split('?')[0], ok: false, httpStatus: response.status }));
      failed = true;
      continue;
    }
    const sizeLimit = 12 * 1024 * 1024;
    const reader = response.body.getReader();
    const chunks = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > sizeLimit) { await reader.cancel(); throw Error('Response too large'); }
      chunks.push(Buffer.from(value));
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (payload?.code !== '0' || !Array.isArray(payload.data)) throw Error('Unexpected OKX API response');
    const rows = payload.data;
    const valid = path.includes('/instruments')
      ? rows.filter(x => x?.instType === 'SPOT' && x?.state === 'live' && typeof x.instId === 'string')
      : rows.filter(x => typeof x?.instId === 'string' && Number.isFinite(Number(x.last)) && Number(x.last) > 0);
    const samples = valid.slice(0, 5).map(x => x.instId);
    const ok = valid.length > 0;
    console.log(JSON.stringify({ endpoint: path.split('?')[0], ok, httpStatus: response.status,
      returnedRows: rows.length, validRows: valid.length, samplePairs: samples }));
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.log(JSON.stringify({ endpoint: path.split('?')[0], ok: false,
      error: error?.name === 'TimeoutError' ? 'timeout' : String(error?.message || 'network error').slice(0, 120) }));
  }
}
if (failed) {
  console.error('OKX TR connectivity NOT verified; keep live trading signals disabled.');
  process.exitCode = 1;
} else {
  console.log('OKX TR REST responded with spot market data. WebSocket, exchange eligibility, and Android still require separate verification.');
}
