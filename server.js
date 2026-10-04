import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const BINANCE = "https://api.binance.com";

app.use(express.static("."));

let cache = {
  ok: true,
  source: "Binance",
  updatedAt: 0,
  scanned: 0,
  rows: []
};

let scanning = false;


/* =========================
   YARDIMCILAR
========================= */

async function getJSON(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}


function average(values) {
  if (!values.length) return null;

  return values.reduce(
    (sum, value) => sum + value,
    0
  ) / values.length;
}


function ema(values, period) {
  if (values.length < period) return null;

  const k = 2 / (period + 1);

  let result = average(
    values.slice(0, period)
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

function rsi(closes, period = 14) {
  if (closes.length <= period) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change =
      closes[i] - closes[i - 1];

    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (
    let i = period + 1;
    i < closes.length;
    i++
  ) {
    const change =
      closes[i] - closes[i - 1];

    const gain =
      Math.max(change, 0);

    const loss =
      Math.max(-change, 0);

    avgGain =
      (
        avgGain * (period - 1) +
        gain
      ) / period;

    avgLoss =
      (
        avgLoss * (period - 1) +
        loss
      ) / period;
  }

  if (avgLoss === 0) return 100;

  const rs =
    avgGain / avgLoss;

  return 100 - 100 / (1 + rs);
}


/* =========================
   MACD
========================= */

function macd(closes) {
  if (closes.length < 40) {
    return {
      value: null,
      signal: null,
      histogram: null,
      bullish: false
    };
  }

  const macdValues = [];

  for (
    let i = 26;
    i <= closes.length;
    i++
  ) {
    const part =
      closes.slice(0, i);

    const fast =
      ema(part, 12);

    const slow =
      ema(part, 26);

    macdValues.push(
      fast - slow
    );
  }

  const value =
    macdValues.at(-1);

  const signal =
    ema(macdValues, 9);

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

function atr(candles, period = 14) {
  if (candles.length <= period) {
    return null;
  }

  const ranges = [];

  for (
    let i = 1;
    i < candles.length;
    i++
  ) {
    const now = candles[i];
    const prev = candles[i - 1];

    ranges.push(
      Math.max(
        now.high - now.low,

        Math.abs(
          now.high - prev.close
        ),

        Math.abs(
          now.low - prev.close
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

  if (values.length < 20) {
    return null;
  }

  const middle =
    average(values);

  const variance =
    average(
      values.map(
        value =>
          (value - middle) ** 2
      )
    );

  const sd =
    Math.sqrt(variance);

  return {
    middle,
    upper: middle + 2 * sd,
    lower: middle - 2 * sd
  };
}


/* =========================
   COİN ANALİZİ
========================= */

function analyze(symbol, raw) {
  const candles =
    raw.map(row => ({
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5])
    }));

  if (candles.length < 205) {
    return null;
  }

  const closes =
    candles.map(x => x.close);

  const volumes =
    candles.map(x => x.volume);

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

  const avgVolume =
    average(
      volumes.slice(-21, -1)
    );

  const volumeRatio =
    avgVolume > 0
      ? current.volume / avgVolume
      : 0;

  const resistance =
    Math.max(
      ...candles
        .slice(-21, -1)
        .map(x => x.high)
    );

  const resistanceDistance =
    (
      (price - resistance) /
      resistance
    ) * 100;

  const atrPct =
    ATR
      ? (ATR / price) * 100
      : 0;


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
    if (!condition) return;

    score += points;
    reasons.push(text);
  }


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

  add(
    RSI >= 52 &&
    RSI <= 68,
    14,
    "RSI yükselişi destekliyor"
  );

  add(
    MACD.bullish,
    14,
    "MACD pozitif"
  );

  add(
    volumeRatio >= 1.30,
    14,
    "Hacim artışı var"
  );

  add(
    resistanceDistance >= -1.5 &&
    resistanceDistance <= 2,
    10,
    "Direnç bölgesinde"
  );

  add(
    BB &&
    price > BB.middle,
    6,
    "Bollinger orta bandı üzerinde"
  );

  add(
    current.close >
      current.open &&
    current.close >
      previous.close,
    6,
    "Son mum pozitif"
  );


  /* =========================
     RİSK CEZALARI
  ========================= */

  const price3DaysAgo =
    closes.at(-4);

  const change3 =
    (
      (price - price3DaysAgo) /
      price3DaysAgo
    ) * 100;

  if (change3 > 15) {
    score -= 10;

    reasons.push(
      "3 günlük hareket fazla uzamış"
    );
  }

  if (RSI > 75) {
    score -= 10;

    reasons.push(
      "RSI aşırı alım bölgesinde"
    );
  }

  score =
    Math.max(
      0,
      Math.min(100, score)
    );


  /* =========================
     ZORUNLU TEYİT
  ========================= */

  const confirmed =
    price > ema20 &&
    price > ema50 &&
    RSI >= 50 &&
    RSI < 75 &&
    MACD.bullish &&
    volumeRatio >= 1.15 &&
    score >= 75;


  return {
    symbol:
      symbol.replace(
        "USDT",
        "/USDT"
      ),

    price,
    score,

    trend:
      price > ema20 &&
      ema20 > ema50 &&
      price > ema200
        ? "bullish"
        : "neutral",

    rsi: RSI,

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

    atr: ATR,
    atrPct,

    resistance,
    resistanceDistance,

    bollingerMiddle:
      BB?.middle ?? null,

    bollingerUpper:
      BB?.upper ?? null,

    bollingerLower:
      BB?.lower ?? null,

    change3,

    confirmed,
    reasons
  };
}


/* =========================
   COİN LİSTESİ
========================= */

async function getSymbols() {
  const tickers =
    await getJSON(
      `${BINANCE}/api/v3/ticker/24hr`
    );

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
    .filter(item => {
      const symbol =
        String(item.symbol);

      if (
        !symbol.endsWith("USDT")
      ) {
        return false;
      }

      const base =
        symbol.slice(0, -4);

      if (excluded.has(base)) {
        return false;
      }

      return (
        Number(item.quoteVolume) >=
        5_000_000
      );
    })
    .sort(
      (a, b) =>
        Number(b.quoteVolume) -
        Number(a.quoteVolume)
    )
    .slice(0, 80)
    .map(item => item.symbol);
}


/* =========================
   MUM VERİSİ
========================= */

async function getCandles(symbol) {
  return getJSON(
    `${BINANCE}/api/v3/klines` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1d` +
    `&limit=230`
  );
}


/* =========================
   ANA TARAMA
========================= */

async function scanMarket() {
  if (scanning) return;

  scanning = true;

  try {
    const symbols =
      await getSymbols();

    const results = [];

    const batchSize = 8;

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

      const promises =
        batch.map(
          async symbol => {
            try {
              const candles =
                await getCandles(
                  symbol
                );

              return analyze(
                symbol,
                candles
              );
            } catch (error) {
              console.error(
                symbol,
                error.message
              );

              return null;
            }
          }
        );

      const batchResults =
        await Promise.all(
          promises
        );

      for (
        const result
        of batchResults
      ) {
        if (
          result &&
          result.confirmed
        ) {
          results.push(
            result
          );
        }
      }
    }

    results.sort(
      (a, b) =>
        b.score - a.score
    );

    cache = {
      ok: true,

      source:
        "Binance",

      updatedAt:
        Date.now(),

      scanned:
        symbols.length,

      rows:
        results.slice(0, 20),

      error:
        null
    };

    console.log(
      `Tarama tamamlandı: ${symbols.length} coin / ${results.length} teyit`
    );

  } catch (error) {
    console.error(
      "Tarama hatası:",
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
   API
========================= */

app.get(
  "/api/daily-confirmations",
  async (req, res) => {

    res.set(
      "Cache-Control",
      "no-store"
    );

    if (
      !cache.updatedAt ||
      Date.now() -
        cache.updatedAt >
        5 * 60 * 1000
    ) {
      await scanMarket();
    }

    res.json(cache);
  }
);


app.get(
  "/health",
  (req, res) => {

    res.json({
      ok: true,

      scannerRunning:
        scanning,

      lastScan:
        cache.updatedAt,

      scanned:
        cache.scanned,

      confirmations:
        cache.rows.length,

      source:
        cache.source
    });
  }
);


/* =========================
   SUNUCUYU BAŞLAT
========================= */

app.listen(
  PORT,
  () => {

    console.log(
      `TradeRadar çalışıyor: ${PORT}`
    );

    scanMarket();
  }
);


/* =========================
   5 DAKİKADA BİR TARA
========================= */

setInterval(
  scanMarket,
  5 * 60 * 1000
);
