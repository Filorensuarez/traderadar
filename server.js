import express from "express";

const app = express();

const PORT =
  process.env.PORT || 3000;

const BINANCE =
  "https://api.binance.com";


/* =====================================================
   AYARLAR
===================================================== */

const CONFIG = {

  // Aynı taramayı en fazla 5 dakikada
  // bir yeniden hesapla.
  scanInterval:
    5 * 60 * 1000,

  // Günlük mum sayısı.
  candleLimit:
    230,

  // Önce hacmi yüksek pariteleri tara.
  maxSymbols:
    80,

  // Çok düşük hacimli coinleri çıkar.
  minimumQuoteVolume:
    5_000_000,

  // Listeye girmek için minimum puan.
  minimumScore:
    75,

  // Aynı anda kaç Binance isteği gönderilsin.
  batchSize:
    8
};


/* =====================================================
   STATİK DOSYALAR
===================================================== */

app.use(
  express.static(".")
);


/* =====================================================
   ÖNBELLEK
===================================================== */

let cache = {

  ok: true,

  source:
    "Binance",

  updatedAt:
    0,

  scanned:
    0,

  rows:
    [],

  error:
    null
};


let scanning = false;


/* =====================================================
   HTTP YARDIMCISI
===================================================== */

async function getJSON(url) {

  const response =
    await fetch(
      url,
      {
        signal:
          AbortSignal.timeout(
            15000
          ),

        headers: {
          "User-Agent":
            "TradeRadar/2.0"
        }
      }
    );


  if (!response.ok) {

    throw new Error(
      `Binance HTTP ${response.status}`
    );
  }


  return response.json();
}


/* =====================================================
   MATEMATİK
===================================================== */

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


function SMA(
  values,
  period
) {

  if (
    values.length <
    period
  ) {
    return null;
  }


  return average(
    values.slice(
      -period
    )
  );
}


/* =====================================================
   EMA
===================================================== */

function EMA(
  values,
  period
) {

  if (
    values.length <
    period
  ) {
    return null;
  }


  const multiplier =
    2 /
    (
      period + 1
    );


  let ema =
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

    ema =
      (
        values[i] *
        multiplier
      ) +
      (
        ema *
        (
          1 -
          multiplier
        )
      );
  }


  return ema;
}


/* =====================================================
   EMA SERİSİ
===================================================== */

function EMASeries(
  values,
  period
) {

  if (
    values.length <
    period
  ) {
    return [];
  }


  const multiplier =
    2 /
    (
      period + 1
    );


  let current =
    average(
      values.slice(
        0,
        period
      )
    );


  const result =
    new Array(
      period - 1
    ).fill(null);


  result.push(
    current
  );


  for (
    let i = period;
    i < values.length;
    i++
  ) {

    current =
      (
        values[i] *
        multiplier
      ) +
      (
        current *
        (
          1 -
          multiplier
        )
      );


    result.push(
      current
    );
  }


  return result;
}


/* =====================================================
   RSI - WILDER
===================================================== */

function RSI(
  closes,
  period = 14
) {

  if (
    closes.length <=
    period
  ) {
    return null;
  }


  let gain = 0;
  let loss = 0;


  for (
    let i = 1;
    i <= period;
    i++
  ) {

    const change =
      closes[i] -
      closes[i - 1];


    if (
      change >= 0
    ) {

      gain +=
        change;

    } else {

      loss +=
        Math.abs(
          change
        );
    }
  }


  let averageGain =
    gain / period;

  let averageLoss =
    loss / period;


  for (
    let i =
      period + 1;

    i <
      closes.length;

    i++
  ) {

    const change =
      closes[i] -
      closes[i - 1];


    const currentGain =
      Math.max(
        change,
        0
      );


    const currentLoss =
      Math.max(
        -change,
        0
      );


    averageGain =
      (
        (
          averageGain *
          (
            period - 1
          )
        ) +
        currentGain
      ) /
      period;


    averageLoss =
      (
        (
          averageLoss *
          (
            period - 1
          )
        ) +
        currentLoss
      ) /
      period;
  }


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
    (
      100 /
      (
        1 + rs
      )
    )
  );
}


/* =====================================================
   MACD
===================================================== */

function MACD(closes) {

  if (
    closes.length <
    40
  ) {

    return {
      macd:
        null,

      signal:
        null,

      histogram:
        null,

      bullish:
        false
    };
  }


  const fast =
    EMASeries(
      closes,
      12
    );


  const slow =
    EMASeries(
      closes,
      26
    );


  const macdSeries =
    [];


  for (
    let i = 0;
    i < closes.length;
    i++
  ) {

    if (
      fast[i] !== null &&
      fast[i] !== undefined &&
      slow[i] !== null &&
      slow[i] !== undefined
    ) {

      macdSeries.push(
        fast[i] -
        slow[i]
      );
    }
  }


  if (
    macdSeries.length <
    9
  ) {

    return {
      macd:
        null,

      signal:
        null,

      histogram:
        null,

      bullish:
        false
    };
  }


  const macd =
    macdSeries.at(-1);


  const signal =
    EMA(
      macdSeries,
      9
    );


  const histogram =
    macd -
    signal;


  return {

    macd,

    signal,

    histogram,

    bullish:
      macd >
        signal &&
      histogram >
        0
  };
}


