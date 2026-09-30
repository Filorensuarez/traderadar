const C = document.querySelector("#cards");
const K = document.querySelector("#conn");
const T = document.querySelector("#time");

const f = (n, d = 2) =>
  Number.isFinite(Number(n))
    ? Number(n).toFixed(d)
    : "-";

const COIN_COOLDOWN = 10 * 60 * 1000;
const SOUND_COOLDOWN = 30 * 1000;

const coinAlarmHistory = new Map();

let audioCtx = null;
let lastSoundAt = 0;
let wsConnected = false;
let activeView = "live";
let currentRows = [];
let movers = {
  gainers: [],
  losers: [],
  updatedAt: 0
};


// =====================================
// SES
// =====================================

async function unlockAudio() {
  try {
    if (!audioCtx) {
      audioCtx =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();
    }

    if (
      audioCtx.state === "suspended"
    ) {
      await audioCtx.resume();
    }

    return (
      audioCtx.state === "running"
    );

  } catch {
    return false;
  }
}


async function playAlarm(
  strong = false,
  force = false
) {
  const now = Date.now();

  if (
    !force &&
    now - lastSoundAt <
      SOUND_COOLDOWN
  ) {
    return;
  }

  const ok =
    await unlockAudio();

  if (!ok) return;

  lastSoundAt = now;

  try {
    const osc =
      audioCtx.createOscillator();

    const gain =
      audioCtx.createGain();

    osc.connect(gain);
    gain.connect(
      audioCtx.destination
    );

    osc.type =
      strong
        ? "square"
        : "sine";

    osc.frequency.value =
      strong
        ? 920
        : 680;

    gain.gain.value =
      0.25;

    osc.start();

    setTimeout(
      () => {
        try {
          osc.stop();
        } catch {}
      },
      strong
        ? 900
        : 500
    );

  } catch {}
}


// =====================================
// BİLDİRİM
// =====================================

async function enableNotifications() {
  await unlockAudio();

  if (
    !("Notification" in window)
  ) {
    notifyBtn.textContent =
      "Ses Açık";

    await playAlarm(
      false,
      true
    );

    alert(
      "Ses alarmı etkinleştirildi."
    );

    return;
  }

  const permission =
    await Notification
      .requestPermission();

  if (
    permission === "granted"
  ) {
    notifyBtn.textContent =
      "Bildirimler Açık";

    await playAlarm(
      false,
      true
    );

    alert(
      "Bildirim ve alarm sesi etkinleştirildi."
    );

  } else {
    notifyBtn.textContent =
      "Ses Açık";

    await playAlarm(
      false,
      true
    );
  }
}


// =====================================
// ALARM TESTİ
// =====================================

