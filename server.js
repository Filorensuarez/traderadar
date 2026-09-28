import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, ".")));

const OKX_REST = "https://www.okx.com";
const OKX_WS = "wss://ws.okx.com:8443/ws/v5/public";

const states = new Map();
const clients = new Set();

const cfg = {
  alert: 72,
  strong: 84,
  late: 5,
  max: 120,
  keepMs: 15 * 60 * 1000
};

const median = arr => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const pct = (a, b) => a ? ((b - a) / a) * 100 : 0;

const sigmoid = (x, c, w) =>
  Math.max(0, Math.min(100, 100 / (1 + Math.exp(-(x - c) / w))));

function getState(symbol) {
  if (!states.has(symbol)) {
    states.set(symbol, {
      symbol,
      trades: [],
      candles: [],
      price: 0,
      score: 0,
      status: "İZLENİYOR",
      metrics: {}
    });
  }
  return states.get(symbol);
}

function windowStats(s, seconds) {
  const since = Date.now() - seconds * 1000;
  const rows = s.trades.filter(x => x.t >= since);

  if (!rows.length) {
    return { ret: 0, vol: 0, n: 0, buyRatio: 50 };
  }

  const volume = rows.reduce((a, x) => a + x.q, 0);
  const buyVolume = rows.reduce(
    (a, x) => a + (x.buy ? x.q : 0),
    0
  );

  return {
    ret: pct(rows[0].p, rows[rows.length - 1].p),
    vol: volume,
    n: rows.length,
    buyRatio: volume ? (buyVolume / volume) * 100 : 50
  };
}

function calculate(s) {
  const w5 = windowStats(s, 5);
  const w10 = windowStats(s, 10);
  const w30 = windowStats(s, 30);
  const w60 = windowStats(s, 60);
  const w120 = windowStats(s, 120);

  const now = Date.now();
  const baselines = [];

  for (let k = 2; k <= 7; k++) {
    const lo = now - k * 120000;
    const hi = now - (k - 1) * 120000;

    const rows = s.trades.filter(x => x.t >= lo && x.t < hi);
    const volume = rows.reduce((a, x) => a + x.q, 0);
    const buyVolume = rows.reduce(
      (a, x) => a + (x.buy ? x.q : 0),
      0
    );

    baselines.push({
      v: volume,
      n: rows.length,
      br: volume ? (buyVolume / volume) * 100 : 50
    });
  }

  const volumeX =
    w120.vol / Math.max(1, median(baselines.map(x => x.v)));

  const tradeX =
    w120.n / Math.max(1, median(baselines.map(x => x.n)));

  const buyShift =
    w30.buyRatio - median(baselines.map(x => x.br));

  const momentum = Math.max(
    0,
    w10.ret * 2 + w30.ret + w60.ret * 0.5
  );

  const candles = s.candles.slice(-8);

  let compression = 50;
  let resistanceDistance = 99;

  if (candles.length >= 4) {
    const highs = candles.map(x => x.h);
    const lows = candles.map(x => x.l);
    const closes = candles.map(x => x.c);

    const range =
      ((Math.max(...highs) - Math.min(...lows)) /
        (median(closes) || 1)) *
      100;

    compression = Math.max(
      0,
      Math.min(100, 100 - range * 15)
    );

    const resistance = Math.max(...highs.slice(0, -1));

    resistanceDistance = resistance
      ? ((resistance - s.price) / resistance) * 100
      : 99;
  }

  const components = {
    volume: sigmoid(volumeX, 1.8, 0.55),
    trades: sigmoid(tradeX, 1.6, 0.5),
    buy: sigmoid(
      w30.buyRatio + Math.max(0, buyShift) * 0.7,
      60,
      6
    ),
    momentum: sigmoid(momentum, 0.55, 0.3),
    compression,
    resistance: Math.max(
      0,
      Math.min(100, 100 - Math.abs(resistanceDistance) * 45)
    )
  };

  let score =
    components.volume * 0.25 +
    components.trades * 0.17 +
    components.buy * 0.20 +
    components.momentum * 0.18 +
    components.compression * 0.10 +
    components.resistance * 0.10;

  const late = w120.ret >= cfg.late;

  if (late) score = Math.min(score, 58);

  s.score = Math.round(score);

  s.status = late
    ? "GEÇ KALINDI"
    : score >= cfg.strong
    ? "GÜÇLÜ ERKEN UYARI"
    : score >= cfg.alert
    ? "ERKEN UYARI"
    : score >= 58
    ? "ADAY"
    : "İZLENİYOR";

  s.metrics = {
    w5,
    w10,
    w30,
    w60,
    w120,
    volX: volumeX,
    tradeX,
    compression,
    resistanceDistance
  };
}

