import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, ".")));

const REST = "https://www.okx.com";
const OKX_WS = "wss://ws.okx.com:8443/ws/v5/public";

const states = new Map();
const clients = new Set();

const CFG = {
  max: 120,
  alert: 72,
  strong: 84,
  late: 5,
  keepMs: 15 * 60 * 1000,
  warmupMs: 8 * 60 * 1000,
  peakMs: 5 * 60 * 1000,
  strongHoldMs: 8000,
  minBaseline: 3
};

const median = a => {
  a = a.filter(x => Number.isFinite(x) && x > 0)
       .sort((x, y) => x - y);

  if (!a.length) return 0;

  const m = Math.floor(a.length / 2);

  return a.length % 2
    ? a[m]
    : (a[m - 1] + a[m]) / 2;
};

const pct = (a, b) =>
  a ? ((b - a) / a) * 100 : 0;

const sig = (x, c, w) =>
  Math.max(
    0,
    Math.min(
      100,
      100 / (1 + Math.exp(-(x - c) / w))
    )
  );

function state(symbol) {
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
      metrics: {},
      firstTradeAt: 0,
      strongSince: 0,
      scores: []
    });
  }

  return states.get(symbol);
}

function win(s, sec) {
  const from = Date.now() - sec * 1000;
  const a = s.trades.filter(x => x.t >= from);

  if (!a.length) {
    return {
      ret: 0,
      vol: 0,
      n: 0,
      buyRatio: 50
    };
  }

  const vol = a.reduce((z, x) => z + x.q, 0);
  const buy = a.reduce(
    (z, x) => z + (x.buy ? x.q : 0),
    0
  );

  return {
    ret: pct(a[0].p, a[a.length - 1].p),
    vol,
    n: a.length,
    buyRatio: vol ? buy / vol * 100 : 50
  };
}

function updatePeak(s) {
  const now = Date.now();

  s.scores.push({
    t: now,
    score: s.score
  });

  const cutoff = now - CFG.peakMs;

  while (
    s.scores.length &&
    s.scores[0].t < cutoff
  ) {
    s.scores.shift();
  }

  s.peak5m = s.scores.length
    ? Math.max(...s.scores.map(x => x.score))
    : s.score;
}

