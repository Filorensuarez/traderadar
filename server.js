import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

const OKX =
  "https://www.okx.com";

const KUCOIN =
  "https://api.kucoin.com";

const GATE =
  "https://api.gateio.ws/api/v4";

app.use(express.static("."));

let scanning = false;
/*
  Anlık radar sinyal hafızası.

  Her coin için sinyalin hangi
  mumda başladığını ve hâlen
  aktif olup olmadığını tutar.
*/

const minuteRadarState =
  new Map();
/*
  SENARYO 2 + SENARYO 3
  MİKRO PİYASA HAFIZASI

  Her coin için son 90 saniyelik
  işlem akışını saklar.
*/

const microMarketState =
  new Map();


function getMicroState(
  source,
  symbol
) {

  const key =
    `${source}:${symbol}`;


  if (
    !microMarketState.has(key)
  ) {

    microMarketState.set(
      key,
      {
        trades: [],

        snapshots: [],

        updatedAt: 0
      }
    );
  }


  return (
    microMarketState.get(key)
  );
}


/*
  Yeni işlemleri hafızaya ekler.
*/

function updateMicroTrades(
  source,
  symbol,
  trades
) {

  const state =
    getMicroState(
      source,
      symbol
    );


  const now =
    Date.now();


  for (
    const trade
    of trades
  ) {

    const time =
      Number(trade.time);

    const price =
      Number(trade.price);

    const amount =
      Number(trade.amount);

    const side =
      trade.side;


    if (
      !Number.isFinite(time) ||
      !Number.isFinite(price) ||
      !Number.isFinite(amount) ||
      price <= 0 ||
      amount <= 0
    ) {
      continue;
    }


    state.trades.push({
      time,
      price,
      amount,

      value:
        price * amount,

      side
    });
  }


  /*
    Yalnız son 90 saniyeyi tut.
  */

  state.trades =
    state.trades.filter(
      trade =>
        trade.time >=
        now - 90_000
    );


  /*
    Aynı işlem tekrar geldiyse
    basit tekilleştirme.
  */

  const unique =
    new Map();


  for (
    const trade
    of state.trades
  ) {

    const tradeKey =
      `${trade.time}:${trade.price}:${trade.amount}:${trade.side}`;

    unique.set(
      tradeKey,
      trade
    );
  }


  state.trades =
    Array.from(
      unique.values()
    )
      .sort(
        (a, b) =>
          a.time - b.time
      );


  state.updatedAt =
    now;


  return state;
}
/* =========================
   SENARYO 3
   FİYAT İVMESİ
========================= */
/* =========================
   SENARYO 3
   FİYAT İVMESİ BAŞLIYOR
========================= */

/* =========================
   SENARYO 4
   BÜYÜK TEYİT
========================= */
function analyzeScenario3(...) {
  ...
}

function analyzeScenario4(...) {
  ...
}
function analyzeScenario4(
  symbol,
  candles,
  source
) {

  if (
    !Array.isArray(candles) ||
    candles.length < 55
  ) {
    return null;
  }


  const data =
    candles.slice(-60);


  const closes =
    data.map(
      c => Number(c.close)
    );


  const highs =
    data.map(
      c => Number(c.high)
    );


  const lows =
    data.map(
      c => Number(c.low)
    );


  const volumes =
    data.map(
      c => Number(c.volume) || 0
    );


  const last =
    data.at(-1);


  const price =
    Number(last.close);


  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return null;
  }


  /*
    EMA
  */

  function localEMA(
    values,
    period
  ) {

    if (!values.length) {
      return 0;
    }


    const k =
      2 /
      (period + 1);


    let value =
      values[0];


    for (
      let i = 1;
      i < values.length;
      i++
    ) {

      value =
        values[i] * k +
        value * (1 - k);
    }


    return value;
  }


  const ema20 =
    localEMA(
      closes,
      20
    );


  const ema50 =
    localEMA(
      closes,
      50
    );


  const emaBullish =
    ema20 >
    ema50;


  /*
    DİRENÇ

    Son 20 mumdan önceki
    20 mumdaki yerel tepeyi
    referans alıyoruz.

    Böylece mevcut kırılım
    mumunu direncin içine
    dahil etmiyoruz.
  */

  const resistanceWindow =
    data.slice(
      -40,
      -5
    );


  const resistance =
    Math.max(
      ...resistanceWindow.map(
        c => Number(c.high)
      )
    );


  const breakout =
    price >
    resistance;


  const breakoutPercent =
    resistance > 0
      ? (
          (
            price -
            resistance
          ) /
          resistance
        ) * 100
      : 0;


  /*
    DİRENÇ ÜSTÜ KAPANIŞ

    Son mum kapanışı direnç
    üzerinde olmalı.
  */

  const closeAboveResistance =
    Number(last.close) >
    resistance;


  /*
    HACİM PATLAMASI

    Son 3 mum ortalaması ile
    önceki 20 mum karşılaştırılır.
  */

  const recentVolume =
    volumes
      .slice(-3)
      .reduce(
        (sum, value) =>
          sum + value,
        0
      ) / 3;


  const oldVolumeValues =
    volumes.slice(
      -23,
      -3
    );


  const oldVolume =
    oldVolumeValues.length
      ? oldVolumeValues.reduce(
          (sum, value) =>
            sum + value,
          0
        ) /
        oldVolumeValues.length
      : 0;


  const volumeRatio =
    oldVolume > 0
      ? recentVolume /
        oldVolume
      : 0;


  const volumeExplosion =
    volumeRatio >= 1.8;


  /*
    VWAP

    1 dakikalık son 30 mum.
  */

  const vwapWindow =
    data.slice(-30);


  let vwapValue = 0;

  let vwapVolume = 0;


  for (
    const candle
    of vwapWindow
  ) {

    const high =
      Number(candle.high);

    const low =
      Number(candle.low);

    const close =
      Number(candle.close);

    const volume =
      Number(candle.volume) || 0;


    const typical =
      (
        high +
        low +
        close
      ) / 3;


    vwapValue +=
      typical *
      volume;


    vwapVolume +=
      volume;
  }


  const vwap =
    vwapVolume > 0
      ? vwapValue /
        vwapVolume
      : 0;


  const aboveVWAP =
    price >
    vwap;


  /*
    RSI
  */

  function localRSI(
    values,
    period = 14
  ) {

    if (
      values.length <
      period + 1
    ) {
      return 50;
    }


    const sample =
      values.slice(
        -(period + 1)
      );


    let gains = 0;
    let losses = 0;


    for (
      let i = 1;
      i < sample.length;
      i++
    ) {

      const difference =
        sample[i] -
        sample[i - 1];


      if (
        difference > 0
      ) {

        gains +=
          difference;

      } else {

        losses +=
          Math.abs(
            difference
          );
      }
    }


    const averageGain =
      gains /
      period;


    const averageLoss =
      losses /
      period;


    if (
      averageLoss === 0
    ) {
      return 100;
    }


    const rs =
      averageGain /
      averageLoss;


    return (
      100 -
      100 /
      (1 + rs)
    );
  }


  const rsiNow =
    localRSI(
      closes,
      14
    );


  const rsiPrevious =
    localRSI(
      closes.slice(
        0,
        -3
      ),
      14
    );


  const rsiRising =
    rsiNow >
    rsiPrevious;


  const rsiBullish =
    rsiNow > 50 &&
    rsiRising;


  /*
    MACD
  */

  function localMACD(
    values
  ) {

    const fast =
      localEMA(
        values,
        12
      );


    const slow =
      localEMA(
        values,
        26
      );


    return (
      fast -
      slow
    );
  }


  const macd =
    localMACD(
      closes
    );


  const previousMacd =
    localMACD(
      closes.slice(
        0,
        -3
      )
    );


  const macdBullish =
    macd > 0 &&
    macd >
    previousMacd;


  /*
    BOLLINGER

    Üst banda yaklaşma ve
    bant genişlemesi.
  */

  function bollinger(
    values
  ) {

    const sample =
      values.slice(-20);


    const middle =
      sample.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      sample.length;


    const variance =
      sample.reduce(
        (
          sum,
          value
        ) => {

          return (
            sum +
            Math.pow(
              value -
              middle,
              2
            )
          );
        },
        0
      ) /
      sample.length;


    const sd =
      Math.sqrt(
        variance
      );


    return {

      middle,

      upper:
        middle +
        2 * sd,

      lower:
        middle -
        2 * sd,

      width:
        middle > 0
          ? (
              (
                4 * sd
              ) /
              middle
            ) * 100
          : 0
    };
  }


  const bollingerNow =
    bollinger(
      closes
    );


  const bollingerPrevious =
    bollinger(
      closes.slice(
        0,
        -5
      )
    );


  const bollingerExpanding =
    bollingerNow.width >
    bollingerPrevious.width;


  const nearUpperBand =
    bollingerNow.upper > 0
      ? (
          (
            bollingerNow.upper -
            price
          ) /
          bollingerNow.upper
        ) * 100 <= 1.5
      : false;


  const bollingerBullish =
    bollingerExpanding &&
    nearUpperBand;


  /*
    HIGHER HIGH
  */

  const recentHigh =
    Math.max(
      ...highs.slice(-5)
    );


  const previousHigh =
    Math.max(
      ...highs.slice(
        -10,
        -5
      )
    );


  const higherHigh =
    recentHigh >
    previousHigh;


  /*
    RETEST

    Son 5 mum içinde fiyat
    dirence geri geldiyse ve
    kapanış tekrar direncin
    üzerinde kaldıysa korunmuş
    retest kabul ediyoruz.
  */

  let retestTouched =
    false;

  let retestHeld =
    false;


  const retestTolerance =
    resistance *
    0.005;


  for (
    const candle
    of data.slice(-5)
  ) {

    const low =
      Number(candle.low);

    const close =
      Number(candle.close);


    if (
      Math.abs(
        low -
        resistance
      ) <=
      retestTolerance
    ) {

      retestTouched =
        true;


      if (
        close >=
        resistance
      ) {

        retestHeld =
          true;
      }
    }
  }


  /*
    SAHTE KIRILIM

    Mum direnç üzerine çıkmış
    fakat kapanış tekrar direnç
    altında kalmışsa.
  */

  const lastHigh =
    Number(last.high);


  const falseBreakout =
    lastHigh >
    resistance &&
    Number(last.close) <
    resistance;


  /*
    PUAN
  */

  let score = 0;


  /*
    Kırılım ve hacim en
    yüksek ağırlığa sahip.
  */

  if (breakout) {
    score += 15;
  }


  if (
    closeAboveResistance
  ) {
    score += 10;
  }


  if (volumeExplosion) {
    score += 15;
  }


  if (
    breakout &&
    volumeExplosion
  ) {
    score += 10;
  }


  if (aboveVWAP) {
    score += 10;
  }


  if (emaBullish) {
    score += 10;
  }


  if (rsiBullish) {
    score += 10;
  }


  if (macdBullish) {
    score += 10;
  }


  if (
    bollingerBullish
  ) {
    score += 5;
  }


  if (higherHigh) {
    score += 5;
  }


  if (retestHeld) {
    score += 10;
  }


  /*
    Sahte kırılım cezası.
  */

  if (falseBreakout) {
    score -= 30;
  }


  score =
    Math.max(
      0,
      Math.min(
        score,
        100
      )
    );


  /*
    SINIFLANDIRMA
  */

  let status =
    "KIRILIM DENEMESİ";


  if (falseBreakout) {

    status =
      "SAHTE KIRILIM RİSKİ";

  } else if (
    score >= 85 &&
    breakout &&
    volumeExplosion &&
    closeAboveResistance
  ) {

    status =
      "BÜYÜK TEYİT";

  } else if (
    score >= 70 &&
    breakout &&
    closeAboveResistance
  ) {

    status =
      "KIRILIM TEYİDİ";

  } else if (
    breakout
  ) {

    status =
      "KIRILIM";
  }


  const qualifies =
    score >= 40 ||
    breakout ||
    falseBreakout;


  return {

    symbol,

    source,

    price,

    score,

    status,

    resistance,

    breakout,

    breakoutPercent,

    closeAboveResistance,

    volumeRatio,

    volumeExplosion,

    vwap,

    aboveVWAP,

    ema20,

    ema50,

    emaBullish,

    rsi:
      rsiNow,

    rsiRising,

    rsiBullish,

    macd,

    macdBullish,

    bollingerWidth:
      bollingerNow.width,

    bollingerExpanding,

    nearUpperBand,

    bollingerBullish,

    higherHigh,

    retestTouched,

    retestHeld,

    falseBreakout,

    qualifies
  };
  /* =========================
   YÜKSELİŞ SENARYOLARI CACHE
========================= */

