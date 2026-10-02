const C = document.querySelector("#cards");
const K = document.querySelector("#conn");
const T = document.querySelector("#time");

const f = (n, d = 2) =>
  Number.isFinite(Number(n))
    ? Number(n).toFixed(d)
    : "-";

const COOLDOWN = 10 * 60 * 1000;

let rows = [];
let movers = {
  gainers: [],
  losers: [],
  updatedAt: 0
};

let activeView = "live";
let wsConnected = false;
let ws = null;
let audioCtx = null;

const alarmTimes = new Map();


// =====================================
// SES
// =====================================

async function unlockAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (
        window.AudioContext ||
        window.webkitAudioContext
      )();
    }

    if (
      audioCtx.state === "suspended"
    ) {
      await audioCtx.resume();
    }

    return true;
  } catch {
    return false;
  }
}

async function beep(strong = false) {
  return;
}

// =====================================
// PUSH YARDIMCISI
// =====================================

function urlBase64ToUint8Array(
  base64String
) {
  const padding =
    "=".repeat(
      (
        4 -
        base64String.length % 4
      ) % 4
    );

  const base64 =
    (
      base64String +
      padding
    )
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const raw =
    atob(base64);

  return Uint8Array.from(
    [...raw].map(
      c => c.charCodeAt(0)
    )
  );
}


// =====================================
// BİLDİRİMLERİ AÇ
// =====================================

async function enableNotifications() {
  try {
    await unlockAudio();

    if (
      !("serviceWorker" in navigator)
    ) {
      throw new Error(
        "Service Worker desteklenmiyor."
      );
    }

    if (
      !("PushManager" in window)
    ) {
      throw new Error(
        "Push bildirimi desteklenmiyor."
      );
    }

    const permission =
      await Notification
        .requestPermission();

    if (
      permission !== "granted"
    ) {
      throw new Error(
        "Bildirim izni verilmedi."
      );
    }

    const reg =
      await navigator
        .serviceWorker
        .register(
          "/service-worker.js"
        );

    await navigator
      .serviceWorker
      .ready;

    const keyResponse =
      await fetch(
        "/api/push/public-key",
        {
          cache: "no-store"
        }
      );

    if (!keyResponse.ok) {
      throw new Error(
        "Push anahtarı alınamadı."
      );
    }

    const keyData =
      await keyResponse.json();

    if (!keyData.publicKey) {
      throw new Error(
        "VAPID anahtarı bulunamadı."
      );
    }

    let subscription =
      await reg.pushManager
        .getSubscription();

    if (!subscription) {
      subscription =
        await reg.pushManager
          .subscribe({
            userVisibleOnly: true,

            applicationServerKey:
              urlBase64ToUint8Array(
                keyData.publicKey
              )
          });
    }

    const response =
      await fetch(
        "/api/push/subscribe",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              subscription
            )
        }
      );

    if (!response.ok) {
      throw new Error(
        "Telefon sunucuya kaydedilemedi."
      );
    }

    const result =
      await response.json();

    notifyBtn.textContent =
      "Arka Plan Bildirimi Açık";

    await beep(false);

    if (
      "vibrate" in navigator
    ) {
      navigator.vibrate(
        [250, 100, 250]
      );
    }

    alert(
      "Arka plan bildirimi açık.\n" +
      "Kayıtlı cihaz: " +
      (result.count || 1)
    );

  } catch (e) {
    console.error(
      "Push:",
      e
    );

    alert(
      "Bildirim açılamadı: " +
      e.message
    );
  }
}


// =====================================
// ALARM TESTİ
// =====================================

async function testAlarm() {
  await unlockAudio();
  await beep(true);

  if (
    "vibrate" in navigator
  ) {
    navigator.vibrate(
      [400, 150, 500]
    );
  }

  try {
    const r =
      await fetch(
        "/api/push/test",
        {
          method: "POST"
        }
      );

    const data =
      await r.json();

    if (
      r.ok &&
      data.sent > 0
    ) {
      alert(
        "Push test bildirimi gönderildi."
      );
      return;
    }
  } catch {}

  if (
    "Notification" in window &&
    Notification.permission ===
      "granted"
  ) {
    try {
      new Notification(
        "TradeRadar Test",
        {
          body:
            "Alarm sistemi çalışıyor."
        }
      );
    } catch {}
  }
}


// =====================================
// YEREL SİNYAL GEÇMİŞİ
// =====================================

function history() {
  try {
    return JSON.parse(
      localStorage.getItem(
        "traderadar_history_v3"
      ) || "[]"
    );
  } catch {
    return [];
  }
}


function saveHistory(list) {
  try {
    localStorage.setItem(
      "traderadar_history_v3",
      JSON.stringify(
        list.slice(0, 500)
      )
    );
  } catch {}
}


