import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

app.use(express.static(DIR));

const REST = "https://www.okx.com";
const OKX_WS = "wss://ws.okx.com:8443/ws/v5/public";

const CFG = {
  alert: 72,
  strong: 84,
  late: 5,

  warmupMs: 8 * 60 * 1000,
  keepMs: 15 * 60 * 1000,
  peakMs: 5 * 60 * 1000,

  strongHoldMs: 8000,
  minBaseline: 3,

  // Tek OKX WS bağlantısına kaç parite
  wsGroupSize: 80
};

const states = new Map();
const clients = new Set();

let moversCache = {
  updatedAt: 0,
  gainers: [],
  losers: []
};

const sleep = ms =>
  new Promise(r => setTimeout(r, ms));

const pct = (a, b) =>
  a ? ((b - a) / a) * 100 : 0;

function median(arr) {
  const a = arr
    .filter(x => Number.isFinite(x) && x > 0)
    .sort((x, y) => x - y);

  if (!a.length) return 0;

  const m = Math.floor(a.length / 2);

  return a.length % 2
    ? a[m]
    : (a[m - 1] + a[m]) / 2;
}

function sigmoid(x, center, width) {
  return Math.max(
    0,
    Math.min(
      100,
      100 / (1 + Math.exp(-(x - center) / width))
    )
  );
}

function getState(symbol) {
  if (!states.has(symbol)) {
    states.set(symbol, {
      symbol,
      trades: [],
      candles: [],
      price: 0,

      score: 0,
      peak5m: 0,

      status: "VERİ TOPLANIYOR",
      rawStatus: "VERİ TOPLANIYOR",

      firstTradeAt: 0,
      strongSince: 0,

      scoreHistory: [],
      metrics: {}
    });
  }

  return states.get(symbol);
}


// =====================================
// SANİYELİK VERİ
// =====================================

function windowStats(s, seconds) {
  const from =
    Date.now() - seconds * 1000;

  const rows =
    s.trades.filter(x => x.t >= from);

  if (!rows.length) {
    return {
      ret: 0,
      vol: 0,
      n: 0,
      buyRatio: 50
    };
  }

  const vol =
    rows.reduce(
      (sum, x) => sum + x.q,
      0
    );

  const buyVol =
    rows.reduce(
      (sum, x) =>
        sum + (x.buy ? x.q : 0),
      0
    );

  return {
    ret: pct(
      rows[0].p,
      rows[rows.length - 1].p
    ),

    vol,

    n: rows.length,

    buyRatio:
      vol
        ? (buyVol / vol) * 100
        : 50
  };
}


// =====================================
// 5 DK ZİRVE PUANI
// =====================================

function updatePeak(s) {
  const now = Date.now();

  s.scoreHistory.push({
    t: now,
    score: s.score
  });

  const cutoff =
    now - CFG.peakMs;

  while (
    s.scoreHistory.length &&
    s.scoreHistory[0].t < cutoff
  ) {
    s.scoreHistory.shift();
  }

  s.peak5m =
    s.scoreHistory.length
      ? Math.max(
          ...s.scoreHistory.map(x => x.score)
        )
      : s.score;
}


// =====================================
// RADAR HESABI
// =====================================

