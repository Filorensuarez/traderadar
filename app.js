const cards = document.querySelector("#cards");
const statusEl = document.querySelector("#status");
const updatedEl = document.querySelector("#updated");
const refreshButton = document.querySelector("#refreshButton");
const okxButton =
  document.querySelector("#okxButton");

const kucoinButton =
  document.querySelector("#kucoinButton");
const gateButton =
  document.querySelector("#gateButton");
const radarButton =
  document.querySelector("#radarButton");
const scenarioButton =
  document.querySelector(
    "#scenarioButton"
  );

const scenarioSection =
  document.querySelector(
    "#scenario"
  );

const scenario1Button =
  document.querySelector(
    "#scenario1Button"
  );

const scenario2Button =
  document.querySelector(
    "#scenario2Button"
  );

const scenario3Button =
  document.querySelector(
    "#scenario3Button"
  );

const scenario4Button =
  document.querySelector(
    "#scenario4Button"
  );

const scenario1Panel =
  document.querySelector(
    "#scenario1"
  );

const scenario2Panel =
  document.querySelector(
    "#scenario2"
  );

const scenario3Panel =
  document.querySelector(
    "#scenario3"
  );

const scenario4Panel =
  document.querySelector(
    "#scenario4"
  );
const enableNotificationsButton =
  document.querySelector(
    "#enableNotificationsButton"
  );

const notificationStatus =
  document.querySelector(
    "#notificationStatus"
  );

let scenarioData =
  null;

let scenarioLoading =
  false;
const radarSection =
  document.querySelector("#radar");

const radarRefreshButton =
  document.querySelector(
    "#radarRefreshButton"
  );

const radarStatus =
  document.querySelector(
    "#radarStatus"
  );

const radarUpdated =
  document.querySelector(
    "#radarUpdated"
  );

const radarCards =
  document.querySelector(
    "#radarCards"
  );

let radarLoading =
  false;

let radarLoaded =
  false;
let selectedExchange =
  "okx";

let lastData =
  null;
const dailySection = document.querySelector("#daily");
const longSection = document.querySelector("#long");

const dailyButton = document.querySelector("#dailyButton");
const longButton = document.querySelector("#longButton");

let loading = false;


/* =========================
   SEKME SİSTEMİ
========================= */

function openView(view) {

  const daily =
    view === "daily";

  const long =
    view === "long";

  const radar =
    view === "radar";

  const scenario =
    view === "scenario";


  dailySection.hidden =
    !daily;

  longSection.hidden =
    !long;

  radarSection.hidden =
    !radar;

  scenarioSection.hidden =
    !scenario;


  dailyButton.classList.toggle(
    "active",
    daily
  );

  longButton.classList.toggle(
    "active",
    long
  );

  radarButton.classList.toggle(
    "active",
    radar
  );

  scenarioButton.classList.toggle(
    "active",
    scenario
  );


  if (
    radar &&
    !radarLoaded
  ) {

    loadMinuteRadar();
  }


  /*
    Yükseliş Senaryosu ilk kez
    açıldığında dört senaryonun
    verisini yükle.
  */

  if (
    scenario &&
    !scenarioData &&
    !scenarioLoading
  ) {

    loadScenarios();
  }
}
dailyButton.addEventListener(
  "click",
  () => openView("daily")
);


longButton.addEventListener(
  "click",
  () => openView("long")
);

radarButton.addEventListener(
  "click",
  () =>
    openView(
      "radar"
    )
);

scenarioButton.addEventListener(
  "click",
  () =>
    openView(
      "scenario"
    )
);

function openScenarioPanel(
  number
) {

  const panels = [
    scenario1Panel,
    scenario2Panel,
    scenario3Panel,
    scenario4Panel
  ];

  const buttons = [
    scenario1Button,
    scenario2Button,
    scenario3Button,
    scenario4Button
  ];


  panels.forEach(
    (
      panel,
      index
    ) => {

      panel.hidden =
        index !==
        number - 1;
    }
  );


  buttons.forEach(
    (
      button,
      index
    ) => {

      button.classList.toggle(
        "active",
        index ===
          number - 1
      );
    }
  );


  if (scenarioData) {

    renderScenarioPanel(
      number
    );
  }
}
scenario1Button.addEventListener(
  "click",
  () =>
    openScenarioPanel(1)
);


