import Ultimate, {
  ultimateStatus,
  ultimateCanGenerateSignal
} from "./ultimate/index.js";
import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import webpush from "web-push";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const REST = "https://www.okx.com";
const OKXWS = "wss://ws.okx.com:8443/ws/v5/public";
const DATA = "/data";

const CFG = {
  warmup: 8 * 60 * 1000,
  keep: 15 * 60 * 1000,
  group: 70,
  cooldown: 10 * 60 * 1000
};

app.use(express.json({ limit: "200kb" }));
app.use(express.static(DIR));

const states = new Map();
const clients = new Set();
const lastSignal = new Map();

let movers = {
  updatedAt: 0,
  gainers: [],
  losers: []
};


// =====================================
// DOSYA YARDIMCILARI
// =====================================

function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;

    const data = JSON.parse(
      fs.readFileSync(file, "utf8") || "[]"
    );

    return data;
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    fs.mkdirSync(DATA, { recursive: true });

    const tmp = file + ".tmp";

    fs.writeFileSync(
      tmp,
      JSON.stringify(data)
    );

    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("Dosya yazma:", e.message);
  }
}


// =====================================
// KALICI SİNYAL GEÇMİŞİ
// =====================================

const HISTORY_FILE = `${DATA}/signals.json`;

let signalHistory = readJSON(
  HISTORY_FILE,
  []
);

if (!Array.isArray(signalHistory)) {
  signalHistory = [];
}

console.log(
  `Geçmiş: ${signalHistory.length} sinyal`
);


// =====================================
// WEB PUSH
// =====================================

const PUSH_FILE =
  `${DATA}/push-subscriptions.json`;

let pushSubscriptions =
  readJSON(PUSH_FILE, []);

if (!Array.isArray(pushSubscriptions)) {
  pushSubscriptions = [];
}

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY;

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY;

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  "mailto:traderadar@example.com";

if (
  VAPID_PUBLIC_KEY &&
  VAPID_PRIVATE_KEY
) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  console.log("Web Push hazır.");
} else {
  console.log("Web Push anahtarları eksik.");
}


async function sendPush(signal) {
  if (!pushSubscriptions.length) return;

  const m = signal.metrics || {};

  const payload = JSON.stringify({
    title:
      `${signal.symbol.replace(
        "-USDT",
        "/USDT"
      )} — ${signal.status}`,

    body:
      `Puan ${signal.score}/100 | ` +
      `Hacim ${Number(m.volX || 0).toFixed(2)}x | ` +
      `İvme ${Number(
        m.volumeAcceleration || 0
      ).toFixed(2)}x | ` +
      `Alış %${Number(
        m.w30?.buyRatio || 0
      ).toFixed(1)}`,

    tag:
      `traderadar-${signal.symbol}`,

    url: "/"
  });

  const alive = [];

  for (const sub of pushSubscriptions) {
    try {
      await webpush.sendNotification(
        sub,
        payload
      );

      alive.push(sub);

    } catch (e) {
      if (
        e.statusCode !== 404 &&
        e.statusCode !== 410
      ) {
        alive.push(sub);

        console.error(
          "Push:",
          e.message
        );
      }
    }
  }

  if (
    alive.length !==
    pushSubscriptions.length
  ) {
    pushSubscriptions = alive;

    writeJSON(
      PUSH_FILE,
      pushSubscriptions
    );
  }
}


// =====================================
// GENEL YARDIMCILAR
// =====================================

const sleep = ms =>
  new Promise(r => setTimeout(r, ms));

const pct = (a, b) =>
  a ? ((b - a) / a) * 100 : 0;

function median(arr) {
  const a = arr
    .filter(
      x =>
        Number.isFinite(x) &&
        x > 0
    )
    .sort((x, y) => x - y);

  if (!a.length) return 0;

  const m = Math.floor(a.length / 2);

  return a.length % 2
    ? a[m]
    : (a[m - 1] + a[m]) / 2;
}


// =====================================
// COİN DURUMU
// =====================================

function S(symbol) {
  if (!states.has(symbol)) {
    states.set(symbol, {
      symbol,
      price: 0,
      first: 0,
      trades: [],
      candles: [],
              multiCandles: {
          "1m": [],
          "3m": [],
          "5m": [],
          "15m": [],
          "1h": [],
          "4h": []
        },
      score: 0,
      peak5m: 0,
      scores: [],
      status: "VERİ TOPLANIYOR",
      metrics: {}
    });
  }

  return states.get(symbol);
}


// =====================================
// SANİYELİK PENCERE
// =====================================

function W(s, sec) {
  const from =
    Date.now() - sec * 1000;

  const a =
    s.trades.filter(x => x.t >= from);

  if (!a.length) {
    return {
      ret: 0,
      vol: 0,
      n: 0,
      buyRatio: 50
    };
  }

  const vol =
    a.reduce((z, x) => z + x.q, 0);

  const buy =
    a.reduce(
      (z, x) => z + (x.buy ? x.q : 0),
      0
    );

  return {
    ret: pct(
      a[0].p,
      a[a.length - 1].p
    ),

    vol,
    n: a.length,

    buyRatio:
      vol ? buy / vol * 100 : 50
  };
}


