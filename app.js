const C = document.querySelector("#cards");
const K = document.querySelector("#conn");
const T = document.querySelector("#time");

const f = (n, d = 2) =>
  Number.isFinite(Number(n))
    ? Number(n).toFixed(d)
    : "-";

const COOLDOWN = 10 * 60 * 1000;
const SOUND_WAIT = 30 * 1000;

let audioCtx = null;
let lastSound = 0;
let wsConnected = false;
let activeView = "live";
let rows = [];

let movers = {
  gainers: [],
  losers: [],
  updatedAt: 0
};

const alarms = new Map();


// =====================================
// SES MOTORU
// =====================================

async function unlockAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (
        window.AudioContext ||
        window.webkitAudioContext
      )();
    }

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    return audioCtx.state === "running";

  } catch {
    return false;
  }
}


async function alarmSound(
  strong = false,
  force = false
) {
  const now = Date.now();

  if (
    !force &&
    now - lastSound < SOUND_WAIT
  ) return;

  if (!(await unlockAudio())) return;

  lastSound = now;

  try {
    const osc =
      audioCtx.createOscillator();

    const gain =
      audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type =
      strong ? "square" : "sine";

    osc.frequency.value =
      strong ? 950 : 700;

    gain.gain.value = 0.30;

    osc.start();

    setTimeout(() => {
      try {
        osc.stop();
      } catch {}
    }, strong ? 900 : 550);

  } catch {}
}


// =====================================
// BİLDİRİMLERİ AÇ
// =====================================

async function enableNotifications() {
  await unlockAudio();

  let granted = false;

  if ("Notification" in window) {
    try {
      const p =
        await Notification.requestPermission();

      granted =
        p === "granted";
    } catch {}
  }

  notifyBtn.textContent =
    granted
      ? "Bildirimler Açık"
      : "Ses Açık";

  await alarmSound(false, true);

  if ("vibrate" in navigator) {
    navigator.vibrate(200);
  }

  alert(
    granted
      ? "Bildirim, titreşim ve alarm sesi etkinleştirildi."
      : "Alarm sesi etkinleştirildi."
  );
}


// =====================================
// ALARM TESTİ
// =====================================

async function testAlarm() {
  await unlockAudio();

  await alarmSound(true, true);

  if ("vibrate" in navigator) {
    navigator.vibrate(
      [400, 150, 500]
    );
  }

  if (
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    try {
      new Notification(
        "TradeRadar Test Alarmı",
        {
          body:
            "Alarm sistemi çalışıyor.",
          tag:
            "traderadar-test"
        }
      );
    } catch {}
  }
}


// =====================================
// SİNYAL GEÇMİŞİ
// =====================================

function getHistory() {
  try {
    return JSON.parse(
      localStorage.getItem(
        "traderadar_history"
      ) || "[]"
    );
  } catch {
    return [];
  }
}


function saveHistory(list) {
  try {
    localStorage.setItem(
      "traderadar_history",
      JSON.stringify(
        list.slice(0, 500)
      )
    );
  } catch {}
}


function addHistory(x) {
  const list = getHistory();
  const now = Date.now();

  const exists =
    list.some(
      h =>
        h.symbol === x.symbol &&
        now - h.timestamp < COOLDOWN
    );

  if (exists) return;

  const m = x.metrics || {};

  list.unshift({
    timestamp: now,

    symbol: x.symbol,
    status: x.status,

    price: Number(x.price),
    score: Number(x.score),

    peak:
      Number(
        m.peak5m ??
        x.peak5m ??
        x.score
      ),

    volX:
      Number(m.volX || 0),

    tradeX:
      Number(m.tradeX || 0),

    buy:
      Number(
        m.w30?.buyRatio || 0
      ),

    ret10:
      Number(
        m.w10?.ret || 0
      ),

    ret30:
      Number(
        m.w30?.ret || 0
      ),

    ret60:
      Number(
        m.w60?.ret || 0
      ),

    ret120:
      Number(
        m.w120?.ret || 0
      ),

    high:
      Number(x.price),

    maxGain: 0,

    lastStatus:
      x.status
  });

  saveHistory(list);
}


