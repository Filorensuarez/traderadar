import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import webpush from "web-push";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

app.use(express.static(DIR));

const REST = "https://www.okx.com";
const OKX_WS = "wss://ws.okx.com:8443/ws/v5/public";

const CFG = {
  warmupMs: 8 * 60 * 1000,
  keepMs: 15 * 60 * 1000,
  groupSize: 70,
  signalCooldown: 10 * 60 * 1000
};

const states = new Map();
const clients = new Set();


// =====================================
// KALICI SİNYAL GEÇMİŞİ
// =====================================

const DATA_DIR = "/data";
const HISTORY_FILE =
  `${DATA_DIR}/signals.json`;

let signalHistory = [];

const lastSignal =
  new Map();


function loadHistory() {
  try {
    fs.mkdirSync(
      DATA_DIR,
      { recursive: true }
    );

    if (
      fs.existsSync(
        HISTORY_FILE
      )
    ) {
      const raw =
        fs.readFileSync(
          HISTORY_FILE,
          "utf8"
        );

      const parsed =
        JSON.parse(
          raw || "[]"
        );

      signalHistory =
        Array.isArray(parsed)
          ? parsed
          : [];
    }

    console.log(
      `Geçmiş: ${signalHistory.length} sinyal`
    );

  } catch (e) {
    console.error(
      "Geçmiş okuma:",
      e.message
    );

    signalHistory = [];
  }
}


function saveHistory() {
  try {
    fs.mkdirSync(
      DATA_DIR,
      { recursive: true }
    );

    const temp =
      `${HISTORY_FILE}.tmp`;

    fs.writeFileSync(
      temp,
      JSON.stringify(
        signalHistory.slice(
          0,
          1000
        )
      )
    );

    fs.renameSync(
      temp,
      HISTORY_FILE
    );

  } catch (e) {
    console.error(
      "Geçmiş yazma:",
      e.message
    );
  }
}


loadHistory();


// =====================================
// HAREKET EDENLER ÖNBELLEĞİ
// =====================================

let movers = {
  updatedAt: 0,
  gainers: [],
  losers: []
};


// =====================================
// YARDIMCI FONKSİYONLAR
// =====================================

const sleep = ms =>
  new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );


const pct = (a, b) =>
  a
    ? (
        (b - a) /
        a
      ) * 100
    : 0;


function median(arr) {
  const a =
    arr
      .filter(
        x =>
          Number.isFinite(x) &&
          x > 0
      )
      .sort(
        (x, y) =>
          x - y
      );

  if (!a.length) {
    return 0;
  }

  const m =
    Math.floor(
      a.length / 2
    );

  return (
    a.length % 2
      ? a[m]
      : (
          a[m - 1] +
          a[m]
        ) / 2
  );
}


// =====================================
// COİN DURUMU
// =====================================

function getState(symbol) {
  if (
    !states.has(symbol)
  ) {
    states.set(
      symbol,
      {
        symbol,

        price: 0,
        firstTradeAt: 0,

        trades: [],
        candles: [],

        score: 0,
        peak5m: 0,

        scoreHistory: [],

        status:
          "VERİ TOPLANIYOR",

        metrics: {}
      }
    );
  }

  return states.get(
    symbol
  );
}


// =====================================
// SANİYELİK PENCERE
// =====================================

function windowStats(
  s,
  seconds
) {
  const from =
    Date.now() -
    seconds * 1000;

  const rows =
    s.trades.filter(
      x =>
        x.t >= from
    );

  if (!rows.length) {
    return {
      ret: 0,
      vol: 0,
      n: 0,
      buyRatio: 50
    };
  }

  const volume =
    rows.reduce(
      (sum, x) =>
        sum + x.q,
      0
    );

  const buyVolume =
    rows.reduce(
      (sum, x) =>
        sum +
        (
          x.buy
            ? x.q
            : 0
        ),
      0
    );

  return {
    ret:
      pct(
        rows[0].p,
        rows[
          rows.length - 1
        ].p
      ),

    vol:
      volume,

    n:
      rows.length,

    buyRatio:
      volume
        ? (
            buyVolume /
            volume
          ) * 100
        : 50
  };
}


