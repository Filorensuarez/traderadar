import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const PORT =
  process.env.PORT || 8080;

app.use(
  express.static(
    path.join(__dirname, ".")
  )
);


// =====================================
// OKX
// =====================================

const REST =
  "https://www.okx.com";

const OKX_WS =
  "wss://ws.okx.com:8443/ws/v5/public";


// =====================================
// AYARLAR
// =====================================

const CFG = {
  max: 120,

  alert: 72,
  strong: 84,

  late: 5,

  keepMs:
    15 * 60 * 1000,

  warmupMs:
    8 * 60 * 1000,

  peakMs:
    5 * 60 * 1000,

  strongHoldMs:
    8 * 1000,

  minBaseline: 3
};


const states =
  new Map();

const clients =
  new Set();


// =====================================
// YARDIMCI FONKSİYONLAR
// =====================================

const median = arr => {

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
};


const pct = (a, b) =>
  a
    ? (
        (b - a) /
        a
      ) * 100
    : 0;


const sig = (
  x,
  center,
  width
) =>
  Math.max(
    0,
    Math.min(
      100,

      100 /
      (
        1 +
        Math.exp(
          -(x - center) /
          width
        )
      )
    )
  );


const sleep = ms =>
  new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );


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

        trades: [],
        candles: [],

        price: 0,

        score: 0,
        peak5m: 0,

        status:
          "VERİ TOPLANIYOR",

        rawStatus:
          "VERİ TOPLANIYOR",

        metrics: {},

        firstTradeAt: 0,

        strongSince: 0,

        scores: []
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

  s.scores.push({
    t: now,
    score: s.score
  });

  const cutoff =
    now -
    CFG.peakMs;

  while (
    s.scores.length &&
    s.scores[0].t <
      cutoff
  ) {

    s.scores.shift();
  }

  s.peak5m =
    s.scores.length
      ? Math.max(
          ...s.scores.map(
            x => x.score
          )
        )
      : s.score;
}


// =====================================
// RADAR PUANI
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

    baseline.length >=
      CFG.minBaseline;


  let volumeX = 0;
  let tradeX = 0;
  let buyShift = 0;


  if (ready) {

    const baseVolume =
      median(
        baseline.map(
          x =>
            x.volume
        )
      );


    const baseTrades =
      median(
        baseline.map(
          x =>
            x.trades
        )
      );


    const baseBuy =
      median(
        baseline.map(
          x =>
            x.buyRatio
        )
      );


    volumeX =
      baseVolume
        ? w120.vol /
          baseVolume
        : 0;


    tradeX =
      baseTrades
        ? w120.n /
          baseTrades
        : 0;


    buyShift =
      w30.buyRatio -
      baseBuy;


    volumeX =
      Math.min(
        volumeX,
        20
      );


    tradeX =
      Math.min(
        tradeX,
        20
      );
  }


// =====================================
// SON 8 MUM
// =====================================

  const candles =
    s.candles.slice(-8);


  let compression = 50;

  let resistanceDistance =
    99;


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
      median(closes) || 1;


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
          range * 15
        )
      );


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
            resistance -
            s.price
          ) /
          resistance *
          100
        : 99;
  }


// =====================================
// HAZIRLIK
// =====================================

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

          CFG.warmupMs -
          age
        ),

      peak5m: 0
    };

    return;
  }


// =====================================
// MOMENTUM
// =====================================

  const momentum =
    Math.max(
      0,

      w10.ret * 2 +

      w30.ret +

      w60.ret * 0.5
    );


