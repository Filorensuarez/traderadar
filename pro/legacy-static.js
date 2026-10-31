import express from 'express';
// Keep browser assets available without publishing runtime stores or server source.
const scripts = new Set([
  'api-route.js', 'app.js', 'install-app.js', 'service-worker.js', 'tab-navigation-fix.js',
  'capital-manager.js', 'whale-monitor.js', 'whale-early.js', 'momentum-visibility.js', 'bist-radar.js',
]);
export function legacyStatic(root) {
  const serve = express.static(root, { dotfiles: 'deny', index: 'index.html' });
  return (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    let path;
    try { path = decodeURIComponent(req.path).replace(/^\//, ''); } catch { return res.sendStatus(400); }
    if (path.includes('..') || path.includes('\\')) return res.sendStatus(404);
    const allowed = ['', 'index.html', 'manifest.json', 'manifest.webmanifest', 'style.css', 'mobile-app.css', 'early-pump-chart.css'].includes(path) ||
      scripts.has(path) || /^[a-z0-9-]+-(ui|chart)\.js$/.test(path) || /^icons\/[a-zA-Z0-9-]+\.(png|svg|ico)$/.test(path) ||
      /^borc-takip\/(index\.html|app\.js|model\.mjs|style\.css)$/.test(path) || path === 'borc-takip/';
    if (!allowed) return res.sendStatus(404);
    res.set('X-Content-Type-Options', 'nosniff'); return serve(req, res, next);
  };
}