// =====================================
// 5 DK ZİRVE PUANI
// =====================================

function updatePeak(s) {
  const now =
    Date.now();

  s.scoreHistory.push({
    t: now,
    score: s.score
  });

  const cutoff =
    now -
    5 * 60 * 1000;

  while (
    s.scoreHistory.length &&
    s.scoreHistory[0].t <
      cutoff
  ) {
    s.scoreHistory.shift();
  }

  s.peak5m =
    s.scoreHistory.length
      ? Math.max(
          ...s.scoreHistory.map(
            x => x.score
          )
        )
      : s.score;
}


// =====================================
// SİNYALİ SUNUCUDA KAYDET
// =====================================

function recordSignal(s) {
  const allowed = [
    "PATLAMA HAZIRLIĞI",
    "GÜÇLÜ PATLAMA HAZIRLIĞI",
    "KIRILIM TEYİDİ"
  ];

  if (
    !allowed.includes(
      s.status
    )
  ) {
    return;
  }

  const now =
    Date.now();

  const key =
    `${s.symbol}|${s.status}`;

  const previous =
    lastSignal.get(key) || 0;

  if (
    now - previous <
    CFG.signalCooldown
  ) {
    return;
  }

  lastSignal.set(
    key,
    now
  );

  const m =
    s.metrics || {};

  signalHistory.unshift({
    time: now,

    symbol:
      s.symbol,

    status:
      s.status,

    price:
      Number(s.price),

    score:
      Number(s.score),

    peak:
      Number(
        s.peak5m ||
        s.score
      ),

    volX:
      Number(
        m.volX || 0
      ),

    tradeX:
      Number(
        m.tradeX || 0
      ),

    volAccel:
      Number(
        m.volumeAcceleration ||
        0
      ),

    tradeAccel:
      Number(
        m.tradeAcceleration ||
        0
      ),

    buy:
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

    resistance:
      Number(
        m.resistanceDistance ||
        0
      )
  });

  signalHistory =
    signalHistory.slice(
      0,
      1000
    );

  saveHistory();

  console.log(
    "SİNYAL:",
    s.symbol,
    s.status,
    s.score
  );
}


// =====================================
// PATLAMA ÖNCESİ MOTOR
// =====================================