function updatePeak(s) {
  const now = Date.now();

  s.scores.push({
    t: now,
    v: s.score
  });

  const cut =
    now - 5 * 60 * 1000;

  while (
    s.scores.length &&
    s.scores[0].t < cut
  ) {
    s.scores.shift();
  }

  s.peak5m =
    Math.max(
      0,
      ...s.scores.map(x => x.v)
    );
}


// =====================================
// SİNYAL KAYDI + PUSH
// =====================================

function recordSignal(s) {
  const allowed = [
  "ERKEN ADAY",
  "PATLAMA HAZIRLIĞI",
  "GÜÇLÜ PATLAMA HAZIRLIĞI",
  "KIRILIM TEYİDİ"
];

  if (!allowed.includes(s.status)) return;

  const now = Date.now();
  const key = `${s.symbol}|${s.status}`;

  if (
    now - (lastSignal.get(key) || 0) <
    CFG.cooldown
  ) {
    return;
  }

  lastSignal.set(key, now);

  const m = s.metrics || {};

  const row = {
    time: now,
    symbol: s.symbol,
    status: s.status,
    price: Number(s.price),
    score: Number(s.score),
    peak: Number(s.peak5m || s.score),

    volX:
      Number(m.volX || 0),

    tradeX:
      Number(m.tradeX || 0),

    volAccel:
      Number(m.volumeAcceleration || 0),

    tradeAccel:
      Number(m.tradeAcceleration || 0),

    buy:
      Number(m.w30?.buyRatio || 0),

    ret10:
      Number(m.w10?.ret || 0),

    ret30:
      Number(m.w30?.ret || 0),

    ret60:
      Number(m.w60?.ret || 0),

    ret120:
      Number(m.w120?.ret || 0),

    resistance:
      Number(m.resistanceDistance || 0)
  };

  signalHistory.unshift(row);

  signalHistory =
    signalHistory.slice(0, 1000);

  writeJSON(
    HISTORY_FILE,
    signalHistory
  );

  console.log(
    "SİNYAL:",
    s.symbol,
    s.status,
    s.score
  );

  sendPush(s).catch(
    e =>
      console.error(
        "Push gönderme:",
        e.message
      )
  );
}

// =====================================
// SİNYAL PERFORMANS TESTİ
// =====================================
const PERFORMANCE_TEST_START =
  new Date(
    "2026-10-02T21:47:32+03:00"
  ).getTime();
const PERFORMANCE_HORIZONS = {
  m5: 5 * 60 * 1000,
  m15: 15 * 60 * 1000,
  m30: 30 * 60 * 1000,
  h1: 60 * 60 * 1000,
  h4: 4 * 60 * 60 * 1000
};

function updateSignalPerformance() {
  const now = Date.now();
  let changed = false;

  for (const row of signalHistory) {
        if (
      Number(row.time) <
      PERFORMANCE_TEST_START
    ) {
      continue;
        }
    if (
      !row?.symbol ||
      !row?.time ||
      !row?.price
    ) continue;

    const s =
      states.get(row.symbol);

    const currentPrice =
      Number(s?.price || 0);

    if (!(currentPrice > 0)) continue;

    row.performance ||= {};

    for (
      const [key, ms]
      of Object.entries(
        PERFORMANCE_HORIZONS
      )
    ) {
      if (
        row.performance[key] ||
        now - Number(row.time) < ms
      ) continue;

      const changePct =
        (
          (
            currentPrice -
            Number(row.price)
          ) /
          Number(row.price)
        ) * 100;

      row.performance[key] = {
        price: currentPrice,
        changePct:
          Number(
            changePct.toFixed(3)
          ),
        checkedAt: now
      };

      changed = true;
    }
  }

  if (changed) {
    writeJSON(
      HISTORY_FILE,
      signalHistory
    );
  }
}

setInterval(
  updateSignalPerformance,
  30 * 1000
);
// =====================================
// PATLAMA ÖNCESİ MOTOR
// =====================================