let scenarioCache = {

  updatedAt: 0,

  scanning: false,

  scenario1: {
    ok: true,
    scanned: 0,
    rows: [],
    error: null
  },

  scenario2: {
    ok: true,
    scanned: 0,
    rows: [],
    error: null
  },

  scenario3: {
    ok: true,
    scanned: 0,
    rows: [],
    error: null
  },

  scenario4: {
    ok: true,
    scanned: 0,
    rows: [],
    error: null
  }
};
}let minuteRadarCache = {

  ok: true,

  updatedAt: 0,

  scanned: 0,

  rows: [],

  exchanges: {

    okx: {
      scanned: 0,
      error: null
    },

    kucoin: {
      scanned: 0,
      error: null
    },

    gate: {
      scanned: 0,
      error: null
    }
  }
};


let minuteRadarScanning =
  false;
let cache = {
  ok: true,
  source: "OKX",
  updatedAt: 0,
  scanned: 0,
  rows: [],
  error: null
};


/* =========================
   HTTP
========================= */

async function getJSON(url) {

  const response =
    await fetch(url, {
      signal:
        AbortSignal.timeout(15000)
    });

  if (!response.ok) {
    throw new Error(
      `OKX HTTP ${response.status}`
    );
  }

  const json =
    await response.json();

  if (
    String(json.code) !== "0"
  ) {
    throw new Error(
      json.msg ||
      "OKX veri hatası"
    );
  }

  return json.data;
}
async function getKucoinJSON(url) {

  const response =
    await fetch(url, {
      signal:
        AbortSignal.timeout(15000)
    });

  if (!response.ok) {
    throw new Error(
      `KuCoin HTTP ${response.status}`
    );
  }

  const json =
    await response.json();

  if (
    String(json.code) !== "200000"
  ) {
    throw new Error(
      json.msg ||
      "KuCoin veri hatası"
    );
  }

  return json.data;
}
async function getGateJSON(url) {

  const response =
    await fetch(url, {
      headers: {
        "Accept":
          "application/json"
      },

      signal:
        AbortSignal.timeout(15000)
    });

  if (!response.ok) {
    throw new Error(
      `Gate.io HTTP ${response.status}`
    );
  }

  const json =
    await response.json();

  if (!Array.isArray(json)) {
    throw new Error(
      "Gate.io veri formatı hatası"
    );
  }

  return json;
}
/* =========================
   MATEMATİK
========================= */

function average(values) {

  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    values.length
  );
}


function ema(values, period) {

  if (
    values.length < period
  ) {
    return null;
  }

  const k =
    2 / (period + 1);

  let result =
    average(
      values.slice(
        0,
        period
      )
    );

  for (
    let i = period;
    i < values.length;
    i++
  ) {

    result =
      values[i] * k +
      result * (1 - k);
  }

  return result;
}


/* =========================
   RSI
========================= */

