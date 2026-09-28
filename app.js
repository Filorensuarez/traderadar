const C = document.querySelector("#cards");
const K = document.querySelector("#conn");
const T = document.querySelector("#time");

const f = (n, d = 2) =>
  Number.isFinite(n) ? n.toFixed(d) : "-";

const alarmHistory = new Map();
const COOLDOWN = 10 * 60 * 1000;

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("Bu tarayıcı bildirimleri desteklemiyor.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    alert("TradeRadar bildirimleri açıldı.");
  }
}

function beep(strong = false) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = strong ? 880 : 620;
    gain.gain.value = 0.15;

    osc.start();

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, strong ? 700 : 350);
  } catch {}
}

function sendAlert(x) {
  if (x.status !== "ERKEN UYARI" &&
      x.status !== "GÜÇLÜ ERKEN UYARI") return;

  const strong = x.status === "GÜÇLÜ ERKEN UYARI";
  const level = strong ? "strong" : "alert";
  const key = `${x.symbol}:${level}`;
  const last = alarmHistory.get(key) || 0;

  if (Date.now() - last < COOLDOWN) return;

  alarmHistory.set(key, Date.now());

  const m = x.metrics || {};
  const w30 = m.w30 || {};

  const title = strong
    ? `GÜÇLÜ ERKEN UYARI — ${x.symbol}`
    : `ERKEN UYARI — ${x.symbol}`;

  const body =
    `Puan: ${x.score}/100\n` +
    `30 sn alış baskısı: %${f(w30.buyRatio, 1)}\n` +
    `Hacim: ${f(m.volX)}× | İşlem: ${f(m.tradeX)}×`;

  beep(strong);

  if ("vibrate" in navigator) {
    navigator.vibrate(
      strong ? [300, 150, 300, 150, 500] : [250, 120, 250]
    );
  }

  if ("Notification" in window &&
      Notification.permission === "granted") {
    new Notification(title, {
      body,
      tag: key,
      renotify: strong
    });
  }
}

function render(rows) {
  T.textContent = new Date().toLocaleTimeString("tr-TR");

  rows.forEach(sendAlert);

  C.innerHTML = rows.map(x => {
    const m = x.metrics || {};
    const w120 = m.w120 || {};
    const w30 = m.w30 || {};

    const symbol = x.symbol.replace("-USDT", "/USDT");

    return `
      <article class="card">
        <div class="top">
          <div>
            <div class="sym">${symbol}</div>
            <
