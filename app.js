const C = document.querySelector("#cards");
const K = document.querySelector("#conn");
const T = document.querySelector("#time");

const f = (n, d = 2) =>
  Number.isFinite(Number(n))
    ? Number(n).toFixed(d)
    : "-";

const COOLDOWN = 10 * 60 * 1000;

let audioCtx = null;
let wsConnected = false;
let activeView = "live";
let rows = [];

let movers = {
  gainers: [],
  losers: [],
  updatedAt: 0
};

const alarmTimes = new Map();


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


async function beep(
  strong = false
) {
  if (!(await unlockAudio())) return;

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
      strong ? 950 : 720;

    gain.gain.value = 0.28;

    osc.start();

    setTimeout(
      () => {
        try {
          osc.stop();
        } catch {}
      },
      strong ? 900 : 550
    );

  } catch {}
}


// =====================================
// BİLDİRİMLERİ AÇ
// =====================================

function urlBase64ToUint8Array(base64String) {
  const padding =
    "=".repeat(
      (4 - base64String.length % 4) % 4
    );

  const base64 =
    (
      base64String +
      padding
    )
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const rawData =
    window.atob(base64);

  return Uint8Array.from(
    [...rawData].map(
      char =>
        char.charCodeAt(0)
    )
  );
}


async function enableNotifications() {
  try {
    await unlockAudio();

    if (
      !("serviceWorker" in navigator)
    ) {
      alert(
        "Bu tarayıcı arka plan bildirimini desteklemiyor."
      );
      return;
    }


    if (
      !("PushManager" in window)
    ) {
      alert(
        "Bu tarayıcı Push bildirimini desteklemiyor."
      );
      return;
    }


    // Bildirim izni
    const permission =
      await Notification
        .requestPermission();


    if (
      permission !== "granted"
    ) {
      alert(
        "Bildirim izni verilmedi."
      );
      return;
    }


    // Service Worker
    const registration =
      await navigator
        .serviceWorker
        .register(
          "/service-worker.js"
        );


    await navigator
      .serviceWorker
      .ready;


    // Sunucudan VAPID public key
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


    if (
      !keyData.publicKey
    ) {
      throw new Error(
        "VAPID public key bulunamadı."
      );
    }


    // Daha önce abone olmuş mu?
    let subscription =
      await registration
        .pushManager
        .getSubscription();


    // Değilse yeni abonelik oluştur
    if (!subscription) {
      subscription =
        await registration
          .pushManager
          .subscribe({
            userVisibleOnly: true,

            applicationServerKey:
              urlBase64ToUint8Array(
                keyData.publicKey
              )
          });
    }


    // Aboneliği Railway sunucusuna kaydet
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
        "Push aboneliği sunucuya kaydedilemedi."
      );
    }


    const result =
      await response.json();


    notifyBtn.textContent =
      "Arka Plan Bildirimi Açık";


    // Ses testi
    await beep(false);


    if (
      "vibrate" in navigator
    ) {
      navigator.vibrate(
        [250, 100, 250]
      );
    }


    alert(
      `Arka plan bildirimi etkinleştirildi.\nKayıtlı cihaz: ${result.count || 1}`
    );


  } catch (e) {
    console.error(
      "Push kurulum:",
      e
    );

    alert(
      "Arka plan bildirimi açılamadı: " +
      e.message
    );
  }
}
  await unlockAudio();

  let granted = false;

  if ("Notification" in window) {
    try {
      const p =
        await Notification
          .requestPermission();

      granted =
        p === "granted";
    } catch {}
  }

  notifyBtn.textContent =
    granted
      ? "Bildirimler Açık"
      : "Ses Açık";

  await beep(false);

  if ("vibrate" in navigator) {
    navigator.vibrate(250);
  }

  alert(
    granted
      ? "Bildirim, titreşim ve alarm etkin."
      : "Ses alarmı etkin."
  );
}


// =====================================
// ALARM TESTİ
// =====================================