function calculate(s) {
  const now =
    Date.now();

  const w5 =
    windowStats(s, 5);

  const w10 =
    windowStats(s, 10);

  const w30 =
    windowStats(s, 30);

  const w60 =
    windowStats(s, 60);

  const w120 =
    windowStats(s, 120);


  // ===================================
  // REFERANS HACİM
  // ===================================

  const baseline = [];

  for (
    let k = 2;
    k <= 7;
    k++
  ) {
    const lo =
      now -
      k * 120000;

    const hi =
      now -
      (k - 1) *
      120000;

    const rows =
      s.trades.filter(
        x =>
          x.t >= lo &&
          x.t < hi
      );

    if (
      rows.length < 3
    ) {
      continue;
    }

    const volume =
      rows.reduce(
        (sum, x) =>
          sum + x.q,
        0
      );

    if (
      volume <= 0
    ) {
      continue;
    }

    const buyVolume =
      rows.reduce(
        (sum, x) =>
          sum +
          (
            x.buy
              ? x.q
              : 0
          ),
        0
      );

    baseline.push({
      volume,

      trades:
        rows.length,

      buyRatio:
        (
          buyVolume /
          volume
        ) * 100
    });
  }


  const age =
    s.firstTradeAt
      ? now -
        s.firstTradeAt
      : 0;


  const ready =
    age >=
      CFG.warmupMs &&

    baseline.length >= 3;


  const baseVolume =
    median(
      baseline.map(
        x => x.volume
      )
    );


  const baseTrades =
    median(
      baseline.map(
        x => x.trades
      )
    );


  const baseBuy =
    median(
      baseline.map(
        x => x.buyRatio
      )
    );


  const volX =
    ready &&
    baseVolume
      ? Math.min(
          99,
          w120.vol /
          baseVolume
        )
      : 0;


  const tradeX =
    ready &&
    baseTrades
      ? Math.min(
          99,
          w120.n /
          baseTrades
        )
      : 0;


  // ===================================
  // HACİM VE İŞLEM İVMESİ
  // ===================================

  const volumeAcceleration =
    w120.vol > 0
      ? w30.vol /
        (
          w120.vol / 4
        )
      : 0;


  const tradeAcceleration =
    w120.n > 0
      ? w30.n /
        (
          w120.n / 4
        )
      : 0;


  const microVolumeAcceleration =
    w30.vol > 0
      ? w10.vol /
        (
          w30.vol / 3
        )
      : 0;


  const microTradeAcceleration =
    w30.n > 0
      ? w10.n /
        (
          w30.n / 3
        )
      : 0;


  const buyShift =
    ready
      ? w30.buyRatio -
        baseBuy
      : 0;


  const buyStrength =
    w10.buyRatio *
      0.35 +

    w30.buyRatio *
      0.45 +

    w60.buyRatio *
      0.20;


  // ===================================
  // MUM YAPISI
  // ===================================

  const candles =
    s.candles.slice(-8);

  let compression = 50;
  let trendScore = 0;

  let resistanceDistance =
    99;

  let breakout = false;


  if (
    candles.length >= 4
  ) {
    const highs =
      candles.map(
        x => x.h
      );

    const lows =
      candles.map(
        x => x.l
      );

    const closes =
      candles.map(
        x => x.c
      );


    const middle =
      median(closes) ||
      1;


    const range =
      (
        Math.max(
          ...highs
        ) -
        Math.min(
          ...lows
        )
      ) /
      middle *
      100;


    compression =
      Math.max(
        0,
        Math.min(
          100,
          100 -
          range * 14
        )
      );


    let rising = 0;

    for (
      let i = 1;
      i < closes.length;
      i++
    ) {
      if (
        closes[i] >
        closes[i - 1]
      ) {
        rising++;
      }
    }


    trendScore =
      rising /
      Math.max(
        1,
        closes.length - 1
      ) *
      100;


    const resistance =
      Math.max(
        ...highs.slice(
          0,
          -1
        )
      );


    resistanceDistance =
      resistance
        ? (
            (
              resistance -
              s.price
            ) /
            resistance
          ) * 100
        : 99;


    breakout =
      resistance > 0 &&
      s.price >
        resistance;
  }


  // ===================================
  // HAZIRLIK
  // ===================================

  if (!ready) {
    s.score = 0;

    s.status =
      "VERİ TOPLANIYOR";

    s.metrics = {
      w5,
      w10,
      w30,
      w60,
      w120,

      volX: 0,
      tradeX: 0,

      volumeAcceleration,
      tradeAcceleration,

      microVolumeAcceleration,
      microTradeAcceleration,

      buyStrength,

      compression,
      trendScore,

      resistanceDistance,

      ready: false,

      warmupRemaining:
        Math.max(
          0,
          CFG.warmupMs -
          age
        ),

      peak5m: 0
    };

    return;
  }


  // ===================================
  // FİYAT ERKENLİK PUANI
  // ===================================

  const moved =
    Math.max(
      w60.ret,
      w120.ret
    );


  let earlyScore = 20;

  if (
    moved <= 0.5
  ) {
    earlyScore = 100;

  } else if (
    moved <= 1
  ) {
    earlyScore = 95;

  } else if (
    moved <= 2
  ) {
    earlyScore = 80;

  } else if (
    moved <= 3
  ) {
    earlyScore = 55;
  }


  // ===================================
  // HACİM PUANI
  // ===================================

  const volumeScore =
    Math.min(
      100,

      volX * 18 +

      Math.max(
        0,
        volumeAcceleration -
        1
      ) * 35 +

      Math.max(
        0,
        microVolumeAcceleration -
        1
      ) * 20
    );


  // ===================================
  // İŞLEM HIZI PUANI
  // ===================================

  const tradeScore =
    Math.min(
      100,

      tradeX * 18 +

      Math.max(
        0,
        tradeAcceleration -
        1
      ) * 35 +

      Math.max(
        0,
        microTradeAcceleration -
        1
      ) * 20
    );


  // ===================================
  // ALIŞ AKIŞI
  // ===================================

  const flowScore =
    Math.min(
      100,

      buyStrength +

      Math.max(
        0,
        buyShift
      ) * 1.2
    );


  // ===================================
  // MİKRO MOMENTUM
  // ===================================

  const momentumScore =
    Math.max(
      0,

      Math.min(
        100,

        50 +

        w5.ret * 90 +

        w10.ret * 65 +

        w30.ret * 30
      )
    );


  // ===================================
  // DİRENÇ PUANI
  // ===================================

  let resistanceScore = 0;

  if (
    resistanceDistance >= 0 &&
    resistanceDistance <= 2
  ) {
    resistanceScore =
      100 -
      resistanceDistance *
      30;

  } else if (
    resistanceDistance < 0 &&
    resistanceDistance > -1
  ) {
    resistanceScore = 100;
  }


  // ===================================
  // TOPLAM PUAN
  // ===================================

  let score =
    volumeScore *
      0.24 +

    tradeScore *
      0.18 +

    flowScore *
      0.18 +

    momentumScore *
      0.10 +

    compression *
      0.09 +

    trendScore *
      0.08 +

    resistanceScore *
      0.07 +

    earlyScore *
      0.06;


  // ===================================
  // YANLIŞ SİNYAL FİLTRELERİ
  // ===================================

  if (
    volumeAcceleration <
      1.05 &&

    volX < 1.3
  ) {
    score =
      Math.min(
        score,
        67
      );
  }


  if (
    w30.buyRatio < 55
  ) {
    score =
      Math.min(
        score,
        66
      );
  }


  // ===================================
  // GEÇ KALINDI
  // ===================================

  const late =
    w120.ret >= 5 ||
    w60.ret >= 4;


  if (late) {
    score =
      Math.min(
        score,
        55
      );
  }


  // ===================================
  // KIRILIM
  // ===================================

  const breakoutConfirmed =
    breakout &&

    w30.buyRatio >= 58 &&

    (
      volX >= 1.5 ||
      volumeAcceleration >=
        1.25
    ) &&

    w10.ret > -0.10;


  if (
    breakoutConfirmed
  ) {
    score =
      Math.max(
        score,
        86
      );
  }


    s.score =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          score
        )
      )
    );

  updatePeak(s);


  // ===================================
  // SİNYAL SINIFLANDIRMASI
  // ===================================

  const accumulation =
    !late &&
    s.score >= 60 &&
    compression >= 55 &&
    (
      volumeAcceleration >= 1.05 ||
      tradeAcceleration >= 1.10
    ) &&
    w30.buyRatio >= 53;


  const preparation =
    !late &&
    s.score >= 72 &&
    (
      volX >= 1.3 ||
      volumeAcceleration >= 1.20
    ) &&
    (
      tradeX >= 1.2 ||
      tradeAcceleration >= 1.20
    ) &&
    w30.buyRatio >= 58 &&
    resistanceDistance <= 2.5;


  const strongPreparation =
    preparation &&
    s.score >= 82 &&
    buyStrength >= 62 &&
    (
      microVolumeAcceleration >= 1.10 ||
      microTradeAcceleration >= 1.10
    );


  if (late) {
    s.status =
      "GEÇ KALINDI";

  } else if (
    breakoutConfirmed
  ) {
    s.status =
      "KIRILIM TEYİDİ";

  } else if (
    strongPreparation
  ) {
    s.status =
      "GÜÇLÜ PATLAMA HAZIRLIĞI";

  } else if (
    preparation
  ) {
    s.status =
      "PATLAMA HAZIRLIĞI";

  } else if (
    accumulation
  ) {
    s.status =
      "BİRİKİM TESPİT EDİLDİ";

  } else {
    s.status =
      "İZLENİYOR";
  }


  s.metrics = {
    w5,
    w10,
    w30,
    w60,
    w120,

    volX:
      Number(
        volX.toFixed(2)
      ),

    tradeX:
      Number(
        tradeX.toFixed(2)
      ),

    volumeAcceleration:
      Number(
        volumeAcceleration.toFixed(2)
      ),

    tradeAcceleration:
      Number(
        tradeAcceleration.toFixed(2)
      ),

    microVolumeAcceleration:
      Number(
        microVolumeAcceleration.toFixed(2)
      ),

    microTradeAcceleration:
      Number(
        microTradeAcceleration.toFixed(2)
      ),

    buyStrength:
      Number(
        buyStrength.toFixed(1)
      ),

    compression:
      Math.round(
        compression
      ),

    trendScore:
      Math.round(
        trendScore
      ),

    resistanceDistance:
      Number(
        resistanceDistance.toFixed(2)
      ),

    breakoutConfirmed,

    earlyPriceScore:
      earlyScore,

    preparationScore:
      s.score,

    ready: true,

    peak5m:
      s.peak5m
  };


  // Sunucu sinyali kendi kaydeder.
  recordSignal(s);
}


