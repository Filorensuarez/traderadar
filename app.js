const cards = document.querySelector("#cards");
const statusEl = document.querySelector("#status");
const updatedEl = document.querySelector("#updated");
const refreshButton = document.querySelector("#refreshButton");

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

  dailySection.hidden =
    !daily;

  longSection.hidden =
    daily;

  dailyButton.classList.toggle(
    "active",
    daily
  );

  longButton.classList.toggle(
    "active",
    !daily
  );
}


dailyButton.addEventListener(
  "click",
  () => openView("daily")
);


longButton.addEventListener(
  "click",
  () => openView("long")
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


      <div class="confirmation">
        YÜKSELİŞ TEYİDİ
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

function render(data) {

  const rows =
    Array.isArray(
      data.rows
    )
      ? data.rows
      : [];


  if (data.ok) {

    statusEl.textContent =
      "Tarama aktif";

  } else {

    statusEl.textContent =
      "Veri bağlantısı sorunu";
  }


  updatedEl.textContent =
    `Son tarama: ${
      timeText(
        data.updatedAt
      )
    } | Taranan: ${
      Number(
        data.scanned || 0
      )
    } coin | Teyit: ${
      rows.length
    }`;


  if (!rows.length) {

    cards.innerHTML = `
      <div class="empty-card">

        Şu anda gerekli teknik
        koşulları birlikte sağlayan
        coin bulunamadı.

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


    render(data);

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
