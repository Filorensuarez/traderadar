import { API_BASE } from './config.js';
const $ = id => document.getElementById(id);
const format = (n, digits = 2) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('tr-TR', { maximumFractionDigits: digits }) : 'Veri yok';
const date = n => n ? new Date(n).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : 'Henüz yok';
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
let state = null, session = { canEdit: false }, historyCursor = null, formLoaded = false, audio = null;
const storage = {
  get(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};
let seen = new Set(storage.get('pro-alarm-ids', []));
let seeded = false;
async function api(path, options) {
  if (globalThis.NativePro) {
    const result = JSON.parse(globalThis.NativePro.request(path, options?.method || 'GET', options?.body || ''));
    if (result?.error) throw Error(result.error);
    return result;
  }
  const response = await fetch((API_BASE ? API_BASE.replace(/\/$/, '') + '/api/pro/' : './api/pro/') + path, { ...options, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error(`İstek başarısız: HTTP ${response.status}`);
  return response.json();
}
const empty = (parent, text) => parent.append(node('p', text, 'empty'));
const labels = { price: 'Fiyat ortalama koşulu', volume: 'Hacim artışı', orderFlow: 'Gerçek işlem alış baskısı', liquidity: 'Spread ve derinlik' };
function signalCard(row) {
  const el = node('article', undefined, 'card');
  el.append(node('h3', row.symbol), node('p', row.source + ' · ' + row.category, 'muted'), node('div', format(row.price, 8), 'price'));
  const dl = node('dl');
  for (const [label, value] of [
    ['Teknik koşul puanı', `${row.score}/100`], ['Ortalamalar farkı', `%${format(row.gainPct)}`],
    ['300s gerçek değişim', `%${format(row.actualChangePct)}`], ['Sinyal zamanı', date(row.signalTime)],
    ['Sinyal fiyatı', format(row.signalPrice, 8)], ['Hacim (kotasyon)', format(row.quoteVolume)],
    ['Hacim oranı (birim/s)', format(row.volumeRatio)], ['Alış oranı', row.buyShare === null ? 'Veri yok' : `%${format(row.buyShare * 100)}`],
    ['Spread', row.spreadPct === null ? 'Veri yok' : `%${format(row.spreadPct, 4)}`],
    ['EMA9 / EMA21', `${format(row.indicators.ema9, 8)} / ${format(row.indicators.ema21, 8)}`],
    ['RSI14', format(row.indicators.rsi14)], ['MACD histogramı', format(row.indicators.macd.histogram, 8)],
    ['Trend', row.indicators.trend], ['Volatilite (1s)', `%${format(row.indicators.volatilityPct, 4)}`],
    ['Destek / direnç', `${format(row.indicators.support, 8)} / ${format(row.indicators.resistance, 8)}`],
    ['Kırılım', row.indicators.breakout ? 'Var' : 'Yok'], ['Risk', row.risk], ['Son gözlem', date(row.observedAt)],
  ]) dl.append(node('dt', label), node('dd', value));
  el.append(dl);
  const past = row.historicalPerformance;
  el.append(node('p', !past || past.evaluated < state.config.minimumSample ? 'Geçmiş performans: yeterli değerlendirilmiş örnek yok.' :
    `Geçmiş örnekler: ${past.evaluated} · Brüt hedef başarısı %${format(past.wins / past.evaluated * 100)}. Kazanç olasılığı değildir.`, 'muted'));
  for (const [key, pass] of Object.entries(row.groups)) el.append(node('span', `${pass ? '✓' : '—'} ${labels[key]}`, 'tag'));
  el.append(node('p', 'EMA, RSI ve MACD aynı fiyat grubundadır. Geçmiş performans, geçmiş ve haftalık rapor bölümünde ölçülür.', 'muted'));
  const button = node('button', 'Gerçek fiyat grafiği'); button.addEventListener('click', () => { $('chart-symbol').value = row.symbol; void chart(); $('chart').scrollIntoView({ behavior: 'smooth' }); });
  el.append(button); return el;
}
function renderSignals() {
  for (const id of ['confirmed', 'watch']) $(id).replaceChildren();
  const q = $('search').value.toUpperCase(), category = $('category').value, key = $('sort').value;
  const rows = (state?.rows ?? []).filter(r => r.symbol.includes(q) && (!category || r.category === category)).sort((a, b) => b[key] - a[key]);
  for (const row of rows) $(row.category === 'ÇOKLU TEYİT' ? 'confirmed' : 'watch').append(signalCard(row));
  for (const id of ['confirmed', 'watch']) if (!$(id).childElementCount) empty($(id), 'Güncel koşulları sağlayan sinyal yok. Eksik verilerden sinyal üretilmez.');
}
const fieldSpecs = [
  ['thresholdPct', 'Ortalamalar farkı eşiği (%)', 0.1, 50, 0.1],
  ['minVolumeRatio', 'İsteğe bağlı hacim çarpanı', 0.1, 100, 0.1],
  ['maxSpreadPct', 'Teyit için en yüksek spread (%)', 0.01, 10, 0.01],
  ['minBuyShare', 'Alış payı alt sınırı (0–1)', 0.5, 1, 0.01],
  ['minIndependentGroups', 'Gerekli kanıt grubu', 2, 4, 1],
  ['targetPct', 'Başarı hedefi (%)', 0.1, 100, 0.1],
  ['horizonMinutes', 'Başarı süresi (dakika)', 1, 60, 1],
  ['commissionPct', 'Komisyon / yön (%)', 0, 5, 0.01],
  ['slippagePct', 'Kayma / yön (%)', 0, 5, 0.01],
  ['minimumSample', 'Asgari rapor örneği', 30, 10000, 1],
  ['staleMs', 'En yüksek veri yaşı (ms)', 2000, 30000, 1000],
];
function loadForm(config) {
  if (formLoaded) return; formLoaded = true;
  for (const [name, title, min, max, step] of fieldSpecs) {
    const label = node('label', title), input = node('input'); Object.assign(input, { name, type: 'number', min, max, step, value: config[name], required: true, disabled: !session.canEdit });
    label.append(input); $('setting-fields').append(label);
  }
  $('settings-form').elements.volumeFilter.checked = config.volumeFilter;
  $('settings-form').elements.volumeFilter.disabled = !session.canEdit;
  $('settings-form').querySelector('button').disabled = !session.canEdit;
  $('settings-note').textContent = globalThis.NativePro ? 'Ayarlar bu Android cihazında saklanır; geçmiş sinyaller kendi ayarlarını korur.' : session.canEdit ? 'Ayarlar sunucuda saklanır; geçmiş sinyaller kendi ayarlarını korur.' : 'Salt okunur erişim. Ayarları sunucunun yerel yöneticisi değiştirebilir.';
}
function renderStatus() {
  const s = state.source, fresh = s.connected && s.fresh;
  $('connection').textContent = fresh ? 'Gerçek işlem akışı alınıyor' : 'Canlı veri doğrulanmadı';
  $('connection').classList.toggle('live', fresh);
  $('metrics').replaceChildren();
  for (const [title, value] of [['Uygun spot parite', s.eligibleMarkets], ['Analize hazır', state.metrics.evaluated], ['Son tarama (ms)', state.metrics.lastScanMs], ['P95 tarama (ms)', state.metrics.p95ScanMs]]) {
    const box = node('div', undefined, 'metric'); box.append(node('strong', format(value)), node('span', title)); $('metrics').append(box);
  }
  $('source').textContent = `${s.source} · ${s.sourceVerification} · Son gerçek işlem: ${date(s.lastMessageAt)} · ${s.error || 'Bağlantı hatası bildirilmedi'}`;
  $('formula').textContent = state.formula;
  $('health-details').textContent = JSON.stringify({ source: s, scan: state.metrics, memoryMiB: Math.round(state.memoryBytes / 1048576), serverRunning: state.running }, null, 2);
  $('unavailable').replaceChildren(...state.rejected.map(r => node('p', `${r.symbol}: ${r.reason}`, 'muted')));
  renderSignals(); loadForm(state.config);
}
async function history(reset = false) {
  if (reset) historyCursor = null;
  const rows = await api('history?limit=100' + (historyCursor === null ? '' : '&before=' + historyCursor.time + '&beforeId=' + encodeURIComponent(historyCursor.id)));
  if (reset) $('history-rows').replaceChildren();
  for (const r of rows) {
    const tr = node('tr');
    const checkpoints = Object.entries(r.checkpoints).map(([m, c]) => `${m}dk: brüt %${format(c.grossPct)} / net ${c.netPct === null ? 'spread verisi yok' : '%' + format(c.netPct)}${c.coverage ? '' : ' (eksik)'}`).join(' · ');
    const outcome = ({ SUCCESS: 'BAŞARILI', FAILED: 'BAŞARISIZ', PENDING: 'GÖZLEM BEKLENİYOR', INSUFFICIENT_DATA: 'YETERSİZ VERİ' })[r.outcome] || r.outcome;
    for (const value of [r.symbol, date(r.time), format(r.price, 8), outcome + (r.liveStatus ? ' · ' + r.liveStatus : ''),
      `%${format(r.maxFavorablePct)} / %${format(r.maxAdversePct)}`, r.timeToTargetMs == null ? 'Henüz yok' : `${format(r.timeToTargetMs / 1000)} sn`, checkpoints || 'Gözlem bekleniyor']) tr.append(node('td', value));
    $('history-rows').append(tr);
  }
  if (rows.length) historyCursor = { time: rows.at(-1).time, id: rows.at(-1).id };
  $('older').disabled = rows.length < 100;
  if (!rows.length && reset) { const tr = node('tr'), td = node('td', 'Henüz gerçek sinyal kaydı yok.'); td.colSpan = 7; tr.append(td); $('history-rows').append(tr); }
}
async function reports() {
  const rows = await api('reports'); $('report-cards').replaceChildren();
  for (const r of rows) {
    const card = node('article', undefined, 'card'); card.append(node('h3', r.week), node('p', r.definition),
      node('p', `Toplam ${r.total} · Başarılı ${r.wins} · Başarısız ${r.failed} · Bekleyen ${r.pending} · Eksik ${r.insufficient}`),
      node('p', r.reliable ? `Gözlenen örnek oranı: %${format(r.sampleRatePct)} (olasılık tahmini değildir)` : `Yetersiz örnek: ${r.evaluated}/${r.minimumSample}. Güvenilir başarı oranı gösterilmiyor.`, 'muted'));
    $('report-cards').append(card);
  }
  if (!rows.length) empty($('report-cards'), 'Gerçek sinyal birikince haftalık dönemler burada oluşur.');
}
async function notifications() {
  const rows = await api('notifications'); $('notification-history').replaceChildren(...rows.map(r => node('p', `${date(r.time)} · ${r.symbol} · ${r.category}`)));
  for (const r of [...rows].reverse()) {
    if (!globalThis.NativePro && !seen.has(r.id) && seeded && Date.now() - r.time < 30000 && state?.source.fresh) {
      if ($('sound').checked && audio) { const osc = audio.createOscillator(), gain = audio.createGain(); osc.connect(gain); gain.connect(audio.destination); gain.gain.value = 0.08; osc.frequency.value = 740; osc.start(); osc.stop(audio.currentTime + 0.2); }
      if ('Notification' in window && Notification.permission === 'granted') new Notification('TradeRadar Pro · Çoklu teyit', { body: r.symbol, tag: r.id });
    }
    seen.add(r.id);
  }
  seen = new Set([...seen].slice(-1000)); storage.set('pro-alarm-ids', [...seen]); seeded = true;
}
async function chart() {
  try {
    const symbol = $('chart-symbol').value.toUpperCase().trim();
    if (!/^[A-Z0-9]{1,24}_[A-Z0-9]{1,12}$/.test(symbol)) throw Error('Pariteyi BTC_TRY biçiminde yazın');
    const data = await api('chart?symbol=' + encodeURIComponent(symbol));
    const canvas = $('price-chart'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!data.bars.length) { $('chart-note').textContent = 'Bu parite için gözlenmiş gerçek saniyelik mum yok.'; return; }
    const bars = data.bars, min = Math.min(...bars.map(b => b.low)), max = Math.max(...bars.map(b => b.high));
    const range = Math.max(max - min, min * 0.00001), t0 = bars[0].time, span = Math.max(1000, bars.at(-1).time - t0);
    ctx.strokeStyle = '#52dfc0'; ctx.lineWidth = 2; ctx.beginPath();
    bars.forEach((b, i) => { const x = 50 + (b.time - t0) / span * (w - 70), y = h - 30 - (b.close - min) / range * (h - 60);
      if (i === 0 || b.time - bars[i - 1].time !== 1000) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    ctx.fillStyle = '#a5b5ca'; ctx.font = '14px system-ui'; ctx.fillText(format(max, 8), 10, 20); ctx.fillText(format(min, 8), 10, h - 10);
    $('chart-note').textContent = `${symbol} · ${data.source} · ${bars.length} gerçek kapalı saniye · ${date(bars.at(-1).time)}`;
    $('chart-summary').textContent = `En düşük ${format(min, 8)} · En yüksek ${format(max, 8)} · Son ${format(bars.at(-1).close, 8)}. Akış kesintileri analiz kullanılabilirliğini etkiler.`;
  } catch (e) { $('chart-note').textContent = e.message; }
}
for (const id of ['search', 'category', 'sort']) $(id).addEventListener('input', renderSignals);
$('load-chart').addEventListener('click', () => void chart());
$('older').addEventListener('click', () => void history().catch(showError));
$('settings-form').addEventListener('submit', async e => {
  e.preventDefault(); const patch = {};
  for (const [key] of fieldSpecs) patch[key] = Number(e.currentTarget.elements[key].value);
  patch.volumeFilter = e.currentTarget.elements.volumeFilter.checked;
  try { await api('settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Pro-CSRF': session.csrf }, body: JSON.stringify(patch) }); $('settings-note').textContent = 'Ayarlar kaydedildi; geçmiş sinyallerin tanımları korunuyor.'; }
  catch (err) { $('settings-note').textContent = err.message; }
});
$('sound').checked = storage.get('pro-sound', false);
$('sound').addEventListener('change', async () => {
  storage.set('pro-sound', $('sound').checked);
  if ($('sound').checked) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { audio ||= new Audio(); await audio.resume(); } }
  $('alarm-note').textContent = 'Ses yalnız bu açık tarayıcı oturumunda çalışır. Arka planda 7/24 bildirim garantisi yoktur.';
});
$('enable-notifications').addEventListener('click', async () => {
  if (!('Notification' in window)) { $('alarm-note').textContent = 'Bu tarayıcı bildirim desteklemiyor.'; return; }
  try { $('alarm-note').textContent = 'Bildirim izni: ' + await Notification.requestPermission(); } catch { $('alarm-note').textContent = 'Bildirim izni alınamadı.'; }
});
function showError(e) { $('error').textContent = e.message; }
let busy = false, refreshes = 0;
async function refresh() {
  if (busy) return; busy = true;
  try {
    state = await api('status'); renderStatus(); $('error').textContent = '';
    const results = await Promise.allSettled([notifications(), ...(refreshes++ % 5 === 0 ? [history(true), reports()] : [])]);
    for (const result of results) if (result.status === 'rejected') showError(result.reason);
  } catch (e) { showError(e); state = null; renderSignals(); $('connection').textContent = 'Sunucuya erişilemiyor · eski sinyaller kaldırıldı'; $('connection').classList.remove('live'); }
  finally { busy = false; }
}
try { session = await api('session'); } catch (e) { showError(e); }
if (globalThis.NativePro) {
  $('sound').parentElement.hidden = true;
  $('enable-notifications').hidden = true;
  $('alarm-note').textContent = 'Bildirimler yerel Android hizmetinden gelir. Ses ve izinler Android bildirim kanalı ayarlarından yönetilir. Eksik dönemler başarı/başarısızlık olarak uydurulmaz.';
  $('settings').querySelector('p').textContent = 'Bu ayarlar yalnız Pro modülüne aittir ve cihazda saklanır. Tarama üstteki Başlat ile açılır; Durdur ile kapanır. Android hizmeti sınırlayabilir.';
}
await refresh(); setInterval(() => void refresh(), 3000);