function rsi(
  closes,
  period = 14
) {

  if (
    closes.length <= period
  ) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (
    let i = 1;
    i <= period;
    i++
  ) {

    const change =
      closes[i] -
      closes[i - 1];

    if (change >= 0) {
      gains += change;
    } else {
      losses +=
        Math.abs(change);
    }
  }

  let avgGain =
    gains / period;

  let avgLoss =
    losses / period;

  for (
    let i = period + 1;
    i < closes.length;
    i++
  ) {

    const change =
      closes[i] -
      closes[i - 1];

    const gain =
      Math.max(
        change,
        0
      );

    const loss =
      Math.max(
        -change,
        0
      );

    avgGain =
      (
        avgGain *
        (period - 1) +
        gain
      ) /
      period;

    avgLoss =
      (
        avgLoss *
        (period - 1) +
        loss
      ) /
      period;
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs =
    avgGain / avgLoss;

  return (
    100 -
    100 / (1 + rs)
  );
}


/* =========================
   MACD
========================= */

function macd(closes) {

  if (
    closes.length < 40
  ) {
    return {
      value: null,
      signal: null,
      histogram: null,
      bullish: false
    };
  }

  const values = [];

  for (
    let i = 26;
    i <= closes.length;
    i++
  ) {

    const part =
      closes.slice(0, i);

    values.push(
      ema(part, 12) -
      ema(part, 26)
    );
  }

  const value =
    values.at(-1);

  const signal =
    ema(values, 9);

  const histogram =
    value - signal;

  return {
    value,
    signal,
    histogram,

    bullish:
      value > signal &&
      histogram > 0
  };
}


/* =========================
   ATR
========================= */

function atr(
  candles,
  period = 14
) {

  if (
    candles.length <= period
  ) {
    return null;
  }

  const ranges = [];

  for (
    let i = 1;
    i < candles.length;
    i++
  ) {

    const current =
      candles[i];

    const previous =
      candles[i - 1];

    ranges.push(
      Math.max(

        current.high -
        current.low,

        Math.abs(
          current.high -
          previous.close
        ),

        Math.abs(
          current.low -
          previous.close
        )
      )
    );
  }

  return average(
    ranges.slice(-period)
  );
}


/* =========================
   BOLLINGER
========================= */

function bollinger(closes) {

  const values =
    closes.slice(-20);

  if (
    values.length < 20
  ) {
    return null;
  }

  const middle =
    average(values);

  const variance =
    average(
      values.map(
        value =>
          (
            value -
            middle
          ) ** 2
      )
    );

  const deviation =
    Math.sqrt(variance);

  return {
    middle,

    upper:
      middle +
      deviation * 2,

    lower:
      middle -
      deviation * 2
  };
}


/* =========================
   OKX COİN LİSTESİ
========================= */

async function getSymbols() {

  const tickers =
    await getJSON(
      `${OKX}/api/v5/market/tickers?instType=SPOT`
    );

  const excluded =
    new Set([
      "USDC",
      "USDT",
      "DAI",
      "EUR",
      "USD"
    ]);

  return tickers
    .filter(item => {

      const symbol =
        String(
          item.instId || ""
        );

      if (
        !symbol.endsWith(
          "-USDT"
        )
      ) {
        return false;
      }

      const base =
        symbol.replace(
          "-USDT",
          ""
        );

      if (
        excluded.has(base)
      ) {
        return false;
      }

      const volumeUsd =
        Number(item.volCcy24h);

      return (
        Number.isFinite(
          volumeUsd
        ) &&
        volumeUsd >=
          200_000
      );
    })

    .sort(
      (a, b) =>
        Number(
          b.volCcy24h
        ) -
        Number(
          a.volCcy24h
        )
    )


    .map(
      item =>
        item.instId
    );
}
/* =========================
   KUCOIN COİN LİSTESİ
========================= */

async function getKucoinSymbols() {

  const data =
    await getKucoinJSON(
      `${KUCOIN}/api/v1/market/allTickers`
    );

  const tickers =
    Array.isArray(data?.ticker)
      ? data.ticker
      : [];

  const excluded =
    new Set([
      "USDC",
      "USDT",
      "DAI",
      "EUR",
      "USD"
    ]);

  return tickers
    .filter(item => {

      const symbol =
        String(
          item.symbol || ""
        );

      if (
        !symbol.endsWith("-USDT")
      ) {
        return false;
      }

      const base =
        symbol.replace(
          "-USDT",
          ""
        );

      if (
        excluded.has(base)
      ) {
        return false;
      }

      /*
        KuCoin volValue:
        24 saatlik işlem hacminin
        USDT karşılığıdır.
      */

      const volumeUsd =
        Number(
          item.volValue
        );

      return (
        Number.isFinite(volumeUsd) &&
        volumeUsd >= 200_000
      );
    })

    .sort(
      (a, b) =>
        Number(b.volValue) -
        Number(a.volValue)
    )

    .map(item => ({
      symbol:
        item.symbol,

      source:
        "KUCOIN"
    }));
}
/* =========================
   GATE.IO COİN LİSTESİ
========================= */

async function getGateSymbols() {

  const tickers =
    await getGateJSON(
      `${GATE}/spot/tickers`
    );

  const excluded =
    new Set([
      "USDC",
      "USDT",
      "DAI",
      "EUR",
      "USD"
    ]);

  return tickers
    .filter(item => {

      const symbol =
        String(
          item.currency_pair || ""
        );

      if (
        !symbol.endsWith("_USDT")
      ) {
        return false;
      }

      const base =
        symbol.replace(
          "_USDT",
          ""
        );

      if (
        excluded.has(base)
      ) {
        return false;
      }

      /*
        quote_volume:
        24 saatlik USDT işlem hacmi.
      */

      const volumeUsd =
        Number(
          item.quote_volume
        );

      return (
        Number.isFinite(volumeUsd) &&
        volumeUsd >= 200_000
      );
    })

    .sort(
      (a, b) =>
        Number(b.quote_volume) -
        Number(a.quote_volume)
    )

    .map(item => ({
      symbol:
        item.currency_pair,

      source:
        "GATE"
    }));
}
/* =========================
   OKX GÜNLÜK MUMLAR
========================= */

async function getCandles(symbol) {

  const data =
    await getJSON(
      `${OKX}/api/v5/market/history-candles` +
      `?instId=${encodeURIComponent(symbol)}` +
      `&bar=1Dutc` +
      `&limit=230`
    );

  /*
    OKX yeni mumu önce gönderir.
    Teknik analiz için eski -> yeni
    sırasına çeviriyoruz.
  */

  return data
    .map(row => ({
      time:
        Number(row[0]),

      open:
        Number(row[1]),

      high:
        Number(row[2]),

      low:
        Number(row[3]),

      close:
        Number(row[4]),

      volume:
        Number(row[5])
    }))

    .reverse();
}
/* =========================
   OKX 1 DAKİKALIK MUMLAR
========================= */

async function getOKXMinuteCandles(
  symbol
) {

  const data =
    await getJSON(
      `${OKX}/api/v5/market/candles` +
      `?instId=${encodeURIComponent(symbol)}` +
      `&bar=1m` +
      `&limit=40`
    );

  return data
    .map(row => ({
      time:
        Number(row[0]),

      open:
        Number(row[1]),

      high:
        Number(row[2]),

      low:
        Number(row[3]),

      close:
        Number(row[4]),

      volume:
        Number(row[5])
    }))
    .reverse();
}
/* =========================
   KUCOIN GÜNLÜK MUMLAR
========================= */

async function getKucoinCandles(symbol) {

  const endAt =
    Math.floor(Date.now() / 1000);

  const startAt =
    endAt - (260 * 24 * 60 * 60);

  const data =
    await getKucoinJSON(
      `${KUCOIN}/api/v1/market/candles` +
      `?type=1day` +
      `&symbol=${encodeURIComponent(symbol)}` +
      `&startAt=${startAt}` +
      `&endAt=${endAt}`
    );

  const list =
    Array.isArray(data)
      ? data
      : [];

  /*
    KuCoin mumları yeni -> eski
    sırasıyla gönderir.

    Analiz sistemi eski -> yeni
    sırası kullandığı için
    ters çeviriyoruz.
  */

  return list
    .slice(0, 230)
    .map(row => ({
      time:
        Number(row[0]) * 1000,

      open:
        Number(row[1]),

      close:
        Number(row[2]),

      high:
        Number(row[3]),

      low:
        Number(row[4]),

      volume:
        Number(row[5])
    }))
    .reverse();
}
/* =========================
   KUCOIN 1 DAKİKALIK MUMLAR
========================= */

async function getKucoinMinuteCandles(
  symbol
) {

  const endAt =
    Math.floor(
      Date.now() / 1000
    );

  const startAt =
    endAt -
    (45 * 60);

  const data =
    await getKucoinJSON(
      `${KUCOIN}/api/v1/market/candles` +
      `?type=1min` +
      `&symbol=${encodeURIComponent(symbol)}` +
      `&startAt=${startAt}` +
      `&endAt=${endAt}`
    );

  const list =
    Array.isArray(data)
      ? data
      : [];

  return list
    .slice(0, 40)
    .map(row => ({
      time:
        Number(row[0]) * 1000,

      open:
        Number(row[1]),

      close:
        Number(row[2]),

      high:
        Number(row[3]),

      low:
        Number(row[4]),

      volume:
        Number(row[5])
    }))
    .reverse();
}
/* =========================
   GATE.IO GÜNLÜK MUMLAR
========================= */

async function getGateCandles(symbol) {

  const data =
    await getGateJSON(
      `${GATE}/spot/candlesticks` +
      `?currency_pair=${encodeURIComponent(symbol)}` +
      `&interval=1d` +
      `&limit=230`
    );

  /*
    Gate.io verisini analiz motorunun
    kullandığı biçime dönüştürüyoruz.
  */

  return data
    .map(row => ({
      time:
        Number(row[0]) * 1000,

      volume:
        Number(row[1]),

      close:
        Number(row[2]),

      high:
        Number(row[3]),

      low:
        Number(row[4]),

      open:
        Number(row[5])
    }))
    .sort(
      (a, b) =>
        a.time - b.time
    );
}
/* =========================
   GATE.IO 1 DAKİKALIK MUMLAR
========================= */

async function getGateMinuteCandles(
  symbol
) {

  const data =
    await getGateJSON(
      `${GATE}/spot/candlesticks` +
      `?currency_pair=${encodeURIComponent(symbol)}` +
      `&interval=1m` +
      `&limit=40`
    );

  return data
    .map(row => ({
      time:
        Number(row[0]) * 1000,

      volume:
        Number(row[1]),

      close:
        Number(row[2]),

      high:
        Number(row[3]),

      low:
        Number(row[4]),

      open:
        Number(row[5])
    }))
    .sort(
      (a, b) =>
        a.time - b.time
    );
}
/* =========================
   ANLIK YÜKSELİŞ RADARI
========================= */

function analyzeMinuteRise(
  symbol,
  candles,
  source
) {

  if (
    !Array.isArray(candles) ||
    candles.length < 30
  ) {
    return null;
  }

  const data =
    candles
      .slice(-60)
      .map(c => ({
        time: Number(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume) || 0
      }))
      .filter(c =>
        Number.isFinite(c.close) &&
        c.close > 0
      );

  if (data.length < 30) {
    return null;
  }

  const last =
    data.at(-1);

  const price =
    last.close;


  /* =========================
     YARDIMCI FONKSİYONLAR
  ========================= */

  function avg(values) {

    const valid =
      values.filter(
        Number.isFinite
      );

    if (!valid.length) {
      return 0;
    }

    return (
      valid.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / valid.length
    );
  }


  function percentChange(
    current,
    previous
  ) {

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(previous) ||
      previous <= 0
    ) {
      return 0;
    }

    return (
      (
        current - previous
      ) /
      previous
    ) * 100;
  }


  function change(minutes) {

    if (
      data.length <
      minutes + 1
    ) {
      return 0;
    }

    return percentChange(
      price,
      data.at(
        -(minutes + 1)
      ).close
    );
  }


  function ema(
    values,
    period
  ) {

    if (
      !Array.isArray(values) ||
      !values.length
    ) {
      return 0;
    }

    const k =
      2 / (period + 1);

    let value =
      values[0];

    for (
      let i = 1;
      i < values.length;
      i++
    ) {

      value =
        values[i] * k +
        value * (1 - k);
    }

    return value;
  }


  function rsi(
    values,
    period = 14
  ) {

    if (
      values.length <
      period + 1
    ) {
      return 50;
    }

    const sample =
      values.slice(
        -(period + 1)
      );

    let gains = 0;
    let losses = 0;

    for (
      let i = 1;
      i < sample.length;
      i++
    ) {

      const difference =
        sample[i] -
        sample[i - 1];

      if (difference > 0) {
        gains += difference;
      } else {
        losses +=
          Math.abs(difference);
      }
    }

    const averageGain =
      gains / period;

    const averageLoss =
      losses / period;

    if (averageLoss === 0) {
      return 100;
    }

    const rs =
      averageGain /
      averageLoss;

    return (
      100 -
      100 / (1 + rs)
    );
  }


  /* =========================
     FİYAT DEĞİŞİMLERİ
  ========================= */

  const change1 =
    change(1);

  const change2 =
    change(2);

  const change3 =
    change(3);

  const change5 =
    change(5);

  const change10 =
    change(10);

  const change15 =
    change(15);


  const priceAcceleration =
    change1 -
    change5 / 5;


  const acceleration3 =
    change3 / 3 -
    change10 / 10;


  /* =========================
     HACİM
  ========================= */

  const volumes =
    data.map(
      c => c.volume
    );


  const baselineVolumes =
    volumes.slice(
      -23,
      -3
    );


  const recentVolumes =
    volumes.slice(-3);


  const baselineVolume =
    avg(
      baselineVolumes
    );


  const recentVolume =
    avg(
      recentVolumes
    );


  const volumeAcceleration =
    baselineVolume > 0
      ? recentVolume /
        baselineVolume
      : 0;


  const lastVolumeRatio =
    baselineVolume > 0
      ? last.volume /
        baselineVolume
      : 0;


  /* =========================
     MUM GÖVDESİ
  ========================= */

  function bodySize(candle) {

    return Math.abs(
      candle.close -
      candle.open
    );
  }


  const oldBodies =
    data
      .slice(-18, -3)
      .map(bodySize);


  const recentBodies =
    data
      .slice(-3)
      .map(bodySize);


  const oldBodyAverage =
    avg(oldBodies);


  const recentBodyAverage =
    avg(recentBodies);


  const bodyExpansion =
    oldBodyAverage > 0
      ? recentBodyAverage /
        oldBodyAverage
      : 0;


  const greenCandles =
    data
      .slice(-5)
      .filter(
        c =>
          c.close >
          c.open
      ).length;


  /* =========================
     EMA 7 / EMA 25
  ========================= */

  const closes =
    data.map(
      c => c.close
    );


  const ema7 =
    ema(
      closes,
      7
    );


  const ema25 =
    ema(
      closes,
      25
    );


  const previousCloses =
    closes.slice(
      0,
      -3
    );


  const ema7Previous =
    ema(
      previousCloses,
      7
    );


  const ema25Previous =
    ema(
      previousCloses,
      25
    );


  const ema7Slope =
    percentChange(
      ema7,
      ema7Previous
    );


  const emaSpread =
    percentChange(
      ema7,
      ema25
    );


  const previousSpread =
    percentChange(
      ema7Previous,
      ema25Previous
    );


  const emaSpreadAcceleration =
    emaSpread -
    previousSpread;


  /* =========================
     RSI
  ========================= */

  const rsiNow =
    rsi(
      closes,
      14
    );


  const rsiPrevious =
    rsi(
      closes.slice(
        0,
        -3
      ),
      14
    );


  const rsiAcceleration =
    rsiNow -
    rsiPrevious;


  /* =========================
     MACD
  ========================= */

  function macdHistogram(
    values
  ) {

    if (values.length < 26) {
      return 0;
    }

    const fast =
      ema(
        values,
        12
      );

    const slow =
      ema(
        values,
        26
      );

    return fast - slow;
  }


  const macdNow =
    macdHistogram(
      closes
    );


  const macdPrevious =
    macdHistogram(
      closes.slice(
        0,
        -3
      )
    );


  const macdAcceleration =
    macdNow -
    macdPrevious;


  /* =========================
     SIKIŞMA / DURAĞANLIK
  ========================= */

  const compressionWindow =
    data.slice(
      -23,
      -3
    );


  const compressionHigh =
    Math.max(
      ...compressionWindow.map(
        c => c.high
      )
    );


  const compressionLow =
    Math.min(
      ...compressionWindow.map(
        c => c.low
      )
    );


  const compressionRange =
    compressionLow > 0
      ? (
          (
            compressionHigh -
            compressionLow
          ) /
          compressionLow
        ) * 100
      : 0;


  const wasCompressed =
    compressionRange <= 3.0;


  /* =========================
     YÜKSEK TEPE / YÜKSEK DİP
  ========================= */

  const recent5 =
    data.slice(-5);


  let higherStructure =
    0;


  for (
    let i = 1;
    i < recent5.length;
    i++
  ) {

    if (
      recent5[i].high >
      recent5[i - 1].high
    ) {
      higherStructure += 1;
    }

    if (
      recent5[i].low >
      recent5[i - 1].low
    ) {
      higherStructure += 1;
    }
  }


  /* =========================
     ERKEN HAREKET PUANI
  ========================= */

  let score = 0;


  if (wasCompressed) {
    score += 8;
  }


  if (
    volumeAcceleration >= 1.3
  ) {
    score += 8;
  }

  if (
    volumeAcceleration >= 2
  ) {
    score += 7;
  }

  if (
    lastVolumeRatio >= 3
  ) {
    score += 5;
  }


  if (
    bodyExpansion >= 1.4
  ) {
    score += 7;
  }

  if (
    bodyExpansion >= 2.2
  ) {
    score += 5;
  }


  if (
    greenCandles >= 3
  ) {
    score += 5;
  }


  if (
    ema7Slope > 0
  ) {
    score += 6;
  }

  if (
    emaSpreadAcceleration > 0
  ) {
    score += 7;
  }

  if (
    ema7 > ema25
  ) {
    score += 5;
  }


  if (
    rsiNow >= 50 &&
    rsiNow <= 72
  ) {
    score += 5;
  }

  if (
    rsiAcceleration >= 3
  ) {
    score += 6;
  }


  if (
    macdAcceleration > 0
  ) {
    score += 7;
  }


  if (
    change1 >= 0.20
  ) {
    score += 5;
  }

  if (
    change3 >= 0.50
  ) {
    score += 5;
  }

  if (
    change5 >= 0.80
  ) {
    score += 5;
  }


  if (
    priceAcceleration > 0
  ) {
    score += 5;
  }


  if (
    acceleration3 > 0
  ) {
    score += 4;
  }


  if (
    higherStructure >= 5
  ) {
    score += 5;
  }


  score =
    Math.min(
      100,
      score
    );


  /* =========================
     HAREKETİN AŞAMASI
  ========================= */

  let stage =
    "DURAĞAN";

  let stageNumber =
    0;


  const lateMove =
    change15 >= 8 ||
    change10 >= 7 ||
    (
      change5 >= 5 &&
      rsiNow >= 75
    );


  const momentumWeakening =
    change15 >= 5 &&
    (
      priceAcceleration < 0 ||
      macdAcceleration < 0 ||
      rsiAcceleration < -3
    );


  if (lateMove) {

    stage =
      momentumWeakening
        ? "ZİRVE RİSKİ"
        : "GEÇ KALINDI";

    stageNumber = 5;

  } else if (
    score >= 82 &&
    change5 >= 1.5 &&
    volumeAcceleration >= 1.5
  ) {

    stage =
      "YÜKSELİŞ TEYİDİ";

    stageNumber = 4;

  } else if (
    score >= 70
  ) {

    stage =
      "YÜKSELİŞ BAŞLIYOR";

    stageNumber = 3;

  } else if (
    score >= 55
  ) {

    stage =
      "ERKEN HAREKET";

    stageNumber = 2;

  } else if (
    (
      wasCompressed &&
      volumeAcceleration >= 1.2
    ) ||
    (
      ema7Slope > 0 &&
      bodyExpansion >= 1.2
    )
  ) {

    stage =
      "UYANIYOR";

    stageNumber = 1;
  }


  /*
    Zirve riski ayrıca
    mevcut güçlü hareketin
    zayıflamasını gösterir.
  */

  if (
    !lateMove &&
    momentumWeakening
  ) {

    stage =
      "HAREKET ZAYIFLIYOR";

    stageNumber = 5;
  }


  const signalLevel =
    stage;


  /*
    Radar artık erken aşamayı da
    gösterebilir. Durağan coinleri
    sonuç listesine almıyoruz.
  */

  const qualifies =
    stageNumber >= 1;


  return {

    symbol,
    source,
    price,

    change1,
    change2,
    change3,
    change5,
    change10,
    change15,

    volumeAcceleration,
    lastVolumeRatio,

    bodyExpansion,
    greenCandles,

    ema7,
    ema25,
    ema7Slope,
    emaSpread,
    emaSpreadAcceleration,

    rsi:
      rsiNow,

    rsiAcceleration,

    macd:
      macdNow,

    macdAcceleration,

    compressionRange,
    wasCompressed,

    higherStructure,

    priceAcceleration,
    acceleration3,

    score,

    stage,
    stageNumber,

    signalLevel,

    lateMove,
    momentumWeakening,

    qualifies
  };
}
/* =========================
   SENARYO 1
   SESSİZLİK VE SIKIŞMA
========================= */