// =====================================
// TÜM AKTİF OKX USDT PARİTELERİ
// =====================================

async function getSymbols() {
  const r =
    await fetch(
      `${REST}/api/v5/market/tickers?instType=SPOT`
    );

  if (!r.ok) {
    throw new Error(
      `OKX HTTP ${r.status}`
    );
  }

  const j =
    await r.json();

  return (j.data || [])
    .filter(
      x =>
        x.instId.endsWith(
          "-USDT"
        )
    )
    .filter(
      x =>
        Number(x.last) > 0 &&
        Number(
          x.volCcy24h || 0
        ) > 0
    )
    .map(
      x => x.instId
    );
}


// =====================================
// 15 DK MUMLAR
// =====================================

async function loadCandles(
  symbols
) {
  for (
    const symbol of symbols
  ) {
    try {
      const r =
        await fetch(
          `${REST}/api/v5/market/candles?instId=${encodeURIComponent(
            symbol
          )}&bar=15m&limit=8`
        );

      if (!r.ok) {
        continue;
      }

      const j =
        await r.json();

      const s =
        getState(
          symbol
        );

      s.candles =
        (j.data || [])
          .map(
            x => ({
              h:
                Number(x[2]),

              l:
                Number(x[3]),

              c:
                Number(x[4])
            })
          )
          .reverse();

      await sleep(35);

    } catch (e) {
      console.error(
        "Mum:",
        symbol,
        e.message
      );
    }
  }
}