function addHistory(x) {
  const list = history();
  const now = Date.now();

  const exists =
    list.some(
      h =>
        h.symbol === x.symbol &&
        h.status === x.status &&
        now - h.time < COOLDOWN
    );

  if (exists) return;

  const m =
    x.metrics || {};

  list.unshift({
    time: now,

    symbol: x.symbol,
    status: x.status,

    price:
      Number(x.price),

    score:
      Number(x.score),

    peak:
      Number(
        x.peak5m ||
        m.peak5m ||
        x.score
      ),

    volX:
      Number(m.volX || 0),

    tradeX:
      Number(m.tradeX || 0),

    volAccel:
      Number(
        m.volumeAcceleration || 0
      ),

    tradeAccel:
      Number(
        m.tradeAcceleration || 0
      ),

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

    resistance:
      Number(
        m.resistanceDistance || 0
      ),

    high:
      Number(x.price),

    maxGain: 0,

    lastStatus:
      x.status
  });

  saveHistory(list);
}


// =====================================
// GEÇMİŞİ GÜNCELLE
// =====================================

function updateHistory() {
  const list = history();
  let changed = false;

  for (const h of list) {
    const x =
      rows.find(
        r =>
          r.symbol === h.symbol
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
              (
                price -
                h.price
              ) /
              h.price
            ) * 100
          : 0;

      changed = true;
    }

    if (
      h.lastStatus !==
      x.status
    ) {
      h.lastStatus =
        x.status;

      changed = true;
    }
  }

  if (changed) {
    saveHistory(list);
  }
}


// =====================================
// ALARM
// =====================================

function isAlertStatus(status) {
  return (
    status ===
      "PATLAMA HAZIRLIĞI" ||

    status ===
      "GÜÇLÜ PATLAMA HAZIRLIĞI" ||

    status ===
      "KIRILIM TEYİDİ"
  );
}


