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
function calculate(s) {
  const now = Date.now();

  const w5 = windowStats(s, 5);
  const w10 = windowStats(s, 10);
  const w30 = windowStats(s, 30);
  const w60 = windowStats(s, 60);
  const w120 = windowStats(s, 120);

  // ===================================
  // GEÇMİŞ REFERANS PENCERELERİ
  // ===================================

  const baseline = [];

  for (let k = 2; k <= 7; k++) {
    const lo = now - k * 120000;
    const hi = now - (k - 1) * 120000;

    const r = s.trades.filter(
      x => x.t >= lo && x.t < hi
    );

    if (r.length < 3) continue;

    const volume =
      r.reduce(
        (a, x) => a + x.q,
        0
      );

    if (!volume) continue;

    const buyVolume =
      r.reduce(
        (a, x) =>
          a + (x.buy ? x.q : 0),
        0
      );

    baseline.push({
      volume,
      trades: r.length,
      buy:
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


  // ===================================
  // HACİM / İŞLEM İVMESİ
  // ===================================

  const baseVol =
    median(
      baseline.map(x => x.volume)
    );

  const baseTrades =
    median(
      baseline.map(x => x.trades)
    );

  const baseBuy =
    median(
      baseline.map(x => x.buy)
    );


  const vol120 =
    ready && baseVol
      ? w120.vol / baseVol
      : 0;


  const trade120 =
    ready && baseTrades
      ? w120.n / baseTrades
      : 0;


  // Son 30 saniyenin hızını
  // 120 saniyelik ortalamaya kıyasla.
  const vol30Expected =
    w120.vol / 4;


  const trade30Expected =
    w120.n / 4;


  const volumeAcceleration =
    vol30Expected > 0
      ? w30.vol / vol30Expected
      : 0;


  const tradeAcceleration =
    trade30Expected > 0
      ? w30.n / trade30Expected
      : 0;


  // Son 10 saniyede daha da
  // hızlanma var mı?
  const vol10Expected =
    w30.vol / 3;


  const microVolumeAcceleration =
    vol10Expected > 0
      ? w10.vol / vol10Expected
      : 0;


  const trade10Expected =
    w30.n / 3;


  const microTradeAcceleration =
    trade10Expected > 0
      ? w10.n / trade10Expected
      : 0;


  // ===================================
  // ALIŞ BASKISI
  // ===================================

  const buyShift =
    ready
      ? w30.buyRatio - baseBuy
      : 0;


  const buyStrength =
    Math.max(
      0,
      Math.min(
        100,
        (
          w10.buyRatio * 0.35 +
          w30.buyRatio * 0.45 +
          w60.buyRatio * 0.20
        )
      )
    );


  // ===================================
  // 15 DK MUM YAPISI
  // ===================================

  const candles =
    s.candles.slice(-8);

  let compression = 50;
  let resistanceDistance = 99;

  let trendScore = 0;
  let breakoutScore = 0;

  let recentResistance = 0;

  if (candles.length >= 4) {
    const highs =
      candles.map(x => x.h);

    const lows =
      candles.map(x => x.l);

    const closes =
      candles.map(x => x.c);


    const middle =
      median(closes) || 1;


    const rangePct =
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
          100 - rangePct * 14
        )
      );


    recentResistance =
      Math.max(
        ...highs.slice(0, -1)
      );


    resistanceDistance =
      recentResistance
        ? (
            (
              recentResistance -
              s.price
            ) /
            recentResistance
          ) * 100
        : 99;


    // Son kapanışlar sürekli
    // yükseliyor mu?
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
      (
        rising /
        Math.max(
          1,
          closes.length - 1
        )
      ) * 100;


    // Direnç kırıldı mı?
    if (
      recentResistance &&
      s.price >
        recentResistance
    ) {
      const breakoutPct =
        (
          (
            s.price -
            recentResistance
          ) /
          recentResistance
        ) * 100;


      breakoutScore =
        Math.min(
          100,
          55 +
          breakoutPct * 100
        );
    }
  }


  // ===================================
  // HAZIRLIK TAMAMLANMADAN
  // ===================================

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

      volumeAcceleration,
      tradeAcceleration,

      microVolumeAcceleration,
      microTradeAcceleration,

      buyStrength,
      buyShift,

      compression,
      trendScore,

      resistanceDistance,
      breakoutScore,

      ready: false,

      warmupRemaining:
        Math.max(
          0,
          CFG.warmupMs - age
        ),

      peak5m: 0
    };

    return;
  }


  // ===================================
  // FİYAT ÇOK İLERLEDİ Mİ?
  // ===================================

  const alreadyMoved =
    Math.max(
      w60.ret,
      w120.ret
    );


  const tooLate =
    w120.ret >= 5 ||
    w60.ret >= 4;


  // Erken sinyal için ideal:
  // fiyat henüz çok yükselmemiş olmalı.
  const earlyPriceScore =
    alreadyMoved <= 0
      ? 35

      : alreadyMoved <= 0.5
        ? 100

        : alreadyMoved <= 1
          ? 95

          : alreadyMoved <= 2
            ? 80

            : alreadyMoved <= 3
              ? 55

              : 20;


  // ===================================
  // HACİM İVMESİ PUANI
  // ===================================

  const volumeScore =
    Math.max(
      0,
      Math.min(
        100,

        vol120 * 18 +

        Math.max(
          0,
          volumeAcceleration - 1
        ) * 35 +

        Math.max(
          0,
          microVolumeAcceleration - 1
        ) * 20
      )
    );


  // ===================================
  // İŞLEM HIZI PUANI
  // ===================================

  const tradeScore =
    Math.max(
      0,
      Math.min(
        100,

        trade120 * 18 +

        Math.max(
          0,
          tradeAcceleration - 1
        ) * 35 +

        Math.max(
          0,
          microTradeAcceleration - 1
        ) * 20
      )
    );


  // ===================================
  // ALIŞ AKIŞI PUANI
  // ===================================

  const orderFlowScore =
    Math.max(
      0,
      Math.min(
        100,

        buyStrength +

        Math.max(
          0,
          buyShift
        ) * 1.2
      )
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
  // DİRENÇ YAKINLIĞI
  // ===================================

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

  } else if (
    resistanceDistance > 2 &&
    resistanceDistance <= 4
  ) {
    resistanceScore = 35;
  }


  // ===================================
  // PATLAMA HAZIRLIK PUANI
  // ===================================

  let preparationScore =
    volumeScore * 0.22 +
    tradeScore * 0.17 +
    orderFlowScore * 0.18 +
    momentumScore * 0.10 +
    compression * 0.10 +
    trendScore * 0.08 +
    resistanceScore * 0.08 +
    earlyPriceScore * 0.07;


  // Hacim gerçekten hızlanmıyorsa
  // yüksek puanı engelle.
  if (
    volumeAcceleration < 1.05 &&
    vol120 < 1.3
  ) {
    preparationScore =
      Math.min(
        preparationScore,
        68
      );
  }


  // Alıcı baskısı yoksa
  // erken patlama sinyali verme.
  if (
    w30.buyRatio < 55
  ) {
    preparationScore =
      Math.min(
        preparationScore,
        67
      );
  }


  // Fiyat zaten çok gittiyse
  // hazırlık sinyali sayma.
  if (tooLate) {
    preparationScore =
      Math.min(
        preparationScore,
        55
      );
  }


  // ===================================
  // KIRILIM PUANI
  // ===================================

  const breakoutConfirmed =
    breakoutScore >= 55 &&
    w30.buyRatio >= 58 &&
    (
      vol120 >= 1.5 ||
      volumeAcceleration >= 1.25
    ) &&
    w10.ret > -0.10;


  let finalScore =
    preparationScore;


  if (breakoutConfirmed) {
    finalScore =
      Math.max(
        finalScore,
        Math.min(
          100,

          70 +
          breakoutScore * 0.15 +
          Math.min(
            15,
            vol120 * 3
          )
        )
      );
  }


  s.score =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          finalScore
        )
      )
    );


  updatePeak(s);


  // ===================================
  // SİNYAL SINIFLANDIRMASI
  // ===================================

  const accumulation =
    !tooLate &&
    s.score >= 60 &&
    compression >= 55 &&
    (
      volumeAcceleration >= 1.05 ||
      tradeAcceleration >= 1.10
    ) &&
    w30.buyRatio >= 53;


  const preparing =
    !tooLate &&
    s.score >= 72 &&
    (
      vol120 >= 1.3 ||
      volumeAcceleration >= 1.20
    ) &&
    (
      trade120 >= 1.2 ||
      tradeAcceleration >= 1.20
    ) &&
    w30.buyRatio >= 58 &&
    resistanceDistance <= 2.5;


  const strongPreparing =
    preparing &&
    s.score >= 82 &&
    buyStrength >= 62 &&
    (
      microVolumeAcceleration >= 1.10 ||
      microTradeAcceleration >= 1.10
    );


  if (tooLate) {
    s.status =
      "GEÇ KALINDI";

  } else if (
    breakoutConfirmed
  ) {
    s.status =
      "KIRILIM TEYİDİ";

  } else if (
    strongPreparing
  ) {
    s.status =
      "GÜÇLÜ PATLAMA HAZIRLIĞI";

  } else if (
    preparing
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


  s.rawStatus =
    s.status;


  // ===================================
  // ARAYÜZE GÖNDERİLECEK VERİLER
  // ===================================

  s.metrics = {
    w5,
    w10,
    w30,
    w60,
    w120,

    volX:
      Number(
        Math.min(
          vol120,
          99
        ).toFixed(2)
      ),

    tradeX:
      Number(
        Math.min(
          trade120,
          99
        ).toFixed(2)
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

    buyShift:
      Number(
        buyShift.toFixed(1)
      ),

    compression:
      Math.round(compression),

    trendScore:
      Math.round(trendScore),

    resistanceDistance:
      Number(
        resistanceDistance.toFixed(2)
      ),

    breakoutScore:
      Math.round(breakoutScore),

    breakoutConfirmed,

    earlyPriceScore:
      Math.round(earlyPriceScore),

    preparationScore:
      Math.round(preparationScore),

    ready: true,

    baselineWindows:
      baseline.length,

    peak5m:
      s.peak5m
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
    .slice(0, 40)
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


// =====================================
// HAREKET EDENLER
// =====================================

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
        v: Number(
          x[7] ||
          x[6] ||
          x[5] ||
          0
        )
      }))
      .reverse();

  } catch {
    return [];
  }
}