// =====================================
// OKX CANLI BAĞLANTI
// =====================================

function connectOKX(
  symbols,
  groupNo
) {
  const ws =
    new WebSocket(
      OKX_WS
    );


  ws.on(
    "open",
    () => {
      const args =
        symbols.map(
          instId => ({
            channel:
              "trades",

            instId
          })
        );


      for (
        let i = 0;
        i < args.length;
        i += 20
      ) {
        ws.send(
          JSON.stringify({
            op:
              "subscribe",

            args:
              args.slice(
                i,
                i + 20
              )
          })
        );
      }


      console.log(
        `OKX grup ${groupNo}: ${symbols.length} parite`
      );
    }
  );


  ws.on(
    "message",
    raw => {
      let data;

      try {
        data =
          JSON.parse(
            raw.toString()
          );

      } catch {
        return;
      }


      if (
        data.arg?.channel !==
          "trades" ||
        !Array.isArray(
          data.data
        )
      ) {
        return;
      }


      for (
        const trade of data.data
      ) {
        const s =
          getState(
            trade.instId
          );

        const price =
          Number(
            trade.px
          );

        const size =
          Number(
            trade.sz
          );

        const t =
          Number(
            trade.ts
          );


        if (
          !price ||
          !size ||
          !t
        ) {
          continue;
        }


        if (
          !s.firstTradeAt
        ) {
          s.firstTradeAt =
            t;
        }


        s.price =
          price;


        s.trades.push({
          t,

          p:
            price,

          q:
            price * size,

          buy:
            trade.side ===
            "buy"
        });


        const cutoff =
          Date.now() -
          CFG.keepMs;


        while (
          s.trades.length &&
          s.trades[0].t <
            cutoff
        ) {
          s.trades.shift();
        }


        calculate(s);
      }
    }
  );


  ws.on(
    "error",
    e => {
      console.error(
        `OKX grup ${groupNo}:`,
        e.message
      );
    }
  );


  ws.on(
    "close",
    () => {
      console.log(
        `OKX grup ${groupNo} yeniden bağlanıyor`
      );

      setTimeout(
        () =>
          connectOKX(
            symbols,
            groupNo
          ),
        3000
      );
    }
  );
}


