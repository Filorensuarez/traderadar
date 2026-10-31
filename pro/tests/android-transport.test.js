import test from 'node:test';
import assert from 'node:assert/strict';
import { AndroidTransport } from '../public/android-transport.js';

function fixture(timeout = 100) {
  let listener;
  const target = { addEventListener: (_name, fn) => { listener = fn; }, removeEventListener: () => { listener = null; } };
  const transport = new AndroidTransport(target, 'https://appassets.androidplatform.net', timeout);
  const sent = [];
  const port = { postMessage: value => sent.push(JSON.parse(value)), close() { this.closed = true; }, start() {} };
  const deliver = (origin = 'https://appassets.androidplatform.net') => listener({ origin, data: JSON.stringify({ type: 'TRADERADAR_NATIVE_PORT', version: 1 }), ports: [port] });
  return { transport, port, sent, deliver };
}
test('native transport rejects a port from another origin; missing bridge stays unavailable', async () => {
  const f = fixture(10); f.deliver('https://evil.test'); assert.equal(f.transport.port, null);
  await assert.rejects(f.transport.request('status'), /kurulamadı/); f.transport.close();
});
test('native transport correlates messages and rejects arbitrary methods and oversized requests', async () => {
  const f = fixture(); f.deliver(); assert.deepEqual(f.sent[0], { type: 'ready' });
  const reply = f.transport.request('status'); const id = f.sent[1].id;
  f.port.onmessage({ data: JSON.stringify({ id: id + 100, result: { wrong: true } }) });
  f.port.onmessage({ data: JSON.stringify({ id, result: { running: false, rows: [] } }) });
  assert.deepEqual(await reply, { running: false, rows: [] });
  await assert.rejects(f.transport.request('status', 'DELETE'), /Geçersiz/);
  await assert.rejects(f.transport.request('settings', 'PATCH', 'x'.repeat(17000)), /Geçersiz/); f.transport.close();
});
test('closing or replacing a native capability rejects old requests instead of leaking callbacks', async () => {
  const f = fixture(); const waiting = f.transport.request('status'); f.transport.close(); await assert.rejects(waiting, /kapatıldı/);
  const g = fixture(); g.deliver(); const pending = g.transport.request('status'); g.deliver(); await assert.rejects(pending, /yenilendi/); g.transport.close();
});