function analyzeMover(t, candles) {
  const price =
    Number(t.last);

  const open24 =
    Number(t.open24h);

  const high24 =
    Number(t.high24h);

  const low24 =
    Number(t.low24h);

  const change24 =
    open24
      ? (
          (price - open24) /
          open24
        ) * 100
      : 0;


  if (candles.length < 6) {
    return {
      symbol: t.instId,
      price,
      change24,

      momentum15: 0,
      momentum1h: 0,
      volumeRatio: 0,

      continuationScore: 0,
      continuationText:
        "VERİ BEKLENİYOR",

      reversalScore: 0,
      reversalText:
        "VERİ BEKLENİYOR",

      supportLow:
        low24,

      supportHigh:
        low24,

      distanceFromHigh: 0
    };
  }


  const cur =
    candles[
      candles.length - 1
    ];

  const prev =
    candles[
      candles.length - 2
    ];

  const hourBack =
    candles[
      Math.max(
        0,
        candles.length - 5
      )
    ];


  const momentum15 =
    prev.c
      ? (
          (cur.c - prev.c) /
          prev.c
        ) * 100
      : 0;


  const momentum1h =
    hourBack.c
      ? (
          (cur.c - hourBack.c) /
          hourBack.c
        ) * 100
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


  // Kesin dönüş fiyatı değil,
  // muhtemel tepki bölgesi.
  const supportLow =
    Math.max(
      0,
      support - range * 0.05
    );

  const supportHigh =
    support + range * 0.12;


  const distanceFromHigh =
    high24
      ? (
          (high24 - price) /
          high24
        ) * 100
      : 0;


  const distanceFromLow =
    low24
      ? (
          (price - low24) /
          low24
        ) * 100
      : 0;


  // ===================================
  // YÜKSELİŞİN DEVAM GÜCÜ
  // ===================================

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


  // Çok uzamış harekete ceza
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
    change24 >= 40 &&
    distanceFromHigh < 3
  ) {
    continuationText =
      "AŞIRI UZAMIŞ — RİSK YÜKSEK";
  }


  // ===================================
  // DÜŞÜŞTEN DÖNÜŞ ANALİZİ
  // ===================================

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
  ) {
    reversalScore += 20;
  }


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


