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

const scenarioResults = document.querySelector("#scenarioResults");
const scenarioStatus = document.querySelector("#scenarioStatus");
const scenarioRefreshButton = document.querySelector("#scenarioRefreshButton");
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

  const xmanager = view === "xmanager";


  dailySection.hidden =
    !daily;

  longSection.hidden =
    !long;

  radarSection.hidden =
    !radar;

  scenarioSection.hidden =
    !scenario;

  document.querySelector("#xmanager").hidden = !xmanager;


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

  document.querySelector("#xManagerButton").classList.toggle("active", xmanager);


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
document.querySelector("#xManagerButton").addEventListener("click", () => openView("xmanager"));

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

/* =========================
   SENARYOLARI GÖSTER
========================= */

function renderScenarios(data) {
  scenarioData = data;
  const found = new Map();
  let scanned = 0;
  for (let n = 1; n <= 4; n++) {
    const part = data["scenario" + n] || {};
    scanned = Math.max(scanned, Number(part.scanned || 0));
    for (const item of (Array.isArray(part.rows) ? part.rows : [])) {
      const key = String(item.symbol || "").toUpperCase();
      if (!key) continue;
      const old = found.get(key) || { ...item, signals: [], score: 0 };
      const labels = ["Birikim / sıkışma", "Alıcı baskısı", "Hacimli kırılım", "Trend devamı"];
      old.signals.push(labels[n - 1]);
      old.score = Math.max(old.score, Number(item.score || 0));
      found.set(key, old);
    }
  }
  const rows = [...found.values()].sort((a,b) => b.signals.length - a.signals.length || b.score - a.score);
  scenarioStatus.textContent = "Taranan: " + scanned + " | İzlenecek: " + rows.length + " | Son kontrol: " + new Date().toLocaleTimeString("tr-TR");
  if (!rows.length) {
    scenarioResults.innerHTML = '<div class="empty-card">Mevcut tarama koşullarını sağlayan coin bulunamadı. Bu sonuç piyasanın yükselmeyeceği anlamına gelmez.</div>';
    return;
  }
  scenarioResults.innerHTML = rows.map(item => {
    const signals = item.signals.join(" • ");
    const late = Number(item.priceChange5 || 0) > 8 || Number(item.rsi || 0) > 80;
    return '<article class="coin-card"><div class="coin-top"><h3>' + escapeHTML(item.symbol) +
      '</h3><span class="score">' + number(item.score,0) + '/100</span></div>' +
      '<p>' + escapeHTML(signals) + '</p><div class="metrics"><div>Fiyat <strong>' + price(item.price) +
      '</strong></div><div>Hacim katsayısı <strong>' + number(item.volumeRatio,2) +
      'x</strong></div><div>Direnç <strong>' + price(item.resistance) +
      '</strong></div></div><p>' + (late ? 'Dikkat: Hızlı hareket sonrası geç giriş riski.' :
      'İzleme adayı: Hacim ve kırılım teyidi beklenmeli.') +
      '</p><small>Bu puan istatistiksel başarı olasılığı değildir. Fiyat hareketinin haber kaynaklı nedeni doğrulanmamıştır.</small></article>';
  }).join("");
}
async function loadScenarios() {
  if (scenarioLoading) return;
  scenarioLoading = true;
  scenarioRefreshButton.disabled = true;
  scenarioStatus.textContent = "Piyasa taranıyor...";
  try {
    const response = await fetch("/api/scenarios", {cache:"no-store"});
    if (!response.ok) throw Error("HTTP " + response.status);
    renderScenarios(await response.json());
  } catch (error) {
    scenarioStatus.textContent = "Tarama hatası: " + error.message;
  } finally {
    scenarioLoading = false;
    scenarioRefreshButton.disabled = false;
  }
}
scenarioRefreshButton.addEventListener("click",loadScenarios);
/* =========================
   SENARYO VERİSİNİ AL
========================= */

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

