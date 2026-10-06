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