scenario2Button.addEventListener(
  "click",
  () =>
    openScenarioPanel(2)
);


scenario3Button.addEventListener(
  "click",
  () =>
    openScenarioPanel(3)
);


scenario4Button.addEventListener(
  "click",
  () =>
    openScenarioPanel(4)
);
function selectExchange(exchange) {

  selectedExchange =
    exchange;

  okxButton.classList.toggle(
    "active",
    exchange === "okx"
  );

  kucoinButton.classList.toggle(
    "active",
    exchange === "kucoin"
  );
gateButton.classList.toggle(
  "active",
  exchange === "gate"
);
  if (lastData) {
    renderExchange(
      lastData
    );
  }
}


okxButton.addEventListener(
  "click",
  () =>
    selectExchange(
      "okx"
    )
);


kucoinButton.addEventListener(
  "click",
  () =>
    selectExchange(
      "kucoin"
    )
);
gateButton.addEventListener(
  "click",
  () =>
    selectExchange(
      "gate"
    )
);
/* =========================
   SAYI GÖSTERİMİ
========================= */

function number(
  value,
  digits = 2
) {

  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return "-";
  }

  return n.toLocaleString(
    "tr-TR",
    {
      minimumFractionDigits:
        digits,

      maximumFractionDigits:
        digits
    }
  );
}


function price(value) {

  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return "-";
  }

  let digits = 2;

  if (n < 1) {
    digits = 6;
  }

  if (n < 0.01) {
    digits = 8;
  }

  return number(
    n,
    digits
  );
}


/* =========================
   ZAMAN
========================= */

function timeText(timestamp) {

  if (!timestamp) {
    return "-";
  }

  return new Date(
    timestamp
  ).toLocaleTimeString(
    "tr-TR",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );
}


/* =========================
   GÜVENLİ METİN
========================= */