async function testAlarm() {
  await unlockAudio();

  await playAlarm(
    true,
    true
  );

  if (
    "vibrate" in navigator
  ) {
    navigator.vibrate(
      [400, 150, 500]
    );
  }

  if (
    "Notification" in window &&
    Notification.permission ===
      "granted"
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

function loadHistory() {
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
  const list =
    loadHistory();

  const now =
    Date.now();

  const exists =
    list.some(
      h =>
        h.symbol ===
          x.symbol &&
        now -
          h.timestamp <
          COIN_COOLDOWN
    );

  if (exists) return;

  const m =
    x.metrics || {};

  list.unshift({
    timestamp:
      now,

    symbol:
      x.symbol,

    status:
      x.status,

    price:
      Number(x.price),

    score:
      Number(x.score),

    peak5m:
      Number(
        m.peak5m ??
        x.peak5m ??
        x.score
      ),

    volX:
      Number(
        m.volX || 0
      ),

    tradeX:
      Number(
        m.tradeX || 0
      ),

    buyRatio:
      Number(
        m.w30?.buyRatio ||
        0
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

    highestPrice:
      Number(x.price),

    maxGain:
      0,

    lastStatus:
      x.status
  });

  saveHistory(list);
}


function updateHistory(rows) {
  const list =
    loadHistory();

  let changed = false;

  for (
    const h of list
  ) {
    const x =
      rows.find(
        r =>
          r.symbol ===
          h.symbol
      );

    if (!x) continue;

    const price =
      Number(x.price);

    if (
      price >
      Number(
        h.highestPrice || 0
      )
    ) {
      h.highestPrice =
        price;

      if (h.price > 0) {
        h.maxGain =
          (
            (
              price -
              h.price
            ) /
            h.price
          ) * 100;
      }

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

    const peak =
      Number(
        x.metrics?.peak5m ??
        x.peak5m ??
        x.score
      );

    if (
      peak >
      Number(
        h.peak5m || 0
      )
    ) {
      h.peak5m =
        peak;

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

function processAlerts(rows) {
  const alerts =
    rows
      .filter(
        x =>
          x.status ===
            "ERKEN UYARI" ||
          x.status ===
            "GÜÇLÜ ERKEN UYARI"
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

  if (!alerts.length) return;

  const now =
    Date.now();

  const fresh =
    alerts.filter(x => {
      const last =
        coinAlarmHistory.get(
          x.symbol
        ) || 0;

      return (
        now - last >=
        COIN_COOLDOWN
      );
    });

  if (!fresh.length) return;

  fresh.forEach(x => {
    coinAlarmHistory.set(
      x.symbol,
      now
    );

    addHistory(x);
  });

  const x =
    fresh[0];

  const strong =
    x.status ===
    "GÜÇLÜ ERKEN UYARI";

  playAlarm(strong);

  if (
    "vibrate" in navigator
  ) {
    navigator.vibrate(
      strong
        ? [400,150,500]
        : [250,120,300]
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
        strong
          ? "GÜÇLÜ ERKEN UYARI — " +
            x.symbol
          : "ERKEN UYARI — " +
            x.symbol,
        {
          body:
            "Puan: " +
            x.score +
            "/100\n" +
            "Fiyat: " +
            x.price +
            "\nHacim: " +
            f(m.volX) +
            "x\nAlış: %" +
            f(
              m.w30?.buyRatio,
              1
            ),

          tag:
            "traderadar-main"
        }
      );
    } catch {}
  }
}


// =====================================
// CANLI RADAR EKRANI
// =====================================

function renderLive() {
  C.innerHTML =
    currentRows
      .map(x => {
        const m =
          x.metrics || {};

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
          warmup = `
            <div class="m">
              <span>Hazırlık</span>
              <b>
                ${Math.ceil(
                  (
                    m.warmupRemaining ||
                    0
                  ) /
                  60000
                )} dk
              </b>
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
                x.score
              )}%"></i>
            </div>

            <div class="metrics">

              <div class="m">
                <span>
                  5 dk zirve
                </span>
                <b>
                  ${f(peak,0)}/100
                </b>
              </div>

              <div class="m">
                <span>
                  120 sn hacim
                </span>
                <b>
                  ${f(m.volX)}x
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
                  30 sn alış
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
                  Dirence uzaklık
                </span>
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
      })
      .join("");
}


// =====================================
// HAREKET EDENLER
// =====================================

async function loadMovers() {
  try {
    const r =
      await fetch(
        "/api/movers?t=" +
        Date.now(),
        {
          cache:
            "no-store"
        }
      );

    if (!r.ok) {
      throw new Error();
    }

    movers =
      await r.json();

    if (
      activeView ===
      "movers"
    ) {
      renderMovers();
    }

  } catch {
    if (
      activeView ===
      "movers"
    ) {
      C.innerHTML = `
        <article class="card">
          Hareket analizi sunucuda
          henüz etkin değil.
        </article>
      `;
    }
  }
}


function moverCard(
  x,
  type
) {
  const symbol =
    x.symbol.replace(
      "-USDT",
      "/USDT"
    );

  const isUp =
    type === "up";

  return `
    <article class="card">

      <div class="top">
        <div>
          <div class="sym">
            ${symbol}
          </div>

          <span class="status">
            ${
              isUp
                ? x.continuationText
                : x.reversalText
            }
          </span>
        </div>

        <div>
          <div class="score">
            ${
              x.change24 >= 0
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
              isUp
                ? "Devam gücü"
                : "Dönüş gücü"
            }
          </span>

          <b>
            ${
              isUp
                ? f(
                    x.continuationScore,
                    0
                  )
                : f(
                    x.reversalScore,
                    0
                  )
            }/100
          </b>
        </div>

        <div class="m">
          <span>
            15 dk momentum
          </span>

          <b>
            %${f(
              x.momentum15
            )}
          </b>
        </div>

        <div class="m">
          <span>
            1 saat momentum
          </span>

          <b>
            %${f(
              x.momentum1h
            )}
          </b>
        </div>

        <div class="m">
          <span>
            Hacim oranı
          </span>

          <b>
            ${f(
              x.volumeRatio
            )}x
          </b>
        </div>

        ${
          !isUp
            ? `
              <div class="m">
                <span>
                  Muhtemel tepki bölgesi
                </span>

                <b>
                  ${f(
                    x.supportLow,
                    6
                  )}
                  –
                  ${f(
                    x.supportHigh,
                    6
                  )}
                </b>
              </div>
            `
            : `
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
        }

      </div>

    </article>
  `;
}


function renderMovers() {
  const gainers =
    movers.gainers || [];

  const losers =
    movers.losers || [];

  C.innerHTML = `
    <div class="title">
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
            Yükselen coin verisi
            bekleniyor.
          </article>
        `
    }

    <div class="title"
         style="margin-top:25px">

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
            Düşen coin verisi
            bekleniyor.
          </article>
        `
    }
  `;
}


// =====================================
// SİNYAL GEÇMİŞİ
// =====================================

function renderHistory() {
  const list =
    loadHistory();

  if (!list.length) {
    C.innerHTML = `
      <article class="card">

        <div class="sym">
          Henüz sinyal yok
        </div>

        <p>
          İlk erken uyarı
          geldiğinde tarih,
          saat ve fiyat burada
          kaydedilecek.
        </p>

      </article>
    `;

    return;
  }

  C.innerHTML =
    list.map(h => {
      const date =
        new Date(
          h.timestamp
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
