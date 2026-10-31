import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { History } from './history.js';
import { ProEngine } from './engine.js';

export function createApp(engine, { allowedOrigin = process.env.PRO_FRONTEND_ORIGIN || '' } = {}) {
  const app = express(); app.disable('x-powered-by');
  const csrf = randomBytes(32).toString('hex');
  const equal = x => typeof x === 'string' && Buffer.byteLength(x) === Buffer.byteLength(csrf) && timingSafeEqual(Buffer.from(x), Buffer.from(csrf));
  const isLocalAdmin = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
    ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(req.hostname) &&
    !['forwarded', 'x-forwarded-for', 'x-forwarded-host'].some(header => req.get(header));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' " + (allowedOrigin ? new URL(allowedOrigin).origin : '') + "; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (allowedOrigin && origin === allowedOrigin) {
      res.set({ 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, X-Pro-CSRF', 'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS' });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(origin === allowedOrigin ? 204 : 403);
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  // Settings are shared server-wide. Only the local administrator can mutate them.
  // Read-only public endpoints never require exchange credentials.
  const updates = new Map();
  app.patch('/api/pro/settings', (req, res) => {
    const local = isLocalAdmin(req);
    const origin = req.get('origin'), sameOrigin = !origin || origin === `${req.protocol}://${req.get('host')}`;
    if (!local || !sameOrigin || !equal(req.get('x-pro-csrf'))) return res.status(403).json({ error: 'Ayar değişikliği yalnız yerel yöneticiye açık' });
    const now = Date.now(), ip = req.socket.remoteAddress;
    if (now - (updates.get(ip) ?? 0) < 1000) return res.status(429).json({ error: 'Ayarlar çok sık değiştiriliyor' });
    try { const config = engine.update(req.body); updates.set(ip, now); res.json(config); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/pro/session', (req, res) => {
    const local = isLocalAdmin(req);
    res.json({ canEdit: local, csrf: local ? csrf : null });
  });
  app.get('/api/pro/status', (_req, res) => res.json(engine.snapshot()));
  app.get('/api/pro/chart', (req, res) => {
    if (typeof req.query.symbol !== 'string' || !/^[A-Z0-9]{1,24}_[A-Z0-9]{1,12}$/.test(req.query.symbol)) return res.status(400).json({ error: 'Geçersiz parite' });
    const result = engine.chart(req.query.symbol);
    if (!result) return res.status(404).json({ error: 'Katalogda parite yok' });
    res.json(result);
  });
  app.get('/api/pro/history', (req, res) => {
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    const before = req.query.before === undefined ? Number.MAX_SAFE_INTEGER : Number(req.query.before);
    const beforeId = req.query.beforeId ?? '';
    if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(before) || before < 0 ||
      typeof beforeId !== 'string' || (beforeId !== '' && !/^[A-Z0-9_]+:\d{1,16}$/.test(beforeId))) return res.status(400).json({ error: 'Geçersiz sayfalama' });
    res.json(engine.history.list(limit, before, beforeId));
  });
  app.get('/api/pro/reports', (_req, res) => res.json(engine.history.reports()));
  app.get('/api/pro/notifications', (_req, res) => res.json(engine.history.notifications()));
  // Only this dedicated directory is public; SQLite, source code and node_modules are never served.
  app.use(express.static(fileURLToPath(new URL('./public/', import.meta.url)), { dotfiles: 'deny', index: 'index.html' }));
  app.use((_req, res) => res.status(404).json({ error: 'Bulunamadı' }));
  app.use((err, _req, res, _next) => res.status(err.status === 413 ? 413 : 400).json({ error: 'İstek işlenemedi' }));
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const history = new History(process.env.PRO_DATA_FILE || resolve(process.cwd(), '../traderadar-pro-data/signals.sqlite'));
  const engine = new ProEngine(history);
  const app = createApp(engine);
  const server = app.listen(Number(process.env.PRO_PORT || process.env.PORT || 3001), process.env.PRO_HOST || '127.0.0.1', () => {
    console.log('TradeRadar Pro hazır; yalnız analiz, izleme ve bildirim.');
    void engine.start();
  });
  const shutdown = () => { engine.stop(); server.close(() => { history.close(); process.exit(0); }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