function analyzeScenario1(
  symbol,
  candles,
  source
) {

  if (
    !Array.isArray(candles) ||
    candles.length < 30
  ) {
    return null;
  }

  const data =
    candles.slice(-40);

  const current =
    data.at(-1);

  const price =
    Number(current.close);

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return null;
  }


  const closes =
    data.map(
      c => Number(c.close)
    );

  const highs =
    data.map(
      c => Number(c.high)
    );

  const lows =
    data.map(
      c => Number(c.low)
    );


  /*
    1. VOLATİLİTE
  */

  function rangePercent(
    candles
  ) {

    if (!candles.length) {
      return 0;
    }

    const high =
      Math.max(
        ...candles.map(
          c => Number(c.high)
        )
      );

    const low =
      Math.min(
        ...candles.map(
          c => Number(c.low)
        )
      );

    if (low <= 0) {
      return 0;
    }

    return (
      (
        high - low
      ) /
      low
    ) * 100;
  }


  const recent10 =
    data.slice(-10);

  const previous20 =
    data.slice(-30, -10);


  const recentRange =
    rangePercent(
      recent10
    );

  const previousRange =
    rangePercent(
      previous20
    );


  const volatilityRatio =
    previousRange > 0
      ? recentRange /
        previousRange
      : 1;


  const volatilityFalling =
    volatilityRatio <= 0.70;


  /*
    2. BOLLINGER BANT GENİŞLİĞİ
  */

  function standardDeviation(
    values
  ) {

    if (!values.length) {
      return 0;
    }

    const mean =
      values.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      values.length;


    const variance =
      values.reduce(
        (sum, value) =>
          sum +
          Math.pow(
            value - mean,
            2
          ),
        0
      ) /
      values.length;


    return Math.sqrt(
      variance
    );
  }


  function bollingerWidth(
    values
  ) {

    if (values.length < 20) {
      return 0;
    }

    const sample =
      values.slice(-20);

    const middle =
      sample.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      sample.length;


    const sd =
      standardDeviation(
        sample
      );


    if (middle <= 0) {
      return 0;
    }


    const upper =
      middle +
      2 * sd;

    const lower =
      middle -
      2 * sd;


    return (
      (
        upper - lower
      ) /
      middle
    ) * 100;
  }


  const currentBollingerWidth =
    bollingerWidth(
      closes
    );


  const oldBollingerWidth =
    bollingerWidth(
      closes.slice(
        0,
        -10
      )
    );


  const bollingerRatio =
    oldBollingerWidth > 0
      ? currentBollingerWidth /
        oldBollingerWidth
      : 1;


  const bollingerSqueeze =
    bollingerRatio <= 0.80;


  /*
    3. ATR
  */

  function trueRange(
    candle,
    previousClose
  ) {

    return Math.max(
      Number(candle.high) -
        Number(candle.low),

      Math.abs(
        Number(candle.high) -
        previousClose
      ),

      Math.abs(
        Number(candle.low) -
        previousClose
      )
    );
  }


  const trueRanges = [];


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    trueRanges.push(
      trueRange(
        data[i],
        Number(
          data[i - 1].close
        )
      )
    );
  }


  const recentATR =
    trueRanges
      .slice(-10)
      .reduce(
        (sum, value) =>
          sum + value,
        0
      ) / 10;


  const previousATRValues =
    trueRanges.slice(
      -30,
      -10
    );


  const previousATR =
    previousATRValues.length
      ? previousATRValues.reduce(
          (sum, value) =>
            sum + value,
          0
        ) /
        previousATRValues.length
      : 0;


  const atrRatio =
    previousATR > 0
      ? recentATR /
        previousATR
      : 1;


  const atrLow =
    atrRatio <= 0.75;


  /*
    4. DAR FİYAT ALANI
  */

  const narrowRange =
    recentRange <= 2.0;


  /*
    5. DİRENÇ TESTİ
  */

  const resistanceWindow =
    data.slice(-20);


  const resistance =
    Math.max(
      ...resistanceWindow.map(
        c => Number(c.high)
      )
    );


  const resistanceTolerance =
    resistance * 0.006;


  let resistanceTests = 0;


  for (
    const candle
    of resistanceWindow
  ) {

    const high =
      Number(candle.high);

    if (
      Math.abs(
        resistance - high
      ) <=
      resistanceTolerance
    ) {

      resistanceTests += 1;
    }
  }


  const repeatedResistance =
    resistanceTests >= 3;


  const distanceToResistance =
    resistance > 0
      ? (
          (
            resistance - price
          ) /
          resistance
        ) * 100
      : 0;


  /*
    PUAN
  */

  let score = 0;


  if (volatilityFalling) {
    score += 20;
  }


  if (bollingerSqueeze) {
    score += 20;
  }


  if (atrLow) {
    score += 20;
  }


  if (narrowRange) {
    score += 20;
  }


  if (repeatedResistance) {
    score += 20;
  }


  /*
    SINIFLANDIRMA
  */

  let status =
    "ZAYIF SIKIŞMA";


  if (score >= 80) {

    status =
      "SIKIŞMA GÜÇLÜ";

  } else if (
    score >= 60
  ) {

    status =
      "SIKIŞMA OLUŞUYOR";

  } else if (
    score >= 40
  ) {

    status =
      "SIKIŞMA ADAYI";
  }


  /*
    Sadece anlamlı adayları
    Senaryo 1 ekranına gönder.
  */

  const qualifies =
    score >= 40;


  return {

    symbol,

    source,

    price,

    score,

    status,

    volatilityFalling,

    volatilityRatio,

    recentRange,

    previousRange,

    bollingerSqueeze,

    bollingerWidth:
      currentBollingerWidth,

    bollingerRatio,

    atrLow,

    atrRatio,

    narrowRange,

    resistance,

    resistanceTests,

    repeatedResistance,

    distanceToResistance,

    qualifies
  };
}
/* =========================
   SENARYO 2
   PARA VE EMİR AKIŞI
========================= */