async function getSymbols() {
  const response = await fetch(
    `${OKX_REST}/api/v5/market/tickers?instType=SPOT`
  );

  if (!response.ok) {
    throw new Error(`OKX HTTP ${response.status}`);
  }

  const json = await response.json();

  const symbols = (json.data || [])
    .filter(x => x.instId.endsWith("-USDT"))
    .filter(x => Number(x.volCcy24h || 0) > 0)
    .sort(
      (a, b) =>
        Number(b.volCcy24h || 0) -
        Number(a.volCcy24h || 0)
    )
    .slice(0, cfg.max)
    .map(x => x.instId);

  return symbols;
}

async function loadCandles(symbols) {
  for (const symbol of symbols) {
    try {
      const response = await fetch(
        `${OKX_REST}/api/v5/market/candles?instId=${encodeURIComponent(
          symbol
        )}&bar=15m&limit=8`
      );

      if (!response.ok) continue;

      const json = await response.json();
      const s = getState(symbol);

      s.candles = (json.data || [])
        .map(x => ({
          t: Number(x[0]),
          h: Number(x[2]),
          l: Number(x[3]),
          c: Number(x[4])
        }))
        .reverse();
    } catch (e) {
      console.error("Mum verisi:", symbol, e.message);
    }
  }
}

function connectOKX(symbols) {
  const ws = new WebSocket(OKX_WS);

  ws.on("open", () => {
    const args = symbols.map(symbol => ({
      channel: "trades",
      instId: symbol
    }));

    for (let i = 0; i < args.length; i += 50) {
      ws.send(
        JSON.stringify({
          op: "subscribe",
          args: args.slice(i, i + 50)
        })
      );
    }

    console.log(
      `OKX canlı bağlantı açıldı: ${symbols.length} USDT paritesi`
    );
  });

  ws.on("message", raw => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.arg?.channel !== "trades" || !Array.isArray(msg.data)) {
      return;
    }

    for (const trade of msg.data) {
      const symbol = trade.instId;
      const s = getState(symbol);

      const price = Number(trade.px);
      const size = Number(trade.sz);
      const timestamp = Number(trade.ts);

      if (!price || !size || !timestamp) continue;

      s.price = price;

      s.trades.push({
        t: timestamp,
        p: price,
        q: price * size,
        buy: trade.side === "buy"
      });

      const cutoff = Date.now() - cfg.keepMs;

      while (s.trades.length && s.trades[0].t < cutoff) {
        s.trades.shift();
      }

      calculate(s);
    }
  });

  ws.on("error", err => {
    console.error("OKX WebSocket:", err.message);
  });

  ws.on("close", () => {
    console.log("OKX bağlantısı kapandı. Yeniden bağlanılıyor.");
    setTimeout(() => connectOKX(symbols), 2000);
  });
}

const server = app.listen(PORT, async () => {
  console.log(`TradeRadar port ${PORT}`);

  try {
    const symbols = await getSymbols();

    console.log(`${symbols.length} OKX USDT paritesi bulundu`);

    if (!symbols.length) {
      console.error("OKX paritesi bulunamadı.");
      return;
    }

    await loadCandles(symbols);
    connectOKX(symbols);
  } catch (e) {
    console.error("OKX başlatma hatası:", e.message);
  }
});

const ui = new WebSocketServer({
  server,
  path: "/live"
});

ui.on("connection", ws => {
  clients.add(ws);

  ws.on("close", () => {
    clients.delete(ws);
  });
});

setInterval(() => {
  const rows = [...states.values()]
    .filter(x => x.price)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map(x => ({
      symbol: x.symbol,
      price: x.price,
      score: x.score,
      status: x.status,
      metrics: x.metrics,
      source: "OKX"
    }));

  const message = JSON.stringify({
    type: "radar",
    source: "OKX",
    rows
  });

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}, 1000);