function calculate(s) {
  const now = Date.now();

  const w5 = windowStats(s, 5);
  const w10 = windowStats(s, 10);
  const w30 = windowStats(s, 30);
  const w60 = windowStats(s, 60);
  const w120 = windowStats(s, 120);

  const baseline = [];

  for (let k = 2; k <= 7; k++) {
    const lo =
      now - k * 120000;

    const hi =
      now - (k - 1) * 120000;

    const rows =
      s.trades.filter(
        x =>
          x.t >= lo &&
          x.t < hi
      );

    if (rows.length < 3) {
      continue;
    }

    const volume =
      rows.reduce(
        (sum, x) =>
          sum + x.q,
        0
      );

    if (volume <= 0) {
      continue;
    }

    const buyVolume =
      rows.reduce(
        (sum, x) =>
          sum +
          (x.buy ? x.q : 0),
        0
      );

    baseline.push({
      volume,
      trades: rows.length,
      buyRatio:
        (buyVolume / volume) * 100
    });
  }

  const age =
    s.firstTradeAt
      ? now - s.firstTradeAt
      : 0;

  const ready =
    age >= CFG.warmupMs &&
    baseline.length >= CFG.minBaseline;

  let volumeX = 0;
  let tradeX = 0;
  let buyShift = 0;

  if (ready) {
    const baseVolume =
      median(
        baseline.map(x => x.volume)
      );

    const baseTrades =
      median(
        baseline.map(x => x.trades)
      );

    const baseBuy =
      median(
        baseline.map(x => x.buyRatio)
      );

    volumeX =
      baseVolume
        ? w120.vol / baseVolume
        : 0;

    tradeX =
      baseTrades
        ? w120.n / baseTrades
        : 0;

    buyShift =
      w30.buyRatio - baseBuy;

    volumeX =
      Math.min(volumeX, 20);

    tradeX =
      Math.min(tradeX, 20);
  }

  let compression = 50;
  let resistanceDistance = 99;

  const candles =
    s.candles.slice(-8);

  if (candles.length >= 4) {
    const highs =
      candles.map(x => x.h);

    const lows =
      candles.map(x => x.l);

    const closes =
      candles.map(x => x.c);

    const middle =
      median(closes) || 1;

    const range =
      (
        Math.max(...highs) -
        Math.min(...lows)
      ) /
      middle *
      100;

    compression =
      Math.max(
        0,
        Math.min(
          100,
          100 - range * 15
        )
      );

    const resistance =
      Math.max(
        ...highs.slice(0, -1)
      );

    resistanceDistance =
      resistance
        ? (
            (resistance - s.price) /
            resistance
          ) * 100
        : 99;
  }

  if (!ready) {
    s.score = 0;
    s.peak5m = 0;

    s.status =
      "VERİ TOPLANIYOR";

    s.rawStatus =
      "VERİ TOPLANIYOR";

    s.strongSince = 0;

    s.metrics = {
      w5,
      w10,
      w30,
      w60,
      w120,

      volX: 0,
      tradeX: 0,

      compression,
      resistanceDistance,

      ready: false,

      baselineWindows:
        baseline.length,

      warmupRemaining:
        Math.max(
          0,
          CFG.warmupMs - age
        ),

      peak5m: 0
    };

    return;
  }

  const momentum =
    Math.max(
      0,

      w10.ret * 2 +
      w30.ret +
      w60.ret * 0.5
    );

  const components = {
    volume:
      sigmoid(
        volumeX,
        1.8,
        0.55
      ),

    trades:
      sigmoid(
        tradeX,
        1.6,
        0.5
      ),

    buy:
      sigmoid(
        w30.buyRatio +
        Math.max(
          0,
          buyShift
        ) * 0.7,
        60,
        6
      ),

    momentum:
      sigmoid(
        momentum,
        0.55,
        0.3
      ),

    compression,

    resistance:
      Math.max(
        0,
        Math.min(
          100,

          100 -
          Math.abs(
            resistanceDistance
          ) * 45
        )
      )
  };

  let score =
    components.volume * 0.25 +
    components.trades * 0.17 +
    components.buy * 0.20 +
    components.momentum * 0.18 +
    components.compression * 0.10 +
    components.resistance * 0.10;

  const late =
    w120.ret >= CFG.late;

  if (late) {
    score =
      Math.min(score, 58);
  }

  s.score =
    Math.round(score);

  updatePeak(s);

  if (late) {
    s.rawStatus =
      "GEÇ KALINDI";

  } else if (
    s.score >= CFG.strong
  ) {
    s.rawStatus =
      "GÜÇLÜ ERKEN UYARI";

  } else if (
    s.score >= CFG.alert
  ) {
    s.rawStatus =
      "ERKEN UYARI";

  } else if (
    s.score >= 58
  ) {
    s.rawStatus =
      "ADAY";

  } else {
    s.rawStatus =
      "İZLENİYOR";
  }

  if (
    !late &&
    s.score >= CFG.strong
  ) {
    if (!s.strongSince) {
      s.strongSince = now;
    }

  } else {
    s.strongSince = 0;
  }

  const strongConfirmed =
    Boolean(
      s.strongSince &&
      now - s.strongSince >=
        CFG.strongHoldMs
    );

  const previouslyStrong =
    s.peak5m >= CFG.strong;

  const healthy =
    w30.buyRatio >= 55 &&

    (
      volumeX >= 1.2 ||
      tradeX >= 1.2
    ) &&

    w10.ret > -0.15 &&
    w30.ret > -0.30;

  if (late) {
    s.status =
      "GEÇ KALINDI";

  } else if (
    strongConfirmed
  ) {
    s.status =
      "GÜÇLÜ ERKEN UYARI";

  } else if (
    s.score >= CFG.strong
  ) {
    s.status =
      "TEYİT BEKLENİYOR";

  } else if (
    s.score >= CFG.alert
  ) {
    s.status =
      "ERKEN UYARI";

  } else if (
    previouslyStrong &&
    s.score >= 70 &&
    healthy
  ) {
    s.status =
      "SİNYAL KORUNUYOR";

  } else if (
    previouslyStrong &&
    (
      s.score < 70 ||
      w30.buyRatio < 50 ||
      (
        volumeX < 1 &&
        tradeX < 1
      ) ||
      w30.ret < -0.4
    )
  ) {
    s.status =
      "SİNYAL BOZULDU";

  } else if (
    s.score >= 58
  ) {
    s.status =
      "ADAY";

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

    volX: volumeX,
    tradeX,

    compression,
    resistanceDistance,

    ready: true,

    baselineWindows:
      baseline.length,

    peak5m:
      s.peak5m,

    strongConfirmed,

    strongHoldSeconds:
      s.strongSince
        ? Math.floor(
            (
              now -
              s.strongSince
            ) / 1000
          )
        : 0,

    rawStatus:
      s.rawStatus
  };
}