async function analyzeScenario2Gate(
  symbol,
  candles
) {

  if (
    !Array.isArray(candles) ||
    candles.length < 10
  ) {
    return null;
  }


  const last =
    candles.at(-1);

  const old =
    candles.at(-6);


  const price =
    Number(last.close);

  const oldPrice =
    Number(old.close);


  if (
    !Number.isFinite(price) ||
    !Number.isFinite(oldPrice) ||
    oldPrice <= 0
  ) {
    return null;
  }


  /*
    ÖN ELEME

    Son 5 dakikadaki hareket
    henüz erken bölgede olmalı.
  */

  const priceChange5 =
    (
      (
        price -
        oldPrice
      ) /
      oldPrice
    ) * 100;


  if (
    priceChange5 < 0.20 ||
    priceChange5 > 1.50
  ) {
    return null;
  }


  /*
    SON İŞLEMLER
  */

  const trades =
    await getGateJSON(
      `${GATE}/spot/trades` +
      `?currency_pair=${encodeURIComponent(symbol)}` +
      `&limit=200`
    );


  /*
    EMİR DEFTERİ
  */

  const response =
    await fetch(
      `${GATE}/spot/order_book` +
      `?currency_pair=${encodeURIComponent(symbol)}` +
      `&limit=20`,
      {
        headers: {
          "Accept":
            "application/json"
        },

        signal:
          AbortSignal.timeout(
            15000
          )
      }
    );


  if (!response.ok) {

    throw new Error(
      `Gate.io order book HTTP ${response.status}`
    );
  }


  const book =
    await response.json();


  const bids =
    Array.isArray(book.bids)
      ? book.bids
      : [];


  const asks =
    Array.isArray(book.asks)
      ? book.asks
      : [];


  if (
    !trades.length ||
    !bids.length ||
    !asks.length
  ) {
    return null;
  }


  /*
    ALIŞ / SATIŞ HACMİ
  */

  let buyVolume = 0;
  let sellVolume = 0;

  let buyTrades = 0;
  let sellTrades = 0;


  let oldestTime =
    Date.now();

  let newestTime =
    0;


  for (
    const trade
    of trades
  ) {

    const amount =
      Number(
        trade.amount
      ) || 0;


    const tradePrice =
      Number(
        trade.price
      ) || 0;


    const value =
      amount *
      tradePrice;


    /*
      Gate.io trade side:
      buy / sell
    */

    if (
      trade.side === "buy"
    ) {

      buyVolume +=
        value;

      buyTrades += 1;

    } else {

      sellVolume +=
        value;

      sellTrades += 1;
    }


    const time =
      Number(
        trade.create_time_ms
      ) ||
      Number(
        trade.create_time
      ) * 1000;


    if (
      Number.isFinite(time)
    ) {

      oldestTime =
        Math.min(
          oldestTime,
          time
        );

      newestTime =
        Math.max(
          newestTime,
          time
        );
    }
  }


  const totalVolume =
    buyVolume +
    sellVolume;


  const buyerRatio =
    totalVolume > 0
      ? buyVolume /
        totalVolume
      : 0;


  /*
    İŞLEM / SANİYE
  */

  const seconds =
    Math.max(
      1,
      (
        newestTime -
        oldestTime
      ) / 1000
    );


  const tradesPerSecond =
    trades.length /
    seconds;


  /*
    HACİM / SANİYE
  */

  const volumePerSecond =
    totalVolume /
    seconds;


  /*
    BID / ASK DERİNLİĞİ
    İlk 10 kademe.
  */

  const bidDepth =
    bids
      .slice(0, 10)
      .reduce(
        (
          sum,
          row
        ) => {

          return (
            sum +
            Number(row[0]) *
            Number(row[1])
          );
        },
        0
      );


  const askDepth =
    asks
      .slice(0, 10)
      .reduce(
        (
          sum,
          row
        ) => {

          return (
            sum +
            Number(row[0]) *
            Number(row[1])
          );
        },
        0
      );


  const bidAskRatio =
    askDepth > 0
      ? bidDepth /
        askDepth
      : 0;


  /*
    SPREAD
  */

  const bestBid =
    Number(
      bids[0][0]
    );


  const bestAsk =
    Number(
      asks[0][0]
    );


  const middle =
    (
      bestBid +
      bestAsk
    ) / 2;


  const spreadPercent =
    middle > 0
      ? (
          (
            bestAsk -
            bestBid
          ) /
          middle
        ) * 100
      : 0;


  /*
    PUAN
  */

  let score = 0;


  if (
    buyerRatio >= 0.55
  ) {
    score += 15;
  }


  if (
    buyerRatio >= 0.65
  ) {
    score += 10;
  }


  if (
    tradesPerSecond >= 1
  ) {
    score += 10;
  }


  if (
    tradesPerSecond >= 3
  ) {
    score += 10;
  }


  if (
    bidAskRatio >= 1.20
  ) {
    score += 15;
  }


  if (
    bidAskRatio >= 1.60
  ) {
    score += 10;
  }


  if (
    spreadPercent <= 0.20
  ) {
    score += 10;
  }


  if (
    priceChange5 >= 0.30 &&
    priceChange5 <= 1.00
  ) {
    score += 10;
  }


  if (
    volumePerSecond > 0
  ) {
    score += 10;
  }


  score =
    Math.min(
      score,
      100
    );


  let status =
    "PARA AKIŞI ZAYIF";


  if (
    score >= 80
  ) {

    status =
      "PARA AKIŞI GÜÇLÜ";

  } else if (
    score >= 60
  ) {

    status =
      "ALICILAR GÜÇLENİYOR";

  } else if (
    score >= 40
  ) {

    status =
      "PARA GİRİŞİ BAŞLIYOR";
  }


  const qualifies =
    score >= 40;


  return {

    symbol:
      symbol.replace(
        "_USDT",
        "/USDT"
      ),

    source:
      "GATE.IO",

    price,

    priceChange5,

    score,

    status,

    buyerRatio:
      buyerRatio * 100,

    buyVolume,

    sellVolume,

    buyTrades,

    sellTrades,

    tradesPerSecond,

    volumePerSecond,

    bidDepth,

    askDepth,

    bidAskRatio,

    bestBid,

    bestAsk,

    spreadPercent,

    qualifies
  };
}
/* =========================
   RADAR SİNYAL YÖNETİMİ
========================= */