function calc(s) {
  const now = Date.now();

  const w5 = W(s, 5);
  const w10 = W(s, 10);
  const w30 = W(s, 30);
  const w60 = W(s, 60);
  const w120 = W(s, 120);

  const base = [];

  for (let k = 2; k <= 7; k++) {
    const lo = now - k * 120000;
    const hi = now - (k - 1) * 120000;

    const a =
      s.trades.filter(
        x =>
          x.t >= lo &&
          x.t < hi
      );

    if (a.length < 3) continue;

    const vol =
      a.reduce((z, x) => z + x.q, 0);

    if (!vol) continue;

    const buy =
      a.reduce(
        (z, x) =>
          z + (x.buy ? x.q : 0),
        0
      );

    base.push({
      vol,
      n: a.length,
      buy: buy / vol * 100
    });
  }

  const age =
    s.first ? now - s.first : 0;

  const ready =
    age >= CFG.warmup &&
    base.length >= 3;

  const bv =
    median(base.map(x => x.vol));

  const bn =
    median(base.map(x => x.n));

  const bb =
    median(base.map(x => x.buy));

  const volX =
    ready && bv
      ? Math.min(99, w120.vol / bv)
      : 0;

  const tradeX =
    ready && bn
      ? Math.min(99, w120.n / bn)
      : 0;

  const volAccel =
    w120.vol
      ? w30.vol / (w120.vol / 4)
      : 0;

  const tradeAccel =
    w120.n
      ? w30.n / (w120.n / 4)
      : 0;

  const microVol =
    w30.vol
      ? w10.vol / (w30.vol / 3)
      : 0;

  const microTrade =
    w30.n
      ? w10.n / (w30.n / 3)
      : 0;

  const buyShift =
    ready
      ? w30.buyRatio - bb
      : 0;

  const buyStrength =
    w10.buyRatio * 0.35 +
    w30.buyRatio * 0.45 +
    w60.buyRatio * 0.20;


  // ===================================
  // 15 DK MUM / SIKIŞMA / DİRENÇ
  // ===================================

  const c = s.candles.slice(-8);

  let compression = 50;
  let trend = 0;
  let resistanceDistance = 99;
  let breakout = false;

  if (c.length >= 4) {
    const highs = c.map(x => x.h);
    const lows = c.map(x => x.l);
    const closes = c.map(x => x.c);

    const mid =
      median(closes) || 1;

    const range =
      (
        Math.max(...highs) -
        Math.min(...lows)
      ) /
      mid *
      100;

    compression =
      Math.max(
        0,
        Math.min(
          100,
          100 - range * 14
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

    trend =
      rising /
      Math.max(1, closes.length - 1) *
      100;

    const resistance =
      Math.max(...highs.slice(0, -1));

    resistanceDistance =
      resistance
        ? (
            (resistance - s.price) /
            resistance
          ) * 100
        : 99;

    breakout =
      resistance > 0 &&
      s.price > resistance;
  }


  if (!ready) {
    s.score = 0;
    s.status = "VERİ TOPLANIYOR";

    s.metrics = {
      w5,
      w10,
      w30,
      w60,
      w120,

      volX: 0,
      tradeX: 0,

      volumeAcceleration: volAccel,
      tradeAcceleration: tradeAccel,

      microVolumeAcceleration:
        microVol,

      microTradeAcceleration:
        microTrade,

      buyStrength,
      compression,
      trendScore: trend,
      resistanceDistance,

      ready: false,

      warmupRemaining:
        Math.max(
          0,
          CFG.warmup - age
        ),

      peak5m: 0
    };

    return;
  }


  // ===================================
  // PUANLAMA
  // ===================================

  const moved =
    Math.max(
      w60.ret,
      w120.ret
    );

  let early = 20;

  if (moved <= 0.5) early = 100;
  else if (moved <= 1) early = 95;
  else if (moved <= 2) early = 80;
  else if (moved <= 3) early = 55;


  const volumeScore =
    Math.min(
      100,

      volX * 18 +

      Math.max(
        0,
        volAccel - 1
      ) * 35 +

      Math.max(
        0,
        microVol - 1
      ) * 20
    );


  const tradeScore =
    Math.min(
      100,

      tradeX * 18 +

      Math.max(
        0,
        tradeAccel - 1
      ) * 35 +

      Math.max(
        0,
        microTrade - 1
      ) * 20
    );


  const flowScore =
    Math.min(
      100,

      buyStrength +

      Math.max(
        0,
        buyShift
      ) * 1.2
    );


  const momentum =
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


  let resistanceScore = 0;

  if (
    resistanceDistance >= 0 &&
    resistanceDistance <= 2
  ) {
    resistanceScore =
      100 -
      resistanceDistance * 30;

  } else if (
    resistanceDistance < 0 &&
    resistanceDistance > -1
  ) {
    resistanceScore = 100;
  }


  let score =
    volumeScore * 0.24 +
    tradeScore * 0.18 +
    flowScore * 0.18 +
    momentum * 0.10 +
    compression * 0.09 +
    trend * 0.08 +
    resistanceScore * 0.07 +
    early * 0.06;


  if (
    volAccel < 1.05 &&
    volX < 1.3
  ) {
    score =
      Math.min(score, 67);
  }


  if (w30.buyRatio < 55) {
    score =
      Math.min(score, 66);
  }


  const late =
    w120.ret >= 5 ||
    w60.ret >= 4;


  if (late) {
    score =
      Math.min(score, 55);
  }


  const breakOK =
    breakout &&
    w30.buyRatio >= 58 &&
    (
      volX >= 1.5 ||
      volAccel >= 1.25
    ) &&
    w10.ret > -0.10;


  if (breakOK) {
    score =
      Math.max(score, 86);
  }


  s.score =
    Math.round(
      Math.max(
        0,
        Math.min(100, score)
      )
    );

  updatePeak(s);


  // ===================================
  // DURUM
  // ===================================

    // ===================================
  // DAHA SIKI SİNYAL FİLTRELERİ
  // ===================================

  const accumulation =
    !late &&
    s.score >= 65 &&

    // Minimum gerçek aktivite
    volX >= 1.0 &&
    tradeX >= 0.8 &&

    compression >= 55 &&

    (
      volAccel >= 1.15 ||
      tradeAccel >= 1.20
    ) &&

    w30.buyRatio >= 55;

  const earlyCandidate =
    !late &&

    s.score >= 58 &&

    // Hacim henüz patlamamış olsa bile
    // hızlanmaya başlamış olmalı
    volX >= 0.85 &&

    tradeX >= 0.70 &&

    // Hacim veya işlem akışından
    // en az biri belirgin hızlanmalı
    (
      volAccel >= 1.08 ||
      tradeAccel >= 1.10 ||
      microVol >= 1.08 ||
      microTrade >= 1.08
    ) &&

    // Satıcıların belirgin üstünlüğü olmasın
    w30.buyRatio >= 52 &&

    // Hareket henüz fazla ilerlememiş olsun
    w120.ret < 2.0 &&

    // Kısa vadede sert aşağı gitmesin
    w30.ret > -0.75;
  const preparation =
    !late &&
    s.score >= 75 &&

    // Hacim gerçekten normalin üzerinde olmalı
    volX >= 1.50 &&

    // İşlem sayısı da yeterli olmalı
    tradeX >= 1.00 &&

    // Akış hızlanıyor olmalı
    volAccel >= 1.20 &&
    tradeAccel >= 1.15 &&

    // Alıcı üstünlüğü
    w30.buyRatio >= 60 &&

    // Dirence yakınlık
    resistanceDistance >= -0.50 &&
    resistanceDistance <= 2.50 &&

    // Hareket bittikten sonra yakalama
    // ihtimalini azalt
    w120.ret < 3.0;


  const strong =
    preparation &&

    s.score >= 82 &&

    // Güçlü sinyal için daha sert filtre
    volX >= 2.00 &&
    tradeX >= 1.20 &&

    volAccel >= 1.40 &&
    tradeAccel >= 1.30 &&

    buyStrength >= 65 &&

    w30.buyRatio >= 65 &&

    // Dirence daha yakın olsun
    resistanceDistance >= -0.30 &&
    resistanceDistance <= 2.00 &&

    // Son iki dakikada zaten uçmuş olmasın
    w120.ret < 2.50 &&

    (
      microVol >= 1.10 ||
      microTrade >= 1.10
    );


  if (late) {
    s.status = "GEÇ KALINDI";

  } else if (breakOK) {
    s.status = "KIRILIM TEYİDİ";

    } else if (strong) {
    s.status =
      "GÜÇLÜ PATLAMA HAZIRLIĞI";

  } else if (preparation) {
    s.status =
      "PATLAMA HAZIRLIĞI";

  } else if (accumulation) {
  s.status =
    "BİRİKİM TESPİT EDİLDİ";

} else if (earlyCandidate) {
  s.status =
    "ERKEN ADAY";

} else {
  s.status =
    "İZLENİYOR";
}

  const ultimateCandidate =
    s.score >= 75 &&
    (
      s.status ===
        "PATLAMA HAZIRLIĞI" ||
      s.status ===
        "GÜÇLÜ PATLAMA HAZIRLIĞI" ||
      s.status ===
        "KIRILIM TEYİDİ"
    );

  if (ultimateCandidate) {
    const now =
      Date.now();

    const lastLoad =
      Number(
        s.lastUltimateCandleLoad ||
        0
      );

    if (
      now - lastLoad >
      5 * 60 * 1000
    ) {
      s.lastUltimateCandleLoad =
        now;

      loadCandles([
        s.symbol
      ]).catch(error => {
        console.error(
          "Ultimate aday mum yükleme:",
          s.symbol,
          error.message
        );
      });
    }
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
        volAccel.toFixed(2)
      ),

    tradeAcceleration:
      Number(
        tradeAccel.toFixed(2)
      ),

    microVolumeAcceleration:
      Number(
        microVol.toFixed(2)
      ),

    microTradeAcceleration:
      Number(
        microTrade.toFixed(2)
      ),

    buyStrength:
      Number(
        buyStrength.toFixed(1)
      ),

    compression:
      Math.round(compression),

    trendScore:
      Math.round(trend),

    resistanceDistance:
      Number(
        resistanceDistance.toFixed(2)
      ),

    breakoutConfirmed:
      breakOK,

    earlyPriceScore:
      early,

    preparationScore:
      s.score,

    ready: true,

    peak5m:
      s.peak5m
  };


  recordSignal(s);
}


// =====================================
// TÜM AKTİF USDT PARİTELERİ
// =====================================

async function getSymbols() {
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

  return (j.data || [])
    .filter(
      x =>
        x.instId.endsWith(
          "-USDT"
        ) &&
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
// 15 DK MUM VERİSİ
// =====================================

async function loadCandles(symbols) {
  const timeframes = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1H",
    "4h": "4H"
  };

  for (const symbol of symbols) {
    const state = S(symbol);

    for (
      const [timeframe, bar]
      of Object.entries(timeframes)
    ) {
      try {
        const r = await fetch(
          `${REST}/api/v5/market/candles?instId=${encodeURIComponent(
            symbol
          )}&bar=${bar}&limit=300`
        );

        if (!r.ok) {
          continue;
        }

        const j = await r.json();

        const candles =
          (j.data || [])
            .map(x => ({
              t: Number(x[0]),
              o: Number(x[1]),
              h: Number(x[2]),
              l: Number(x[3]),
              c: Number(x[4]),
              v: Number(x[7] || 0),
              confirmed:
                String(x[8]) === "1"
            }))
            .reverse();

        state.multiCandles[
          timeframe
        ] = candles;

        if (
          timeframe === "15m"
        ) {
          state.candles =
            candles;
        }

        await sleep(35);

      } catch (error) {
        console.error(
          `Mum verisi ${symbol} ${timeframe}:`,
          error.message
        );
      }
    }
  }
}

// =====================================
// OKX CANLI İŞLEM AKIŞI
// =====================================

function connectOKX(
  symbols,
  groupNo
) {
  const ws =
    new WebSocket(
      OKXWS
    );


  ws.on(
    "open",
    () => {
            try {
        Ultimate.systemHealth
          .websocketConnected();

        Ultimate.systemHealth
          .scannerUpdate(
            states.size
          );
      } catch (error) {
        console.error(
          "Ultimate health open:",
          error.message
        );
            }
      const args =
        symbols.map(
          instId => ({
            channel:
              "trades",

            instId
          })
        );
      const bookArgs =
        symbols.map(
          instId => ({
            channel:
              "books5",

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

      for (
        let i = 0;
        i < bookArgs.length;
        i += 20
      ) {
        ws.send(
          JSON.stringify({
            op:
              "subscribe",

            args:
              bookArgs.slice(
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

      // =================================
      // ULTIMATE ORDER BOOK KÖPRÜSÜ
      // =================================

      if (
        data.arg?.channel ===
          "books5" &&
        Array.isArray(data.data)
      ) {
        try {
          const symbol =
            data.arg.instId;

          for (
            const book of data.data
          ) {
            const bids =
              Array.isArray(book.bids)
                ? book.bids
                : [];

            const asks =
              Array.isArray(book.asks)
                ? book.asks
                : [];

            const timestamp =
              Number(
                book.ts ||
                Date.now()
              );

            Ultimate.marketData
              .updateOrderBook(
                symbol,
                bids,
                asks,
                timestamp
              );
          }
        } catch (error) {
          console.error(
            "Ultimate order book:",
            error.message
          );
        }

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
          S(
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


        if (!s.first) {
          s.first = t;
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
        // =================================
        // ULTIMATE CANLI VERİ KÖPRÜSÜ
        // =================================

        try {
          const ultimateTick = {
            symbol:
              trade.instId,

            price,

            quantity:
              size,

            quoteVolume:
              price * size,

            side:
              trade.side,

            timestamp:
              t
          };

          const quality =
            Ultimate.dataQuality
              .validateTick({
                symbol:
                  trade.instId,

                price,

                volume:
                  price * size,

                timestamp:
                  t
              });

          if (quality.valid) {
  Ultimate.marketData
    .addTick(
      ultimateTick
    );

  Ultimate.systemHealth
    .marketTick(t);

  Ultimate.systemHealth
    .scannerUpdate(
      states.size
    );
}
        } catch (error) {
          console.error(
            "Ultimate veri köprüsü:",
            error.message
          );
        }

        const cutoff =
          Date.now() -
          CFG.keep;


        while (
          s.trades.length &&
          s.trades[0].t <
            cutoff
        ) {
          s.trades.shift();
        }


        calc(s);
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
          try {
      Ultimate.systemHealth
        .websocketDisconnected();

      Ultimate.systemHealth
        .websocketReconnectAttempt();
    } catch (error) {
      console.error(
        "Ultimate health close:",
        error.message
      );
    }
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
// RADAR LİSTESİ
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
    "ERKEN ADAY"
  ) return 3;

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
// HAREKET EDENLER
// =====================================

async function updateMovers() {
  try {
    const r =
      await fetch(
        `${REST}/api/v5/market/tickers?instType=SPOT`
      );

    if (!r.ok) return;

    const j =
      await r.json();


    const all =
      (j.data || [])
        .filter(
          x =>
            x.instId.endsWith(
              "-USDT"
            ) &&
            Number(x.last) > 0 &&
            Number(x.open24h) > 0
        )
        .map(
          x => {
            const price =
              Number(x.last);

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
                low
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
          m.w120?.ret || 0
        );


      const momentum1h =
        Number(
          m.w60?.ret || 0
        );


      const volumeRatio =
        Number(
          m.volX || 0
        );


      if (up) {
        let score = 0;

        if (
          x.change24 > 0
        ) score += 15;

        if (
          momentum15 > 0
        ) score += 15;

        if (
          momentum1h > 0
        ) score += 15;

        if (
          volumeRatio >= 1.3
        ) score += 20;

        if (
          Number(
            m.volumeAcceleration ||
            0
          ) >= 1.2
        ) score += 20;

        if (
          Number(
            m.w30?.buyRatio ||
            0
          ) >= 60
        ) score += 15;


        score =
          Math.min(
            100,
            score
          );


        let text =
          "DEVAM GÜCÜ ZAYIF";

        if (
          score >= 75
        ) {
          text =
            "MOMENTUM GÜÇLÜ";

        } else if (
          score >= 55
        ) {
          text =
            "YÜKSELİŞ KORUNUYOR";

        } else if (
          score >= 35
        ) {
          text =
            "TEYİT BEKLENİYOR";
        }


        if (
          x.change24 >= 40
        ) {
          text =
            "AŞIRI UZAMIŞ — RİSK YÜKSEK";
        }


        return {
          ...x,

          momentum15,
          momentum1h,
          volumeRatio,

          continuationScore:
            score,

          continuationText:
            text
        };
      }


      const range =
        Math.max(
          x.high24 -
          x.low24,

          x.price *
          0.001
        );


      let score = 0;

      if (
        momentum15 > 0
      ) score += 25;

      if (
        Number(
          m.volumeAcceleration ||
          0
        ) >= 1.2
      ) score += 25;

      if (
        Number(
          m.w30?.buyRatio ||
          0
        ) >= 55
      ) score += 25;

      if (
        Number(
          m.trendScore ||
          0
        ) >= 55
      ) score += 25;


      score =
        Math.min(
          100,
          score
        );


      let text =
        "DÜŞÜŞ DEVAM EDİYOR";

      if (
        score >= 75
      ) {
        text =
          "DÖNÜŞ TEYİDİ";

      } else if (
        score >= 50
      ) {
        text =
          "TEPKİ İHTİMALİ ARTIYOR";

      } else if (
        score >= 25
      ) {
        text =
          "DÖNÜŞ TEYİDİ BEKLENİYOR";
      }


      return {
        ...x,

        momentum15,
        momentum1h,
        volumeRatio,

        reversalScore:
          score,

        reversalText:
          text,

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
      "Movers:",
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

// =====================================
// TEK COİN SORGULAMA
// =====================================

app.get(
  "/api/coin/:symbol",
  async (req, res) => {
    res.set(
      "Cache-Control",
      "no-store"
    );

    let symbol =
      String(
        req.params.symbol || ""
      )
        .trim()
        .toUpperCase();


    symbol =
      symbol
        .replace("/USDT", "")
        .replace("-USDT", "")
        .replace("USDT", "")
        .trim();


    const fullSymbol =
      `${symbol}-USDT`;


    const s =
      states.get(
        fullSymbol
      );


    if (!s) {
      return res
        .status(404)
        .json({
          ok: false,
          error:
            "Coin bulunamadı.",
          symbol:
            fullSymbol
        });
    }


    const lastHistory =
      signalHistory.find(
        h =>
          h.symbol ===
          fullSymbol
      );


    const m =
      s.metrics || {};

    const ultimateReady =
      ["1m", "3m", "5m", "15m", "1h", "4h"]
        .every(
          tf =>
            Array.isArray(
              s.multiCandles?.[tf]
            ) &&
            s.multiCandles[tf].length >= 200
        );

    let ultimateResult =
      null;

    if (ultimateReady) {
      try {
        const response =
          await fetch(
            `http://127.0.0.1:${PORT}/api/ultimate/coin/${encodeURIComponent(
              symbol
            )}`
          );

        if (response.ok) {
          ultimateResult =
            await response.json();
        }
      } catch (error) {
        console.error(
          "Ultimate coin detay:",
          symbol,
          error.message
        );
      }
      }
    res.json({
      ok: true,

      source:
        "OKX",

      symbol:
        s.symbol,

      price:
        s.price,

      score:
        s.score,

      peak5m:
        s.peak5m,

      status:
        s.status,

      metrics:
        m,

      history:
        lastHistory || null,
            ultimateResult,
      ultimateReady:
        Array.isArray(
          s.multiCandles?.["1m"]
        ) &&
        s.multiCandles["1m"].length >= 200 &&
        Array.isArray(
          s.multiCandles?.["15m"]
        ) &&
        s.multiCandles["15m"].length >= 200 &&
        Array.isArray(
          s.multiCandles?.["1h"]
        ) &&
        s.multiCandles["1h"].length >= 200,

      ultimateTimeframes: {
        "1m":
          s.multiCandles?.["1m"]
            ?.length || 0,

        "3m":
          s.multiCandles?.["3m"]
            ?.length || 0,

        "5m":
          s.multiCandles?.["5m"]
            ?.length || 0,

        "15m":
          s.multiCandles?.["15m"]
            ?.length || 0,

        "1h":
          s.multiCandles?.["1h"]
            ?.length || 0,

        "4h":
          s.multiCandles?.["4h"]
            ?.length || 0
      },
      analysis: {
        volumeStrong:
          Number(
            m.volX || 0
          ) >= 2,

        volumeAccelerationStrong:
          Number(
            m.volumeAcceleration ||
            0
          ) >= 1.4,

        tradeStrong:
          Number(
            m.tradeX || 0
          ) >= 1.2,

        tradeAccelerationStrong:
          Number(
            m.tradeAcceleration ||
            0
          ) >= 1.3,

        buyerStrong:
          Number(
            m.w30?.buyRatio ||
            0
          ) >= 65,

        resistanceNear:
          Number(
            m.resistanceDistance ||
            99
          ) >= -0.5 &&
          Number(
            m.resistanceDistance ||
            99
          ) <= 2.5,

        priceNotExtended:
          Number(
            m.w120?.ret ||
            0
          ) < 2.5
      },

      ts:
        Date.now()
    });
  }
);
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

// =====================================
// SİNYAL PERFORMANS ÖZETİ
// =====================================

app.get(
  "/api/performance",
  (req, res) => {
    res.set(
      "Cache-Control",
      "no-store"
    );

    const horizons =
      ["m5", "m15", "m30", "h1", "h4"];

    const summary = {};

    for (const key of horizons) {
      const values =
        signalHistory
  .filter(
    row =>
      Number(row.time) >=
      PERFORMANCE_TEST_START
  )
  .map(
            row =>
              Number(
                row.performance
                  ?.[key]
                  ?.changePct
              )
          )
          .filter(
            Number.isFinite
          );

      const positive =
        values.filter(
          value => value > 0
        ).length;

      const negative =
        values.filter(
          value => value < 0
        ).length;

      const average =
        values.length
          ? values.reduce(
              (a, b) => a + b,
              0
            ) / values.length
          : 0;

      const best =
        values.length
          ? Math.max(...values)
          : 0;

      const worst =
        values.length
          ? Math.min(...values)
          : 0;

      summary[key] = {
        tested:
          values.length,

        positive,

        negative,

        successRate:
          values.length
            ? Number(
                (
                  positive /
                  values.length *
                  100
                ).toFixed(1)
              )
            : 0,

        averagePct:
          Number(
            average.toFixed(3)
          ),

        bestPct:
          Number(
            best.toFixed(3)
          ),

        worstPct:
          Number(
            worst.toFixed(3)
          )
      };
    }
    const testSignals =
      signalHistory
        .filter(
          row =>
            Number(row.time) >=
            PERFORMANCE_TEST_START
        )
        .map(row => ({
          symbol: row.symbol,
          status: row.status,
          signalPrice: row.price,
          score: row.score,
          time: row.time,
          performance:
            row.performance || {}
        }));
    res.json({
      ok: true,

      totalSignals:
  signalHistory.filter(
    row =>
      Number(row.time) >=
      PERFORMANCE_TEST_START
  ).length,

      summary,
      signals:
        testSignals,
      updatedAt:
        Date.now()
    });
  }
);
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
// PUSH API
// =====================================

app.get(
  "/api/push/public-key",
  (req, res) => {
    res.json({
      publicKey:
        VAPID_PUBLIC_KEY ||
        ""
    });
  }
);


app.post(
  "/api/push/subscribe",
  (req, res) => {
    const sub =
      req.body;

    if (
      !sub ||
      !sub.endpoint
    ) {
      return res
        .status(400)
        .json({
          ok: false
        });
    }


    const exists =
      pushSubscriptions.some(
        x =>
          x.endpoint ===
          sub.endpoint
      );


    if (!exists) {
      pushSubscriptions.push(
        sub
      );

      writeJSON(
        PUSH_FILE,
        pushSubscriptions
      );
    }


    console.log(
      `Push abonesi: ${pushSubscriptions.length}`
    );


    res.json({
      ok: true,
      count:
        pushSubscriptions.length
    });
  }
);


// =====================================
// PUSH TEST
// =====================================

app.post(
  "/api/push/test",
  async (
    req,
    res
  ) => {
    try {
      const payload =
        JSON.stringify({
          title:
            "TradeRadar Test",

          body:
            "Arka plan bildirimi çalışıyor.",

          tag:
            "traderadar-test",

          url:
            "/"
        });


      let sent = 0;
      const alive = [];


      for (
        const sub of pushSubscriptions
      ) {
        try {
          await webpush
            .sendNotification(
              sub,
              payload
            );

          alive.push(sub);
          sent++;

        } catch (e) {
          if (
            e.statusCode !==
              404 &&
            e.statusCode !==
              410
          ) {
            alive.push(sub);
          }
        }
      }


      pushSubscriptions =
        alive;


      writeJSON(
        PUSH_FILE,
        pushSubscriptions
      );


      res.json({
        ok: true,
        sent
      });

    } catch (e) {
      res
        .status(500)
        .json({
          ok: false,
          error:
            e.message
        });
    }
  }
);

// =====================================
// TRADERADAR ULTIMATE - DURUM
// =====================================

app.get(
  "/api/ultimate/status",
  (req, res) => {
    try {
      res.json({
        ok: true,
        ultimate:
          ultimateStatus(),
        signalPermission:
          ultimateCanGenerateSignal()
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error.message
      });
    }
  }
);
// =====================================
// TRADERADAR ULTIMATE - COIN VERİ TESTİ
// =====================================

app.get(
  "/api/ultimate/coin/:symbol",
  (req, res) => {
    try {
      const raw =
        String(
          req.params.symbol || ""
        )
          .trim()
          .toUpperCase();

      const symbol =
        raw.includes("-")
          ? raw
          : `${raw}-USDT`;

      const snapshot =
        Ultimate.marketData
          .snapshot(symbol);

      const windows =
        Ultimate.marketData
          .windows(symbol);
            const state =
        S(symbol);

      const technicalCandles =
        (state.candles || [])
          .map(candle => ({
            timestamp:
              candle.t,

            open:
              candle.o,

            high:
              candle.h,

            low:
              candle.l,

            close:
              candle.c,

            volume:
              candle.v,

            confirmed:
              candle.confirmed
          }));
      const technicalAnalysis =
        Ultimate.technical
          .analyze(
            technicalCandles
          );
            const timeframeAnalysis = {};

      for (
        const [
          timeframe,
          candles
        ] of Object.entries(
          state.multiCandles || {}
        )
      ) {
        const formatted =
          (candles || [])
            .map(candle => ({
              timestamp:
                candle.t,

              open:
                candle.o,

              high:
                candle.h,

              low:
                candle.l,

              close:
                candle.c,

              volume:
                candle.v,

              confirmed:
                candle.confirmed
            }));

        timeframeAnalysis[
          timeframe
        ] =
          Ultimate.technical
            .analyze(
              formatted
            );
      }

      const marketRegime =
        Ultimate.marketRegime
          .classifyMarket(
            timeframeAnalysis
          );
      const volumeAnalysis =
        Ultimate.volume
          .analyze({
            windows,
            historicalVolumes: []
          });

      const orderFlowAnalysis =
        Ultimate.orderFlow
          .analyze({
            windows,

            orderBook:
              snapshot.orderBook || {},

            previousCvdNet: 0
          });
      if (!snapshot) {
        return res
          .status(404)
          .json({
            ok: false,
            symbol,
            error:
              "ULTIMATE VERİSİ BULUNAMADI"
          });
      }
      const health =
        Ultimate.systemHealth
          .snapshot();

      const riskFilters =
        Ultimate.riskFilters
          .evaluate({
            symbol,

            market:
              snapshot,

            volume:
              volumeAnalysis,

            orderFlow:
              orderFlowAnalysis,

            technical:
              technicalAnalysis,

            notionalUsd:
              1000,

            candleClosed:
              technicalCandles
                .at(-1)
                ?.confirmed === true,

            higherTimeframeBullish:
              false
          });

      const entryAnalysis =
        Ultimate.entry
          .calculate({
            price:
              snapshot.price,

            technical:
              technicalAnalysis,

            market:
              snapshot,

            signalTime:
              Date.now()
          });

      const stopAnalysis =
        Ultimate.stop
          .calculate({
            entryPrice:
              entryAnalysis
                ?.entry
                ?.ideal,

            technical:
              technicalAnalysis,

            regime: {}
          });

      const targetRiskAnalysis =
        Ultimate.targetRisk
          .calculate({
            entryPrice:
              entryAnalysis
                ?.entry
                ?.ideal,

            stopPrice:
              stopAnalysis
                ?.stop,

            technical:
              technicalAnalysis,

            slippagePct:
              riskFilters
                ?.slippage
                ?.slippagePct
          });

      const signalAnalysis =
        Ultimate.signal
          .evaluate({
            technical:
              technicalAnalysis,

            market:
              snapshot,

            volume:
              volumeAnalysis,

            orderFlow:
              orderFlowAnalysis,

            regime:
  marketRegime,

            riskFilters,

            riskReward:
              targetRiskAnalysis,

            dataReliable:
              health.healthy === true,

            systemHealthy:
              health.healthy === true
          });
      return res.json({
        ok: true,

        symbol,

        systemHealthy:
          Ultimate.systemHealth
            .snapshot()
            .healthy,

        snapshot,

        windows,
                technicalAnalysis,
                timeframeAnalysis,

        marketRegime,
        volumeAnalysis,

        orderFlowAnalysis,
        riskFilters,

entryAnalysis,

stopAnalysis,

targetRiskAnalysis,

signalAnalysis,
        checkedAt:
          Date.now()
      });

    } catch (error) {
      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message
        });
    }
  }
);
// =====================================
// SAĞLIK
// =====================================

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,

      tracked:
        states.size,

      signals:
        signalHistory.length,

      pushSubscribers:
        pushSubscriptions.length,

      pushReady:
        Boolean(
          VAPID_PUBLIC_KEY &&
          VAPID_PRIVATE_KEY
        ),

      time:
        Date.now()
    });
  }
);


// =====================================
// SUNUCU
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
          S(symbol);
        }


                const candleSymbols =
          [
            "BTC-USDT"
          ];

        loadCandles(
          candleSymbols
        );


        const groups = [];

        for (
          let i = 0;
          i < symbols.length;
          i += CFG.group
        ) {
          groups.push(
            symbols.slice(
              i,
              i + CFG.group
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
// TELEFONA CANLI VERİ
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
          type:
            "radar",

          source:
            "OKX",

          tracked:
            states.size,

          rows:
            radarRows()
        })
      );

    } catch {}


    ws.on(
      "close",
      () => {
        clients.delete(
          ws
        );
      }
    );
  }
);


// =====================================
//
// RADARI HER SANİYE GÖNDER
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

    for (const ws of clients) {
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


console.log(
  "TradeRadar + Web Push hazır."
);
// Web Push aktif