// =====================================
// HAREKET EDENLERİ GÜNCELLE
// =====================================

async function updateMovers() {
  try {
    const r = await fetch(
      `${REST}/api/v5/market/tickers?instType=SPOT`
    );

    if (!r.ok) {
      throw new Error(
        `OKX HTTP ${r.status}`
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
            Number(x.open24h) > 0 &&
            Number(
              x.volCcy24h || 0
            ) > 0
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
        .slice(0, 15);


    const losers =
      [...all]
        .sort(
          (a, b) =>
            a.change24 -
            b.change24
        )
        .slice(0, 15);


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


    const analyses =
      new Map();


    for (
      const ticker of selected
    ) {
      const candles =
        await moverCandles(
          ticker.instId
        );

      analyses.set(
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
              analyses.get(
                x.instId
              )
          )
          .filter(Boolean),

      losers:
        losers
          .map(
            x =>
              analyses.get(
                x.instId
              )
          )
          .filter(Boolean)
    };


    console.log(
      `Hareket analizi: ${moversCache.gainers.length} yükselen, ${moversCache.losers.length} düşen`
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
      rows: radarRows(),
      tracked:
        states.size,
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
        moversCache.updatedAt,

      gainers:
        moversCache.gainers,

      losers:
        moversCache.losers
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
          await getAllSymbols();


        console.log(
          `OKX'te ${symbols.length} aktif USDT paritesi taranacak`
        );


        // Her coin için state oluştur.
        for (
          const symbol of symbols
        ) {
          getState(symbol);
        }


        // Mumları yükle.
        loadRadarCandles(
          symbols
        );


        // Tüm coinleri WS gruplarına böl.
        const groups =
          splitGroups(
            symbols,
            CFG.wsGroupSize
          );


        groups.forEach(
          (group, index) => {
            // Bağlantıları aynı anda
            // patlatmamak için geciktir.
            setTimeout(
              () =>
                connectOKXGroup(
                  group,
                  index + 1
                ),

              index * 1200
            );
          }
        );


        // Hareket analizi.
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
// TELEFON WEBSOCKET
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
          rows: radarRows(),
          tracked:
            states.size
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
// CANLI RADARI TELEFONA GÖNDER
// =====================================

setInterval(
  () => {
    const message =
      JSON.stringify({
        type: "radar",
        source: "OKX",
        rows: radarRows(),
        tracked:
          states.size
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
// HAREKET EDENLERİ YENİLE
// =====================================

setInterval(
  updateMovers,
  60 * 1000
);