// =====================================
// TÜM AKTİF USDT SPOT PARİTELERİ
// =====================================

async function getAllSymbols() {
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
        Number(x.last) > 0
    )
    .filter(
      x =>
        Number(
          x.volCcy24h || 0
        ) > 0
    )
    .map(
      x => x.instId
    );
}


// =====================================
// RADAR MUMLARI
// =====================================

async function loadRadarCandles(
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
        getState(symbol);

      s.candles =
        (j.data || [])
          .map(x => ({
            t:
              Number(x[0]),

            h:
              Number(x[2]),

            l:
              Number(x[3]),

            c:
              Number(x[4])
          }))
          .reverse();

      // REST'i gereksiz zorlamayalım
      await sleep(40);

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
// WEBSOCKET GRUPLARI
// =====================================

function splitGroups(
  symbols,
  size
) {
  const groups = [];

  for (
    let i = 0;
    i < symbols.length;
    i += size
  ) {
    groups.push(
      symbols.slice(
        i,
        i + size
      )
    );
  }

  return groups;
}


// =====================================
// OKX CANLI GRUP BAĞLANTISI
// =====================================

function connectOKXGroup(
  symbols,
  groupNo
) {
  const ws =
    new WebSocket(OKX_WS);

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

      // Abonelikleri 20'şerli gönder
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
      let msg;

      try {
        msg =
          JSON.parse(
            raw.toString()
          );

      } catch {
        return;
      }

      if (
        msg.arg?.channel !==
          "trades" ||
        !Array.isArray(
          msg.data
        )
      ) {
        return;
      }

      for (
        const trade of msg.data
      ) {
        const s =
          getState(
            trade.instId
          );

        const price =
          Number(trade.px);

        const size =
          Number(trade.sz);

        const t =
          Number(trade.ts);

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
          s.firstTradeAt = t;
        }

        s.price = price;

        s.trades.push({
          t,
          p: price,

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
          connectOKXGroup(
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
    "GÜÇLÜ ERKEN UYARI"
  ) return 7;

  if (
    status ===
    "ERKEN UYARI"
  ) return 6;

  if (
    status ===
    "SİNYAL KORUNUYOR"
  ) return 5;

  if (
   
