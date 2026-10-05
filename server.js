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
   ANLIK YÜKSELİŞ RADARI
========================= */

function analyzeMinuteRise(
  symbol,
  candles,
  source
) {

  if (
    !Array.isArray(candles) ||
    candles.length < 40
  ) {
    return null;
  }

  const data =
    candles.slice(-40);

  const changes =
    data.map(candle => {

      const open =
        Number(candle.open);

      const close =
        Number(candle.close);

      if (
        !Number.isFinite(open) ||
        !Number.isFinite(close) ||
        open <= 0
      ) {
        return 0;
      }

      return (
        (
          close - open
        ) /
        open
      ) * 100;
    });


  const previous20 =
    changes.slice(
      0,
      20
    );

  const recent20 =
    changes.slice(
      20,
      40
    );


  const previousAverage =
    previous20.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / 20;


  const recentAverage =
    recent20.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / 20;


  const difference =
    recentAverage -
    previousAverage;


  const qualifies =
    recentAverage > 0 &&
    difference >= 2;


  return {

    symbol,

    source,

    price:
      Number(
        data.at(-1).close
      ),

    previousAverage,

    recentAverage,

    difference,

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
    Şart artık sağlanmıyorsa
    aktif sinyali kaldır.
  */

  if (!result.qualifies) {

    if (state) {
      minuteRadarState.delete(
        key
      );
    }

    return null;
  }


  /*
    İlk kez şart sağlandı.
  */

  if (!state) {

    state = {

      startedAt:
        candleTime,

      startIndex:
        0,

      candlesAlive:
        0
    };


    minuteRadarState.set(
      key,
      state
    );


    return {
      ...result,

      signal:
        "YÜKSELİŞ BAŞLIYOR",

      candlesAlive:
        0
    };
  }


  /*
    Aynı mum tekrar taranırsa
    sayaç artırılmayacak.
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
    Sinyal en fazla 20 yeni
    mum boyunca ekranda kalır.
  */

  if (
    state.candlesAlive >= 20
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

    signal:
      "YÜKSELİŞ BAŞLIYOR",

    candlesAlive:
      state.candlesAlive
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