function updateHistory() {
  const list = getHistory();

  let changed = false;

  for (const h of list) {
    const x =
      rows.find(
        r => r.symbol === h.symbol
      );

    if (!x) continue;

    const price =
      Number(x.price);

    if (
      price >
      Number(h.high || 0)
    ) {
      h.high = price;

      h.maxGain =
        h.price
          ? (
              (price - h.price) /
              h.price
            ) * 100
          : 0;

      changed = true;
    }

    if (
      h.lastStatus !== x.status
    ) {
      h.lastStatus =
        x.status;

      changed = true;
    }

    const peak =
      Number(
        x.metrics?.peak5m ??
        x.peak5m ??
        x.score
      );

    if (
      peak >
      Number(h.peak || 0)
    ) {
      h.peak = peak;
      changed = true;
    }
  }

  if (changed) {
    saveHistory(list);
  }
}


// =====================================
// GERÇEK SİNYAL ALARMI
// =====================================

function processAlerts() {
  const candidates =
    rows
      .filter(
        x =>
          x.status === "ERKEN UYARI" ||
          x.status === "GÜÇLÜ ERKEN UYARI"
      )
      .filter(
        x =>
          x.metrics?.ready !== false
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (!candidates.length) return;

  const now = Date.now();

  const fresh =
    candidates.filter(x => {
      const last =
        alarms.get(x.symbol) || 0;

      return (
        now - last >= COOLDOWN
      );
    });

  if (!fresh.length) return;

  fresh.forEach(x => {
    alarms.set(
      x.symbol,
      now
    );

    addHistory(x);
  });

  const x = fresh[0];

  const strong =
    x.status ===
    "GÜÇLÜ ERKEN UYARI";

  alarmSound(strong);

  if ("vibrate" in navigator) {
    navigator.vibrate(
      strong
        ? [400, 150, 500]
        : [250, 120, 300]
    );
  }

  if (
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    const m = x.metrics || {};

    try {
      new Notification(
        strong
          ? `GÜÇLÜ ERKEN UYARI — ${x.symbol}`
          : `ERKEN UYARI — ${x.symbol}`,
        {
          body:
            `Puan: ${x.score}/100\n` +
            `Fiyat: ${x.price}\n` +
            `Hacim: ${f(m.volX)}x\n` +
            `İşlem hızı: ${f(m.tradeX)}x\n` +
            `Alış baskısı: %${f(
              m.w30?.buyRatio,
              1
            )}`,

          tag:
            "traderadar-signal"
        }
      );
    } catch {}
  }
}


// =====================================
// SEKME DÜĞMELERİ
// =====================================

const nav =
  document.createElement("div");

nav.style.cssText =
  "display:flex;" +
  "gap:7px;" +
  "padding:10px 16px;" +
  "overflow-x:auto;" +
  "position:sticky;" +
  "top:0;" +
  "z-index:100;" +
  "background:#0b1220;";


function makeTab(
  text,
  view
) {
  const b =
    document.createElement("button");

  b.textContent = text;

  b.style.cssText =
    "white-space:nowrap;" +
    "padding:10px 13px;" +
    "border:0;" +
    "border-radius:10px;" +
    "font-weight:700;" +
    "cursor:pointer;";

  b.onclick = () => {
    activeView = view;
    draw();
  };

  nav.appendChild(b);

  return b;
}


const liveTab =
  makeTab(
    "Canlı Radar",
    "live"
  );

const moversTab =
  makeTab(
    "Hareket Edenler",
    "movers"
  );

const historyTab =
  makeTab(
    "Sinyal Geçmişi",
    "history"
  );


if (C?.parentNode) {
  C.parentNode.insertBefore(
    nav,
    C
  );
}


// =====================================
// SABİT DÜĞMELER
// =====================================

const notifyBtn =
  document.createElement("button");

notifyBtn.textContent =
  (
    "Notification" in window &&
    Notification.permission === "granted"
  )
    ? "Bildirimler Açık"
    : "Bildirimleri Aç";

notifyBtn.onclick =
  enableNotifications;


const testBtn =
  document.createElement("button");

testBtn.textContent =
  "Alarmı Test Et";

testBtn.onclick =
  testAlarm;


const controls =
  document.createElement("div");

controls.style.cssText =
  "position:fixed;" +
  "right:12px;" +
  "bottom:15px;" +
  "z-index:999;" +
  "display:flex;" +
  "flex-direction:column;" +
  "gap:8px;";


for (
  const b of [
    testBtn,
    notifyBtn
  ]
) {
  b.style.cssText =
    "padding:11px 15px;" +
    "border:0;" +
    "border-radius:20px;" +
    "font-weight:700;" +
    "cursor:pointer;";
}


controls.appendChild(testBtn);
controls.appendChild(notifyBtn);

document.body.appendChild(
  controls
);
// =====================================
// CANLI RADAR EKRANI
// =====================================

function renderLive() {
  if (!rows.length) {
    C.innerHTML = `
      <article class="card">
        <div class="sym">Radar verisi bekleniyor</div>
      </article>
    `;
    return;
  }

  C.innerHTML =
    rows.map(x => {
      const m = x.metrics || {};

      const symbol =
        x.symbol.replace(
          "-USDT",
          "/USDT"
        );

      const peak =
        Number(
          m.peak5m ??
          x.peak5m ??
          x.score
        );

      let warmup = "";

      if (
        x.status ===
        "VERİ TOPLANIYOR"
      ) {
        const remaining =
          Math.ceil(
            Number(
              m.warmupRemaining || 0
            ) / 60000
          );

        warmup = `
          <div class="m">
            <span>Hazırlık</span>
            <b>${remaining} dk</b>
          </div>
        `;
      }

      return `
        <article class="card">

          <div class="top">
            <div>
              <div class="sym">
                ${symbol}
              </div>

              <span class="status">
                ${x.status}
              </span>
            </div>

            <div>
              <div class="score">
                ${x.score}/100
              </div>

              <small>
                ${x.price}
              </small>
            </div>
          </div>

          <div class="bar">
            <i style="width:${Math.min(
              100,
              Number(x.score) || 0
            )}%"></i>
          </div>

          <div class="metrics">

            <div class="m">
              <span>5 dk zirve</span>
              <b>${f(peak, 0)}/100</b>
            </div>

            <div class="m">
              <span>120 sn hacim</span>
              <b>${f(m.volX)}x</b>
            </div>

            <div class="m">
              <span>İşlem hızı</span>
              <b>${f(m.tradeX)}x</b>
            </div>

            <div class="m">
              <span>30 sn alış</span>
              <b>
                %${f(
                  m.w30?.buyRatio,
                  1
                )}
              </b>
            </div>

            <div class="m">
              <span>10 sn fiyat</span>
              <b>
                %${f(
                  m.w10?.ret
                )}
              </b>
            </div>

            <div class="m">
              <span>30 sn fiyat</span>
              <b>
                %${f(
                  m.w30?.ret
                )}
              </b>
            </div>

            <div class="m">
              <span>60 sn fiyat</span>
              <b>
                %${f(
                  m.w60?.ret
                )}
              </b>
            </div>

            <div class="m">
              <span>120 sn fiyat</span>
              <b>
                %${f(
                  m.w120?.ret
                )}
              </b>
            </div>

            <div class="m">
              <span>Sıkışma</span>
              <b>
                ${f(
                  m.compression,
                  0
                )}/100
              </b>
            </div>

            <div class="m">
              <span>Dirence uzaklık</span>
              <b>
                %${f(
                  m.resistanceDistance
                )}
              </b>
            </div>

            ${warmup}

          </div>

        </article>
      `;
    }).join("");
}


// =====================================
// HAREKET EDENLER KARTI
// =====================================

function moverCard(x, type) {
  const up =
    type === "up";

  const symbol =
    x.symbol.replace(
      "-USDT",
      "/USDT"
    );

  const score =
    up
      ? x.continuationScore
      : x.reversalScore;

  const status =
    up
      ? x.continuationText
      : x.reversalText;

  return `
    <article class="card">

      <div class="top">

        <div>
          <div class="sym">
            ${symbol}
          </div>

          <span class="status">
            ${status}
          </span>
        </div>

        <div>
          <div class="score">
            ${
              Number(x.change24) >= 0
                ? "+"
                : ""
            }${f(x.change24)}%
          </div>

          <small>
            ${x.price}
          </small>
        </div>

      </div>

      <div class="bar">
        <i style="width:${Math.min(
          100,
          Number(score) || 0
        )}%"></i>
      </div>

      <div class="metrics">

        <div class="m">
          <span>
            ${
              up
                ? "Devam gücü"
                : "Dönüş gücü"
            }
          </span>

          <b>
            ${f(score, 0)}/100
          </b>
        </div>

        <div class="m">
          <span>15 dk momentum</span>
          <b>
            %${f(x.momentum15)}
          </b>
        </div>

        <div class="m">
          <span>1 saat momentum</span>
          <b>
            %${f(x.momentum1h)}
          </b>
        </div>

        <div class="m">
          <span>Hacim oranı</span>
          <b>
            ${f(x.volumeRatio)}x
          </b>
        </div>

        ${
          up
            ? `
              <div class="m">
                <span>
                  24s zirveye uzaklık
                </span>

                <b>
                  %${f(
                    x.distanceFromHigh
                  )}
                </b>
              </div>
            `
            : `
              <div class="m">
                <span>
                  Muhtemel tepki bölgesi
                </span>

                <b>
                  ${f(
                    x.supportLow,
                    8
                  )}
                  –
                  ${f(
                    x.supportHigh,
                    8
                  )}
                </b>
              </div>
            `
        }

      </div>

    </article>
  `;
}


// =====================================
// HAREKET EDENLER EKRANI
// =====================================

function renderMovers() {
  const gainers =
    movers.gainers || [];

  const losers =
    movers.losers || [];

  const updated =
    movers.updatedAt
      ? new Date(
          movers.updatedAt
        ).toLocaleTimeString(
          "tr-TR"
        )
      : "-";

  C.innerHTML = `
    <article class="card">
      <div class="sym">
        En Çok Hareket Edenler
      </div>

      <small>
        Son analiz: ${updated}
      </small>
    </article>

    <div style="padding:12px 2px">
      <h2>
        En Çok Yükselenler
      </h2>
    </div>

    ${
      gainers.length
        ? gainers
            .map(
              x =>
                moverCard(
                  x,
                  "up"
                )
            )
            .join("")
        : `
          <article class="card">
            Yükselen coin analizi
            hazırlanıyor.
          </article>
        `
    }

    <div style="padding:20px 2px 12px">
      <h2>
        En Çok Düşenler
      </h2>
    </div>

    ${
      losers.length
        ? losers
            .map(
              x =>
                moverCard(
                  x,
                  "down"
                )
            )
            .join("")
        : `
          <article class="card">
            Düşen coin analizi
            hazırlanıyor.
          </article>
        `
    }
  `;
}


// =====================================
// SİNYAL GEÇMİŞİ EKRANI
// =====================================

function renderHistory() {
  const list =
    getHistory();

  if (!list.length) {
    C.innerHTML = `
      <article class="card">
        <div class="sym">
          Henüz sinyal geçmişi yok
        </div>

        <p>
          Radar ilk ERKEN UYARI veya
          GÜÇLÜ ERKEN UYARI verdiğinde
          coin, tarih, saat, fiyat ve
          sinyal verileri burada
          kaydedilecek.
        </p>
      </article>
    `;

    return;
  }

  C.innerHTML =
    list.map(h => {
      const d =
        new Date(
          h.timestamp
        );

      const date =
        d.toLocaleDateString(
          "tr-TR"
        );

      const time =
        d.toLocaleTimeString(
          "tr-TR"
        );

      return `
        <article class="card">

          <div class="top">

            <div>
              <div class="sym">
                ${h.symbol.replace(
                  "-USDT",
                  "/USDT"
                )}
              </div>

              <span class="status">
                ${h.status}
              </span>
            </div>

            <div>
              <div class="score">
                ${h.score}/100
              </div>

              <small>
                ${date}
                ${time}
              </small>
            </div>

          </div>

          <div class="metrics">

            <div class="m">
              <span>İlk sinyal fiyatı</span>
              <b>${h.price}</b>
            </div>

            <div class="m">
              <span>Zirve puanı</span>
              <b>
                ${f(h.peak, 0)}/100
              </b>
            </div>

            <div class="m">
              <span>Sinyal sonrası zirve</span>
              <b>${h.high}</b>
            </div>

            <div class="m">
              <span>Maksimum yükseliş</span>
              <b>
                +%${f(h.maxGain)}
              </b>
            </div>

            <div class="m">
              <span>Hacim</span>
              <b>
                ${f(h.volX)}x
              </b>
            </div>

            <div class="m">
              <span>İşlem hızı</span>
              <b>
                ${f(h.tradeX)}x
              </b>
            </div>

            <div class="m">
              <span>Alış baskısı</span>
              <b>
                %${f(h.buy, 1)}
              </b>
            </div>

            <div class="m">
              <span>10 sn</span>
              <b>
                %${f(h.ret10)}
              </b>
            </div>

            <div class="m">
              <span>30 sn</span>
              <b>
                %${f(h.ret30)}
              </b>
            </div>

            <div class="m">
              <span>60 sn</span>
              <b>
                %${f(h.ret60)}
              </b>
            </div>

            <div class="m">
              <span>120 sn</span>
              <b>
                %${f(h.ret120)}
              </b>
            </div>

            <div class="m">
              <span>Son durum</span>
              <b>
                ${h.lastStatus}
              </b>
            </div>

          </div>

        </article>
      `;
    }).join("");
}


// =====================================
// EKRAN SEÇİMİ
// =====================================

function draw() {
  if (
    activeView === "movers"
  ) {
    renderMovers();
    return;
  }

  if (
    activeView === "history"
  ) {
    renderHistory();
    return;
  }

  renderLive();
}


// =====================================
// HAREKET VERİSİ
// =====================================

async function pollMovers() {
  try {
    const r =
      await fetch(
        "/api/movers?t=" +
        Date.now(),
        {
          cache: "no-store"
        }
      );

    if (!r.ok) {
      throw new Error(
        `HTTP ${r.status}`
      );
    }

    movers =
      await r.json();

    if (
      activeView === "movers"
    ) {
      renderMovers();
    }

  } catch {}
}


// =====================================
// RADAR HTTP YEDEK
// =====================================

async function pollRadar() {
  try {
    const r =
      await fetch(
        "/api/radar?t=" +
        Date.now(),
        {
          cache: "no-store"
        }
      );

    if (!r.ok) {
      throw new Error(
        `HTTP ${r.status}`
      );
    }

    const data =
      await r.json();

    if (
      data.type === "radar" &&
      Array.isArray(data.rows)
    ) {
      rows = data.rows;

      processAlerts();
      updateHistory();

      T.textContent =
        new Date()
          .toLocaleTimeString(
            "tr-TR"
          );

      if (!wsConnected) {
        K.textContent =
          `OKX HTTP — ${data.tracked || "?"} coin`;
      }

      if (
        activeView === "live"
      ) {
        renderLive();
      }
    }

  } catch {
    if (!wsConnected) {
      K.textContent =
        "Bağlantı bekleniyor...";
    }
  }
}


// =====================================
// WEBSOCKET
// =====================================

function connectWS() {
  const protocol =
    location.protocol === "https:"
      ? "wss"
      : "ws";

  const ws =
    new WebSocket(
      `${protocol}://${location.host}/live`
    );

  ws.onopen = () => {
    wsConnected = true;

    K.textContent =
      "OKX Canlı";
  };

  ws.onmessage = event => {
    try {
      const data =
        JSON.parse(
          event.data
        );

      if (
        data.type === "radar" &&
        Array.isArray(
          data.rows
        )
      ) {
        rows =
          data.rows;

        processAlerts();
        updateHistory();

        T.textContent =
          new Date()
            .toLocaleTimeString(
              "tr-TR"
            );

        K.textContent =
          `OKX Canlı — ${data.tracked || "?"} coin`;

        if (
          activeView === "live"
        ) {
          renderLive();
        }
      }

    } catch {}
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


// =====================================
// BAŞLAT
// =====================================

connectWS();

pollRadar();
pollMovers();

setInterval(
  pollRadar,
  3000
);

setInterval(
  pollMovers,
  30000
);

draw();