/* =========================
   X MANAGER - ÜÇ BÖLÜM
========================= */
const xSignalSelect = document.querySelector("#xSignalSelect");
const xPostText = document.querySelector("#xPostText");
const xManagerStatus = document.querySelector("#xManagerStatus");
const xPostCount = document.querySelector("#xPostCount");
const xChartPanel = document.querySelector("#xChartPanel");
const xChartCanvas = document.querySelector("#xChartCanvas");
let xSignals = [];
let xMode = "general";
let xGeneralIndex = 0;
const xHashtags = "#TradeRadar #Kripto";
const xThemes = [
  "Kriptoda güçlü bir mum tek başına trend değildir. Hacim, fiyat yapısı ve devam eden alıcı ilgisi birlikte incelenmelidir.",
  "Yükselişten önceki sıkışma dikkat çekicidir. Ancak her sıkışma yukarı kırılmaz; kırılım sonrası teyit önemlidir.",
  "RSI tek başına alım sinyali değildir. EMA eğimi, hacim ve piyasa koşullarıyla birlikte değerlendirmek gerekir.",
  "Hızlı yükselen bir coinde asıl soru yalnızca ne kadar arttığı değil, hareketin ne kadarının geride kaldığıdır.",
  "MACD'nin pozitif olması tek başına yükseliş garantisi vermez. Momentumun güçlenmesi ve fiyatın teyidi birlikte aranmalıdır.",
  "Bir coin zirveye yaklaştığında yüksek puan bile geç giriş riskini ortadan kaldırmaz. Risk yönetimi her zaman önceliklidir.",
  "Düşük hacimli kırılımlarda yanıltıcı hareket riski yüksektir. Hacmin sürekliliğini takip etmek önemlidir."
];
function xSetText(text) {
  document.querySelector("#xDraftPanel").hidden = false;
  const tail = "\n" + xHashtags;
  const limit = 280 - tail.length;
  xPostText.value = text.slice(0, limit).trimEnd() + tail;
  xPostCount.textContent = String(xPostText.value.length);
}
function xSelectMode(mode) {
  xMode = mode;
  for (const [name, id] of [["general","xGeneralPanel"],["signal","xSignalPanel"],["lookup","xLookupPanel"]]) {
    document.getElementById(id).hidden = name !== mode;
  }
  document.querySelectorAll("[data-xmode]").forEach(button =>
    button.classList.toggle("active", button.dataset.xmode === mode)
  );
  xChartPanel.hidden = true;
  document.querySelector("#xDraftPanel").hidden = true;
  xManagerStatus.textContent = "Bölüm hazır.";
}
document.querySelectorAll("[data-xmode]").forEach(button => button.addEventListener("click", () => xSelectMode(button.dataset.xmode)));
document.querySelector("#xGenerateGeneral").addEventListener("click", () => {
  const topic = document.querySelector("#xGeneralTopic")?.value.trim() || "";
  if (!topic) {
    xManagerStatus.textContent = "Lütfen önce yorum konusunu yazın.";
    return;
  }
  const news = document.querySelector("#xTopicNews");
  if (news) {
    news.href = "https://news.google.com/search?q=" + encodeURIComponent(topic) + "&hl=tr&gl=TR&ceid=TR:tr";
    news.hidden = false;
  }
  const draft = [
    "TradeRadar | " + topic,
    "Bu konuyu değerlendirirken güncel haber akışı, işlem hacmi, fiyat eğilimi ve önemli teknik seviyeler birlikte incelenmelidir. Tek bir haber veya gösterge kesin yön tayin etmez.",
    "Güncel gelişmeler bu taslakta doğrulanmamıştır. Paylaşmadan önce ilgili haberleri ve piyasa verilerini kontrol edin.",
    "Yatırım tavsiyesi değildir."
  ].join("\n\n");
  xSetText(draft);
  xChartPanel.hidden = true;
  xManagerStatus.textContent = "Konuya özel taslak hazır. Canlı haber doğrulaması yapılmadı.";
});
async function loadXSignals() {
  xManagerStatus.textContent = "Sinyaller alınıyor...";
  xSignals = [];
  const sources = [["/api/daily-confirmations","Günlük"],["/api/minute-radar","Anlık"],["/api/scenarios","Senaryo"]];
  const responses = await Promise.allSettled(sources.map(async ([url,label]) => {
    const response = await fetch(url,{cache:"no-store"});
    if (!response.ok) throw Error(label + " HTTP " + response.status);
    return {label,data:await response.json()};
  }));
  for (const result of responses) {
    if (result.status !== "fulfilled") continue;
    const {label,data} = result.value;
    let rows = [];
    if (label === "Günlük") {
      for (const name of ["okx","kucoin","gate"]) {
        const group = data[name];
        if (Array.isArray(group?.rows)) rows.push(...group.rows.map(item => ({...item,source:item.source || name.toUpperCase()})));
      }
    } else if (label === "Anlık") {
      rows = Array.isArray(data.rows) ? data.rows : [];
    } else {
      for (let n=1;n<=4;n++) {
        const group = data["scenario"+n];
        if (Array.isArray(group?.rows)) rows.push(...group.rows.map(item=>({...item,scenarioNumber:n})));
      }
    }
    xSignals.push(...rows.filter(item => item.symbol && Number(item.price)>0).map(item=>({...item,origin:label})));
  }
  xSignals.sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  xSignals=xSignals.slice(0,100);
  xSignalSelect.replaceChildren();
  xSignals.forEach((item,i)=>xSignalSelect.add(new Option([item.symbol,item.source,item.origin,item.scenarioNumber?"S"+item.scenarioNumber:""].filter(Boolean).join(" | "),String(i))));
  if (!xSignals.length) xSignalSelect.add(new Option("Sinyal bulunamadı",""));
  xManagerStatus.textContent = xSignals.length+" sinyal bulundu.";
}
const xPrice = value => Number(value).toLocaleString("en-US",{maximumSignificantDigits:7});
function xChartDraw(data) {
  const canvas=xChartCanvas,ctx=canvas.getContext("2d");
  const w=canvas.width,h=canvas.height,rows=data.candles;
  const min=Math.min(...rows.map(x=>x.low)),max=Math.max(...rows.map(x=>x.high));
  const range=Math.max(max-min,max*.001),left=70,right=w-60,top=120,bottom=475;
  const y=v=>bottom-(v-min)/range*(bottom-top),step=(right-left)/rows.length;
  ctx.fillStyle="#0b1729";ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#f1f6ff";ctx.font="bold 34px sans-serif";
  ctx.fillText("TradeRadar | "+data.symbol+" | "+data.exchange,32,45);
  ctx.fillStyle="#b5c7d9";ctx.font="21px sans-serif";
  ctx.fillText("Günlük USDT mumları • "+new Date().toLocaleDateString("tr-TR"),32,82);
  ctx.strokeStyle="#34445c";ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const yy=top+(bottom-top)*i/4;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    ctx.fillStyle="#afc0d1";ctx.font="16px sans-serif";ctx.fillText(xPrice(max-range*i/4),right-115,yy-6);
  }
  const maxVol=Math.max(...rows.map(x=>x.volume),1);
  rows.forEach((bar,i)=>{
    const xx=left+(i+.5)*step,up=bar.close>=bar.open;
    ctx.strokeStyle=ctx.fillStyle=up?"#24c79c":"#ff6178";
    ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xx,y(bar.high));ctx.lineTo(xx,y(bar.low));ctx.stroke();
    const a=y(Math.max(bar.open,bar.close)),b=y(Math.min(bar.open,bar.close));
    ctx.fillRect(xx-step*.3,a,Math.max(2,step*.6),Math.max(2,b-a));
    ctx.fillRect(xx-step*.3,570-bar.volume/maxVol*68,Math.max(2,step*.6),bar.volume/maxVol*68);
  });
  const first=rows[0],last=rows.at(-1);
  const base=rows.slice(0,Math.min(15,rows.length-5));
  const baseHigh=Math.max(...base.map(x=>x.high)),baseLow=Math.min(...base.map(x=>x.low));
  const breakoutIndex=rows.findIndex((bar,i)=>i>=base.length&&bar.close>baseHigh);
  const peakIndex=rows.findIndex(x=>x.high===max);
  const annotations=[];
  if(baseLow>0&&(baseHigh/baseLow-1)*100<=12&&breakoutIndex>=0){
    annotations.push({i:breakoutIndex,price:rows[breakoutIndex].high,label:"Sıkışma sonrası kırılım"});
  }
  const highestVolumeIndex=rows.findIndex(x=>x.volume===maxVol);
  if(highestVolumeIndex>=0)annotations.push({i:highestVolumeIndex,price:rows[highestVolumeIndex].high,label:"Hacim zirvesi"});
  if(peakIndex>=0)annotations.push({i:peakIndex,price:max,label:"Dönem zirvesi"});
  const colors=["#f6c950","#2bd7a4","#77b8ff"];
  annotations.slice(0,3).forEach((a,k)=>{
    const xx=left+(a.i+.5)*step,yy=y(a.price);
    ctx.strokeStyle=colors[k];ctx.lineWidth=2;ctx.beginPath();ctx.arc(xx,yy,7,0,Math.PI*2);ctx.stroke();
    const bx=k===0?left+15:k===1?left+340:left+670;
    const by=top+20+(k%2)*45;
    ctx.beginPath();ctx.moveTo(xx,yy-9);ctx.lineTo(bx+15,by+8);ctx.stroke();
    ctx.fillStyle="#102c40";ctx.fillRect(bx,by-22,Math.min(295,ctx.measureText(a.label).width+35),34);
    ctx.fillStyle=colors[k];ctx.font="bold 17px sans-serif";ctx.fillText(a.label,bx+8,by);
  });
  ctx.fillStyle=data.change>=0?"#2bd7a4":"#ff6178";ctx.font="bold 26px sans-serif";
  ctx.fillText("Dönem değişimi: "+(data.change>=0?"+":"")+data.change.toFixed(2)+"%",32,624);
  ctx.fillStyle="#e0ebf5";ctx.font="19px sans-serif";
  ctx.fillText("EMA7 "+xPrice(data.ema7)+"  |  EMA25 "+xPrice(data.ema25)+"  |  Son mum hacmi "+data.volumeRatio.toFixed(2)+"x",32,662);
  ctx.fillStyle="#9eb3c8";ctx.font="16px sans-serif";
  ctx.fillText("İşaretler teknik gözlemdir; yükselişin kesin nedeni veya yatırım tavsiyesi değildir.",32,701);

  // Her grafikte veriye dayalı teknik açıklama paneli.
  const periodUp = data.change > 0;
  const emaPositive = Number(data.ema7) > Number(data.ema25);
  const volumeStrong = Number(data.volumeRatio) >= 1.5;
  const peakPullback = max > 0 ? (1 - rows.at(-1).close / max) * 100 : 0;
  const heading = periodUp
    ? "YÜKSELİŞİ DESTEKLEYEN TEKNİK GELİŞMELER"
    : "OLASI YÜKSELİŞ İÇİN İZLENECEK KOŞULLAR";
  const explanations = [
    periodUp
      ? "Fiyat: İncelenen dönemde %" + data.change.toFixed(2) + " yükseldi."
      : "Fiyat: İncelenen dönemde %" + Math.abs(data.change).toFixed(2) + " geriledi.",
    emaPositive
      ? "EMA7 > EMA25: Kısa vadeli fiyat eğilimi pozitif."
      : "EMA7 <= EMA25: Yukarı yönlü ortalama teyidi henüz yok.",
    volumeStrong
      ? "Hacim: Son mum, önceki 20 mum ortalamasının " + data.volumeRatio.toFixed(2) + " katı."
      : "Hacim: Son mumda 1,5 katlık hacim teyidi yok (" + data.volumeRatio.toFixed(2) + "x).",
    breakoutIndex >= 0
      ? "Fiyat kırılımı: İlk dönem tepesinin üzerinde kapanış görüldü."
      : "Fiyat kırılımı: İlk dönem tepesinin üzerinde kapanış görülmedi.",
    "Dönem zirvesinden geri çekilme: %" + peakPullback.toFixed(2) + "."
  ];
  ctx.fillStyle="#13263d";
  ctx.fillRect(25,725,w-50,174);
  ctx.fillStyle="#f5c451";
  ctx.font="bold 22px sans-serif";
  ctx.fillText(heading,42,755);
  ctx.font="18px sans-serif";
  explanations.forEach((line,i)=>{
    ctx.fillStyle=i===0?"#eaf3fc":"#bfd1e5";
    ctx.fillText("• "+line,42,785+i*26);
  });
  ctx.fillStyle="#91a9c1";
  ctx.font="15px sans-serif";
  ctx.fillText("Geçmiş verilerden çıkarılan teknik yorumdur; haber veya kesin yükseliş nedeni değildir.",30,927);
}
async function xMakeChart(symbol,exchange) {
  xManagerStatus.textContent="Gerçek USDT mumları yükleniyor...";
  xChartPanel.hidden=true;
  const params=new URLSearchParams({symbol,exchange});
  const response=await fetch("/api/x/chart?"+params,{cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"Grafik verisi alınamadı");
  xChartDraw(data);
  xChartPanel.hidden=false;
  const coinTag="#"+data.symbol.split("/")[0].replace(/[^A-Z0-9]/g,"");
  const notes=data.notes.slice(0,2).join(" ");
  xSetText("TradeRadar | "+data.symbol+"\n"+data.exchange+" günlük USDT grafiği: "+(data.change>=0?"+":"")+data.change.toFixed(2)+"%.\n"+notes+"\nTeknik gözlemdir, yatırım tavsiyesi değildir.\n"+coinTag);
  xManagerStatus.textContent="Gerçek verilerle grafik ve taslak hazır. PNG dosyasını X'e ayrıca ekleyin.";
}
document.querySelector("#xRefreshSignals").addEventListener("click",()=>loadXSignals().catch(e=>xManagerStatus.textContent=e.message));
document.querySelector("#xGeneratePost").addEventListener("click",()=>{
  const item=xSignals[Number(xSignalSelect.value)];
  if(!item){xManagerStatus.textContent="Önce sinyal seçin.";return;}
  const source=String(item.source||"OKX").toUpperCase().replace("GATE","GATE.IO");
  xMakeChart(item.symbol,["OKX","KUCOIN","GATE.IO"].includes(source)?source:"OKX").catch(e=>xManagerStatus.textContent=e.message);
});
document.querySelector("#xAnalyzeCoin").addEventListener("click",()=>{
  xMakeChart(document.querySelector("#xCoinInput").value,document.querySelector("#xExchangeSelect").value).catch(e=>xManagerStatus.textContent=e.message);
});
document.querySelector("#xDownloadChart").addEventListener("click",()=>{
  const a=document.createElement("a");a.href=xChartCanvas.toDataURL("image/png");a.download="TradeRadar-USDT-grafik.png";a.click();
});
xPostText.addEventListener("input",()=>{xPostCount.textContent=String(xPostText.value.length);});
function xFinalText(){
  const t=xPostText.value.trim();
  const tags=[...new Set((t.match(/#[A-Za-z0-9_ğüşöçıİĞÜŞÖÇ]+/g)||[]).map(x=>x.toLowerCase()))];
  const missing=["#TradeRadar","#Kripto"].filter(x=>!tags.includes(x.toLowerCase()));
  return (t.slice(0,280-missing.join(" ").length-(missing.length?1:0)).trimEnd()+(missing.length?"\n"+missing.join(" "):"")).slice(0,280);
}
document.querySelector("#xCopyPost").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(xFinalText());xManagerStatus.textContent="Metin etiketleriyle kopyalandı.";}
  catch(e){xManagerStatus.textContent="Kopyalanamadı: "+e.message;}
});
document.querySelector("#xOpenComposer").addEventListener("click",()=>{
  if(!xPostText.value.trim()){xManagerStatus.textContent="Önce taslak oluşturun.";return;}
  window.open("https://twitter.com/intent/tweet?text="+encodeURIComponent(xFinalText()),"_blank","noopener,noreferrer");
});