function escapeHTML(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


/* Günlük teyit: gösterim amaçlı alım/satım planı, emir göndermez. */
function dailyTradePlan(row) {
  const last = Number(row.price);
  const atrPct = Number(row.atrPct);
  const ema20 = Number(row.ema20);
  if (!(last > 0) || !(atrPct > 0) || !Number.isFinite(atrPct)) return null;
  const atr = last * atrPct / 100;
  // Günlük trend teyidinde EMA20 üzerinde geri çekilme bölgesi.
  const entry = ema20 > 0 && ema20 <= last && last - ema20 <= 2 * atr
    ? ema20 : last - 0.5 * atr;
  const stop = entry - 1.5 * atr;
  const target = entry + 3 * atr;
  if (!(stop > 0) || !(target > entry)) return null;
  return { entry, stop, target, ratio: 2 };
}

/* =========================
   COİN KARTI
========================= */

function coinCard(row) {

  const reasons =
    Array.isArray(
      row.reasons
    )
      ? row.reasons
      : [];


  const plan = row.confirmed ? dailyTradePlan(row) : null;

  const reasonText =
    reasons.length
      ? reasons
          .map(
            item =>
              escapeHTML(item)
          )
          .join(" • ")
      : "Teknik teyit mevcut";


  return `
    <article class="coin-card">

      <div class="coin-top">

        <div class="coin-symbol">
          ${escapeHTML(row.symbol)}
        </div>

        <div class="score">
          ${number(row.score, 0)}/100
        </div>

      </div>


      <div class="confirmation ${row.confirmed ? "confirmed" : "candidate"}">
  ${
    row.confirmed
      ? "YÜKSELİŞ TEYİDİ"
      : "YÜKSELİŞ ADAYI"
  }
</div>


      <div class="metrics">

        <div class="metric">
          Fiyat
          <strong>
            ${price(row.price)}
          </strong>
        </div>


        <div class="metric">
          RSI
          <strong>
            ${number(row.rsi, 1)}
          </strong>
        </div>


        <div class="metric">
          Hacim Gücü
          <strong>
            ${number(
              row.volumeRatio,
              2
            )}x
          </strong>
        </div>


        <div class="metric">
          ATR
          <strong>
            %${number(
              row.atrPct,
              2
            )}
          </strong>
        </div>


        <div class="metric">
          EMA 20
          <strong>
            ${price(row.ema20)}
          </strong>
        </div>


        <div class="metric">
          EMA 50
          <strong>
            ${price(row.ema50)}
          </strong>
        </div>


        <div class="metric">
          EMA 200
          <strong>
            ${price(row.ema200)}
          </strong>
        </div>


        <div class="metric">
          MACD
          <strong>
            ${
              row.macdBullish
                ? "Pozitif"
                : "Zayıf"
            }
          </strong>
        </div>


        <div class="metric">
          Trend
          <strong>
            ${
              row.trend ===
              "bullish"
                ? "Yükseliş"
                : "Nötr"
            }
          </strong>
        </div>

      </div>


      <div class="daily-trade-plan">
        <h4>Alım / Satım Fiyat Planı</h4>
        ${plan ? `
          <div class="trade-levels">
            <span>Alım için izlenecek fiyat <strong>${price(plan.entry)}</strong></span>
            <span>Satış hedefi <strong>${price(plan.target)}</strong></span>
            <span>Zarar-kes seviyesi <strong>${price(plan.stop)}</strong></span>
          </div>
          <small>ATR temelli örnek plan · Risk/ödül 1:2 · Otomatik emir verilmez.
          Fiyatlar anlık değişebilir; işlem öncesi borsa fiyat adımını kontrol edin.</small>
        ` : '<small>Fiyat planı için günlük yükseliş teyidi ve geçerli ATR verisi gerekli.</small>'}
      </div>
      <div class="reasons">

        ${reasonText}

      </div>

    </article>
  `;
}


/* =========================
   SONUÇLARI GÖSTER
========================= */

function renderExchange(data) {

  lastData =
    data;

  const exchangeData =
  selectedExchange === "gate"
    ? data.gate
    : selectedExchange === "kucoin"
      ? data.kucoin
      : data.okx;


  if (!exchangeData) {

    statusEl.textContent =
      "Veri bekleniyor";

    updatedEl.textContent =
      "Borsa verisi henüz hazır değil.";

    cards.innerHTML = `
      <div class="empty-card">
        Veri bekleniyor...
      </div>
    `;

    return;
  }


  const rows =
    Array.isArray(
      exchangeData.rows
    )
      ? exchangeData.rows
      : [];


  const exchangeName =
  selectedExchange === "gate"
    ? "GATE.IO"
    : selectedExchange === "kucoin"
      ? "KUCOIN"
      : "OKX";


  if (exchangeData.ok) {

    statusEl.textContent =
      `${exchangeName} tarama aktif`;

  } else {

    statusEl.textContent =
      `${exchangeName} bağlantı sorunu`;
  }


  updatedEl.textContent =
    `Son tarama: ${
      timeText(data.updatedAt)
    } | ${exchangeName} | Taranan: ${
      Number(
        exchangeData.scanned || 0
      )
    } coin | Teyit: ${
      Number(
        exchangeData.confirmed || 0
      )
    } | Aday: ${
      Number(
        exchangeData.candidates || 0
      )
    }`;


  if (exchangeData.error) {

    cards.innerHTML = `
      <div class="empty-card">

        ${exchangeName}
        bağlantı sorunu.

        <br><br>

        ${exchangeData.error}

        <br><br>

        Diğer borsanın taraması
        bundan etkilenmez.

      </div>
    `;

    return;
  }


  if (!rows.length) {

    cards.innerHTML = `
      <div class="empty-card">

        ${exchangeName} üzerinde
        şu anda gerekli teknik
        koşulları sağlayan coin
        bulunamadı.

        <br><br>

        Sistem koşullar oluşmadan
        yükseliş teyidi üretmez.

      </div>
    `;

    return;
  }


  cards.innerHTML =
    rows
      .map(coinCard)
      .join("");
}
/* =========================
   SUNUCUDAN VERİ AL
========================= */

async function loadData() {

  if (loading) {
    return;
  }


  loading = true;

  refreshButton.disabled =
    true;

  refreshButton.textContent =
    "Taranıyor...";


  try {

    const response =
      await fetch(
        "/api/daily-confirmations",
        {
          cache:
            "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    renderExchange(data);

  } catch (error) {

    console.error(
      "TradeRadar:",
      error
    );


    statusEl.textContent =
      "Bağlantı yok";


    updatedEl.textContent =
      "Sunucudan veri alınamadı.";


    cards.innerHTML = `
      <div class="empty-card">

        TradeRadar sunucusuna
        bağlanılamadı.

        <br><br>

        Birkaç saniye sonra
        tekrar deneyin.

      </div>
    `;

  } finally {

    loading = false;

    refreshButton.disabled =
      false;

    refreshButton.textContent =
      "Yenile";
  }
}


/* =========================
   MANUEL YENİLE
========================= */

refreshButton.addEventListener(
  "click",
  loadData
);


/* =========================
   OTOMATİK YENİLEME
========================= */

loadData();


setInterval(
  loadData,
  60 * 1000
);

/* =========================
   ANLIK RADAR KARTI
========================= */

function minuteRadarCard(item) {

  const score =
    Number(item.score || 0);

  const stage =
    item.stage ||
    item.signal ||
    item.signalLevel ||
    "İZLE";


  const multiText =
    item.multiExchange
      ? `Çoklu borsa teyidi: ${
          item.exchangeConfirmations
        } borsa`
      : `Borsa: ${
          item.source || "-"
        }`;


  /*
    Aşama rengi
  */

  let stageClass =
    "candidate";


  if (
    stage === "YÜKSELİŞ TEYİDİ" ||
    stage === "YÜKSELİŞ BAŞLIYOR"
  ) {

    stageClass =
      "confirmed";
  }


  if (
    stage === "GEÇ KALINDI" ||
    stage === "ZİRVE RİSKİ" ||
    stage === "HAREKET ZAYIFLIYOR"
  ) {

    stageClass =
      "late";
  }


  return `
    <article class="coin-card">

      <div class="coin-top">

        <div>

          <h3>
            ${item.symbol}
          </h3>

          <div class="confirmation ${stageClass}">
            ${stage}
          </div>

        </div>

        <div class="score">
          ${number(score, 0)}/100
        </div>

      </div>


      <div class="metrics">

        <div>
          <span>Anlık Fiyat</span>
          <strong>
            ${price(item.price)}
          </strong>
        </div>

        <div>
          <span>Başlangıç Fiyatı</span>
          <strong>
            ${
              item.startPrice
                ? price(item.startPrice)
                : "-"
            }
          </strong>
        </div>

        <div>
          <span>Başlangıçtan</span>
          <strong>
            ${number(
              item.moveFromStart,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>Maks. Hareket</span>
          <strong>
            ${number(
              item.maxMoveFromStart,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>Zirveden</span>
          <strong>
            ${number(
              item.pullbackFromPeak,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>Hareket Yaşı</span>
          <strong>
            ${Number(
              item.movementAge || 0
            )} dk
          </strong>
        </div>

        <div>
          <span>1 dk</span>
          <strong>
            ${number(
              item.change1,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>3 dk</span>
          <strong>
            ${number(
              item.change3,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>5 dk</span>
          <strong>
            ${number(
              item.change5,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>10 dk</span>
          <strong>
            ${number(
              item.change10,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>15 dk</span>
          <strong>
            ${number(
              item.change15,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>Hacim İvmesi</span>
          <strong>
            ${number(
              item.volumeAcceleration,
              2
            )}x
          </strong>
        </div>

        <div>
          <span>Son Mum Hacmi</span>
          <strong>
            ${number(
              item.lastVolumeRatio,
              2
            )}x
          </strong>
        </div>

        <div>
          <span>Mum Büyümesi</span>
          <strong>
            ${number(
              item.bodyExpansion,
              2
            )}x
          </strong>
        </div>

        <div>
          <span>EMA7 / EMA25</span>
          <strong>
            ${
              Number(item.ema7) >
              Number(item.ema25)
                ? "Yukarı"
                : "Aşağı"
            }
          </strong>
        </div>

        <div>
          <span>EMA İvmesi</span>
          <strong>
            ${number(
              item.emaSpreadAcceleration,
              3
            )}
          </strong>
        </div>

        <div>
          <span>RSI</span>
          <strong>
            ${number(
              item.rsi,
              1
            )}
          </strong>
        </div>

        <div>
          <span>RSI İvmesi</span>
          <strong>
            ${number(
              item.rsiAcceleration,
              2
            )}
          </strong>
        </div>

        <div>
          <span>MACD İvmesi</span>
          <strong>
            ${number(
              item.macdAcceleration,
              6
            )}
          </strong>
        </div>

        <div>
          <span>Sıkışma</span>
          <strong>
            ${
              item.wasCompressed
                ? "VAR"
                : "YOK"
            }
          </strong>
        </div>

      </div>


      <div class="reasons">

        <span>
          ${multiText}
        </span>

        <span>
          Aşama:
          ${
            Number(
              item.stageNumber || 0
            )
          }/5
        </span>

        ${
          item.isNew
            ? `
              <span>
                Yeni hareket tespit edildi
              </span>
            `
            : ""
        }

        ${
          item.levelChanged
            ? `
              <span>
                Hareket aşaması değişti
              </span>
            `
            : ""
        }

        ${
          item.lateMove
            ? `
              <span>
                Hareket önemli ölçüde ilerledi
              </span>
            `
            : ""
        }

        ${
          item.momentumWeakening
            ? `
              <span>
                Momentum zayıflıyor
              </span>
            `
            : ""
        }

      </div>

    </article>
  `;
}
/* =========================
   ANLIK RADARI GÖSTER
========================= */

function renderMinuteRadar(data) {

  const rows =
    Array.isArray(data.rows)
      ? data.rows
      : [];


  radarStatus.textContent =
    data.ok
      ? "Anlık radar aktif"
      : "Anlık radar bağlantı sorunu";


  radarUpdated.textContent =
    `Son tarama: ${
      timeText(data.updatedAt)
    } | Taranan: ${
      Number(data.scanned || 0)
    } | Aktif sinyal: ${
      rows.length
    }`;


  if (!rows.length) {

    radarCards.innerHTML = `
      <div class="empty-card">

        Şu anda anlık yükseliş
        koşullarını sağlayan coin
        bulunamadı.

        <br><br>

        Radar 1, 3, 5 ve 15
        dakikalık fiyat hareketini,
        hacim ivmesini ve fiyat
        ivmesini izliyor.

      </div>
    `;

    return;
  }


  radarCards.innerHTML =
    rows
      .map(minuteRadarCard)
      .join("");
}


/* =========================
   ANLIK RADAR VERİSİ
========================= */

async function loadMinuteRadar(
  force = false
) {

  if (radarLoading) {
    return;
  }


  radarLoading =
    true;

  radarRefreshButton.disabled =
    true;

  radarRefreshButton.textContent =
    "Taranıyor...";

  radarStatus.textContent =
    "Üç borsa taranıyor...";


  try {

    const url =
      force
        ? `/api/minute-radar?t=${Date.now()}`
        : "/api/minute-radar";


    const response =
      await fetch(
        url,
        {
          cache:
            "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    radarLoaded =
      true;


    renderMinuteRadar(
      data
    );


  } catch (error) {

    console.error(
      "Anlık Radar:",
      error
    );


    radarStatus.textContent =
      "Anlık radar bağlantı sorunu";


    radarUpdated.textContent =
      "Radar verisi alınamadı.";


    radarCards.innerHTML = `
      <div class="empty-card">

        Anlık radar verisi
        alınamadı.

        <br><br>

        ${
          error.message ||
          "Bilinmeyen hata"
        }

      </div>
    `;


  } finally {

    radarLoading =
      false;

    radarRefreshButton.disabled =
      false;

    radarRefreshButton.textContent =
      "Yenile";
  }
}


/* =========================
   RADAR YENİLE
========================= */

radarRefreshButton.addEventListener(
  "click",
  () =>
    loadMinuteRadar(
      true
    )
);

/* =========================
   YÜKSELİŞ SENARYOSU KARTI
========================= */

function scenarioCard(
  item,
  scenarioNumber
) {

  const score =
    Number(item.score || 0);

  const status =
    item.status || "-";


  let details = "";


  /* SENARYO 1 */

  if (scenarioNumber === 1) {

    details = `
      <div class="metrics">

        <div>
          <span>Fiyat</span>
          <strong>
            ${price(item.price)}
          </strong>
        </div>

        <div>
          <span>Volatilite</span>
          <strong>
            ${
              item.volatilityFalling
                ? "Düşüyor"
                : "Normal"
            }
          </strong>
        </div>

        <div>
          <span>Fiyat Aralığı</span>
          <strong>
            ${number(
              item.recentRange,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>Bollinger</span>
          <strong>
            ${
              item.bollingerSqueeze
                ? "Daralıyor"
                : "Normal"
            }
          </strong>
        </div>

        <div>
          <span>ATR</span>
          <strong>
            ${
              item.atrLow
                ? "Düşük"
                : "Normal"
            }
          </strong>
        </div>

        <div>
          <span>Direnç Testi</span>
          <strong>
            ${
              Number(
                item.resistanceTests || 0
              )
            } kez
          </strong>
        </div>

        <div>
          <span>Direnç</span>
          <strong>
            ${price(
              item.resistance
            )}
          </strong>
        </div>

        <div>
          <span>Dirence Uzaklık</span>
          <strong>
            ${number(
              item.distanceToResistance,
              2
            )}%
          </strong>
        </div>

      </div>
    `;
  }


  /* SENARYO 2 */

  if (scenarioNumber === 2) {

    details = `
      <div class="metrics">

        <div>
          <span>Fiyat</span>
          <strong>
            ${price(item.price)}
          </strong>
        </div>

        <div>
          <span>5 dk</span>
          <strong>
            ${number(
              item.priceChange5,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>Alıcı Hacmi</span>
          <strong>
            ${number(
              item.buyerRatio,
              1
            )}%
          </strong>
        </div>

        <div>
          <span>İşlem/sn</span>
          <strong>
            ${number(
              item.tradesPerSecond,
              2
            )}
          </strong>
        </div>

        <div>
          <span>Hacim/sn</span>
          <strong>
            ${number(
              item.volumePerSecond,
              2
            )}
          </strong>
        </div>

        <div>
          <span>Bid / Ask</span>
          <strong>
            ${number(
              item.bidAskRatio,
              2
            )}
          </strong>
        </div>

        <div>
          <span>Spread</span>
          <strong>
            ${number(
              item.spreadPercent,
              3
            )}%
          </strong>
        </div>

      </div>
    `;
  }


  /* SENARYO 3 */

  if (scenarioNumber === 3) {

    details = `
      <div class="metrics">

        <div>
          <span>Fiyat</span>
          <strong>
            ${price(item.price)}
          </strong>
        </div>

        <div>
          <span>5 sn</span>
          <strong>
            ${number(
              item.price5,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>10 sn</span>
          <strong>
            ${number(
              item.price10,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>30 sn</span>
          <strong>
            ${number(
              item.price30,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>60 sn</span>
          <strong>
            ${number(
              item.price60,
              2
            )}%
          </strong>
        </div>

        <div>
          <span>Hacim İvmesi</span>
          <strong>
            ${
              item.volumeGrowing
                ? "Artıyor"
                : "Zayıf"
            }
          </strong>
        </div>

        <div>
          <span>İşlem Frekansı</span>
          <strong>
            ${
              item.tradeFrequencyGrowing
                ? "Artıyor"
                : "Zayıf"
            }
          </strong>
        </div>

        <div>
          <span>Alıcı Oranı</span>
          <strong>
            ${number(
              item.buyerRatio30,
              1
            )}%
          </strong>
        </div>

      </div>
    `;
  }


  /* SENARYO 4 */

  if (scenarioNumber === 4) {

    details = `
      <div class="metrics">

        <div>
          <span>Fiyat</span>
          <strong>
            ${price(item.price)}
          </strong>
        </div>

        <div>
          <span>Direnç</span>
          <strong>
            ${price(
              item.resistance
            )}
          </strong>
        </div>

        <div>
          <span>Kırılım</span>
          <strong>
            ${
              item.breakout
                ? "VAR"
                : "YOK"
            }
          </strong>
        </div>

        <div>
          <span>Kırılım Hacmi</span>
          <strong>
            ${number(
              item.volumeRatio,
              2
            )}x
          </strong>
        </div>

        <div>
          <span>VWAP</span>
          <strong>
            ${
              item.aboveVWAP
                ? "Üstünde"
                : "Altında"
            }
          </strong>
        </div>

        <div>
          <span>EMA20 / EMA50</span>
          <strong>
            ${
              item.emaBullish
                ? "Bullish"
                : "Zayıf"
            }
          </strong>
        </div>

        <div>
          <span>RSI</span>
          <strong>
            ${number(
              item.rsi,
              1
            )}
          </strong>
        </div>

        <div>
          <span>MACD</span>
          <strong>
            ${
              item.macdBullish
                ? "Bullish"
                : "Zayıf"
            }
          </strong>
        </div>

        <div>
          <span>Higher High</span>
          <strong>
            ${
              item.higherHigh
                ? "VAR"
                : "YOK"
            }
          </strong>
        </div>

        <div>
          <span>Retest</span>
          <strong>
            ${
              item.retestHeld
                ? "Korundu"
                : "Yok"
            }
          </strong>
        </div>

      </div>
    `;
  }


  return `
    <article class="coin-card">

      <div class="coin-top">

        <div>

          <h3>
            ${item.symbol}
          </h3>

          <div class="confirmation ${
            score >= 80
              ? "confirmed"
              : "candidate"
          }">
            ${status}
          </div>

        </div>

        <div class="score">
          ${number(
            score,
            0
          )}/100
        </div>

      </div>

      ${details}

      <div class="reasons">

        <span>
          Borsa:
          ${item.source || "GATE.IO"}
        </span>

        <span>
          Senaryo ${scenarioNumber}
        </span>

      </div>

    </article>
  `;
}


/* =========================
   SENARYO PANELİNİ GÖSTER
========================= */

function renderScenarioPanel(
  number
) {

  if (!scenarioData) {
    return;
  }


  const key =
    `scenario${number}`;


  const data =
    scenarioData[key];


  const panel =
    [
      scenario1Panel,
      scenario2Panel,
      scenario3Panel,
      scenario4Panel
    ][number - 1];


  if (
    !data ||
    !panel
  ) {
    return;
  }


  const rows =
    Array.isArray(data.rows)
      ? data.rows
      : [];


  if (data.error) {

    panel.innerHTML = `
      <h3>
        Senaryo ${number}
      </h3>

      <div class="empty-card">
        ${data.error}
      </div>
    `;

    return;
  }


  if (!rows.length) {

    panel.innerHTML = `
      <h3>
        Senaryo ${number}
      </h3>

      <div class="empty-card">
        Şu anda bu senaryonun
        koşullarını sağlayan coin
        bulunamadı.
      </div>
    `;

    return;
  }


  panel.innerHTML = `
    <h3>
      Senaryo ${number}
    </h3>

    <div class="updated-line">
      Taranan:
      ${Number(
        data.scanned || 0
      )}
      coin |
      Bulunan:
      ${rows.length}
    </div>

    <div class="cards">
      ${
        rows
          .map(
            item =>
              scenarioCard(
                item,
                number
              )
          )
          .join("")
      }
    </div>
  `;
}


/* =========================
   SENARYOLARI GÖSTER
========================= */

function renderScenarios(
  data
) {

  scenarioData =
    data;


  renderScenarioPanel(1);

  renderScenarioPanel(2);

  renderScenarioPanel(3);

  renderScenarioPanel(4);
}


/* =========================
   SENARYO VERİSİNİ AL
========================= */

async function loadScenarios() {

  if (scenarioLoading) {
    return;
  }


  scenarioLoading =
    true;


  try {

    const response =
      await fetch(
        "/api/scenarios",
        {
          cache:
            "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    renderScenarios(
      data
    );


  } catch (error) {

    console.error(
      "Yükseliş Senaryoları:",
      error
    );


    scenario1Panel.innerHTML = `
      <div class="empty-card">
        Senaryo verileri alınamadı.
        ${error.message}
      </div>
    `;


  } finally {

    scenarioLoading =
      false;
  }
}

/* =========================
   PUSH BİLDİRİMLERİ
========================= */

/*
  VAPID public key'i
  PushManager formatına çevir.
*/

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
      .replace(
        /-/g,
        "+"
      )
      .replace(
        /_/g,
        "/"
      );


  const rawData =
    window.atob(
      base64
    );


  return Uint8Array.from(
    [...rawData].map(
      character =>
        character.charCodeAt(0)
    )
  );
}


/* =========================
   SERVICE WORKER
========================= */

async function getServiceWorker() {

  if (
    !(
      "serviceWorker"
      in navigator
    )
  ) {

    throw new Error(
      "Bu tarayıcı Service Worker desteklemiyor."
    );
  }


  return navigator
    .serviceWorker
    .register(
      "/service-worker.js"
    );
}


/* =========================
   BİLDİRİMİ AÇ
========================= */

async function enablePushNotifications() {

  if (
    !(
      "Notification"
      in window
    )
  ) {

    throw new Error(
      "Bu tarayıcı bildirimleri desteklemiyor."
    );
  }


  enableNotificationsButton.disabled =
    true;

  enableNotificationsButton.textContent =
    "Açılıyor...";

  notificationStatus.textContent =
    "Bildirim izni hazırlanıyor...";


  try {

    const permission =
      await Notification
        .requestPermission();


    if (
      permission !==
      "granted"
    ) {

      notificationStatus.textContent =
        "Bildirim izni verilmedi.";

      return;
    }


    const registration =
      await getServiceWorker();


    /*
      Service Worker tamamen
      hazır olana kadar bekle.
    */

    await navigator
      .serviceWorker
      .ready;


    /*
      Sunucudan public VAPID
      anahtarını al.
    */

    const keyResponse =
      await fetch(
        "/api/push/public-key",
        {
          cache:
            "no-store"
        }
      );


    if (
      !keyResponse.ok
    ) {

      throw new Error(
        `Bildirim anahtarı alınamadı: HTTP ${
          keyResponse.status
        }`
      );
    }


    const keyData =
      await keyResponse.json();


    if (
      !keyData.ok ||
      !keyData.publicKey
    ) {

      throw new Error(
        "Sunucuda bildirim anahtarı hazır değil."
      );
    }


    /*
      Daha önce abonelik varsa
      tekrar oluşturma.
    */

    let subscription =
      await registration
        .pushManager
        .getSubscription();


    if (!subscription) {

      subscription =
        await registration
          .pushManager
          .subscribe({

            userVisibleOnly:
              true,

            applicationServerKey:
              urlBase64ToUint8Array(
                keyData.publicKey
              )
          });
    }


    /*
      Aboneliği Railway
      sunucusuna kaydet.
    */

    const response =
      await fetch(
        "/api/push/subscribe",
        {

          method:
            "POST",

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
        `Abonelik kaydedilemedi: HTTP ${
          response.status
        }`
      );
    }


    const result =
      await response.json();


    if (!result.ok) {

      throw new Error(
        result.error ||
        "Bildirim aboneliği kaydedilemedi."
      );
    }


    notificationStatus.textContent =
      "Bildirimler açık. Yeni yükseliş senaryosu yakalandığında haber verilecek.";

    enableNotificationsButton.textContent =
      "Bildirimler Açık";


  } catch (error) {

    console.error(
      "Push bildirimi:",
      error
    );


    notificationStatus.textContent =
      `Bildirim açılamadı: ${
        error.message
      }`;


    enableNotificationsButton.textContent =
      "Bildirimleri Aç";


  } finally {

    enableNotificationsButton.disabled =
      false;
  }
}


/* =========================
   BİLDİRİM DURUMUNU KONTROL ET
========================= */

async function checkNotificationStatus() {

  if (
    !(
      "Notification"
      in window
    ) ||
    !(
      "serviceWorker"
      in navigator
    )
  ) {

    notificationStatus.textContent =
      "Bu cihaz push bildirimini desteklemiyor.";

    return;
  }


  if (
    Notification.permission ===
    "denied"
  ) {

    notificationStatus.textContent =
      "Bildirim izni tarayıcıdan engellenmiş.";

    return;
  }


  if (
    Notification.permission !==
    "granted"
  ) {

    notificationStatus.textContent =
      "Bildirimler kapalı.";

    return;
  }


  try {

    const registration =
      await getServiceWorker();


    const subscription =
      await registration
        .pushManager
        .getSubscription();


    if (subscription) {

      notificationStatus.textContent =
        "Bildirimler açık.";

      enableNotificationsButton.textContent =
        "Bildirimler Açık";

    } else {

      notificationStatus.textContent =
        "Bildirim aboneliği henüz oluşturulmadı.";
    }


  } catch (error) {

    notificationStatus.textContent =
      "Bildirim durumu kontrol edilemedi.";
  }
}


/* =========================
   BİLDİRİM DÜĞMESİ
========================= */

enableNotificationsButton
  .addEventListener(
    "click",
    enablePushNotifications
  );


/*
  Sayfa açıldığında mevcut
  bildirim durumunu kontrol et.
*/

checkNotificationStatus();