// =====================================
// PUAN BİLEŞENLERİ
// =====================================

  const components = {

    volume:
      sig(
        volumeX,
        1.8,
        0.55
      ),

    trades:
      sig(
        tradeX,
        1.6,
        0.5
      ),

    buy:
      sig(
        w30.buyRatio +

        Math.max(
          0,
          buyShift
        ) * 0.7,

        60,
        6
      ),

    momentum:
      sig(
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

    components.volume *
      0.25 +

    components.trades *
      0.17 +

    components.buy *
      0.20 +

    components.momentum *
      0.18 +

    components.compression *
      0.10 +

    components.resistance *
      0.10;


// =====================================
// GEÇ KALINDI KONTROLÜ
// =====================================

  const late =
    w120.ret >=
    CFG.late;


  if (late) {

    score =
      Math.min(
        score,
        58
      );
  }


  s.score =
    Math.round(
      score
    );


  updatePeak(s);


// =====================================
// HAM DURUM
// =====================================

  if (late) {

    s.rawStatus =
      "GEÇ KALINDI";

  } else if (
    s.score >=
    CFG.strong
  ) {

    s.rawStatus =
      "GÜÇLÜ ERKEN UYARI";

  } else if (
    s.score >=
    CFG.alert
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


// =====================================
// 84+ PUAN TEYİDİ
// =====================================

  if (
    !late &&
    s.score >=
      CFG.strong
  ) {

    if (
      !s.strongSince
    ) {

      s.strongSince =
        now;
    }

  } else {

    s.strongSince = 0;
  }


  const strongConfirmed =
    Boolean(
      s.strongSince &&

      now -
      s.strongSince >=
      CFG.strongHoldMs
    );


  const previouslyStrong =
    s.peak5m >=
    CFG.strong;


  const healthy =
    w30.buyRatio >= 55 &&

    (
      volumeX >= 1.2 ||
      tradeX >= 1.2
    ) &&

    w10.ret > -0.15 &&

    w30.ret > -0.30;


// =====================================
// SİNYAL DURUMU
// =====================================

  if (late) {

    s.status =
      "GEÇ KALINDI";

  } else if (
    strongConfirmed
  ) {

    s.status =
      "GÜÇLÜ ERKEN UYARI";

  } else if (
    s.score >=
    CFG.strong
  ) {

    s.status =
      "TEYİT BEKLENİYOR";

  } else if (
    s.score >=
    CFG.alert
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


// =====================================
// METRİKLER
// =====================================

  s.metrics = {

    w5,
    w10,
    w30,
    w60,
    w120,

    volX:
      volumeX,

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
            ) /
            1000
          )
        : 0,

    rawStatus:
      s.rawStatus
  };
}


// =====================================
// OKX USDT COİNLERİ
// =====================================

async function getSymbols() {

  const response =
    await fetch(
      `${REST}/api/v5/market/tickers?instType=SPOT`
    );


  if (!response.ok) {

    throw new Error(
      `OKX HTTP ${response.status}`
    );
  }


  const json =
    await response.json();


  return (
    json.data || []
  )

    .filter(
      x =>
        x.instId.endsWith(
          "-USDT"
        )
    )

    .filter(
      x =>
        Number(
          x.volCcy24h || 0
        ) > 0
    )

    .sort(
      (a, b) =>
        Number(
          b.volCcy24h || 0
        ) -

        Number(
          a.volCcy24h || 0
        )
    )

    .slice(
      0,
      CFG.max
    )

    .map(
      x =>
        x.instId
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

      const response =
        await fetch(
          `${REST}/api/v5/market/candles?instId=${encodeURIComponent(
            symbol
          )}&bar=15m&limit=8`
        );


      if (!response.ok) {
        continue;
      }


      const json =
        await response.json();


      const s =
        getState(
          symbol
        );


      s.candles =
        (
          json.data || []
        )

          .map(
            x => ({
              t:
                Number(x[0]),

              h:
                Number(x[2]),

              l:
                Number(x[3]),

              c:
                Number(x[4])
            })
          )

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


// =====================================
// OKX CANLI İŞLEMLER
// =====================================

function connectOKX(
  symbols
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
        i += 50
      ) {

        ws.send(
          JSON.stringify({
            op:
              "subscribe",

            args:
              args.slice(
                i,
                i + 50
              )
          })
        );
      }


      console.log(
        `OKX canlı: ${symbols.length} USDT paritesi`
      );
    }
  );


  ws.on(
    "message",
    raw => {

      let message;


      try {

        message =
          JSON.parse(
            raw.toString()
          );

      } catch {

        return;
      }


      if (
        message.arg?.channel !==
          "trades" ||

        !Array.isArray(
          message.data
        )
      ) {

        return;
      }


      for (
        const trade of
        message.data
      ) {

        const s =
          getState(
            trade.instId
          );


        const price =
          Number(
            tradetatus === "ERKEN UYARI") return 6;
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

    // =====================================
// HAREKET EDENLER
// =====================================

let moversCache = {
  updatedAt: 0,
  gainers: [],
  losers: []
};

async function moverCandles(symbol) {
  try {
    const r = await fetch(
      `${REST}/api/v5/market/candles?instId=${encodeURIComponent(symbol)}&bar=15m&limit=20`
    );

    if (!r.ok) return [];

    const j = await r.json();

    return (j.data || [])
      .map(x => ({
        o: Number(x[1]),
        h: Number(x[2]),
        l: Number(x[3]),
        c: Number(x[4]),
        v: Number(x[7] || x[6] || x[5] || 0)
      }))
      .reverse();

  } catch {
    return [];
  }
}


function analyzeMover(t, candles) {

  const price = Number(t.last);
  const open24 = Number(t.open24h);
  const high24 = Number(t.high24h);
  const low24 = Number(t.low24h);

  const change24 =
    open24
      ? ((price - open24) / open24) * 100
      : 0;

  if (candles.length < 6) {
    return {
      symbol: t.instId,
      price,
      change24,
      continuationScore: 0,
      reversalScore: 0,
      continuationText: "VERİ BEKLENİYOR",
      reversalText: "VERİ BEKLENİYOR",
      momentum15: 0,
      momentum1h: 0,
      volumeRatio: 0,
      supportLow: low24,
      supportHigh: low24,
      distanceFromHigh: 0
    };
  }

  const cur =
    candles[candles.length - 1];

  const prev =
    candles[candles.length - 2];

  const h1 =
    candles[
      Math.max(
        0,
        candles.length - 5
      )
    ];

  const momentum15 =
    prev.c
      ? ((cur.c - prev.c) / prev.c) * 100
      : 0;

  const momentum1h =
    h1.c
      ? ((cur.c - h1.c) / h1.c) * 100
      : 0;


  const oldVolumes =
    candles
      .slice(-8, -1)
      .map(x => x.v)
      .filter(x => x > 0);

  const normalVolume =
    median(oldVolumes);

  const volumeRatio =
    normalVolume
      ? cur.v / normalVolume
      : 0;


  const recent =
    candles.slice(-12);

  const lows =
    recent.map(x => x.l);

  const highs =
    recent.map(x => x.h);


  const support =
    Math.min(...lows);

  const resistance =
    Math.max(...highs);

  const range =
    Math.max(
      resistance - support,
      price * 0.001
    );


  const supportLow =
    Math.max(
      0,
      support - range * 0.05
    );

  const supportHigh =
    support + range * 0.12;


  const distanceFromHigh =
    high24
      ? ((high24 - price) / high24) * 100
      : 0;

  const distanceFromLow =
    low24
      ? ((price - low24) / low24) * 100
      : 0;


  // YÜKSELİŞ DEVAM GÜCÜ

  let continuationScore = 0;

  if (change24 > 0)
    continuationScore += 15;

  if (momentum15 > 0)
    continuationScore += 15;

  if (momentum15 > 0.5)
    continuationScore += 10;

  if (momentum1h > 0)
    continuationScore += 15;

  if (momentum1h > 2)
    continuationScore += 10;

  if (volumeRatio >= 1.5)
    continuationScore += 15;

  if (volumeRatio >= 2.5)
    continuationScore += 10;

  if (distanceFromHigh <= 2)
    continuationScore += 10;

  // Fazla yükselmiş coinlerde risk cezası
  if (change24 >= 30)
    continuationScore -= 10;

  if (change24 >= 60)
    continuationScore -= 15;


  continuationScore =
    Math.max(
      0,
      Math.min(
        100,
        continuationScore
      )
    );


  let continuationText =
    "DEVAM GÜCÜ ZAYIF";

  if (continuationScore >= 75) {
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
    change24 >= 40 &&
    distanceFromHigh < 3
  ) {
    continuationText =
      "AŞIRI UZAMIŞ — RİSK YÜKSEK";
  }


  // DÜŞÜŞTEN TEPKİ ANALİZİ

  let reversalScore = 0;

  if (change24 < 0)
    reversalScore += 10;

  if (distanceFromLow <= 3)
    reversalScore += 20;

  if (momentum15 > 0)
    reversalScore += 20;

  if (volumeRatio >= 1.3)
    reversalScore += 15;

  if (cur.c > cur.o)
    reversalScore += 15;

  if (
    momentum15 > 0 &&
    momentum1h > -1
  )
    reversalScore += 20;


  reversalScore =
    Math.max(
      0,
      Math.min(
        100,
        reversalScore
      )
    );


  let reversalText =
    "DÜŞÜŞ DEVAM EDİYOR";

  if (reversalScore >= 75) {
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


  return {
    symbol: t.instId,
    price,
    change24,

    momentum15,
    momentum1h,
    volumeRatio,

    continuationScore,
    continuationText,

    reversalScore,
    reversalText,

    supportLow,
    supportHigh,

    distanceFromHigh
  };
}


async function updateMovers() {

  try {

    const r = await fetch(
      `${REST}/api/v5/market/tickers?instType=SPOT`
    );

    if (!r.ok) {
      throw new Error(
        `OKX ${r.status}`
      );
    }

    const j = await r.json();


    const all =
      (j.data || [])
        .filter(
          x =>
            x.instId.endsWith("-USDT")
        )
        .filter(
          x =>
            Number(x.last) > 0 &&
            Number(x.open24h) > 0
        )
        .map(x => ({
          ...x,

          change24:
            (
              (
                Number(x.last) -
                Number(x.open24h)
              ) /
              Number(x.open24h)
            ) * 100
        }));


    const gainers =
      [...all]
        .sort(
          (a, b) =>
            b.change24 -
            a.change24
        )
        .slice(0, 12);


    const losers =
      [...all]
        .sort(
          (a, b) =>
            a.change24 -
            b.change24
        )
        .slice(0, 12);


    const selected =
      [
        ...new Map(
          [
            ...gainers,
            ...losers
          ].map(
            x => [
              x.instId,
              x
            ]
          )
        ).values()
      ];


    const result =
      new Map();


    for (
      const ticker of selected
    ) {

      const candles =
        await moverCandles(
          ticker.instId
        );

      result.set(
        ticker.instId,
        analyzeMover(
          ticker,
          candles
        )
      );

      await sleep(80);
    }


    moversCache = {
      updatedAt:
        Date.now(),

      gainers:
        gainers
          .map(
            x =>
              result.get(
                x.instId
              )
          )
          .filter(Boolean),

      losers:
        losers
          .map(
            x =>
              result.get(
                x.instId
              )
          )
          .filter(Boolean)
    };


    console.log(
      "Hareket analizi güncellendi"
    );

  } catch (e) {

    console.error(
      "Hareket analizi hatası:",
      e.message
    );
  }
}


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
        moversCache.updatedAt,

      gainers:
        moversCache.gainers,

      losers:
        moversCache.losers
    });
  }
);


// Sunucu açıldıktan 5 saniye sonra başlat
setTimeout(
  updateMovers,
  5000
);


// Her 60 saniyede yeniden analiz et
setInterval(
  updateMovers,
  60000
);