// =====================================
// RADAR ÖNCELİĞİ
// =====================================

function priority(status) {
  if (
    status ===
    "KIRILIM TEYİDİ"
  ) return 7;

  if (
    status ===
    "GÜÇLÜ PATLAMA HAZIRLIĞI"
  ) return 6;

  if (
    status ===
    "PATLAMA HAZIRLIĞI"
  ) return 5;

  if (
    status ===
    "BİRİKİM TESPİT EDİLDİ"
  ) return 4;

  if (
    status ===
    "GEÇ KALINDI"
  ) return 2;

  return 1;
}


function radarRows() {
  return [...states.values()]
    .filter(
      x => x.price
    )
    .sort(
      (a, b) =>
        priority(
          b.status
        ) -
        priority(
          a.status
        ) ||
        b.score -
        a.score
    )
    .slice(
      0,
      50
    )
    .map(
      x => ({
        symbol:
          x.symbol,

        price:
          x.price,

        score:
          x.score,

        peak5m:
          x.peak5m,

        status:
          x.status,

        rawStatus:
          x.status,

        metrics:
          x.metrics,

        source:
          "OKX"
      })
    );
}


// =====================================
// EN ÇOK YÜKSELEN / DÜŞEN
// =====================================

async function updateMovers() {
  try {
    const r =
      await fetch(
        `${REST}/api/v5/market/tickers?instType=SPOT`
      );

    if (!r.ok) {
      throw new Error(
        `OKX ${r.status}`
      );
    }

    const j =
      await r.json();


    const all =
      (j.data || [])
        .filter(
          x =>
            x.instId.endsWith(
              "-USDT"
            )
        )
        .filter(
          x =>
            Number(x.last) > 0 &&
            Number(x.open24h) > 0
        )
        .map(
          x => {
            const price =
              Number(
                x.last
              );

            const open =
              Number(
                x.open24h
              );

            const high =
              Number(
                x.high24h
              );

            const low =
              Number(
                x.low24h
              );

            return {
              symbol:
                x.instId,

              price,

              change24:
                pct(
                  open,
                  price
                ),

              high24:
                high,

              low24:
                low,

              distanceFromHigh:
                high
                  ? (
                      (
                        high -
                        price
                      ) /
                      high
                    ) * 100
                  : 0,

              distanceFromLow:
                low
                  ? (
                      (
                        price -
                        low
                      ) /
                      low
                    ) * 100
                  : 0
            };
          }
        );


    const gainers =
      [...all]
        .sort(
          (a, b) =>
            b.change24 -
            a.change24
        )
        .slice(
          0,
          15
        );


    const losers =
      [...all]
        .sort(
          (a, b) =>
            a.change24 -
            b.change24
        )
        .slice(
          0,
          15
        );


    function enrich(
      x,
      up
    ) {
      const s =
        states.get(
          x.symbol
        );

      const m =
        s?.metrics || {};


      const momentum15 =
        Number(
          m.w120?.ret ||
          0
        );


      const momentum1h =
        Number(
          m.w60?.ret ||
          0
        );


      const volumeRatio =
        Number(
          m.volX ||
          0
        );


      if (up) {
        let continuationScore =
          0;


        if (
          x.change24 > 0
        ) {
          continuationScore +=
            15;
        }


        if (
          momentum15 > 0
        ) {
          continuationScore +=
            15;
        }


        if (
          momentum1h > 0
        ) {
          continuationScore +=
            15;
        }


        if (
          volumeRatio >= 1.3
        ) {
          continuationScore +=
            20;
        }


        if (
          Number(
            m.volumeAcceleration ||
            0
          ) >= 1.2
        ) {
          continuationScore +=
            20;
        }


        if (
          Number(
            m.w30?.buyRatio ||
            0
          ) >= 60
        ) {
          continuationScore +=
            15;
        }


        continuationScore =
          Math.min(
            100,
            continuationScore
          );


        let continuationText =
          "DEVAM GÜCÜ ZAYIF";


        if (
          continuationScore >=
          75
        ) {
          continuationText =
            "MOMENTUM GÜÇLÜ";

        } else if (
          continuationScore >=
          55
        ) {
          continuationText =
            "YÜKSELİŞ KORUNUYOR";

        } else if (
          continuationScore >=
          35
        ) {
          continuationText =
            "TEYİT BEKLENİYOR";
        }


        if (
          x.change24 >= 40
        ) {
          continuationText =
            "AŞIRI UZAMIŞ — RİSK YÜKSEK";
        }


        return {
          ...x,

          momentum15,
          momentum1h,
          volumeRatio,

          continuationScore,
          continuationText
        };
      }


      // Düşüşten tepki analizi

      let reversalScore =
        0;


      if (
        x.distanceFromLow <=
        3
      ) {
        reversalScore +=
          25;
      }


      if (
        momentum15 > 0
      ) {
        reversalScore +=
          20;
      }


      if (
        Number(
          m.volumeAcceleration ||
          0
        ) >= 1.2
      ) {
        reversalScore +=
          20;
      }


      if (
        Number(
          m.w30?.buyRatio ||
          0
        ) >= 55
      ) {
        reversalScore +=
          20;
      }


      if (
        Number(
          m.trendScore ||
          0
        ) >= 55
      ) {
        reversalScore +=
          15;
      }


      reversalScore =
        Math.min(
          100,
          reversalScore
        );


      let reversalText =
        "DÜŞÜŞ DEVAM EDİYOR";


      if (
        reversalScore >= 75
      ) {
        reversalText =
          "DÖNÜŞ TEYİDİ";

      } else if (
        reversalScore >= 55
      ) {
        reversalText =
          "TEPKİ İHTİMALİ ARTIYOR";

      } else if (
        reversalScore >= 35
      ) {
        reversalText =
          "DÖNÜŞ TEYİDİ BEKLENİYOR";
      }


      const range =
        Math.max(
          x.high24 -
          x.low24,

          x.price *
          0.001
        );


      return {
        ...x,

        momentum15,
        momentum1h,
        volumeRatio,

        reversalScore,
        reversalText,

        supportLow:
          Math.max(
            0,

            x.low24 -
            range *
            0.02
          ),

        supportHigh:
          x.low24 +
          range *
          0.08
      };
    }


    movers = {
      updatedAt:
        Date.now(),

      gainers:
        gainers.map(
          x =>
            enrich(
              x,
              true
            )
        ),

      losers:
        losers.map(
          x =>
            enrich(
              x,
              false
            )
        )
    };


    console.log(
      "Hareket analizi güncellendi"
    );

  } catch (e) {
    console.error(
      "Hareket analizi:",
      e.message
    );
  }
}