function updateMinuteRadarState(
  result,
  candleTime
) {

  if (!result) {
    return null;
  }

  const key =
    `${result.source}:${result.symbol}`;

  let state =
    minuteRadarState.get(key);


  /*
    Henüz radar aşamasına
    girmemiş coin.
  */

  if (!result.qualifies) {

    /*
      Daha önce hareket başlamışsa
      hemen hafızadan silmiyoruz.

      Böylece hareket bittikten sonra
      sonucu değerlendirebiliriz.
    */

    if (state) {

      state.inactiveCandles =
        (state.inactiveCandles || 0) + 1;

      /*
        5 mum boyunca tekrar
        canlanmazsa kaldır.
      */

      if (
        state.inactiveCandles >= 5
      ) {

        minuteRadarState.delete(
          key
        );

        return null;
      }

      minuteRadarState.set(
        key,
        state
      );
    }

    return null;
  }


  /*
    İLK YAKALAMA
  */

  if (!state) {

    state = {

      startedAt:
        Date.now(),

      firstCandleTime:
        candleTime,

      lastCandleTime:
        candleTime,

      startPrice:
        result.price,

      lowestPrice:
        result.price,

      highestPrice:
        result.price,

      candlesAlive:
        0,

      inactiveCandles:
        0,

      highestScore:
        result.score,

      firstScore:
        result.score,

      firstStage:
        result.stage,

      lastStage:
        result.stage,

      highestStageNumber:
        result.stageNumber || 0,

      stageChangedAt:
        Date.now()
    };


    minuteRadarState.set(
      key,
      state
    );


    return {

      ...result,

      signal:
        result.stage,

      isNew:
        true,

      levelChanged:
        false,

      candlesAlive:
        0,

      movementAge:
        0,

      startPrice:
        state.startPrice,

      moveFromStart:
        0,

      maxMoveFromStart:
        0,

      pullbackFromPeak:
        0,

      highestScore:
        state.highestScore,

      firstStage:
        state.firstStage
    };
  }


  /*
    Coin yeniden aktif.
  */

  state.inactiveCandles =
    0;


  /*
    YENİ 1 DAKİKALIK MUM
  */

  if (
    state.lastCandleTime !==
    candleTime
  ) {

    state.candlesAlive += 1;

    state.lastCandleTime =
      candleTime;
  }


  /*
    FİYAT GEÇMİŞİ
  */

  state.highestPrice =
    Math.max(
      state.highestPrice ||
        result.price,
      result.price
    );


  state.lowestPrice =
    Math.min(
      state.lowestPrice ||
        result.price,
      result.price
    );


  /*
    BAŞLANGIÇTAN İTİBAREN
    HAREKET
  */

  const moveFromStart =
    state.startPrice > 0
      ? (
          (
            result.price -
            state.startPrice
          ) /
          state.startPrice
        ) * 100
      : 0;


  const maxMoveFromStart =
    state.startPrice > 0
      ? (
          (
            state.highestPrice -
            state.startPrice
          ) /
          state.startPrice
        ) * 100
      : 0;


  /*
    ZİRVEDEN GERİ ÇEKİLME
  */

  const pullbackFromPeak =
    state.highestPrice > 0
      ? (
          (
            result.price -
            state.highestPrice
          ) /
          state.highestPrice
        ) * 100
      : 0;


  /*
    EN YÜKSEK PUAN
  */

  state.highestScore =
    Math.max(
      state.highestScore || 0,
      result.score
    );


  /*
    AŞAMA DEĞİŞİMİ
  */

  const levelChanged =
    state.lastStage !==
    result.stage;


  if (levelChanged) {

    state.stageChangedAt =
      Date.now();
  }


  state.lastStage =
    result.stage;


  state.highestStageNumber =
    Math.max(
      state.highestStageNumber || 0,
      result.stageNumber || 0
    );


  /*
    HAREKET YAŞI

    Her mum 1 dakika.
  */

  const movementAge =
    state.candlesAlive;


  /*
    EK ZİRVE KONTROLÜ

    Analiz motorunun verdiği
    uyarıya ek olarak zirveden
    belirgin geri çekilme varsa
    riski artır.
  */

  let finalStage =
    result.stage;


  if (
    maxMoveFromStart >= 5 &&
    pullbackFromPeak <= -2.5
  ) {

    finalStage =
      "ZİRVE RİSKİ";
  }


  /*
    Hareket çok ilerlediyse
    yeni alım fırsatı gibi
    göstermiyoruz.
  */

  if (
    finalStage !==
      "ZİRVE RİSKİ" &&
    (
      result.change15 >= 8 ||
      maxMoveFromStart >= 10
    )
  ) {

    finalStage =
      "GEÇ KALINDI";
  }


  /*
    Maksimum takip süresi:
    60 adet 1 dakikalık mum.

    Böylece RVN/NIL gibi
    daha uzun hareketleri de
    izleyebiliriz.
  */

  if (
    state.candlesAlive >= 60
  ) {

    minuteRadarState.delete(
      key
    );

    return null;
  }


  minuteRadarState.set(
    key,
    state
  );


  return {

    ...result,

    stage:
      finalStage,

    signal:
      finalStage,

    isNew:
      false,

    levelChanged,

    candlesAlive:
      state.candlesAlive,

    movementAge,

    startPrice:
      state.startPrice,

    currentPrice:
      result.price,

    highestPrice:
      state.highestPrice,

    lowestPrice:
      state.lowestPrice,

    moveFromStart,

    maxMoveFromStart,

    pullbackFromPeak,

    highestScore:
      state.highestScore,

    firstScore:
      state.firstScore,

    firstStage:
      state.firstStage,

    highestStageNumber:
      state.highestStageNumber,

    signalStartedAt:
      state.startedAt,

    stageChangedAt:
      state.stageChangedAt
  };
}

/* =========================
   COİN ANALİZİ
========================= */

function analyze(
  symbol,
  candles
) {

  if (
    !Array.isArray(candles) ||
    candles.length < 205
  ) {
    return null;
  }

  const closes =
    candles.map(
      candle =>
        candle.close
    );

  const volumes =
    candles.map(
      candle =>
        candle.volume
    );

  const current =
    candles.at(-1);

  const previous =
    candles.at(-2);

  const price =
    current.close;

  const ema20 =
    ema(closes, 20);

  const ema50 =
    ema(closes, 50);

  const ema200 =
    ema(closes, 200);

  const RSI =
    rsi(closes);

  const MACD =
    macd(closes);

  const ATR =
    atr(candles);

  const BB =
    bollinger(closes);


  /* =========================
     HACİM
  ========================= */

  const previousVolumes =
    volumes.slice(
      -21,
      -1
    );

  const avgVolume =
    average(
      previousVolumes
    );

  const volumeRatio =
    avgVolume > 0
      ?
        current.volume /
        avgVolume
      :
        0;


  /* =========================
     DİRENÇ
  ========================= */

  const previous20 =
    candles.slice(
      -21,
      -1
    );

  const resistance =
    Math.max(
      ...previous20.map(
        candle =>
          candle.high
      )
    );

  const support =
    Math.min(
      ...previous20.map(
        candle =>
          candle.low
      )
    );

  const resistanceDistance =
    (
      (
        price -
        resistance
      ) /
      resistance
    ) *
    100;


  /* =========================
     ATR %
  ========================= */

  const atrPct =
    ATR && price
      ?
        (
          ATR /
          price
        ) *
        100
      :
        0;


  /* =========================
     3 GÜNLÜK HAREKET
  ========================= */

  const price3DaysAgo =
    closes.at(-4);

  const change3 =
    (
      (
        price -
        price3DaysAgo
      ) /
      price3DaysAgo
    ) *
    100;


  /* =========================
     PUANLAMA
  ========================= */

  let score = 0;

  const reasons = [];

  function add(
    condition,
    points,
    text
  ) {

    if (!condition) {
      return;
    }

    score += points;

    reasons.push(text);
  }


  /* TREND */

  add(
    price > ema20,
    8,
    "Fiyat EMA20 üzerinde"
  );

  add(
    ema20 > ema50,
    12,
    "EMA20 EMA50 üzerinde"
  );

  add(
    price > ema50,
    8,
    "Fiyat EMA50 üzerinde"
  );

  add(
    price > ema200,
    8,
    "Fiyat EMA200 üzerinde"
  );


  /* RSI */

  add(
    RSI >= 52 &&
    RSI <= 68,
    14,
    "RSI yükselişi destekliyor"
  );


  /* MACD */

  add(
    MACD.bullish,
    14,
    "MACD pozitif"
  );


  /* HACİM */

  add(
    volumeRatio >= 1.30,
    14,
    "Hacim ortalamanın üzerinde"
  );


  /* DİRENÇ */

  add(
    resistanceDistance >=
      -1.5 &&
    resistanceDistance <=
      2,
    10,
    "20 günlük dirence yakın"
  );


  /* BOLLINGER */

  add(
    BB &&
    price >
      BB.middle,
    6,
    "Bollinger orta bandı üzerinde"
  );


  /* MUM */

  add(
    current.close >
      current.open &&
    current.close >
      previous.close,
    6,
    "Son günlük mum pozitif"
  );


  /* =========================
     RİSK CEZALARI
  ========================= */

  if (
    change3 > 15
  ) {

    score -= 10;

    reasons.push(
      "Son 3 günlük hareket fazla uzamış"
    );
  }


  if (
    RSI > 75
  ) {

    score -= 10;

    reasons.push(
      "RSI aşırı alım bölgesinde"
    );
  }


  score =
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    );


  /* =========================
     TREND DURUMU
  ========================= */

  const trend =
    (
      price > ema20 &&
      ema20 > ema50 &&
      price > ema200
    )
      ?
        "bullish"
      :
        "neutral";


  /* =========================
     ZORUNLU YÜKSELİŞ TEYİDİ
  ========================= */

  const extended =
  (
    change3 >= 12 ||
    RSI >= 74
  );


const confirmed =
  (
    !extended &&

    price > ema20 &&

    price > ema50 &&
price > ema200 &&
    RSI >= 50 &&

    RSI < 74 &&

    MACD.bullish &&

    volumeRatio >= 1.15 &&

    score >= 75
  );


const candidate =
  (
    !extended &&
    !confirmed &&

    price > ema20 &&

    RSI >= 47 &&
    RSI < 70 &&

    (
      MACD.bullish ||
      MACD.histogram > 0
    ) &&

    volumeRatio >= 0.90 &&

    score >= 55
  );


let signalType =
  "IZLEME";


if (candidate) {
  signalType =
    "YÜKSELİŞ ADAYI";
}


if (confirmed) {
  signalType =
    "YÜKSELİŞ TEYİDİ";
}


if (extended) {
  signalType =
    "HAREKET İLERLEMİŞ";
}


  return {

    symbol:
      symbol.replace(
        "-USDT",
        "/USDT"
      ),

    price,

    score,

    trend,

    rsi:
      RSI,

    ema20,

    ema50,

    ema200,

    macd:
      MACD.value,

    macdSignal:
      MACD.signal,

    macdHistogram:
      MACD.histogram,

    macdBullish:
      MACD.bullish,

    volumeRatio,

    atr:
      ATR,

    atrPct,

    support,

    resistance,

    resistanceDistance,

    bollingerMiddle:
      BB?.middle ??
      null,

    bollingerUpper:
      BB?.upper ??
      null,

    bollingerLower:
      BB?.lower ??
      null,

    change3,

    confirmed,

candidate,

extended,

signalType,

reasons
  };
}


/* =========================
   PİYASA TARAMASI
========================= */

async function scanMarket() {

  if (scanning) {
    return;
  }

  scanning = true;

  console.log(
    "Bağımsız borsa taraması başladı."
  );

  try {

    /* =========================
       OKX
    ========================= */

    let okxSymbols = [];
    let okxResults = [];
    let okxError = null;

    try {

      okxSymbols =
        await getSymbols();

      const batchSize = 5;

      for (
        let i = 0;
        i < okxSymbols.length;
        i += batchSize
      ) {

        const batch =
          okxSymbols.slice(
            i,
            i + batchSize
          );

        const responses =
          await Promise.allSettled(

            batch.map(
              async symbol => {

                const candles =
                  await getCandles(
                    symbol
                  );

                const result =
                  analyze(
                    symbol,
                    candles
                  );

                if (!result) {
                  return null;
                }

                result.source =
                  "OKX";

                return result;
              }
            )
          );


        for (
          const response
          of responses
        ) {

          if (
            response.status !==
            "fulfilled"
          ) {
            continue;
          }

          const result =
            response.value;

          if (
            result &&
            (
              result.confirmed ||
              result.candidate
            )
          ) {

            okxResults.push(
              result
            );
          }
        }


        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              150
            )
        );
      }

    } catch (error) {

      okxError =
        error.message;

      console.error(
        "OKX tarama hatası:",
        error.message
      );
    }