function processAlerts() {
  const now = Date.now();

  const candidates =
    rows
      .filter(
        x =>
          isAlertStatus(
            x.status
          )
      )
      .filter(
        x =>
          x.metrics?.ready !==
          false
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  for (const x of candidates) {
    const key =
      `${x.symbol}-${x.status}`;

    const last =
      alarmTimes.get(key) || 0;

    if (
      now - last <
      COOLDOWN
    ) {
      continue;
    }

    alarmTimes.set(
      key,
      now
    );

    addHistory(x);

    const strong =
      x.status ===
        "GÜÇLÜ PATLAMA HAZIRLIĞI" ||
      x.status ===
        "KIRILIM TEYİDİ";

    beep(strong);

    if (
      "vibrate" in navigator
    ) {
      navigator.vibrate(
        strong
          ? [500, 150, 500]
          : [300, 120, 300]
      );
    }

    break;
  }
}


// =====================================
// MENÜ
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


function addTab(
  text,
  view
) {
  const button =
    document.createElement(
      "button"
    );

  button.textContent =
    text;

  button.style.cssText =
    "white-space:nowrap;" +
    "padding:10px 13px;" +
    "border:0;" +
    "border-radius:10px;" +
    "font-weight:700;";

  button.onclick = () => {
    activeView = view;
    draw();
  };

  nav.appendChild(
    button
  );
}


addTab(
  "Canlı Radar",
  "live"
);

addTab(
  "Hareket Edenler",
  "movers"
);

addTab(
  "Sinyal Geçmişi",
  "history"
);
addTab(
  "Coin Sorgula",
  "search"
);
addTab(
  "Performans Testi",
  "performance"
);
if (
  C &&
  C.parentNode
) {
  C.parentNode.insertBefore(
    nav,
    C
  );
}


// =====================================
// ALARM DÜĞMELERİ
// =====================================

const notifyBtn =
  document.createElement(
    "button"
  );

notifyBtn.textContent =
  (
    "Notification" in window &&
    Notification.permission ===
      "granted"
  )
    ? "Bildirimler Açık"
    : "Bildirimleri Aç";

notifyBtn.onclick =
  enableNotifications;


const testBtn =
  document.createElement(
    "button"
  );

testBtn.textContent =
  "Alarmı Test Et";

testBtn.onclick =
  testAlarm;


const controls =
  document.createElement(
    "div"
  );

controls.style.cssText =
  "position:fixed;" +
  "right:12px;" +
  "bottom:15px;" +
  "z-index:999;" +
  "display:flex;" +
  "flex-direction:column;" +
  "gap:8px;";


for (
  const button of [
    testBtn,
    notifyBtn
  ]
) {
  button.style.cssText =
    "padding:11px 15px;" +
    "border:0;" +
    "border-radius:20px;" +
    "font-weight:700;";
}


controls.appendChild(
  testBtn
);

controls.appendChild(
  notifyBtn
);

document.body.appendChild(
  controls
);


// =====================================
// CANLI RADAR KARTI
// =====================================

function renderLive() {
  if (!C) return;

  if (!rows.length) {
    C.innerHTML = `
      <article class="card">
        Veri bekleniyor...
      </article>
    `;

    return;
  }

  C.innerHTML =
    rows
      .map(
        x => {
          const m =
            x.metrics || {};

          const symbol =
            x.symbol.replace(
              "-USDT",
              "/USDT"
            );

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
                <i
                  style="width:${Math.min(
                    100,
                    Number(
                      x.score
                    ) || 0
                  )}%"
                ></i>
              </div>


              <div class="metrics">

                <div class="m">
                  <span>Hacim</span>
                  <b>
                    ${f(
                      m.volX
                    )}x
                  </b>
                </div>

                <div class="m">
                  <span>
                    Hacim ivmesi
                  </span>
                  <b>
                    ${f(
                      m.volumeAcceleration
                    )}x
                  </b>
                </div>

                <div class="m">
                  <span>
                    İşlem hızı
                  </span>
                  <b>
                    ${f(
                      m.tradeX
                    )}x
                  </b>
                </div>

                <div class="m">
                  <span>
                    İşlem ivmesi
                  </span>
                  <b>
                    ${f(
                      m.tradeAcceleration
                    )}x
                  </b>
                </div>

                <div class="m">
                  <span>
                    Alış baskısı
                  </span>
                  <b>
                    %${f(
                      m.w30
                        ?.buyRatio,
                      1
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    10 sn fiyat
                  </span>
                  <b>
                    %${f(
                      m.w10?.ret
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    30 sn fiyat
                  </span>
                  <b>
                    %${f(
                      m.w30?.ret
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    60 sn fiyat
                  </span>
                  <b>
                    %${f(
                      m.w60?.ret
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    120 sn fiyat
                  </span>
                  <b>
                    %${f(
                      m.w120?.ret
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    Sıkışma
                  </span>
                  <b>
                    ${f(
                      m.compression,
                      0
                    )}/100
                  </b>
                </div>

                <div class="m">
                  <span>
                    Trend
                  </span>
                  <b>
                    ${f(
                      m.trendScore,
                      0
                    )}/100
                  </b>
                </div>

                <div class="m">
                  <span>
                    Dirence uzaklık
                  </span>
                  <b>
                    %${f(
                      m.resistanceDistance
                    )}
                  </b>
                </div>

              </div>

            </article>
          `;
        }
      )
      .join("");
}


// =====================================
// HAREKET EDENLER
// =====================================

function moverCard(
  x,
  up
) {
  const score =
    up
      ? x.continuationScore
      : x.reversalScore;

  const text =
    up
      ? x.continuationText
      : x.reversalText;

  return `
    <article class="card">

      <div class="top">

        <div>
          <div class="sym">
            ${x.symbol.replace(
              "-USDT",
              "/USDT"
            )}
          </div>

          <span class="status">
            ${text || "-"}
          </span>
        </div>

        <div>
          <div class="score">
            ${
              Number(
                x.change24
              ) >= 0
                ? "+"
                : ""
            }${f(
              x.change24
            )}%
          </div>

          <small>
            ${x.price}
          </small>
        </div>

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
            ${f(
              score,
              0
            )}/100
          </b>
        </div>

                <div class="m">
          <span>
            Momentum
          </span>

          <b>
            %${f(
              x.momentum15
            )}
          </b>
        </div>

        <div class="m">
          <span>
            Hacim
          </span>

          <b>
            ${f(
              x.volumeRatio
            )}x
          </b>
        </div>

        ${
          !up
            ? `
              <div class="m">
                <span>
                  Muhtemel tepki
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
            : ""
        }

      </div>

    </article>
  `;
}


// =====================================
// HAREKET EDENLER EKRANI
// =====================================

function renderMovers() {
  if (!C) return;

  const gainers =
    movers.gainers || [];

  const losers =
    movers.losers || [];

  C.innerHTML = `
    <h2>
      En Çok Yükselenler
    </h2>

    ${
      gainers.length
        ? gainers
            .map(
              x =>
                moverCard(
                  x,
                  true
                )
            )
            .join("")
        : `
          <article class="card">
            Veri bekleniyor...
          </article>
        `
    }


    <h2 style="margin-top:24px">
      En Çok Düşenler
    </h2>

    ${
      losers.length
        ? losers
            .map(
              x =>
                moverCard(
                  x,
                  false
                )
            )
            .join("")
        : `
          <article class="card">
            Veri bekleniyor...
          </article>
        `
    }
  `;
}


// =====================================
// SİNYAL GEÇMİŞİ
// =====================================

function renderHistory() {
  if (!C) return;

  const list =
    history();

  if (!list.length) {
    C.innerHTML = `
      <article class="card">

        <div class="sym">
          Henüz yeni sinyal yok
        </div>

        <p>
          Patlama hazırlığı veya
          kırılım teyidi oluştuğunda
          burada görünecek.
        </p>

      </article>
    `;

    return;
  }


  C.innerHTML =
    list
      .map(
        h => {
          const date =
            new Date(
              h.time
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
                    ${date.toLocaleString(
                      "tr-TR"
                    )}
                  </small>
                </div>

              </div>


              <div class="metrics">

                <div class="m">
                  <span>
                    İlk sinyal fiyatı
                  </span>

                  <b>
                    ${h.price}
                  </b>
                </div>

                <div class="m">
                  <span>
                    Sinyal sonrası zirve
                  </span>

                  <b>
                    ${h.high}
                  </b>
                </div>

                <div class="m">
                  <span>
                    Maksimum yükseliş
                  </span>

                  <b>
                    +%${f(
                      h.maxGain
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    Hacim
                  </span>

                  <b>
                    ${f(
                      h.volX
                    )}x
                  </b>
                </div>

                <div class="m">
                  <span>
                    Hacim ivmesi
                  </span>

                  <b>
                    ${f(
                      h.volAccel
                    )}x
                  </b>
                </div>

                <div class="m">
                  <span>
                    İşlem hızı
                  </span>

                  <b>
                    ${f(
                      h.tradeX
                    )}x
                  </b>
                </div>

                <div class="m">
                  <span>
                    İşlem ivmesi
                  </span>

                  <b>
                    ${f(
                      h.tradeAccel
                    )}x
                  </b>
                </div>

                <div class="m">
                  <span>
                    Alış baskısı
                  </span>

                  <b>
                    %${f(
                      h.buy,
                      1
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    120 sn fiyat
                  </span>

                  <b>
                    %${f(
                      h.ret120
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    Dirence uzaklık
                  </span>

                  <b>
                    %${f(
                      h.resistance
                    )}
                  </b>
                </div>

                <div class="m">
                  <span>
                    Son durum
                  </span>

                  <b>
                    ${h.lastStatus}
                  </b>
                </div>

              </div>

            </article>
          `;
        }
      )
      .join("");
}


// =====================================
// EKRAN SEÇİMİ
// =====================================
// =====================================
// COİN SORGULAMA
// =====================================

function renderSearch() {
  if (!C) return;

  C.innerHTML = `
    <article class="card">
      <div class="sym">
        Coin Sorgula
      </div>

      <div style="
        display:flex;
        gap:8px;
        margin-top:12px;
      ">
        <input
          id="coinSearchInput"
          type="text"
          placeholder="Örnek: MEME"
          autocomplete="off"
          style="
            flex:1;
            min-width:0;
            padding:12px;
            border-radius:10px;
            border:1px solid #334155;
            font-size:16px;
          "
        >

        <button
          id="coinSearchBtn"
          style="
            padding:12px 16px;
            border:0;
            border-radius:10px;
            font-weight:700;
          "
        >
          Sorgula
        </button>
      </div>

      <div
        id="coinSearchResult"
        style="margin-top:14px"
      >
        Coin adını yazıp Sorgula'ya basın.
      </div>
    </article>
  `;


  const input =
    document.querySelector(
      "#coinSearchInput"
    );

  const button =
    document.querySelector(
      "#coinSearchBtn"
    );


  button.onclick = () => {
    searchCoin(
      input.value
    );
  };


  input.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter"
      ) {
        searchCoin(
          input.value
        );
      }
    }
  );
}


async function searchCoin(value) {
  const result =
    document.querySelector(
      "#coinSearchResult"
    );

  if (!result) return;


  let query =
    String(value || "")
      .trim()
      .toUpperCase()
      .replace("/USDT", "")
      .replace("-USDT", "")
      .replace("USDT", "")
      .trim();


  if (!query) {
    result.innerHTML =
      "Coin adı yazın.";
    return;
  }


  result.innerHTML = `
    <div class="status">
      ${query}/USDT sorgulanıyor...
    </div>
  `;


  try {
    const response =
      await fetch(
        `/api/coin/${encodeURIComponent(
          query
        )}?t=${Date.now()}`,
        {
          cache: "no-store"
        }
      );


    if (response.status === 404) {
      result.innerHTML = `
        <div class="status">
          ${query}/USDT bulunamadı.
        </div>
      `;
      return;
    }


    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      !data.ok ||
      !data.symbol
    ) {
      throw new Error(
        "Coin verisi alınamadı."
      );
    }


    const m =
      data.metrics || {};

    const a =
      data.analysis || {};

    const h =
      data.history;

    const u =
      data.ultimateResult || null;

    const ultimateSignal =
      u?.signalAnalysis || {};

    const ultimateEntry =
      u?.entryAnalysis || {};

    const ultimateStop =
      u?.stopAnalysis || {};

    const ultimateTarget =
      u?.targetRiskAnalysis || {};

    const ultimateRegime =
      u?.marketRegime || {};

    const ultimateRisk =
      u?.riskFilters || {};

    const ultimateScore =
  Number(
    ultimateSignal.technicalScore ??
    ultimateSignal.scoreDetails?.total ??
    0
  );

    const ultimateStatus =
  ultimateSignal.stage ||
  ultimateSignal.message ||
  (
    data.ultimateReady
      ? "İZLE"
      : "ULTIMATE HAZIRLANIYOR"
  );

    const entryIdeal =
      ultimateEntry?.entry?.ideal ??
      ultimateEntry?.ideal ??
      "-";

    const entryMin =
  ultimateEntry?.entry?.low ??
  "-";

const entryMax =
  ultimateEntry?.entry?.high ??
  ultimateEntry?.entry?.maximum ??
  "-";

    const stopPrice =
      ultimateStop?.stop ??
      "-";

    const target1 =
      ultimateTarget?.targets?.target1 ??
      ultimateTarget?.target1 ??
      "-";

    const target2 =
      ultimateTarget?.targets?.target2 ??
      ultimateTarget?.target2 ??
      "-";

    const target3 =
      ultimateTarget?.targets?.target3 ??
      ultimateTarget?.target3 ??
      "-";

    const netRR =
  ultimateTarget?.riskReward?.netRR ??
  "-";

    const regimeText =
      ultimateRegime?.regime ||
      ultimateRegime?.status ||
      "-";

    const riskAllowed =
      ultimateRisk?.tradingAllowed === true
        ? "UYGUN"
        : "UYGUN DEĞİL";
    const signalTime =
      h?.time
        ? new Date(
            h.time
          ).toLocaleString(
            "tr-TR"
          )
        : "Henüz sinyal yok";


    const firstPrice =
      h?.price ?? "-";


    const highPrice =
      h?.high ?? "-";


    const maxGain =
      Number.isFinite(
        Number(h?.maxGain)
      )
        ? `+%${f(
            h.maxGain
          )}`
        : "-";


    let explanation =
      "Şu anda güçlü hazırlık şartlarının tamamı oluşmamış.";


    if (
      data.status ===
      "KIRILIM TEYİDİ"
    ) {
      explanation =
        "Direnç kırılımı tespit edilmiş. " +
        "Hacim ve işlem akışının devamı izlenmeli.";

    } else if (
      data.status ===
      "GÜÇLÜ PATLAMA HAZIRLIĞI"
    ) {
      explanation =
        "Hacim, işlem akışı ve alıcı baskısı güçlü. " +
        "Fiyat henüz aşırı ilerlememiş.";

    } else if (
      data.status ===
      "PATLAMA HAZIRLIĞI"
    ) {
      explanation =
        "Erken hazırlık şartları oluşmuş ancak güçlü teyit şartlarının tamamı henüz oluşmamış.";

    } else if (
      data.status ===
      "BİRİKİM TESPİT EDİLDİ"
    ) {
      explanation =
        "Birikim belirtileri mevcut ancak güçlü kırılım henüz teyit edilmemiş.";

    } else if (
      data.status ===
      "GEÇ KALINDI"
    ) {
      explanation =
        "Fiyat hareketinin önemli bölümü gerçekleşmiş olabilir.";
    }


    const check = (
      name,
      ok
    ) => `
      <div class="m">
        <span>
          ${name}
        </span>

        <b>
          ${ok ? "UYGUN" : "YETERSİZ"}
        </b>
      </div>
    `;


    result.innerHTML = `
      <div style="margin-top:8px">

        <div class="top">

          <div>
            <div class="sym">
              ${data.symbol.replace(
                "-USDT",
                "/USDT"
              )}
            </div>

            <span class="status">
              ${data.status}
            </span>
          </div>

          <div>
            <div class="score">
              ${data.score}/100
            </div>

            <small>
              ${data.price}
            </small>
          </div>

        </div>


        <div class="bar">
          <i style="width:${Math.min(
            100,
            Number(
              data.score
            ) || 0
          )}%"></i>
        </div>


        <div class="metrics">

          <div class="m">
            <span>
              Anlık fiyat
            </span>
            <b>
              ${data.price}
            </b>
          </div>

          <div class="m">
            <span>
              Radar puanı
            </span>
            <b>
              ${data.score}/100
            </b>
          </div>

          <div class="m">
            <span>
              5 dk zirve puanı
            </span>
            <b>
              ${f(
                data.peak5m,
                0
              )}/100
            </b>
          </div>

          <div class="m">
            <span>Hacim</span>
            <b>
              ${f(
                m.volX
              )}x
            </b>
          </div>

          <div class="m">
            <span>
              Hacim ivmesi
            </span>
            <b>
              ${f(
                m.volumeAcceleration
              )}x
            </b>
          </div>

          <div class="m">
            <span>
              İşlem hızı
            </span>
            <b>
              ${f(
                m.tradeX
              )}x
            </b>
          </div>

          <div class="m">
            <span>
              İşlem ivmesi
            </span>
            <b>
              ${f(
                m.tradeAcceleration
              )}x
            </b>
          </div>

          <div class="m">
            <span>
              Alış baskısı
            </span>
            <b>
              %${f(
                m.w30?.buyRatio,
                1
              )}
            </b>
          </div>

          <div class="m">
            <span>
              5 sn fiyat
            </span>
            <b>
              %${f(
                m.w5?.ret
              )}
            </b>
          </div>

          <div class="m">
            <span>
              10 sn fiyat
            </span>
            <b>
              %${f(
                m.w10?.ret
              )}
            </b>
          </div>

          <div class="m">
            <span>
              30 sn fiyat
            </span>
            <b>
              %${f(
                m.w30?.ret
              )}
            </b>
          </div>

          <div class="m">
            <span>
              60 sn fiyat
            </span>
            <b>
              %${f(
                m.w60?.ret
              )}
            </b>
          </div>

          <div class="m">
            <span>
              120 sn fiyat
            </span>
            <b>
              %${f(
                m.w120?.ret
              )}
            </b>
          </div>

          <div class="m">
            <span>
              Sıkışma
            </span>
            <b>
              ${f(
                m.compression,
                0
              )}/100
            </b>
          </div>

          <div class="m">
            <span>
              Trend yapısı
            </span>
            <b>
              ${f(
                m.trendScore,
                0
              )}/100
            </b>
          </div>

          <div class="m">
            <span>
              Dirence uzaklık
            </span>
            <b>
              %${f(
                m.resistanceDistance
              )}
            </b>
          </div>

          <div class="m">
            <span>
              İlk sinyal fiyatı
            </span>
            <b>
              ${firstPrice}
            </b>
          </div>

          <div class="m">
            <span>
              Sinyal sonrası zirve
            </span>
            <b>
              ${highPrice}
            </b>
          </div>

          <div class="m">
            <span>
              Maksimum yükseliş
            </span>
            <b>
              ${maxGain}
            </b>
          </div>

          <div class="m">
            <span>
              Son sinyal zamanı
            </span>
            <b>
              ${signalTime}
            </b>
          </div>

        </div>

        <div
          class="card"
          style="margin-top:12px"
        >
          <div class="sym">
            ULTIMATE ANALİZ
          </div>

          <div class="metrics">

            <div class="m">
              <span>Ultimate hazır</span>
              <b>
                ${data.ultimateReady
                  ? "EVET"
                  : "HAYIR"}
              </b>
            </div>

            <div class="m">
              <span>Ultimate puanı</span>
              <b>
                ${ultimateScore}/100
              </b>
            </div>

            <div class="m">
              <span>Karar</span>
              <b>
                ${ultimateStatus}
              </b>
            </div>

            <div class="m">
              <span>Piyasa rejimi</span>
              <b>
                ${regimeText}
              </b>
            </div>

            <div class="m">
              <span>Risk filtresi</span>
              <b>
                ${riskAllowed}
              </b>
            </div>

            <div class="m">
              <span>İdeal giriş</span>
              <b>
                ${entryIdeal}
              </b>
            </div>

            <div class="m">
              <span>Giriş alt sınır</span>
              <b>
                ${entryMin}
              </b>
            </div>

            <div class="m">
              <span>Giriş üst sınır</span>
              <b>
                ${entryMax}
              </b>
            </div>

            <div class="m">
              <span>Stop</span>
              <b>
                ${stopPrice}
              </b>
            </div>

            <div class="m">
              <span>Hedef 1</span>
              <b>
                ${target1}
              </b>
            </div>

            <div class="m">
              <span>Hedef 2</span>
              <b>
                ${target2}
              </b>
            </div>

            <div class="m">
              <span>Hedef 3</span>
              <b>
                ${target3}
              </b>
            </div>

            <div class="m">
              <span>Net R/R</span>
              <b>
                ${netRR}
              </b>
            </div>

          </div>
        </div>
        <div
          class="card"
          style="margin-top:12px"
        >
          <div class="sym">
            Güçlü Sinyal Kontrolü
          </div>

          <div class="metrics">

            ${check(
              "Hacim ≥ 2,00x",
              a.volumeStrong
            )}

            ${check(
              "Hacim ivmesi ≥ 1,40x",
              a.volumeAccelerationStrong
            )}

            ${check(
              "İşlem hızı ≥ 1,20x",
              a.tradeStrong
            )}

            ${check(
              "İşlem ivmesi ≥ 1,30x",
              a.tradeAccelerationStrong
            )}

            ${check(
              "Alış baskısı ≥ %65",
              a.buyerStrong
            )}

            ${check(
              "Dirence yakın",
              a.resistanceNear
            )}

            ${check(
              "Fiyat henüz kaçmamış",
              a.priceNotExtended
            )}

          </div>
        </div>


        <div
          class="card"
          style="margin-top:12px"
        >
          <div class="sym">
            Neden bu durumda?
          </div>

          <p>
            ${explanation}
          </p>
        </div>

      </div>
    `;


  } catch (e) {
    console.error(
      "Coin sorgu:",
      e
    );

    result.innerHTML = `
      <div class="status">
        Coin sorgulanırken hata oluştu.
      </div>
    `;
  }
}
async function renderPerformance() {
  C.innerHTML = `
    <article class="card">
      <div class="sym">
        SİNYAL PERFORMANS TESTİ
      </div>
      <div class="status">
        Sonuçlar yükleniyor...
      </div>
    </article>
  `;

  try {
    const response =
      await fetch(
        `/api/performance?t=${Date.now()}`,
        { cache: "no-store" }
      );

    const data =
      await response.json();

    const labels = {
      m5: "5 dakika",
      m15: "15 dakika",
      m30: "30 dakika",
      h1: "1 saat",
      h4: "4 saat"
    };

    const cards =
      Object.entries(
        data.summary || {}
      )
        .map(([key, x]) => `
          <article class="card">
            <div class="sym">
              ${labels[key] || key}
            </div>

            <div class="metrics">
              <div class="m">
                <span>Test edilen</span>
                <b>${x.tested}</b>
              </div>

              <div class="m">
                <span>Başarı oranı</span>
                <b>%${f(x.successRate, 1)}</b>
              </div>

              <div class="m">
                <span>Pozitif</span>
                <b>${x.positive}</b>
              </div>

              <div class="m">
                <span>Negatif</span>
                <b>${x.negative}</b>
              </div>

              <div class="m">
                <span>Ortalama</span>
                <b>%${f(x.averagePct, 3)}</b>
              </div>

              <div class="m">
                <span>En iyi</span>
                <b>%${f(x.bestPct, 3)}</b>
              </div>

              <div class="m">
                <span>En kötü</span>
                <b>%${f(x.worstPct, 3)}</b>
              </div>
            </div>
          </article>
        `)
        .join("");
    
    const signalCards =
      (data.signals || [])
        .map(s => {
          const p5 =
            s.performance?.m5;

          const p15 =
            s.performance?.m15;

          const p30 =
            s.performance?.m30;

          const p1h =
            s.performance?.h1;

          const p4h =
            s.performance?.h4;

          return `
            <article class="card">
              <div class="sym">
                ${s.symbol.replace(
                  "-USDT",
                  "/USDT"
                )}
              </div>

              <div class="metrics">
                <div class="m">
                  <span>Sinyal</span>
                  <b>${s.status}</b>
                </div>

                <div class="m">
                  <span>Radar puanı</span>
                  <b>${s.score}/100</b>
                </div>

                <div class="m">
                  <span>Sinyal fiyatı</span>
                  <b>${s.signalPrice}</b>
                </div>

                <div class="m">
                  <span>5 dk</span>
                  <b>
                    ${p5
                      ? `%${f(
                          p5.changePct,
                          3
                        )}`
                      : "BEKLENİYOR"}
                  </b>
                </div>

                <div class="m">
                  <span>15 dk</span>
                  <b>
                    ${p15
                      ? `%${f(
                          p15.changePct,
                          3
                        )}`
                      : "BEKLENİYOR"}
                  </b>
                </div>

                <div class="m">
                  <span>30 dk</span>
                  <b>
                    ${p30
                      ? `%${f(
                          p30.changePct,
                          3
                        )}`
                      : "BEKLENİYOR"}
                  </b>
                </div>

                <div class="m">
                  <span>1 saat</span>
                  <b>
                    ${p1h
                      ? `%${f(
                          p1h.changePct,
                          3
                        )}`
                      : "BEKLENİYOR"}
                  </b>
                </div>

                <div class="m">
                  <span>4 saat</span>
                  <b>
                    ${p4h
                      ? `%${f(
                          p4h.changePct,
                          3
                        )}`
                      : "BEKLENİYOR"}
                  </b>
                </div>
              </div>
            </article>
          `;
        })
        .join("");
    C.innerHTML = `
      <article class="card">
        <div class="sym">
          PERFORMANS TESTİ
        </div>
        <div class="m">
          <span>Toplam sinyal</span>
          <b>${data.totalSignals || 0}</b>
        </div>
      </article>
${signalCards}
      ${cards}
    `;
  } catch (error) {
    C.innerHTML = `
      <article class="card">
        Performans verisi alınamadı.
      </article>
    `;
  }
}
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
    if (
    activeView === "performance"
  ) {
    renderPerformance();
    return;
  }
  if (
    activeView === "search"
  ) {
    renderSearch();
    return;
  }
  renderLive();
}


// =====================================
// RADAR HTTP YEDEK
// =====================================

async function pollRadar() {
  try {
    const response =
      await fetch(
        "/api/radar?t=" +
        Date.now(),
        {
          cache: "no-store"
        }
      );


    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      !data ||
      !Array.isArray(
        data.rows
      )
    ) {
      throw new Error(
        "Radar verisi geçersiz."
      );
    }


    rows =
      data.rows;


    if (T) {
      T.textContent =
        new Date()
          .toLocaleTimeString(
            "tr-TR"
          );
    }


    if (
      !wsConnected &&
      K
    ) {
      K.textContent =
        `OKX HTTP — ${
          data.tracked || 0
        } coin`;
    }


    try {
      processAlerts();
    } catch (e) {
      console.error(
        "Alarm:",
        e
      );
    }


    try {
      updateHistory();
    } catch (e) {
      console.error(
        "Geçmiş:",
        e
      );
    }


    if (
      activeView === "live"
    ) {
      renderLive();
    }


  } catch (e) {
    console.error(
      "Radar HTTP:",
      e
    );

    if (
      !wsConnected &&
      K
    ) {
      K.textContent =
        "HTTP bağlantı hatası";
    }
  }
}


// =====================================
// HAREKET EDENLER VERİSİ
// =====================================

async function pollMovers() {
  try {
    const response =
      await fetch(
        "/api/movers?t=" +
        Date.now(),
        {
          cache: "no-store"
        }
      );


    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    movers = {
      gainers:
        Array.isArray(
          data.gainers
        )
          ? data.gainers
          : [],

      losers:
        Array.isArray(
          data.losers
        )
          ? data.losers
          : [],

      updatedAt:
        data.updatedAt || 0
    };


    if (
      activeView === "movers"
    ) {
      renderMovers();
    }


  } catch (e) {
    console.error(
      "Movers:",
      e
    );
  }
}


// =====================================
// WEBSOCKET
// =====================================

function connectWS() {
  try {
    if (
      ws &&
      (
        ws.readyState ===
          WebSocket.OPEN ||

        ws.readyState ===
          WebSocket.CONNECTING
      )
    ) {
      return;
    }


    const protocol =
      location.protocol ===
      "https:"
        ? "wss"
        : "ws";


    ws =
      new WebSocket(
        `${protocol}://${location.host}/live`
      );


    ws.onopen = () => {
      wsConnected = true;

      if (K) {
        K.textContent =
          "OKX Canlı";
      }
    };


    ws.onmessage =
      event => {
        try {
          const data =
            JSON.parse(
              event.data
            );


          if (
            data.type !==
              "radar" ||

            !Array.isArray(
              data.rows
            )
          ) {
            return;
          }


          rows =
            data.rows;


          if (T) {
            T.textContent =
              new Date()
                .toLocaleTimeString(
                  "tr-TR"
                );
          }


          if (K) {
            K.textContent =
              `OKX Canlı — ${
                data.tracked || 0
              } coin`;
          }


          try {
            processAlerts();
          } catch {}


          try {
            updateHistory();
          } catch {}


          if (
            activeView ===
            "live"
          ) {
            renderLive();
          }


        } catch (e) {
          console.error(
            "WebSocket veri:",
            e
          );
        }
      };


    ws.onerror = () => {
      wsConnected = false;

      if (K) {
        K.textContent =
          "OKX HTTP Yedek";
      }
    };


    ws.onclose = () => {
      wsConnected = false;
      ws = null;

      if (K) {
        K.textContent =
          "OKX HTTP Yedek";
      }

      setTimeout(
        connectWS,
        3000
      );
    };


  } catch (e) {
    wsConnected = false;

    console.error(
      "WebSocket:",
      e
    );

    setTimeout(
      connectWS,
      3000
    );
  }
}


// =====================================
// BAŞLAT
// =====================================

if (K) {
  K.textContent =
    "Bağlanıyor...";
}


draw();


// HTTP'yi önce başlat.
// WebSocket bozuk olsa bile
// radar açılır.
pollRadar();
pollMovers();


// Ardından canlı bağlantı.
connectWS();


// HTTP her zaman yedek olarak
// çalışmaya devam eder.
setInterval(
  pollRadar,
  3000
);

setInterval(
  pollMovers,
  30000
);


console.log(
  "TradeRadar arayüzü hazır."
);