// =====================================
// API
// =====================================

app.get(
  "/api/radar",
  (req, res) => {
    res.set(
      "Cache-Control",
      "no-store"
    );

    res.json({
      type:
        "radar",

      source:
        "OKX",

      tracked:
        states.size,

      rows:
        radarRows(),

      ts:
        Date.now()
    });
  }
);


// Kalıcı sinyal geçmişi

app.get(
  "/api/history",
  (req, res) => {
    res.set(
      "Cache-Control",
      "no-store"
    );

    res.json({
      type:
        "history",

      source:
        "server",

      count:
        signalHistory.length,

      rows:
        signalHistory
    });
  }
);


// Hareket edenler

app.get(
  "/api/movers",
  (req, res) => {
    res.set(
      "Cache-Control",
      "no-store"
    );

    res.json({
      type:
        "movers",

      source:
        "OKX",

      updatedAt:
        movers.updatedAt,

      gainers:
        movers.gainers,

      losers:
        movers.losers
    });
  }
);


// =====================================
// SUNUCUYU BAŞLAT
// =====================================

const server =
  app.listen(
    PORT,
    async () => {
      console.log(
        `TradeRadar port ${PORT}`
      );

      try {
        const symbols =
          await getSymbols();


        console.log(
          `${symbols.length} aktif USDT paritesi`
        );


        for (
          const symbol of symbols
        ) {
          getState(
            symbol
          );
        }


        // Mumlar arka planda yüklenir.
        loadCandles(
          symbols
        );


        // Tüm coinleri gruplara böl.
        const groups =
          [];

        for (
          let i = 0;
          i < symbols.length;
          i +=
            CFG.groupSize
        ) {
          groups.push(
            symbols.slice(
              i,
              i +
              CFG.groupSize
            )
          );
        }


        groups.forEach(
          (
            group,
            index
          ) => {
            setTimeout(
              () =>
                connectOKX(
                  group,
                  index + 1
                ),

              index *
              1200
            );
          }
        );


        setTimeout(
          updateMovers,
          5000
        );

      } catch (e) {
        console.error(
          "Başlatma:",
          e.message
        );
      }
   
    }
  );