/* =========================
   KUCOIN
========================= */

let kucoinSymbols = [];
let kucoinResults = [];
let kucoinError = null;

try {

  kucoinSymbols =
    await getKucoinSymbols();

  const batchSize = 5;

  for (
    let i = 0;
    i < kucoinSymbols.length;
    i += batchSize
  ) {

    const batch =
      kucoinSymbols.slice(
        i,
        i + batchSize
      );

    const responses =
      await Promise.allSettled(

        batch.map(
          async item => {

            const candles =
              await getKucoinCandles(
                item.symbol
              );

            const base =
              item.symbol.replace(
                "-USDT",
                ""
              );

            const result =
              analyze(
                `${base}/USDT`,
                candles
              );

            if (!result) {
              return null;
            }

            result.source =
              "KUCOIN";

            return result;
          }
        )
      );


    for (
      const response
      of responses
    ) {

      if (
        response.status !==
        "fulfilled"
      ) {
        continue;
      }

      const result =
        response.value;

      if (
        result &&
        (
          result.confirmed ||
          result.candidate
        )
      ) {

        kucoinResults.push(
          result
        );
      }
    }


    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          150
        )
    );
  }

} catch (error) {

  kucoinError =
    error.message;

  console.error(
    "KuCoin tarama hatası:",
    error.message
  );
}
    /* =========================
   GATE.IO
========================= */

let gateSymbols = [];
let gateResults = [];
let gateError = null;

try {

  gateSymbols =
    await getGateSymbols();

  const batchSize = 5;

  for (
    let i = 0;
    i < gateSymbols.length;
    i += batchSize
  ) {

    const batch =
      gateSymbols.slice(
        i,
        i + batchSize
      );

    const responses =
      await Promise.allSettled(

        batch.map(
          async item => {

            const candles =
              await getGateCandles(
                item.symbol
              );

            const base =
              item.symbol.replace(
                "_USDT",
                ""
              );

            const result =
              analyze(
                `${base}/USDT`,
                candles
              );

            if (!result) {
              return null;
            }

            result.source =
              "GATE";

            return result;
          }
        )
      );


    for (
      const response
      of responses
    ) {

      if (
        response.status !==
        "fulfilled"
      ) {
        continue;
      }

      const result =
        response.value;

      if (
        result &&
        (
          result.confirmed ||
          result.candidate
        )
      ) {

        gateResults.push(
          result
        );
      }
    }


    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          150
        )
    );
  }

} catch (error) {

  gateError =
    error.message;

  console.error(
    "Gate.io tarama hatası:",
    error.message
  );
}
    /* =========================
       SIRALAMA
    ========================= */

    const sortResults =
      (rows) => {

        rows.sort(
          (a, b) => {

            if (
              a.confirmed &&
              !b.confirmed
            ) {
              return -1;
            }

            if (
              b.confirmed &&
              !a.confirmed
            ) {
              return 1;
            }

            return (
              b.score -
              a.score
            );
          }
        );

        return rows;
      };


    okxResults =
      sortResults(
        okxResults
      );

    kucoinResults =
      sortResults(
        kucoinResults
      );

gateResults =
  sortResults(
    gateResults
  );
    /* =========================
       SAYILAR
    ========================= */

    const okxConfirmed =
      okxResults.filter(
        row =>
          row.confirmed
      ).length;

    const okxCandidates =
      okxResults.filter(
        row =>
          row.candidate
      ).length;


    const kucoinConfirmed =
      kucoinResults.filter(
        row =>
          row.confirmed
      ).length;

    const kucoinCandidates =
      kucoinResults.filter(
        row =>
          row.candidate
      ).length;

const gateConfirmed =
  gateResults.filter(
    row =>
      row.confirmed
  ).length;

const gateCandidates =
  gateResults.filter(
    row =>
      row.candidate
  ).length;
    /* =========================
       CACHE
    ========================= */

    cache = {

      ok:
        !okxError,

      source:
        "MULTI",

      updatedAt:
        Date.now(),

      scanned:
  okxSymbols.length +
  kucoinSymbols.length +
  gateSymbols.length,


      /* OKX */

      okx: {

        ok:
          !okxError,

        error:
          okxError,

        scanned:
          okxSymbols.length,

        confirmed:
          okxConfirmed,

        candidates:
          okxCandidates,

        rows:
          okxResults.slice(
            0,
            30
          )
      },


      /* KUCOIN */

      kucoin: {

        ok:
          !kucoinError,

        error:
          kucoinError,

        scanned:
          kucoinSymbols.length,

        confirmed:
          kucoinConfirmed,

        candidates:
          kucoinCandidates,

        rows:
          kucoinResults.slice(
            0,
            30
          )
      },
gate: {

  ok:
    !gateError,

  error:
    gateError,

  scanned:
    gateSymbols.length,

  confirmed:
    gateConfirmed,

  candidates:
    gateCandidates,

  rows:
    gateResults.slice(
      0,
      30
    )
},

      /*
        Eski arayüzün geçici olarak
        çalışmaya devam etmesi için
        OKX sonuçlarını rows içinde
        de tutuyoruz.
      */

      rows:
        okxResults.slice(
          0,
          30
        ),

      error:
        okxError
    };


    console.log(
      `OKX: ${okxSymbols.length} coin / ${okxConfirmed} teyit / ${okxCandidates} aday`
    );

    console.log(
      `KuCoin: ${kucoinSymbols.length} coin / ${kucoinConfirmed} teyit / ${kucoinCandidates} aday / ${kucoinError || "OK"}`
    );

console.log(
  `Gate.io: ${gateSymbols.length} coin / ${gateConfirmed} teyit / ${gateCandidates} aday / ${gateError || "OK"}`
);
    
  } catch (error) {

    console.error(
      "Genel tarama hatası:",
      error.message
    );

    cache = {
      ...cache,

      ok: false,

      error:
        error.message
    };


  } finally {

    scanning = false;
  }
}
/* =========================
   ANLIK RADAR TARAMASI
========================= */
/* =========================
   YÜKSELİŞ SENARYOLARI TARAMASI
========================= */

