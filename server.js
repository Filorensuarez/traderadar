import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

app.use(express.static(DIR));

const REST = "https://www.okx.com";
const WS_URL = "wss://ws.okx.com:8443/ws/v5/public";

const CFG = {
  warmup: 8 * 60 * 1000,
  keep: 15 * 60 * 1000,
  group: 70
};

const states = new Map();
const clients = new Set();

let movers = {
  updatedAt: 0,
  gainers: [],
  losers: []
};

const sleep = ms =>
  new Promise(r => setTimeout(r, ms));

const pct = (a, b) =>
  a ? ((b - a) / a) * 100 : 0;

function median(a) {
  const x = a
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (!x.length) return 0;

  const m = Math.floor(x.length / 2);

  return x.length % 2
    ? x[m]
    : (x[m - 1] + x[m]) / 2;
}

function state(symbol) {
  if (!states.has(symbol)) {
    states.set(symbol, {
      symbol,
      price: 0,
      first: 0,
      trades: [],
      candles: [],
      score: 0,
      peak5m: 0,
      scores: [],
      status: "VERİ TOPLANIYOR",
      metrics: {}
    });
  }

  return states.get(symbol);
}

function win(s, sec) {
  const from = Date.now() - sec * 1000;

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

function peak(s) {
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
// PATLAMA ÖNCESİ MOTOR
// =====================================

function calc(s) {
  const now = Date.now();

  const w5 = win(s, 5);
  const w10 = win(s, 10);
  const w30 = win(s, 30);
  const w60 = win(s, 60);
  const w120 = win(s, 120);

  const bases = [];

  for (let k = 2; k <= 7; k++) {
    const lo = now - k * 120000;
    const hi = now - (k - 1) * 120000;

    const a =
      s.trades.filter(
        x => x.t >= lo && x.t < hi
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

    bases.push({
      vol,
      n: a.length,
      buy: buy / vol * 100
    });
  }

  const age =
    s.first ? now - s.first : 0;

  const ready =
    age >= CFG.warmup &&
    bases.length >= 3;

  const bv =
    median(bases.map(x => x.vol));

  const bn =
    median(bases.map(x => x.n));

  const bb =
    median(bases.map(x => x.buy));

  const volX =
    ready && bv
      ? Math.min(99, w120.vol / bv)
      : 0;

  const tradeX =
    ready && bn
      ? Math.min(99, w120.n / bn)
      : 0;

  // Hacim yalnız yüksek mi değil,
  // giderek hızlanıyor mu?
  const volAccel =
    w120.vol > 0
      ? w30.vol / (w120.vol / 4)
      : 0;

  const tradeAccel =
    w120.n > 0
      ? w30.n / (w120.n / 4)
      : 0;

  const microVol =
    w30.vol > 0
      ? w10.vol / (w30.vol / 3)
      : 0;

  const microTrades =
    w30.n > 0
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
  // MUM / SIKIŞMA / DİRENÇ
  // ===================================

  const c =
    s.candles.slice(-8);

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
        closes[i] > closes[i - 1]
      ) rising++;
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
      microVolumeAcceleration: microVol,
      microTradeAcceleration: microTrades,
      buyStrength,
      compression,
      trendScore: trend,
      resistanceDistance,
      ready: false,
      warmupRemaining:
        Math.max(0, CFG.warmup - age),
      peak5m: 0
    };

    return;
  }


  // ===================================
  // PUAN
  // ===================================

  const moved =
    Math.max(
      w60.ret,
      w120.ret
    );

  // Fiyat henüz çok ilerlemediyse
  // daha yüksek erkenlik puanı.
  let early = 20;

  if (moved <= 0.5) early = 100;
  else if (moved <= 1) early = 95;
  else if (moved <= 2) early = 80;
  else if (moved <= 3) early = 55;


  const volumeScore =
    Math.min(
      100,
      volX * 18 +
      Math.max(0, volAccel - 1) * 35 +
      Math.max(0, microVol - 1) * 20
    );


  const tradeScore =
    Math.min(
      100,
      tradeX * 18 +
      Math.max(0, tradeAccel - 1) * 35 +
      Math.max(0, microTrades - 1) * 20
    );


  const flowScore =
    Math.min(
      100,
      buyStrength +
      Math.max(0, buyShift) * 1.2
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
      100 - resistanceDistance * 30;

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


  // Sahte yüksek puan filtreleri.
  if (
    volAccel < 1.05 &&
    volX < 1.3
  ) {
    score = Math.min(score, 67);
  }

  if (w30.buyRatio < 55) {
    score = Math.min(score, 66);
  }


  // Hareket zaten çok ilerlediyse
  // erken sinyal değildir.
  const late =
    w120.ret >= 5 ||
    w60.ret >= 4;

  if (late) {
    score = Math.min(score, 55);
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

  peak(s);


  // ===================================
  // DURUM
  // ===================================

  const accumulation =
    !late &&
    s.score >= 60 &&
    compression >= 55 &&
    (
      volAccel >= 1.05 ||
      tradeAccel >= 1.10
    ) &&
    w30.buyRatio >= 53;


  const preparation =
    !late &&
    s.score >= 72 &&
    (
      volX >= 1.3 ||
      volAccel >= 1.20
    ) &&
    (
      tradeX >= 1.2 ||
      tradeAccel >= 1.20
    ) &&
    w30.buyRatio >= 58 &&
    resistanceDistance <= 2.5;


  const strongPreparation =
    preparation &&
    s.score >= 82 &&
    buyStrength >= 62 &&
    (
      microVol >= 1.10 ||
      microTrades >= 1.10
    );


  if (late) {
    s.status =
      "GEÇ KALINDI";

  } else if (breakOK) {
    s.status =
      "KIRILIM TEYİDİ";

  } else if (strongPreparation) {
    s.status =
      "GÜÇLÜ PATLAMA HAZIRLIĞI";

  } else if (preparation) {
    s.status =
      "PATLAMA HAZIRLIĞI";

  } else if (accumulation) {
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
      Number(volX.toFixed(2)),

    tradeX:
      Number(tradeX.toFixed(2)),

    volumeAcceleration:
      Number(volAccel.toFixed(2)),

    tradeAcceleration:
      Number(tradeAccel.toFixed(2)),

    microVolumeAcceleration:
      Number(microVol.toFixed(2)),

    microTradeAcceleration:
      Number(microTrades.toFixed(2)),

    buyStrength:
      Number(buyStrength.toFixed(1)),

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
}


// =====================================
// TÜM AKTİF USDT PARİTELERİ
// =====================================

async function symbols() {
  const r = await fetch(
    `${REST}/api/v5/market/tickers?instType=SPOT`
  );

  if (!r.ok) {
    throw new Error(
      `OKX ${r.status}`
    );
  }

  const j = await r.json();

  return (j.data || [])
    .filter(
      x =>
        x.instId.endsWith("-USDT") &&
        Number(x.last) > 0 &&
        Number(x.volCcy24h || 0) > 0
    )
    .map(x => x.instId);
}


// =====================================
// 15 DK MUMLARI
// =====================================

async function candles(list) {
  for (const symbol of list) {
    try {
      const r = await fetch(
        `${REST}/api/v5/market/candles?instId=${encodeURIComponent(symbol)}&bar=15m&limit=8`
      );

      if (!r.ok) continue;

      const j = await r.json();

      state(symbol).candles =
        (j.data || [])
          .map(x => ({
            h: Number(x[2]),
            l: Number(x[3]),
            c: Number(x[4])
          }))
          .reverse();

      await sleep(35);

    } catch {}
  }
}


// =====================================
// OKX WEBSOCKET
// =====================================

function connect(list, no) {
  const ws =
    new WebSocket(WS_URL);

  ws.on("open", () => {
    const args =
      list.map(instId => ({
        channel: "trades",
        instId
      }));

    for (
      let i = 0;
      i < args.length;
      i += 20
    ) {
      ws.send(
        JSON.stringify({
          op: "subscribe",
          args: args.slice(i, i + 20)
        })
      );
    }

    console.log(
      `OKX grup ${no}: ${list.length} parite`
    );
  });


  ws.on("message", raw => {
    let d;

    try {
      d =
        JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (
      d.arg?.channel !== "trades" ||
      !Array.isArray(d.data)
    ) return;


    for (const x of d.data) {
      const s =
        state(x.instId);

      const p =
        Number(x.px);

      const size =
        Number(x.sz);

      const t =
        Number(x.ts);

      if (!p || !size || !t) continue;

      if (!s.first) {
        s.first = t;
      }

      s.price = p;

      s.trades.push({
        t,
        p,

        // USDT bazlı işlem hacmi
        q: p * size,

        buy:
          x.side === "buy"
      });


      const cut =
        Date.now() - CFG.keep;

      while (
        s.trades.length &&
        s.trades[0].t < cut
      ) {
        s.trades.shift();
      }

      calc(s);
    }
  });


  ws.on("error", e => {
    console.error(
      `WS ${no}:`,
      e.message
    );
  });


  ws.on("close", () => {
    setTimeout(
      () => connect(list, no),
      3000
    );
  });
}


// =====================================
// RADAR
// =====================================

function priority(x) {
  if (x === "KIRILIM TEYİDİ") return 7;
  if (x === "GÜÇLÜ PATLAMA HAZIRLIĞI") return 6;
  if (x === "PATLAMA HAZIRLIĞI") return 5;
  if (x === "BİRİKİM TESPİT EDİLDİ") return 4;
  if (x === "GEÇ KALINDI") return 2;
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
    .slice(0, 50)
    .map(x => ({
      symbol: x.symbol,
      price: x.price,
      score: x.score,
      peak5m: x.peak5m,
      status: x.status,
      rawStatus: x.status,
      metrics: x.metrics,
      source: "OKX"
    }));
}


// =====================================
// HAREKET EDENLER
// =====================================

async function updateMovers() {
  try {
    const r = await fetch(
      `${REST}/api/v5/market/tickers?instType=SPOT`
    );

    if (!r.ok) {
      throw new Error(`OKX ${r.status}`);
    }

    const j = await r.json();

    const all = (j.data || [])
      .filter(
        x =>
          x.instId.endsWith("-USDT") &&
          Number(x.last) > 0 &&
          Number(x.open24h) > 0
      )
      .map(x => {
        const price = Number(x.last);
        const open = Number(x.open24h);
        const high = Number(x.high24h);
        const low = Number(x.low24h);

        return {
          symbol: x.instId,
          price,

          change24:
            pct(open, price),

          high24: high,
          low24: low,

          distanceFromHigh:
            high
              ? ((high - price) / high) * 100
              : 0,

          distanceFromLow:
            low
              ? ((price - low) / low) * 100
              : 0
        };
      });


    const gainers = [...all]
      .sort(
        (a, b) =>
          b.change24 - a.change24
      )
      .slice(0, 15);


    const losers = [...all]
      .sort(
        (a, b) =>
          a.change24 - b.change24
      )
      .slice(0, 15);


    function enrich(x, up) {
      const s =
        states.get(x.symbol);

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
        let continuationScore = 0;

        if (x.change24 > 0)
          continuationScore += 15;

        if (momentum15 > 0)
          continuationScore += 15;

        if (momentum1h > 0)
          continuationScore += 15;

        if (volumeRatio >= 1.3)
          continuationScore += 20;

        if (
          Number(
            m.volumeAcceleration || 0
          ) >= 1.2
        ) {
          continuationScore += 20;
        }

        if (
          Number(
            m.w30?.buyRatio || 0
          ) >= 60
        ) {
          continuationScore += 15;
        }

        continuationScore =
          Math.min(
            100,
            continuationScore
          );

        let continuationText =
          "DEVAM GÜCÜ ZAYIF";

        if (
          continuationScore >= 75
        ) {
          continuationText =
            "MOMENTUM GÜÇLÜ";

        } else if (
          continuationScore >= 55
        ) {
          continuationText =
            "YÜKSELİŞ KORUNUYOR";

        } else if (
          continuationScore >= 35
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


      let reversalScore = 0;

      if (
        x.distanceFromLow <= 3
      ) {
        reversalScore += 25;
      }

      if (momentum15 > 0) {
        reversalScore += 20;
      }

      if (
        Number(
          m.volumeAcceleration || 0
        ) >= 1.2
      ) {
        reversalScore += 20;
      }

      if (
        Number(
          m.w30?.buyRatio || 0
        ) >= 55
      ) {
        reversalScore += 20;
      }

      if (
        Number(
          m.trendScore || 0
        ) >= 55
      ) {
        reversalScore += 15;
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
          x.high24 - x.low24,
          x.price * 0.001
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
              range * 0.02
          ),

        supportHigh:
          x.low24 +
          range * 0.08
      };
    }


    movers = {
      updatedAt: Date.now(),

      gainers:
        gainers.map(
          x => enrich(x, true)
        ),

      losers:
        losers.map(
          x => enrich(x, false)
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
      type: "radar",
      source: "OKX",
      tracked: states.size,
      rows: radarRows(),
      ts: Date.now()
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
      type: "movers",
      source: "OKX",

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
        const list =
          await symbols();

        console.log(
          `${list.length} aktif USDT paritesi`
        );


        for (
          const symbol of list
        ) {
          state(symbol);
        }


        // Mum yükleme arka planda.
        candles(list);


        // Tüm coinleri gruplara ayır.
        const groups = [];

        for (
          let i = 0;
          i < list.length;
          i += CFG.group
        ) {
          groups.push(
            list.slice(
              i,
              i + CFG.group
            )
          );
        }


        groups.forEach(
          (group, i) => {
            setTimeout(
              () =>
                connect(
                  group,
                  i + 1
                ),

              i * 1200
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
// TELEFON CANLI BAĞLANTI
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
// HER SANİYE RADAR
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
        ws.send(message);
      }
    }
  },
  1000
);


// =====================================
// HAREKET EDENLER
// =====================================

setInterval(
  updateMovers,
  60 * 1000
);
