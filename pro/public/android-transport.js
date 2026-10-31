// A capability port is transferred only to the app's fixed local main-frame origin.
// No Java object is exposed to arbitrary JavaScript frames.
export class AndroidTransport {
  constructor(target, origin, timeoutMs = 10000) {
    this.target = target; this.origin = origin; this.timeoutMs = timeoutMs;
    this.port = null; this.sequence = 0; this.pending = new Map(); this.waiting = new Map();
    this.listener = event => {
      if (event.origin && event.origin !== 'null' && event.origin !== this.origin) return;
      let data; try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (data?.type !== 'TRADERADAR_NATIVE_PORT' || data.version !== 1 || event.ports?.length !== 1) return;
      if (this.port) this.port.close();
      for (const call of this.pending.values()) call.reject(Error('Yerel bağlantı yenilendi'));
      this.pending.clear(); this.port = event.ports[0];
      this.port.onmessage = reply => this.receive(reply.data); this.port.start?.();
      this.port.postMessage(JSON.stringify({ type: 'ready' }));
      for (const resolve of this.waiting.keys()) resolve(this.port); this.waiting.clear();
    };
    target.addEventListener('message', this.listener);
  }
  receive(raw) {
    let data; try { data = JSON.parse(raw); } catch { return; }
    if (!Number.isSafeInteger(data.id)) return;
    const call = this.pending.get(data.id); if (!call) return;
    this.pending.delete(data.id); call.resolve(data.result);
  }
  async request(path, method = 'GET', body = '') {
    if (typeof path !== 'string' || path.length > 200 || !['GET', 'PATCH'].includes(method) || typeof body !== 'string' || body.length > 16384) throw Error('Geçersiz yerel istek');
    if (this.pending.size + this.waiting.size >= 32) throw Error('Çok fazla yerel istek');
    const deadline = Date.now() + this.timeoutMs;
    let port = this.port;
    if (!port) port = await new Promise((resolve, reject) => {
      const done = value => { clearTimeout(timer); this.waiting.delete(done); resolve(value); };
      const timer = setTimeout(() => { this.waiting.delete(done); reject(Error('Yerel Android bağlantısı kurulamadı')); }, this.timeoutMs);
      this.waiting.set(done, { reject: e => { clearTimeout(timer); this.waiting.delete(done); reject(e); } });
    });
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('Yerel Android isteği zaman aşımına uğradı')); }, Math.max(1, deadline - Date.now()));
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: e => { clearTimeout(timer); reject(e); } });
      try { port.postMessage(JSON.stringify({ id, path, method, body })); } catch { this.pending.get(id)?.reject(Error('Yerel kanal kapalı')); this.pending.delete(id); }
    });
  }
  close() {
    this.target.removeEventListener('message', this.listener); this.port?.close(); this.port = null;
    for (const call of this.pending.values()) call.reject(Error('Yerel kanal kapatıldı')); this.pending.clear();
    for (const call of this.waiting.values()) call.reject(Error('Yerel kanal kapatıldı')); this.waiting.clear();
  }
}
export const nativeTransport = typeof window !== 'undefined' && /TradeRadarNative\/1/.test(navigator.userAgent) ? new AndroidTransport(window, location.origin) : null;