async function scanScenarios() {

  if (scenarioCache.scanning) {
    return;
  }

  scenarioCache.scanning =
    true;


  const scenario1Rows = [];
  const scenario2Rows = [];
  const scenario3Rows = [];
  const scenario4Rows = [];


  let scanned = 0;
  let generalError = null;


  try {

    const symbols =
      await getGateSymbols();


    /*
      API yükünü kontrollü tut.
    */

    const batchSize = 4;


    for (
      let i = 0;
      i < symbols.length;
      i += batchSize
    ) {

      const batch =
        symbols.slice(
          i,
          i + batchSize
        );


      const responses =
        await Promise.allSettled(

          batch.map(
            async item => {

              const symbol =
                item.symbol;


              /*
                1 DAKİKALIK MUMLAR
              */

              const candles =
                await getGateMinuteCandles(
                  symbol
                );


              if (
                !Array.isArray(candles) ||
                candles.length < 30
              ) {
                return;
              }


              scanned += 1;


              const displaySymbol =
                symbol.replace(
                  "_USDT",
                  "/USDT"
                );


              /* =====================
                 SENARYO 1
              ===================== */

              const scenario1 =
                analyzeScenario1(
                  displaySymbol,
                  candles,
                  "GATE.IO"
                );


              if (
                scenario1 &&
                scenario1.qualifies
              ) {

                scenario1Rows.push(
                  scenario1
                );
              }


              /* =====================
                 SENARYO 4
              ===================== */

              const scenario4 =
                analyzeScenario4(
                  displaySymbol,
                  candles,
                  "GATE.IO"
                );


              if (
                scenario4 &&
                scenario4.qualifies
              ) {

                scenario4Rows.push(
                  scenario4
                );
              }


              /*
                SENARYO 2 + 3 ÖN ELEME

                İşlem ve order-book verisini
                her coinde çekmeyelim.

                Son 5 dakikada fiyat henüz
                erken hareket bölgesindeyse
                ayrıntılı inceleme yap.
              */

              const latest =
                candles.at(-1);

              const old =
                candles.at(-6);


              const latestPrice =
                Number(
                  latest?.close
                );


              const oldPrice =
                Number(
                  old?.close
                );


              if (
                !Number.isFinite(
                  latestPrice
                ) ||
                !Number.isFinite(
                  oldPrice
                ) ||
                oldPrice <= 0
              ) {
                return;
              }


              const change5 =
                (
                  (
                    latestPrice -
                    oldPrice
                  ) /
                  oldPrice
                ) * 100;


              /*
                Çok düşen veya zaten
                fazla yükselmiş coinleri
                mikro analizden çıkar.
              */

              if (
                change5 < -0.50 ||
                change5 > 2.50
              ) {
                return;
              }


              /* =====================
                 GATE.IO SON İŞLEMLER
              ===================== */

              const rawTrades =
                await getGateJSON(
                  `${GATE}/spot/trades` +
                  `?currency_pair=${encodeURIComponent(symbol)}` +
                  `&limit=200`
                );


              const normalizedTrades =
                rawTrades
                  .map(
                    trade => {

                      const time =
                        Number(
                          trade.create_time_ms
                        ) ||
                        Number(
                          trade.create_time
                        ) * 1000;


                      return {

                        time,

                        price:
                          Number(
                            trade.price
                          ),

                        amount:
                          Number(
                            trade.amount
                          ),

                        side:
                          trade.side
                      };
                    }
                  )
                  .filter(
                    trade =>
                      Number.isFinite(
                        trade.time
                      ) &&
                      Number.isFinite(
                        trade.price
                      ) &&
                      Number.isFinite(
                        trade.amount
                      )
                  );


              /*
                Mikro hafızayı besle.
              */

              updateMicroTrades(
                "GATE.IO",
                displaySymbol,
                normalizedTrades
              );


              /* =====================
                 SENARYO 3
              ===================== */

              const scenario3 =
                analyzeScenario3(
                  "GATE.IO",
                  displaySymbol
                );


              if (
                scenario3 &&
                scenario3.qualifies
              ) {

                scenario3Rows.push(
                  scenario3
                );
              }


              /* =====================
                 SENARYO 2
              ===================== */

              /*
                Senaryo 2 fonksiyonu
                trade + order book verisini
                ayrıca değerlendirir.
              */

              const scenario2 =
                await analyzeScenario2Gate(
                  symbol,
                  candles
                );


              if (
                scenario2 &&
                scenario2.qualifies
              ) {

                scenario2Rows.push(
                  scenario2
                );
              }
            }
          )
        );


      /*
        Promise hataları tüm taramayı
        durdurmasın.
      */

      for (
        const response
        of responses
      ) {

        if (
          response.status ===
          "rejected"
        ) {

          console.error(
            "Senaryo coin hatası:",
            response.reason?.message ||
            response.reason
          );
        }
      }


      /*
        Gate.io API'sine gereksiz
        yük bindirmemek için
        gruplar arasında bekle.
      */

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            150
          )
      );
    }


    /* =========================
       SIRALAMA
    ========================= */

    scenario1Rows.sort(
      (a, b) =>
        b.score -
        a.score
    );


    scenario2Rows.sort(
      (a, b) =>
        b.score -
        a.score
    );


    scenario3Rows.sort(
      (a, b) =>
        b.score -
        a.score
    );


    scenario4Rows.sort(
      (a, b) =>
        b.score -
        a.score
    );


    /* =========================
       CACHE
    ========================= */

    scenarioCache = {

      updatedAt:
        Date.now(),

      scanning:
        false,


      scenario1: {

        ok: true,

        scanned,

        rows:
          scenario1Rows.slice(
            0,
            50
          ),

        error:
          null
      },


      scenario2: {

        ok: true,

        scanned,

        rows:
          scenario2Rows.slice(
            0,
            50
          ),

        error:
          null
      },


      scenario3: {

        ok: true,

        scanned,

        rows:
          scenario3Rows.slice(
            0,
            50
          ),

        error:
          null
      },


      scenario4: {

        ok: true,

        scanned,

        rows:
          scenario4Rows.slice(
            0,
            50
          ),

        error:
          null
      }
    };


    console.log(
      `Senaryolar: ${scanned} coin | S1 ${scenario1Rows.length} | S2 ${scenario2Rows.length} | S3 ${scenario3Rows.length} | S4 ${scenario4Rows.length}`
    );


  } catch (error) {

    generalError =
      error.message;


    console.error(
      "Senaryo tarama hatası:",
      error.message
    );


    scenarioCache = {

      ...scenarioCache,

      updatedAt:
        Date.now(),

      scanning:
        false,


      scenario1: {
        ...scenarioCache.scenario1,
        ok: false,
        error: generalError
      },

      scenario2: {
        ...scenarioCache.scenario2,
        ok: false,
        error: generalError
      },

      scenario3: {
        ...scenarioCache.scenario3,
        ok: false,
        error: generalError
      },

      scenario4: {
        ...scenarioCache.scenario4,
        ok: false,
        error: generalError
      }
    };


  } finally {

    scenarioCache.scanning =
      false;
  }
}
async function scanMinuteRadar() {

  if (minuteRadarScanning) {
    return;
  }

  minuteRadarScanning = true;

  const allResults = [];

  const exchangeStatus = {

    okx: {
      scanned: 0,
      error: null
    },

    kucoin: {
      scanned: 0,
      error: null
    },

    gate: {
      scanned: 0,
      error: null
    }
  };


  /*
    Bir borsayı bağımsız tarar.

    Böylece bir borsa hata verirse
    diğerleri çalışmaya devam eder.
  */

  async function scanExchange(
    exchange,
    symbols,
    candleFunction
  ) {

    const batchSize = 4;

    let scanned = 0;


    for (
      let i = 0;
      i < symbols.length;
      i += batchSize
    ) {

      const batch =
        symbols.slice(
          i,
          i + batchSize
        );


      const responses =
        await Promise.allSettled(

          batch.map(
            async item => {

              let symbol;
              let displaySymbol;


              /*
                OKX listesi doğrudan
                string döndürür.

                KuCoin ve Gate.io
                nesne döndürür.
              */

              if (
                exchange === "OKX"
              ) {

                symbol =
                  item;

                displaySymbol =
                  item.replace(
                    "-USDT",
                    "/USDT"
                  );

              } else if (
                exchange === "KUCOIN"
              ) {

                symbol =
                  item.symbol;

                displaySymbol =
                  item.symbol.replace(
                    "-USDT",
                    "/USDT"
                  );

              } else {

                symbol =
                  item.symbol;

                displaySymbol =
                  item.symbol.replace(
                    "_USDT",
                    "/USDT"
                  );
              }


              const candles =
                await candleFunction(
                  symbol
                );


              scanned += 1;


              if (
                !Array.isArray(candles) ||
                candles.length < 20
              ) {
                return null;
              }


              const analysis =
                analyzeMinuteRise(
                  displaySymbol,
                  candles,
                  exchange
                );


              if (!analysis) {
                return null;
              }


              const lastCandle =
                candles.at(-1);


              const candleTime =
                Number(
                  lastCandle.time
                );


              return (
                updateMinuteRadarState(
                  analysis,
                  candleTime
                )
              );
            }
          )
        );


      for (
        const response
        of responses
      ) {

        if (
          response.status !==
          "fulfilled"
        ) {
          continue;
        }


        const result =
          response.value;


        if (result) {

          allResults.push(
            result
          );
        }
      }


      /*
        Borsaların API limitlerine
        gereksiz yük bindirmeyelim.
      */

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            120
          )
      );
    }


    return scanned;
  }


  try {

    /*
      OKX
    */

    try {

      const okxSymbols =
        await getSymbols();


      exchangeStatus.okx.scanned =
        await scanExchange(
          "OKX",
          okxSymbols,
          getOKXMinuteCandles
        );

    } catch (error) {

      exchangeStatus.okx.error =
        error.message;

      console.error(
        "Anlık radar OKX:",
        error.message
      );
    }


    /*
      KUCOIN
    */

    try {

      const kucoinSymbols =
        await getKucoinSymbols();


      exchangeStatus.kucoin.scanned =
        await scanExchange(
          "KUCOIN",
          kucoinSymbols,
          getKucoinMinuteCandles
        );

    } catch (error) {

      exchangeStatus.kucoin.error =
        error.message;

      console.error(
        "Anlık radar KuCoin:",
        error.message
      );
    }


    /*
      GATE.IO
    */

    try {

      const gateSymbols =
        await getGateSymbols();


      exchangeStatus.gate.scanned =
        await scanExchange(
          "GATE.IO",
          gateSymbols,
          getGateMinuteCandles
        );

    } catch (error) {

      exchangeStatus.gate.error =
        error.message;

      console.error(
        "Anlık radar Gate.io:",
        error.message
      );
    }


    /*
      Önce yüksek puan.

      Aynı puanda hacim ivmesi
      daha güçlü olan üstte.
    */

    allResults.sort(
      (a, b) => {

        if (
          b.score !==
          a.score
        ) {

          return (
            b.score -
            a.score
          );
        }


        return (
          b.volumeAcceleration -
          a.volumeAcceleration
        );
      }
    );


    /*
      Aynı coin farklı borsalarda
      sinyal veriyorsa bunu say.
    */

    const symbolCounts =
      new Map();


    for (
      const result
      of allResults
    ) {

      symbolCounts.set(
        result.symbol,
        (
          symbolCounts.get(
            result.symbol
          ) || 0
        ) + 1
      );
    }


    const finalResults =
      allResults.map(
        result => ({

          ...result,

          exchangeConfirmations:
            symbolCounts.get(
              result.symbol
            ) || 1,

          multiExchange:
            (
              symbolCounts.get(
                result.symbol
              ) || 1
            ) >= 2
        })
      );


    minuteRadarCache = {

      ok: true,

      updatedAt:
        Date.now(),

      scanned:
        exchangeStatus.okx.scanned +
        exchangeStatus.kucoin.scanned +
        exchangeStatus.gate.scanned,

      rows:
        finalResults.slice(
          0,
          50
        ),

      exchanges:
        exchangeStatus
    };


    console.log(
      `Anlık radar: ${minuteRadarCache.scanned} tarama / ${finalResults.length} aktif sinyal`
    );


  } catch (error) {

    console.error(
      "Anlık radar genel hata:",
      error.message
    );


    minuteRadarCache = {
      ...minuteRadarCache,

      ok: false,

      updatedAt:
        Date.now(),

      error:
        error.message,

      exchanges:
        exchangeStatus
    };


  } finally {

    minuteRadarScanning =
      false;
  }
}

/* =========================
   GÜNLÜK TEYİT API
========================= */

app.get(
  "/api/daily-confirmations",
  async (
    req,
    res
  ) => {

    res.set(
      "Cache-Control",
      "no-store"
    );


    if (
      !cache.updatedAt ||
      (
        Date.now() -
        cache.updatedAt
      ) >
      5 * 60 * 1000
    ) {

      await scanMarket();
    }


    res.json(
      cache
    );
  }
);
/* =========================
   ANLIK YÜKSELİŞ RADARI API
========================= */

app.get(
  "/api/minute-radar",
  async (
    req,
    res
  ) => {

    res.set(
      "Cache-Control",
      "no-store"
    );


    /*
      İlk istek veya eski veri varsa
      yeni radar taraması çalıştır.
    */

    if (
      !minuteRadarCache.updatedAt ||
      (
        Date.now() -
        minuteRadarCache.updatedAt
      ) >
      60 * 1000
    ) {

      await scanMinuteRadar();
    }


    res.json(
      minuteRadarCache
    );
  }
);

/* =========================
   SAĞLIK KONTROLÜ
========================= */

app.get(
  "/health",
  (
    req,
    res
  ) => {

    res.json({

      ok: true,

      source:
        cache.source,

      scannerRunning:
        scanning,

      lastScan:
        cache.updatedAt,

      scanned:
        cache.scanned,

      confirmations:
        cache.rows.length,

      dataOk:
        cache.ok,

      error:
        cache.error
    });
  }
);


/* =========================
   SUNUCU
========================= */

app.listen(
  PORT,
  () => {

    console.log(
      `TradeRadar OKX çalışıyor: ${PORT}`
    );

    scanMarket();
  }
);


/* =========================
   OTOMATİK TARAMA
========================= */

setInterval(
  scanMarket,
  5 * 60 * 1000
);