// =====================================
// TELEFON CANLI WEBSOCKET
// =====================================

const ui =
  new WebSocketServer({
    server,
    path: "/live"
  });


ui.on(
  "connection",
  ws => {
    clients.add(ws);

    try {
      ws.send(
        JSON.stringify({
          type: "radar",
          source: "OKX",
          tracked: states.size,
          rows: radarRows()
        })
      );
    } catch {}


    ws.on(
      "close",
      () => {
        clients.delete(ws);
      }
    );
  }
);


// =====================================
// RADARI HER SANİYE TELEFONA GÖNDER
// =====================================

setInterval(
  () => {
    const message =
      JSON.stringify({
        type: "radar",
        source: "OKX",
        tracked: states.size,
        rows: radarRows()
      });


    for (
      const ws of clients
    ) {
      if (
        ws.readyState ===
        WebSocket.OPEN
      ) {
        try {
          ws.send(message);
        } catch {}
      }
    }
  },
  1000
);


// =====================================
// HAREKET EDENLERİ GÜNCELLE
// =====================================

setInterval(
  updateMovers,
  60 * 1000
);


// =====================================
// SAĞLIK KONTROLÜ
// =====================================

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      source: "OKX",
      tracked: states.size,
      signals: signalHistory.length,
      time: Date.now()
    });
  }
);


console.log(
  "TradeRadar sistemi hazır."
);
