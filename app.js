const C = document.querySelector("#cards");
const K = document.querySelector("#conn");
const T = document.querySelector("#time");

const f = (n, d = 2) =>
  Number.isFinite(Number(n)) ? Number(n).toFixed(d) : "-";

const coinAlarmHistory = new Map();

const COIN_COOLDOWN = 10 * 60 * 1000;
const SOUND_COOLDOWN = 30 * 1000;

let lastSoundAt = 0;
let wsConnected = false;

async function enableNotifications() {
  if (!("Notification" in window)) {
    alert("Tarayıcınız bildirimleri desteklemiyor.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    notifyBtn.textContent = "Bildirimler Açık";
    alert("TradeRadar bildirimleri açıldı.");
  }
}

function beep(strong = false) {
  const now = Date.now();

  // En fazla 30 saniyede bir ses
  if (now - lastSoundAt < SOUND_COOLDOWN) return;

  lastSoundAt = now;

  try {
    const ctx =
      new (window.AudioContext || window.webkitAudioContext)();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = strong ? 880 : 620;
    gain.gain.value = 0.12;

    osc.start();

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, strong ? 600 : 300);

  } catch (e) {}
}

function processAlerts(rows) {
  const alerts = rows
    .filter(x =>
      x.status === "ERKEN UYARI" ||
      x.status === "GÜÇLÜ ERKEN UYARI"
    )
    .filter(x => x.metrics?.ready !== false)
    .sort((a, b) => b.score - a.score);

  if (!alerts.length) return;

  const now = Date.now();

  const fresh = alerts.filter(x => {
    const last =
      coinAlarmHistory.get(x.symbol) || 0;

    return now - last >= COIN_COOLDOWN;
  });

  if (!fresh.length) return;

  fresh.forEach(x => {
    coinAlarmHistory.set(x.symbol, now);
  });

  const strongest = fresh[0];

  const strong =
    strongest.status === "GÜÇLÜ ERKEN UYARI";

  // Kaç coin gelirse gelsin tek ses
  beep(strong);

  if ("vibrate" in navigator) {
    navigator.vibrate(
      strong
        ? [300, 150, 400]
        : [250, 120, 250]
    );
  }

  if (
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    const m = strongest.metrics || {};
    const w30 = m.w30 || {};

    let body =
      "Puan: " + strongest.score + "/100\n" +
      "Alış baskısı: %" + f(w30.buyRatio, 1) + "\n" +
      "Hacim: " + f(m.volX) + "x\n" +
      "İşlem hızı: " + f(m.tradeX) + "x";

    if (fresh.length > 1) {
      body +=
        "\nAyrıca " +
        (fresh.length - 1) +
        " coin daha uyarı verdi.";
    }

    new Notification(
      strong
        ? "GÜÇLÜ ERKEN UYARI — " + strongest.symbol
        : "ERKEN UYARI — " + strongest.symbol,
      {
        body,
        tag: "traderadar-main"
      }
    );
  }
}

function render(rows) {
  T.textContent =
    new Date().toLocaleTimeString("tr-TR");

  processAlerts(rows);

  C.innerHTML = rows.map(x => {
    const m = x.metrics || {};

    const w10 = m.w10 || {};
    const w30 = m.w30 || {};
    const w60 = m.w60 || {};
    const w120 = m.w120 || {};

    const symbol =
      x.symbol.replace("-USDT", "/USDT");

    let warmup = "";

    if (x.status === "VERİ TOPLANIYOR") {
      const remaining =
        Math.ceil(
          (m.warmupRemaining || 0) / 60000
        );

      warmup =
        `<div class="m">
          <span>Hazırlık</span>
          <b>${remaining} dk</b>
        </div>`;
    }

    return `
      <article class="card">

        <div class="top">
          <div>
            <div class="sym">${symbol}</div>
            <span class="status">${x.status}</span>
          </div>

          <div>
            <div class="score">${x.score}/100</div>
            <small>${x.price}</small>
          </div>
        </div>

        <div class="bar">
          <i style="width:${x.score}%"></i>
        </div>

        <div class="metrics">

          <div class="m">
            <span>120 sn hacim</span>
            <b>${f(m.volX)}x</b>
          </div>

          <div class="m">
            <span>İşlem hızı</span>
            <b>${f(m.tradeX)}x</b>
          </div>

          <div class="m">
            <span>30 sn alış baskısı</span>
            <b>%${f(w30.buyRatio, 1)}</b>
          </div>

          <div class="m">
            <span>10 sn fiyat</span>
            <b>%${f(w10.ret)}</b>
          </div>

          <div class="m">
            <span>60 sn fiyat</span>
            <b>%${f(w60.ret)}</b>
          </div>

          <div class="m">
            <span>120 sn fiyat</span>
            <b>%${f(w120.ret)}</b>
          </div>

          <div class="m">
            <span>8 mum sıkışma</span>
            <b>${f(m.compression, 0)}/100</b>
          </div>

          <div class="m">
            <span>Dirence uzaklık</span>
            <b>%${f(m.resistanceDistance)}</b>
          </div>

          ${warmup}

        </div>
      </article>
    `;
  }).join("");
}

const notifyBtn =
  document.createElement("button");

notifyBtn.textContent =
  (
    "Notification" in window &&
    Notification.permission === "granted"
  )
    ? "Bildirimler Açık"
    : "Bildirimleri Aç";

notifyBtn.style.cssText =
  "position:fixed;" +
  "right:15px;" +
  "bottom:18px;" +
  "z-index:999;" +
  "padding:13px 18px;" +
  "border:0;" +
  "border-radius:24px;" +
  "font-weight:700;" +
  "cursor:pointer;";

notifyBtn.onclick =
  enableNotifications;

document.body.appendChild(notifyBtn);


// HTTP YEDEK BAĞLANTI

async function pollRadar() {
  try {
    const response =
      await fetch(
        "/api/radar?t=" + Date.now(),
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        "HTTP " + response.status
      );
    }

    const data =
      await response.json();

    if (
      data.type === "radar" &&
      Array.isArray(data.rows)
    ) {
      render(data.rows);

      if (!wsConnected) {
        K.textContent =
          "OKX HTTP Yedek";
      }
    }

  } catch (e) {
    if (!wsConnected) {
      K.textContent =
        "Bağlantı bekleniyor...";
    }
  }
}


// WEBSOCKET ANA BAĞLANTI

function connectWS() {
  const protocol =
    location.protocol === "https:"
      ? "wss"
      : "ws";

  const ws =
    new WebSocket(
      protocol +
      "://" +
      location.host +
      "/live"
    );

  ws.onopen = () => {
    wsConnected = true;

    K.textContent =
      "OKX Canlı";
  };

  ws.onmessage = event => {
    try {
      const data =
        JSON.parse(event.data);

      if (
        data.type === "radar" &&
        Array.isArray(data.rows)
      ) {
        render(data.rows);
      }

    } catch (e) {}
  };

  ws.onerror = () => {
    wsConnected = false;
  };

  ws.onclose = () => {
    wsConnected = false;

    K.textContent =
      "OKX HTTP Yedek";

    setTimeout(
      connectWS,
      3000
    );
  };
}


// BAŞLAT

connectWS();

// Sayfa açılır açılmaz HTTP'den de veri al
pollRadar();

// WebSocket çalışsa bile HTTP yedek kontrolü
setInterval(
  pollRadar,
  2000
);