/* =====================================================
   ATR - WILDER
===================================================== */

function ATR(
  candles,
  period = 14
) {

  if (
    candles.length <=
    period
  ) {
    return null;
  }


  const ranges =
    [];


  for (
    let i = 1;
    i <
      candles.length;
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


  let atr =
    average(
      ranges.slice(
        0,
        period
      )
    );


  for (
    let i = period;
    i <
      ranges.length;
    i++
  ) {

    atr =
      (
        (
          atr *
          (
            period - 1
          )
        ) +
        ranges[i]
      ) /
      period;
  }


  return atr;
}


/* =====================================================
   STANDART SAPMA
===================================================== */

function standardDeviation(
  values
) {

  if (!values.length) {
    return null;
  }


  const mean =
    average(values);


  const variance =
    average(
      values.map(
        value =>
          (
            value -
            mean
          ) ** 2
      )
    );


  return Math.sqrt(
    variance
  );
}


/* =====================================================
   BOLLINGER
===================================================== */

function Bollinger(
  closes,
  period = 20
) {

  if (
    closes.length <
    period
  ) {
    return null;
  }


  const values =
    closes.slice(
      -period
    );


  const middle =
    average(values);


  const deviation =
    standardDeviation(
      values
    );


  return {

    middle,

    upper:
      middle +
      (
        deviation *
        2
      ),

    lower:
      middle -
      (
        deviation *
        2
      )
  };
}


/* =====================================================
   MUM DÖNÜŞTÜRME
===================================================== */

function formatCandles(
  raw
) {

  return raw.map(
    candle => ({

      time:
        Number(
          candle[0]
        ),

      open:
        Number(
          candle[1]
        ),

      high:
        Number(
          candle[2]
        ),

      low:
        Number(
          candle[3]
        ),

      close:
        Number(
          candle[4]
        ),

      volume:
        Number(
          candle[5]
        ),

      closeTime:
        Number(
          candle[6]
        )
    })
  );
}


/* =====================================================
   DESTEK / DİRENÇ
===================================================== */

function structure(
  candles
) {

  const previous =
    candles.slice(
      -21,
      -1
    );


  if (!previous.length) {

    return {
      resistance:
        null,

      support:
        null
    };
  }


  const resistance =
    Math.max(
      ...previous.map(
        candle =>
          candle.high
      )
    );


  const support =
    Math.min(
      ...previous.map(
        candle =>
          candle.low
      )
    );


  return {
    resistance,
    support
  };
}


/* =====================================================
   COİN ANALİZİ
===================================================== */

function analyzeCoin(
  symbol,
  rawCandles
) {

  const candles =
    formatCandles(
      rawCandles
    );


  if (
    candles.length <
    205
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


  const currentPrice =
    current.close;


  const ema20 =
    EMA(
      closes,
      20
    );


  const ema50 =
    EMA(
      closes,
      50
    );


  const ema200 =
    EMA(
      closes,
      200
    );


  const rsi =
    RSI(
      closes,
      14
    );


  const macd =
    MACD(
      closes
    );


  const atr =
    ATR(
      candles,
      14
    );


  const bollinger =
    Bollinger(
      closes,
      20
    );


  const levels =
    structure(
      candles
    );


  const previousVolumes =
    volumes.slice(
      -21,
      -1
    );


  const averageVolume =
    average(
      previousVolumes
    );


  const volumeRatio =
    averageVolume > 0
      ?
        current.volume /
        averageVolume
      :
        0;


  const atrPct =
    atr &&
    currentPrice
      ?
        (
          atr /
          currentPrice
        ) *
        100
      :
        0;


  const resistanceDistance =
    levels.resistance
      ?
        (
          (
            currentPrice -
            levels.resistance
          ) /
          levels.resistance
        ) *
        100
      :
        null;


  let score = 0;

  const reasons =
    [];


  function add(
    condition,
    points,
    text
  ) {

    if (!condition) {
      return;
    }

    score +=
      points;

    reasons.push(
      text
    );
  }


  /* ---------------------------------
     TREND
  ---------------------------------- */

  add(
    currentPrice >
      ema20,
    8,
    "Fiyat EMA20 üzerinde"
  );


  add(
    ema20 >
      ema50,
    12,
    "EMA20 EMA50 üzerinde"
  );


  add(
    currentPrice >
      ema50,
    8,
    "Fiyat EMA50 üzerinde"
  );


  add(
    currentPrice >
      ema200,
    8,
    "Fiyat EMA200 üzerinde"
  );


  /* ---------------------------------
     MOMENTUM
  ---------------------------------- */

  add(
    rsi >= 52 &&
    rsi <= 68,
    12,
    "RSI yükselişi destekliyor"
  );


  add(
    macd.bullish,
    14,
    "MACD pozitif kesişim yapısında"
  );


  /* ---------------------------------
     HACİM
  ---------------------------------- */

  add(
    volumeRatio >= 1.30,
    12,
    "Hacim ortalamanın üzerinde"
  );


  add(
    volumeRatio >= 1.80,
    4,
    "Güçlü hacim artışı"
  );


  /* ---------------------------------
     DİRENÇ
  ---------------------------------- */

  add(
    resistanceDistance !==
      null &&
    resistanceDistance >=
      -1.5 &&
    resistanceDistance <=
      2.0,
    10,
    "20 günlük dirence yakın veya kırıyor"
  );


  /* ---------------------------------
     BOLLINGER
  ---------------------------------- */

  add(
    bollinger &&
    currentPrice >
      bollinger.middle,
    5,
    "Bollinger orta bandı üzerinde"
  );


  /* ---------------------------------
     SON MUM
  ---------------------------------- */

  add(
    current.close >
      current.open &&
    current.close >
      previous.close,
    4,
    "Son günlük mum pozitif"
  );


  /* ---------------------------------
     AŞIRI UZAMIŞ HAREKET CEZASI
  ---------------------------------- */

  const change3 =
    (
      (
        currentPrice -
        closes.at(-4)
      ) /
      closes.at(-4)
    ) *
    100;


  if (
    change3 > 15
  ) {

    score -=
      10;

    reasons.push(
      "Son 3 günde hareket fazla uzamış"
    );
  }


  /* ---------------------------------
     AŞIRI RSI CEZASI
  ---------------------------------- */

  if (
    rsi > 75
  ) {

    score -=
      10;

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


  const trend =
    (
      currentPrice >
        ema20 &&
      ema20 >
        ema50 &&
      currentPrice >
        ema200
    )
      ?
        "bullish"
      :
        "neutral";


  /*
     Listeye girmek için yalnızca puan
     yeterli değil.

     Temel zorunlu teyitler de aranır.
  */

  const mandatoryConfirmation =
    (
      currentPrice >
        ema20 &&

      currentPrice >
        ema50 &&

      rsi >= 50 &&

      rsi < 75 &&

      macd.bullish &&

      volumeRatio >=
        1.15
    );


  return {

    symbol,

    price:
      currentPrice,

    score,

    trend,

    rsi,

    ema20,

    ema50,

    ema200,

    macd:
      macd.macd,

    macdSignal:
      macd.signal,

    macdHistogram:
      macd.histogram,

    macdBullish:
      macd.bullish,

    volumeRatio,

    atr,

    atrPct,

    resistance:
      levels.resistance,

    support:
      levels.support,

    resistanceDistance,

    bollingerMiddle:
      bollinger?.middle ??
      null,

    bollingerUpper:
      bollinger?.upper ??
      null,

    bollingerLower:
      bollinger?.lower ??
      null,

    change3,

    mandatoryConfirmation,

    reasons
  };
}


/* =====================================================
   PARİTELERİ BUL
===================================================== */

async function getSymbols() {

  const tickers =
    await getJSON(
      `${BINANCE}/api/v3/ticker/24hr`
    );


  /*
     Stablecoin ve doğrudan para
     benzeri pariteleri çıkar.
  */

  const excluded =
    new Set([
      "USDC",
      "FDUSD",
      "TUSD",
      "USDP",
      "DAI",
      "EUR",
      "TRY"
    ]);


  return tickers
    .filter(
      ticker => {

        const symbol =
          String(
            ticker.symbol
          );


        if (
          !symbol.endsWith(
            "USDT"
          )
        ) {
          return false;
        }


        const base =
          symbol.slice(
            0,
            -4
          );


        if (
          excluded.has(
            base
          )
        ) {
          return false;
        }


        const volume =
          Number(
            ticker.quoteVolume
          );


        return (
          Number.isFinite(
            volume
          ) &&
          volume >=
            CONFIG
              .minimumQuoteVolume
        );
      }
    )
    .sort(
      (
        a,
        b
      ) =>
        Number(
          b.quoteVolume
        ) -
        Number(
          a.quoteVolume
        )
    )
    .slice(
      0,
      CONFIG.maxSymbols
    )
    .map(
      ticker =>
        ticker.symbol
    );
}


/* =====================================================
   MUM VERİSİ
===================================================== */

async function getCandles(
  symbol
) {

  const url =
    `${BINANCE}/api/v3/klines` +
    `?symbol=${encodeURIComponent(symbol