async function testAlarm() {
  await unlockAudio();

  await beep(true);

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
        "TradeRadar Test",
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
// GEÇMİŞ
// =====================================

function history() {
  try {
    return JSON.parse(
      localStorage.getItem(
        "traderadar_history_v2"
      ) || "[]"
    );
  } catch {
    return [];
  }
}


function saveHistory(list) {
  try {
    localStorage.setItem(
      "traderadar_history_v2",
      JSON.stringify(
        list.slice(0, 500)
      )
    );
  } catch {}
}


function addHistory(x) {
  const list = history();
  const now = Date.now();

  const duplicate =
    list.some(
      h =>
        h.symbol === x.symbol &&
        h.status === x.status &&
        now - h.time < COOLDOWN
    );

  if (duplicate) return;

  const m = x.metrics || {};

  list.unshift({
    time: now,

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

    const p =
      Number(x.price);

    if (
      p >
      Number(h.high || 0)
    ) {
      h.high = p;

      h.maxGain =
        h.price
          ? (
              (p - h.price) /
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
  }

  if (changed) {
    saveHistory(list);
  }
}


// =====================================
// YENİ PATLAMA ALARMI
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
          x.metrics?.ready !== false
      )
      .sort(
        (a, b) =>
          b.score - a.score
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


    if ("vibrate" in navigator) {
      navigator.vibrate(
        strong
          ? [500, 150, 500]
          : [300, 120, 300]
      );
    }


    if (
      "Notification" in window &&
      Notification.permission ===
        "granted"
    ) {
      const m =
        x.metrics || {};

      try {
        new Notification(
          `${x.symbol} — ${x.status}`,
          {
            body:
              `Puan: ${x.score}/100\n` +
              `Fiyat: ${x.price}\n` +
              `Hacim: ${f(m.volX)}x\n` +
              `Hacim ivmesi: ${f(
                m.volumeAcceleration
              )}x\n` +
              `İşlem ivmesi: ${f(
                m.tradeAcceleration
              )}x\n` +
              `Alış: %${f(
                m.w30?.buyRatio,
                1
              )}\n` +
              `Dirence uzaklık: %${f(
                m.resistanceDistance
              )}`,

            tag:
              `traderadar-${x.symbol}`
          }
        );

      } catch {}
    }

    // Aynı saniyede onlarca
    // alarm çalmasını engelle.
    break;
  }
}


// =====================================
// SEKME MENÜSÜ
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


function tab(text, view) {
  const b =
    document.createElement("button");

  b.textContent = text;

  b.style.cssText =
    "white-space:nowrap;" +
    "padding:10px 13px;" +
    "border:0;" +
    "border-radius:10px;" +
    "font-weight:700;";

  b.onclick = () => {
    activeView = view;
    draw();
  };

  nav.appendChild(b);
}


tab(
  "Canlı Radar",
  "live"
);

tab(
  "Hareket Edenler",
  "movers"
);

tab(
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
// ALARM DÜĞMELERİ
// =====================================

const notifyBtn =
  document.createElement("button");

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
    "font-weight:700;";
}


controls.appendChild(testBtn);
controls.appendChild(notifyBtn);

document.body.appendChild(
  controls
);


// =====================================
// CANLI RADAR
// =====================================

function renderLive() {
  if (!rows.length) {
    C.innerHTML = `
      <article class="card">
        Veri bekleniyor...
      </article>
    `;
    return;
  }


  C.innerHTML =
    rows.map(x => {
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
            <i style="width:${Math.min(
              100,
              Number(x.score) || 0
            )}%"></i>
          </div>


          <div class="metrics">

            <div class="m">
              <span>
                Hacim
              </span>

              <b>
                ${f(m.volX)}x
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
                ${f(m.tradeX)}x
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


            ${
              x.status ===
                "VERİ TOPLANIYOR"
                ? `
                  <div class="m">
                    <span>
                      Hazırlık
                    </span>

                    <b>
                      ${Math.ceil(
                        Number(
                          m.warmupRemaining ||
                          0
                        ) /
                        60000
                      )} dk
                    </b>
                  </div>
                `
                : ""
            }

          </div>

        </article>
      `;
    }).join("");
}


// =====================================
// HAREKET EDENLER
// =====================================

function moverCard(x, up) {
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


function renderMovers() {
  C.innerHTML = `
    <h2>
      En Çok Yükselenler
    </h2>

    ${
      (movers.gainers || [])
        .map(
          x =>
            moverCard(
              x,
              true
            )
        )
        .join("")
    }

    <h2 style="margin-top:24px">
      En Çok Düşenler
    </h2>

    ${
      (movers.losers || [])
        .map(
          x =>
            moverCard(
              x,
              false
            )
        )
        .join("")
    }
  `;
}


// =====================================
// SİNYAL GEÇMİŞİ
// =====================================

function renderHistory() {
  const list = history();

  if (!list.length) {
    C.innerHTML = `
      <article class="card">
        <div class="sym">
          Henüz güçlü sinyal yok
        </div>

        <p>
          PATLAMA HAZIRLIĞI,
          GÜÇLÜ PATLAMA HAZIRLIĞI
          veya KIRILIM TEYİDİ
          oluştuğunda burada
          kaydedilecek.
        </p>
      </article>
    `;

    return;
  }

  C.innerHTML =
    list.map(h => {
      const d =
        new Date(h.time);

      const tarih =
        d.toLocaleDateString(
          "tr-TR"
        );

      const saat =
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
                ${tarih} ${saat}
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
                +%${f(h.maxGain)}
              </b>
            </div>

            <div class="m">
              <span>
                Sinyal puanı
              </span>
              <b>
                ${h.score}/100
              </b>
            </div>

            <div class="m">
              <span>
                5 dk zirve puanı
              </span>
              <b>
                ${f(h.peak, 0)}/100
              </b>
            </div>

            <div class="m">
              <span>
                Hacim
              </span>
              <b>
                ${f(h.volX)}x
              </b>
            </div>

            <div class="m">
              <span>
                Hacim ivmesi
              </span>
              <b>
                ${f(h.volAccel)}x
              </b>
            </div>

            <div class="m">
              <span>
                İşlem hızı
              </span>
              <b>
                ${f(h.tradeX)}x
              </b>
            </div>

            <div class="m">
              <span>
                İşlem ivmesi
              </span>
              <b>
                ${f(h.tradeAccel)}x
              </b>
            </div>

            <div class="m">
              <span>
                Alış baskısı
              </span>
              <b>
                %${f(h.buy, 1)}
              </b>
            </div>

            <div class="m">
              <span>
                10 sn fiyat
              </span>
              <b>
                %${f(h.ret10)}
              </b>
            </div>

            <div class="m">
              <span>
                30 sn fiyat
              </span>
              <b>
                %${f(h.ret30)}
              </b>
            </div>

            <div class="m">
              <span>
                60 sn fiyat
              </span>
              <b>
                %${f(h.ret60)}
              </b>
            </div>

            <div class="m">
              <span>
                120 sn fiyat
              </span>
              <b>
                %${f(h.ret120)}
              </b>
            </div>

            <div class="m">
              <span>
                Dirence uzaklık
              </span>
              <b>
                %${f(h.resistance)}
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

      if (T) {
        T.textContent =
          new Date()
            .toLocaleTimeString(
              "tr-TR"
            );
      }

      if (!wsConnected && K) {
        K.textContent =
          `OKX HTTP — ${
            data.tracked || "?"
          } coin`;
      }

      if (
        activeView === "live"
      ) {
        renderLive();
      }
    }

  } catch {
    if (
      !wsConnected &&
      K
    ) {
      K.textContent =
        "Bağlantı bekleniyor...";
    }
  }
}


// =====================================
// HAREKET EDENLER VERİSİ
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
// CANLI WEBSOCKET
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

    if (K) {
      K.textContent =
        "OKX Canlı";
    }
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
        rows = data.rows;

        processAlerts();
        updateHistory();

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
              data.tracked || "?"
            } coin`;
        }

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

    if (K) {
      K.textContent =
        "OKX HTTP Yedek";
    }

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