function calculate(s) {
  const now = Date.now();

  const w5 = win(s, 5);
  const w10 = win(s, 10);
  const w30 = win(s, 30);
  const w60 = win(s, 60);
  const w120 = win(s, 120);

  const base = [];

  for (let k = 2; k <= 7; k++) {
    const lo = now - k * 120000;
    const hi = now - (k - 1) * 120000;

    const a = s.trades.filter(
      x => x.t >= lo && x.t < hi
    );

    if (a.length < 3) continue;

    const vol = a.reduce((z, x) => z + x.q, 0);

    if (vol <= 0) continue;

    const buy = a.reduce(
      (z, x) => z + (x.buy ? x.q : 0),
      0
    );

    base.push({
      vol,
      n: a.length,
      buyRatio: buy / vol * 100
    });
  }

  const age = s.firstTradeAt
    ? now - s.firstTradeAt
    : 0;

  const ready =
    age >= CFG.warmupMs &&
    base.length >= CFG.minBaseline;

  let volumeX = 0;
  let tradeX = 0;
  let buyShift = 0;

  if (ready) {
    const bv = median(base.map(x => x.vol));
    const bn = median(base.map(x => x.n));
    const bb = median(base.map(x => x.buyRatio));

    volumeX = bv ? w120.vol / bv : 0;
    tradeX = bn ? w120.n / bn : 0;
    buyShift = w30.buyRatio - bb;

    volumeX = Math.min(volumeX, 20);
    tradeX = Math.min(tradeX, 20);
  }

  const candles = s.candles.slice(-8);

  let compression = 50;
  let resistanceDistance = 99;

  if (candles.length >= 4) {
    const highs = candles.map(x => x.h);
    const lows = candles.map(x => x.l);
    const closes = candles.map(x => x.c);

    const mid = median(closes) || 1;

    const range =
      (Math.max(...highs) - Math.min(...lows))
      / mid * 100;

    compression = Math.max(
      0,
      Math.min(100, 100 - range * 15)
    );

    const resistance = Math.max(
      ...highs.slice(0, -1)
    );

    resistanceDistance = resistance
      ? (resistance - s.price) / resistance * 100
      : 99;
  }

  if (!ready) {
    s.score = 0;
    s.peak5m = 0;
    s.status = "VERİ TOPLANIYOR";
    s.rawStatus = "VERİ TOPLANIYOR";
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
      baselineWindows: base.length,
      warmupRemaining: Math.max(
        0,
        CFG.warmupMs - age
      ),
      peak5m: 0
    };

    return;
  }

  const momentum = Math.max(
    0,
    w10.ret * 2 +
    w30.ret +
    w60.ret * 0.5
  );

  const components = {
    volume: sig(volumeX, 1.8, 0.55),
    trades: sig(tradeX, 1.6, 0.5),

    buy: sig(
      w30.buyRatio +
      Math.max(0, buyShift) * 0.7,
      60,
      6
    ),

    momentum: sig(momentum, 0.55, 0.3),

    compression,

    resistance: Math.max(
      0,
      Math.min(
        100,
        100 - Math.abs(resistanceDistance) * 45
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

  const late = w120.ret >= CFG.late;

  if (late) {
    score = Math.min(score, 58);
  }

  s.score = Math.round(score);

  updatePeak(s);

  if (late) {
    s.rawStatus = "GEÇ KALINDI";
  } else if (s.score >= CFG.strong) {
    s.rawStatus = "GÜÇLÜ ERKEN UYARI";
  } else if (s.score >= CFG.alert) {
    s.rawStatus = "ERKEN UYARI";
  } else if (s.score >= 58) {
    s.rawStatus = "ADAY";
  } else {
    s.rawStatus = "İZLENİYOR";
  }

  if (!late && s.score >= CFG.strong) {
    if (!s.strongSince) {
      s.strongSince = now;
    }
  } else {
    s.strongSince = 0;
  }

  const strongConfirmed = Boolean(
    s.strongSince &&
    now - s.strongSince >= CFG.strongHoldMs
  );

  const hadStrong = s.peak5m >= CFG.strong;

  const structureHealthy =
    w30.buyRatio >= 55 &&
    (volumeX >= 1.2 || tradeX >= 1.2) &&
    w10.ret > -0.15 &&
    w30.ret > -0.30;

  if (late) {
    s.status = "GEÇ KALINDI";

  } else if (strongConfirmed) {
    s.status = "GÜÇLÜ ERKEN UYARI";

  } else if (s.score >= CFG.strong) {
    s.status = "TEYİT BEKLENİYOR";

  } else if (s.score >= CFG.alert) {
    s.status = "ERKEN UYARI";

  } else if (
    hadStrong &&
    s.score >= 70 &&
    structureHealthy
  ) {
    s.status = "SİNYAL KORUNUYOR";

  } else if (
    hadStrong &&
    (
      s.score < 70 ||
      w30.buyRatio < 50 ||
      (volumeX < 1 && tradeX < 1) ||
      w30.ret < -0.4
    )
  ) {
    s.status = "SİNYAL BOZULDU";

  } else if (s.score >= 58) {
    s.status = "ADAY";

  } else {
    s.status = "İZLENİYOR";
  }

  s.metrics = {
    w5,
    w10,
    w30,
    w60,
    w120,

    // Önceki hatanın düzeltilmiş hâli
    volX: volumeX,
    tradeX,

    compression,
    resistanceDistance,

    ready: true,
    baselineWindows: base.length,

    peak5m: s.peak5m,
    strongConfirmed,

    strongHoldSeconds: s.strongSince
      ? Math.floor(
          (now - s.strongSince) / 1000
        )
      : 0,

    rawStatus: s.rawStatus
  };
}

async function getSymbols() {
  const r = await fetch(
    `${REST}/api/v5/market/tickers?instType=SPOT`
  );

  if (!r.ok) {
    throw new Error(
      `OKX HTTP ${r.status}`
    );
  }

  const j = await r.json();

  return (j.data || [])
    .filter(x => x.instId.endsWith("-USDT"))
    .filter(x => Number(x.volCcy24h || 0) > 0)
    .sort(
      (a, b) =>
        Number(b.volCcy24h || 0) -
        Number(a.volCcy24h || 0)
    )
    .slice(0, CFG.max)
    .map(x => x.instId);
}

async function loadCandles(symbols) {
  for (const symbol of symbols) {
    try {
      const r = await fetch(
        `${REST}/api/v5/market/candles?instId=${encodeURIComponent(symbol)}&bar=15m&limit=8`
      );

      if (!r.ok) continue;

      const j = await r.json();
      const s = state(symbol);

      s.candles = (j.data || [])
        .map(x => ({
          t: Number(x[0]),
          h: Number(x[2]),
          l: Number(x[3]),
          c: Number(x[4])
        }))
        .reverse();

    } catch (e) {
      console.error(
        "Mum hatası:",
        symbol,
        e.message
      );
    }
  }
}

function connectOKX(symbols) {
  const ws = new WebSocket(OKX_WS);

  ws.on("open", () => {
    const args = symbols.map(
      instId => ({
        channel: "trades",
        instId
      })
    );

    for (
      let i = 0;
      i < args.length;
      i += 50
    ) {
      ws.send(
        JSON.stringify({
          op: "subscribe",
          args: args.slice(i, i + 50)
        })
      );
    }

    console.log(
      `OKX canlı: ${symbols.length} USDT paritesi`
    );
  });

  ws.on("message", raw => {
    let msg;

    try {
      msg = JSON.parse(
        raw.toString()
      );
    } catch {
      return;
    }

    if (
      msg.arg?.channel !== "trades" ||
      !Array.isArray(msg.data)
    ) {
      return;
    }

    for (const tr of msg.data) {
      const s = state(tr.instId);

      const price = Number(tr.px);
      const size = Number(tr.sz);
      const t = Number(tr.ts);

      if (!price || !size || !t) {
        continue;
      }

      if (!s.firstTradeAt) {
        s.firstTradeAt = t;
      }

      s.price = price;

      s.trades.push({
        t,
        p: price,
        q: price * size,
        buy: tr.side === "buy"
      });

      const cutoff =
        Date.now() - CFG.keepMs;

      while (
        s.trades.length &&
        s.trades[0].t < cutoff
      ) {
        s.trades.shift();
      }

      calculate(s);
    }
  });

  ws.on("error", e => {
    console.error(
      "OKX WS:",
      e.message
    );
  });

  ws.on("close", () => {
    console.log(
      "OKX bağlantısı kapandı; yeniden bağlanıyor."
    );

    setTimeout(
      () => connectOKX(symbols),
      2000
    );
  });
}

function priority(status) {
  if (status === "GÜÇLÜ ERKEN UYARI") return 7;
  if (status === "ERKEN UYARI") return 6;
  if (status === "SİNYAL KORUNUYOR") return 5;
  if (status === "TEYİT BEKLENİYOR") return 4;
  if (status === "ADAY") return 3;
  if (status === "SİNYAL BOZULDU") return 2;
  return 1;
}

function radarRows() {
  return [...states.values()]
    .filter(x => x.price)
    .sort(
      (a, b) =>
        priority(b.status) -
        priority(a.status) ||
        b.score - a.score
    )
    .slice(0, 30)
    .map(x => ({
      symbol: x.symbol,
      price: x.price,
      score: x.score,
      peak5m: x.peak5m,
      status: x.status,
      rawStatus: x.rawStatus,
      metrics: x.metrics,
      source: "OKX"
    }));
}

app.get(
  "/api/radar",
  (req, res) => {
    res.set(
      "Cache-Control",
      "no-store"
    );

    res.json({
      type: "radar",
      source: "OKX",
      rows: radarRows(),
      ts: Date.now()
    });
  }
);

const server = app.listen(
  PORT,
  async () => {
    console.log(
      `TradeRadar port ${PORT}`
    );

    try {
      const symbols =
        await getSymbols();

      console.log(
        `${symbols.length} OKX USDT paritesi bulundu`
      );

      await loadCandles(symbols);

      connectOKX(symbols);

    } catch (e) {
      console.error(
        "Başlatma hatası:",
        e.message
      );
    }
  }
);

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
          rows: radarRows()
        })
      );
    } catch {}

    ws.on(
      "close",
      () => clients.delete(ws)
    );
  }
);

setInterval(() => {
  const message =
    JSON.stringify({
      type: "radar",
      source: "OKX",
      rows: radarRows()
    });

  for (const ws of clients) {
    if (
      ws.readyState ===
      WebSocket.OPEN
    ) {
      ws.send(message);
    }
  }
}, 1000);