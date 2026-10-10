import {startKucoinFlow,kucoinFlowSnapshot} from "./kucoin-flow.js";
import {startOkxFlow,okxFlowSnapshot} from "./okx-flow.js";
import {startFlowRadar,flowSnapshot} from "./flow-radar.js";
import express from "express";
import webpush from "web-push";
import fs from "fs";
import { detectMinutePatterns } from "./minute-patterns.js";
import { detectPrePumpSetup } from "./pre-pump-setup.js";
import { buildDecisionPlans } from "./decision-engine.js";
import { analyzeMediumTrend, detectMediumPreBreakout } from "./medium-trend.js";
import { recordSignals, getSignalStatistics } from "./signal-stats.js";



const app = express();
app.get("/api/flow-radar",(req,res)=>{
 res.set("Cache-Control","no-store");
 const gate=flowSnapshot(),okx=okxFlowSnapshot(),kucoin=kucoinFlowSnapshot();
 const rows=[...gate.rows,...okx.rows,...kucoin.rows].sort((a,b)=>
  Number(b.mode.includes("ARTIYOR"))-Number(a.mode.includes("ARTIYOR"))||
  Math.abs(b.imbalancePercent)-Math.abs(a.imbalancePercent));
 res.json({connected:gate.connected||okx.connected||kucoin.connected,updatedAt:Date.now(),
  trackedSymbols:gate.trackedSymbols+okx.trackedSymbols+kucoin.trackedSymbols,
  lastMessage:Math.max(gate.lastMessage||0,okx.lastMessage||0,kucoin.lastMessage||0),
  exchanges:{gate:{connected:gate.connected,tracked:gate.trackedSymbols,error:gate.lastError,subscriptionError:gate.subscriptionError},
   okx:{connected:okx.connected,tracked:okx.trackedSymbols,error:okx.lastError},
   kucoin:{connected:kucoin.connected,tracked:kucoin.trackedSymbols,error:kucoin.lastError}},
  rows:rows.slice(0,200),notice:"Gerçekleşen işlemler; her coin ve borsada eksiksiz kapsama garanti edilmez."});
});
const PORT = process.env.PORT || 3000;

const OKX =
  "https://www.okx.com";

const KUCOIN =
  "https://api.kucoin.com";

const GATE =
  "https://api.gateio.ws/api/v4";

app.use(
  express.json({
    limit: "64kb"
  })
);

app.use(
  express.static(".")
);


/* =========================
   WEB PUSH
========================= */

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY || "";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  "mailto:traderadar@localhost";


if (
  VAPID_PUBLIC_KEY &&
  VAPID_PRIVATE_KEY
) {

  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}


/*
  Push aboneliklerini Railway
  volume üzerinde saklayacağız.
*/

const PUSH_FILE =
  "/data/push-subscriptions.json";


let pushSubscriptions = [];


/*
  Aynı coin aynı senaryoda
  kaldığı sürece tekrar bildirim
  göndermemek için hafıza.
*/

const scenarioSeen =
  new Map();


try {

  if (
    fs.existsSync(
      PUSH_FILE
    )
  ) {

    pushSubscriptions =
      JSON.parse(
        fs.readFileSync(
          PUSH_FILE,
          "utf8"
        )
      );


    if (
      !Array.isArray(
        pushSubscriptions
      )
    ) {

      pushSubscriptions = [];
    }
  }

} catch (error) {

  console.error(
    "Push abonelikleri okunamadı:",
    error.message
  );

  pushSubscriptions = [];
}


/* =========================
   PUSH ABONELİK KAYDI
========================= */

function savePushSubscriptions() {

  try {

    fs.mkdirSync(
      "/data",
      {
        recursive: true
      }
    );


    fs.writeFileSync(
      PUSH_FILE,
      JSON.stringify(
        pushSubscriptions,
        null,
        2
      )
    );

  } catch (error) {

    console.error(
      "Push abonelikleri kaydedilemedi:",
      error.message
    );
  }
}
/* =========================
   PUSH GÖNDER
========================= */

async function sendPush(
  payload
) {

  if (
    !VAPID_PUBLIC_KEY ||
    !VAPID_PRIVATE_KEY ||
    !pushSubscriptions.length
  ) {
    return;
  }

  const body =
    JSON.stringify(
      payload
    );

  const activeSubscriptions = [];

  for (
    const subscription
    of pushSubscriptions
  ) {

    try {

      await webpush.sendNotification(
        subscription,
        body,
        {
          TTL: 120
        }
      );

      activeSubscriptions.push(
        subscription
      );

    } catch (error) {

      /*
        404 ve 410:
        Abonelik artık geçerli değil.
      */

      if (
        error.statusCode !== 404 &&
        error.statusCode !== 410
      ) {

        activeSubscriptions.push(
          subscription
        );

        console.error(
          "Push gönderilemedi:",
          error.message
        );
      }
    }
  }

  if (
    activeSubscriptions.length !==
    pushSubscriptions.length
  ) {

    pushSubscriptions =
      activeSubscriptions;

    savePushSubscriptions();
  }
}


/* =========================
   SENARYO BİLDİRİMLERİ
========================= */

async function notifyScenarioChanges(
  cache
) {

  const groups = [
    ["scenario1", 1],
    ["scenario2", 2],
    ["scenario3", 3],
    ["scenario4", 4]
  ];

  /*
    Bu taramada aktif olan
    senaryolar.
  */

  const activeNow =
    new Set();


  for (
    const [
      scenarioName,
      scenarioNumber
    ]
    of groups
  ) {

    const rows =
      Array.isArray(
        cache?.[
          scenarioName
        ]?.rows
      )
        ? cache[
            scenarioName
          ].rows
        : [];


    for (
      const row
      of rows
    ) {

      const symbol =
        row.symbol ||
        row.instId ||
        row.pair ||
        "Coin";


      const source =
        row.source ||
        row.exchange ||
        "";


      /*
        Her coin + borsa + senaryo
        için benzersiz kimlik.
      */

      const key =
        `${scenarioNumber}:${source}:${symbol}`;


      activeNow.add(
        key
      );


      /*
        Daha önce aynı senaryo için
        bildirim gönderildiyse
        tekrar gönderme.
      */

      if (
        scenarioSeen.has(
          key
        )
      ) {
        continue;
      }


      scenarioSeen.set(
        key,
        Date.now()
      );


      const score =
        Number(
          row.score
        );


      const scoreText =
        Number.isFinite(
          score
        )
          ? ` • ${Math.round(
              score
            )}/100`
          : "";


      const sourceText =
        source
          ? ` • ${source}`
          : "";


      await sendPush({

        title:
          `TradeRadar • Senaryo ${scenarioNumber}`,

        body:
          `${symbol}${sourceText} • Senaryo ${scenarioNumber} koşullarını sağladı${scoreText}`,

        tag:
          `scenario-${key}`,

        url:
          "/#scenario",

        scenario:
          scenarioNumber,

        symbol,

        source,

        score:
          Number.isFinite(
            score
          )
            ? score
            : null
      });
    }
  }


  /*
    Coin artık senaryoyu
    sağlamıyorsa hafızadan çıkar.

    Daha sonra yeniden aynı
    senaryoya girerse tekrar
    bildirim gönderilebilir.
  */

  for (
    const key
    of scenarioSeen.keys()
  ) {

    if (
      !activeNow.has(
        key
      )
    ) {

      scenarioSeen.delete(
        key
      );
    }
  }
}

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
   SENARYO 3
   FİYAT İVMESİ BAŞLIYOR
========================= */

function analyzeScenario3(
  source,
  symbol
) {

  const state =
    getMicroState(
      source,
      symbol
    );

  const trades =
    Array.isArray(state.trades)
      ? state.trades
      : [];

  if (trades.length < 5) {
    return null;
  }

  const latestTrade =
    trades.at(-1);

  const now =
    Number(latestTrade.time) ||
    Date.now();

  const currentPrice =
    Number(latestTrade.price);

  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    return null;
  }


  function windowStats(seconds) {

    const startTime =
      now -
      seconds * 1000;

    const rows =
      trades.filter(
        trade =>
          trade.time >= startTime &&
          trade.time <= now
      );

    if (!rows.length) {

      return {
        priceChange: 0,
        volume: 0,
        tradesPerSecond: 0,
        volumePerSecond: 0,
        buyerRatio: 0
      };
    }

    const firstPrice =
      Number(
        rows[0].price
      );

    const lastPrice =
      Number(
        rows.at(-1).price
      );

    const priceChange =
      firstPrice > 0
        ? (
            (
              lastPrice -
              firstPrice
            ) /
            firstPrice
          ) * 100
        : 0;

    let volume = 0;
    let buyVolume = 0;

    for (
      const trade
      of rows
    ) {

      const value =
        Number(
          trade.value
        ) || 0;

      volume += value;

      if (
        trade.side === "buy"
      ) {
        buyVolume += value;
      }
    }

    return {

      priceChange,

      volume,

      tradesPerSecond:
        rows.length /
        seconds,

      volumePerSecond:
        volume /
        seconds,

      buyerRatio:
        volume > 0
          ? (
              buyVolume /
              volume
            ) * 100
          : 0
    };
  }


  const w5 =
    windowStats(5);

  const w10 =
    windowStats(10);

  const w30 =
    windowStats(30);

  const w60 =
    windowStats(60);


  const priceAcceleration =
    w10.priceChange >
      w5.priceChange &&
    w30.priceChange >
      w10.priceChange &&
    w60.priceChange >
      w30.priceChange;


  const volumeGrowing =
    w10.volume >
      w5.volume &&
    w30.volume >
      w10.volume &&
    w60.volume >
      w30.volume;


  const tradeFrequencyGrowing =
    w10.tradesPerSecond >=
      w5.tradesPerSecond * 0.75 &&
    w30.tradesPerSecond >=
      w10.tradesPerSecond * 0.75 &&
    w60.tradesPerSecond >=
      w30.tradesPerSecond * 0.65;


  const buyerStrengthening =
    w10.buyerRatio >= 52 &&
    w30.buyerRatio >= 55;


  let score = 0;


  if (w5.priceChange >= 0.05) {
    score += 5;
  }

  if (w5.priceChange >= 0.10) {
    score += 5;
  }

  if (w10.priceChange >= 0.15) {
    score += 7;
  }

  if (w10.priceChange >= 0.22) {
    score += 5;
  }

  if (w30.priceChange >= 0.35) {
    score += 7;
  }

  if (w30.priceChange >= 0.55) {
    score += 5;
  }

  if (w60.priceChange >= 0.60) {
    score += 8;
  }

  if (w60.priceChange >= 0.95) {
    score += 5;
  }

  if (priceAcceleration) {
    score += 15;
  }

  if (volumeGrowing) {
    score += 12;
  }

  if (tradeFrequencyGrowing) {
    score += 12;
  }

  if (buyerStrengthening) {
    score += 7;
  }

  if (w10.buyerRatio >= 60) {
    score += 5;
  }


  score =
    Math.min(
      score,
      100
    );


  const lateMove =
    w60.priceChange >= 3 ||
    w30.priceChange >= 2.5;


  let status =
    "İVME ZAYIF";


  if (lateMove) {

    status =
      "GEÇ KALINDI";

  } else if (
    score >= 80 &&
    priceAcceleration &&
    volumeGrowing &&
    tradeFrequencyGrowing
  ) {

    status =
      "GÜÇLÜ FİYAT İVMESİ";

  } else if (
    score >= 60
  ) {

    status =
      "İVME HIZLANIYOR";

  } else if (
    score >= 40
  ) {

    status =
      "İVME OLUŞUYOR";
  }


  return {

    symbol,

    source,

    price:
      currentPrice,

    score,

    status,

    price5:
      w5.priceChange,

    price10:
      w10.priceChange,

    price30:
      w30.priceChange,

    price60:
      w60.priceChange,

    volume5:
      w5.volume,

    volume10:
      w10.volume,

    volume30:
      w30.volume,

    volume60:
      w60.volume,

    volumePerSecond5:
      w5.volumePerSecond,

    volumePerSecond10:
      w10.volumePerSecond,

    volumePerSecond30:
      w30.volumePerSecond,

    volumePerSecond60:
      w60.volumePerSecond,

    tradesPerSecond5:
      w5.tradesPerSecond,

    tradesPerSecond10:
      w10.tradesPerSecond,

    tradesPerSecond30:
      w30.tradesPerSecond,

    tradesPerSecond60:
      w60.tradesPerSecond,

    buyerRatio5:
      w5.buyerRatio,

    buyerRatio10:
      w10.buyerRatio,

    buyerRatio30:
      w30.buyerRatio,

    buyerRatio60:
      w60.buyerRatio,

    priceAcceleration,

    volumeGrowing,

    tradeFrequencyGrowing,

    buyerStrengthening,

    lateMove,

    qualifies:
      score >= 40
  };
}
/* =========================
   SENARYO 4
   BÜYÜK TEYİT
========================= */

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
}

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

let minuteRadarCache = {

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


// Erken uyarılarda aynı coini sürekli bildirmemek için.
const earlyAlertState = new Map();
const EARLY_ALERT_COOLDOWN = 30 * 60 * 1000;
let earlyAlertsInitialized = false;

async function notifyEarlyMovement(rows) {
  if (!Array.isArray(rows)) return;
  const now = Date.now();
  const active = rows.filter(row => row.earlyWatch && row.dataFresh &&
    Number(row.earlyScore) >= 75 && Number(row.change5) < 2.5);
  // İlk tam taramada mevcut sinyalleri başlangıç durumu kabul et.
  // Böylece sunucu yeniden başladığında eski sinyaller yağmaz.
  if (!earlyAlertsInitialized) {
    for (const row of active) {
      earlyAlertState.set(row.source + ":" + row.symbol, now);
    }
    earlyAlertsInitialized = true;
    return;
  }
  for (const row of active) {
    const key = row.source + ":" + row.symbol;
    const lastAlert = earlyAlertState.get(key) || 0;
    if (now - lastAlert < EARLY_ALERT_COOLDOWN) continue;
    earlyAlertState.set(key, now);
    await sendPush({
      title: "TradeRadar • Erken Hareket",
      body: row.symbol + " • " + row.source + " | Hazırlık " +
        row.earlyScore + "/100 | Hacim " +
        Number(row.volumeAcceleration).toFixed(2) + "x. Kesin yükseliş sinyali değildir.",
      tag: "early-" + key.replace(/[^A-Za-z0-9_-]/g,"-"),
      url: "/#radar"
    });
  }
  for (const [key,time] of earlyAlertState) {
    if (now - time > EARLY_ALERT_COOLDOWN * 2) earlyAlertState.delete(key);
  }
}

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

function calculateMACD(closes) {

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
     ERKEN HAREKET DEDEKTÖRÜ
     Yalnız 1 dakikalık mumlardan ölçülür.
     1 dakika sonra yükseliş garantisi yoktur.
  ========================= */
  const latestTimestamp = Number(last.time);
  const freshnessMs = Date.now() - latestTimestamp;
  // Mum açılış zamanı veya kapanış zamanı sağlayan borsalar için
  // 1 dakikalık pencere toleransı; eski veriden erken uyarı üretme.
  const dataFresh = Number.isFinite(latestTimestamp) &&
    freshnessMs >= -65000 && freshnessMs <= 125000;
  const distanceToResistance = compressionHigh > 0
    ? (compressionHigh - price) / compressionHigh * 100 : null;
  const nearResistance = distanceToResistance !== null &&
    distanceToResistance >= -0.2 && distanceToResistance <= 1.0;
  const notExtended = change5 >= -0.5 && change5 < 2.5 &&
    change15 >= -1 && change15 < 4 && change1 >= -0.5 && change1 < 1.5;
  const earlyVolume = volumeAcceleration >= 1.5 || lastVolumeRatio >= 1.8;
  const momentumTurning = ema7Slope > 0 && emaSpreadAcceleration > 0;
  const earlyWatch = dataFresh && wasCompressed && nearResistance &&
    earlyVolume && momentumTurning && notExtended &&
    rsiNow >= 45 && rsiNow <= 72 && !lateMoveGuard();
  function lateMoveGuard() {
    return change10 >= 7 || change15 >= 8 ||
      (change5 >= 5 && rsiNow >= 75);
  }
  const earlyReasons = [
    wasCompressed ? "20 dakikalık fiyat aralığı dar" : null,
    nearResistance ? "Sıkışma direncine yakın" : null,
    earlyVolume ? "1 dakikalık mumlarda hacim artıyor" : null,
    momentumTurning ? "EMA7 eğimi ve ayrışması pozitif" : null,
    notExtended ? "Fiyat henüz aşırı yükselmemiş" : null
  ].filter(Boolean);
  const earlyScore = Math.round(
    (wasCompressed ? 20 : 0) +
    (nearResistance ? 20 : 0) +
    (earlyVolume ? 25 : 0) +
    (momentumTurning ? 20 : 0) +
    (notExtended ? 15 : 0)
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


  const prePump = detectPrePumpSetup(data);
  const patternDecision = detectMinutePatterns(data);
  // Teknik risk modunu güçlü yükseliş puanından bağımsız hesapla.
  const decisionMode = patternDecision.mode;
  const patternScore = patternDecision.patternScore;
  const patterns = patternDecision.patterns;
  const patternWarnings = patternDecision.warnings;
  const triggerPrice = patternDecision.trigger;
  const technicalStop = patternDecision.stop;

  const signalLevel =
    stage;


  /*
    Radar artık erken aşamayı da
    gösterebilir. Durağan coinleri
    sonuç listesine almıyoruz.
  */

  // İzleme ekranı eski veriyi gösterebilir; ancak yeni sinyal olarak
  // yayımlanabilmesi için veri güncel ve hareket aşırı ilerlememiş olmalı.
  const qualifies = dataFresh && (stageNumber >= 1 || earlyWatch || decisionMode === "AL" || prePump.setupPhase === "PRE_BREAKOUT" || prePump.setupPhase === "BREAKOUT");


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
    ...prePump,
    decisionMode,
    patternScore,
    patterns,
    patternWarnings,
    triggerPrice,
    technicalStop,

    earlyWatch,
    earlyScore,
    earlyReasons,
    distanceToResistance,
    compressionHigh,
    compressionLow,
    dataFresh,

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
    calculateMACD(closes);

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
     W/TRY TİPİ KIRILIM KONTROLÜ
     Günlük mumlardan hesaplanır.
     15 dakikalık verilerle karıştırılmaz.
  ========================= */

  const ema7Daily = ema(closes, 7);
  const ema25Daily = ema(closes, 25);
  const ema7PrevDaily = ema(closes.slice(0, -3), 7);
  const ema25PrevDaily = ema(closes.slice(0, -3), 25);
  const emaSeparation =
    ema25Daily > 0 ? (ema7Daily / ema25Daily - 1) * 100 : 0;
  const emaSeparationBefore =
    ema25PrevDaily > 0 ? (ema7PrevDaily / ema25PrevDaily - 1) * 100 : 0;
  const emaOpening = emaSeparation > emaSeparationBefore;

  const baseWindow = candles.slice(-16, -5);
  const baseHigh = Math.max(...baseWindow.map(c => c.high));
  const baseLow = Math.min(...baseWindow.map(c => c.low));
  const baseRangePct = baseLow > 0
    ? (baseHigh / baseLow - 1) * 100 : 0;
  const compressedBefore = baseRangePct > 0 && baseRangePct <= 12;

  const recentVolumeAvg = average(volumes.slice(-3));
  const earlierVolumeAvg = average(volumes.slice(-23, -3));
  const sustainedVolumeRatio = earlierVolumeAvg > 0
    ? recentVolumeAvg / earlierVolumeAvg : 0;

  const last5 = candles.slice(-5);
  const positiveCandles = last5.filter(c => c.close > c.open).length;
  const breakoutFromBase = baseHigh > 0 && price > baseHigh;
  const dailyBreakoutSetup =
    compressedBefore &&
    breakoutFromBase &&
    ema7Daily > ema25Daily &&
    emaOpening &&
    sustainedVolumeRatio >= 1.4 &&
    positiveCandles >= 3;

  if (dailyBreakoutSetup) {
    score += 8;
    reasons.push("W tipi: sıkışma sonrası hacimli EMA7/25 kırılımı");
  }

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
    Number.isFinite(atrPct) && atrPct > 0 && atrPct <= 12 &&
    Number.isFinite(resistanceDistance) &&
    resistanceDistance >= -4 && resistanceDistance <= 8 &&

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

    dailyBreakoutSetup,
    compressedBefore,
    baseRangePct,
    sustainedVolumeRatio,
    ema7Daily,
    ema25Daily,
    emaOpening,

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

let mediumWatchCache={updatedAt:0,scanned:0,rows:[]};

async function scanMarket() {

  if (scanning) {
    return;
  }

  scanning = true;
  const mediumCandidates=[];
  let mediumScanned=0;
  const utcDayStart=Math.floor(Date.now()/86400000)*86400000;
  function collectMedium(symbol,source,candles){
    const closed=candles.filter(x=>Number(x.time)<utcDayStart);
    const setup=detectMediumPreBreakout(closed);
    if(!setup)return;
    mediumScanned++;
    if(setup.score>=50 && setup.status!=="GEÇ KALINDI"){
      mediumCandidates.push({symbol:String(symbol).replace(/[-_]USDT$/,"/USDT"),
        source,...setup});
    }
  }

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
                collectMedium(symbol,"OKX",candles);

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
                collectMedium(item.symbol,"KUCOIN",candles);

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
                collectMedium(item.symbol,"GATE",candles);

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

    mediumWatchCache={
      updatedAt:Date.now(),scanned:mediumScanned,
      rows:mediumCandidates.sort((a,b)=>b.score-a.score).slice(0,100)
    };

    recordSignals("daily", [...okxResults, ...kucoinResults, ...gateResults].filter(row => row.confirmed));

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


// Binance TR public market scanner. No trading keys or account access.
const BINANCE_TR = "https://www.binance.tr";
const BINANCE_TR_MAIN = "https://api.binance.me";
const BINANCE_TR_NEXT = "https://cloudme-tr.2meta.app";
let binanceTrLastError = null;
async function trFetch(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(11000), headers: { Accept: "application/json" } });
  if (!response.ok) throw Error("Binance TR HTTP " + response.status + (response.status === 451 ? " — sunucu IP adresinden erişim kısıtlandı; farklı veri kaynağı izinsiz kullanılmayacak" : ""));
  const body = await response.json();
  if (body.code !== 0 || !body.data) throw Error("Binance TR API: " + (body.msg || body.message || "geçersiz yanıt"));
  return body.data;
}
async function trSymbols() {
  const data = await trFetch(BINANCE_TR + "/open/v1/common/symbols");
  if (!Array.isArray(data.list)) throw Error("Binance TR sembol listesi eksik");
  const list = data.list.filter(x => String(x.quoteAsset).toUpperCase() === "TRY" &&
    x.spotTradingEnable !== false && x.spotTradingEnable !== 0 && [1,3].includes(Number(x.type)) &&
    /^[A-Z0-9]+_TRY$/.test(String(x.symbol).toUpperCase()));
  if (!list.length) throw Error("Binance TR üzerinde aktif TRY paritesi bulunamadı");
  return list;
}
async function trCandles(item) {
  const kind = Number(item.type);
  const base = kind === 1 ? BINANCE_TR_MAIN : BINANCE_TR_NEXT;
  const symbol = kind === 1 ? item.symbol.replaceAll("_","") : item.symbol;
  const raw = await trFetch(base + (kind === 1 ? "/api/v1/klines" : "/api/v1/klines") + "?symbol=" + encodeURIComponent(symbol) + "&interval=1m&limit=90");
  if (!Array.isArray(raw)) throw Error("Mum verisi geçersiz");
  return raw.map(row => ({
    time: Number(row[0]), open: Number(row[1]), high: Number(row[2]),
    low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
    quoteVolume: Number(row[7]), trades: Number(row[8]), buyVolume: Number(row[9])
  })).filter(c => [c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite) && c.low > 0)
    .sort((a,b)=>a.time-b.time);
}
function trAnalyze(item, candles) {
  if (candles.length < 40) return null;
  const recent = candles.slice(-6), prev = candles.slice(-26,-6);
  const last = recent.at(-1), old = recent[0];
  const baseline = prev.reduce((n,c)=>n+c.volume,0)/prev.length;
  if (!(baseline > 0) || !(last.close > 0)) return null;
  const volumeRatio = last.volume / baseline;
  const high = Math.max(...prev.map(c=>c.high));
  const low = Math.min(...prev.map(c=>c.low));
  const change5 = (last.close/old.close-1)*100;
  const buyPressure = last.volume > 0 && Number.isFinite(last.buyVolume) ? last.buyVolume/last.volume : null;
  const consolidation = (high-low)/low < 0.075;
  const volume = volumeRatio >= 1.5;
  const breakout = last.close > high && volume;
  const buying = buyPressure !== null && buyPressure >= 0.57;
  const notLate = change5 < 7 && change5 > -2;
  const signals = [consolidation && "Birikim / sıkışma",buying && "Alıcı baskısı",breakout && "Hacimli kırılım",notLate && last.close > old.close && "Erken ivme"].filter(Boolean);
  if (signals.length < 2 || !volume || !notLate) return null;
  const score = Math.min(95, 20 + signals.length*14 + Math.min(12,volumeRatio*3) + (buying?7:0));
  return { symbol: item.symbol.replace("_","/"), exchange:"BINANCE TR", price:last.close,
    volumeRatio, resistance:high, support:low, priceChange5:change5,
    buyPressure, score:Math.round(score), signals, qualifies:true };
}
async function scanBinanceTrScenarios() {
  if (scenarioCache.scanning) return;
  scenarioCache.scanning = true;
  let scanned=0, failed=0;
  const rows=[];
  try {
    const symbols = await trSymbols();
    for(let i=0;i<symbols.length;i+=5) {
      const batch=await Promise.allSettled(symbols.slice(i,i+5).map(async item=>{
        const candles=await trCandles(item);
        if(candles.length<40) return null;
        scanned++;
        return trAnalyze(item,candles);
      }));
      for(const result of batch) {
        if(result.status==="rejected") failed++;
        else if(result.value) rows.push(result.value);
      }
      if(i+5<symbols.length) await new Promise(resolve=>setTimeout(resolve,180));
    }
    if(!scanned) throw Error("Binance TR mum verisi alınamadı ("+failed+" başarısız istek)");
    rows.sort((a,b)=>b.score-a.score);
    const common={ok:true,scanned,rows:[],error:null};
    scenarioCache={updatedAt:Date.now(),scanning:false,exchange:"BINANCE TR", failed,
      scenario1:{...common,rows:rows.slice(0,60)},scenario2:{...common},scenario3:{...common},scenario4:{...common}};
    binanceTrLastError=null;
  } catch(error) {
    binanceTrLastError=error.message;
    const part={ok:false,scanned:0,rows:[],error:error.message};
    scenarioCache={updatedAt:Date.now(),scanning:false,exchange:"BINANCE TR",
      scenario1:part,scenario2:part,scenario3:part,scenario4:part};
    console.error("Binance TR tarama hatası:",error.message);
  } finally {scenarioCache.scanning=false;}
}


let usdTryCache={rate:null,updatedAt:0};
async function getUsdTryReference() {
  if(usdTryCache.rate && Date.now()-usdTryCache.updatedAt<60*60*1000)return usdTryCache.rate;
  try {
    const response=await fetch("https://open.er-api.com/v6/latest/USD",{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error("Kur HTTP "+response.status);
    const data=await response.json();
    const rate=Number(data?.rates?.TRY);
    if(!(rate>0))throw Error("Kur verisi yok");
    usdTryCache={rate,updatedAt:Date.now()};
    return rate;
  }catch(error){console.error("USD/TRY referans kuru:",error.message);return null;}
}
function analyzeEarlyMovement(symbol, exchange, candles) {
  const valid = candles.filter(c => [c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite) && c.low>0 && c.volume>=0);
  if(valid.length<30) return null;
  const last=valid.at(-1), previous=valid.slice(-26,-6), recent=valid.slice(-6);
  const old=recent[0];
  if(!previous.length || !(old.close>0)) return null;
  const resistance=Math.max(...previous.map(c=>c.high));
  const support=Math.min(...previous.map(c=>c.low));
  const avgVolume=previous.reduce((n,c)=>n+c.volume,0)/previous.length;
  if(!(avgVolume>0)) return null;
  const volumeRatio=recent.reduce((n,c)=>n+c.volume,0)/recent.length/avgVolume;
  const change5=(last.close/old.close-1)*100;
  const change1=(last.close/valid.at(-2).close-1)*100;
  const rangePct=(resistance/support-1)*100;
  const nearResistance=last.close>=resistance*0.985;
  const breakout=last.close>resistance && volumeRatio>=1.5;
  const compression=rangePct<=5 && rangePct>0;
  const acceleration=change1>=0.35 && change5>=0.8 && volumeRatio>=1.4;
  const activeVolume=volumeRatio>=1.4;
  const notLate=change5<=6 && change5>=-1;
  const signals=[
    compression && nearResistance && "Birikim / direnç yakınlığı",
    activeVolume && "Hacim artışı",
    breakout && "Hacimli kırılım",
    acceleration && "Fiyat ivmesi"
  ].filter(Boolean);
  if(!notLate || !activeVolume || signals.length<2) return null;
  const score=Math.min(95,Math.round(22+signals.length*14+Math.min(volumeRatio,4)*5));
  const entry=breakout ? resistance : Math.min(last.close,resistance*0.995);
  const stop=Math.min(support,entry*0.975);
  const risk=entry-stop;
  if(!(risk>0))return null;
  const target=entry+2*risk;
  return {symbol,source:exchange,exchange,price:last.close,score,signals,
    volumeRatio,resistance,support,priceChange5:change5,priceChange1:change1,
    entry,stop,target,riskReward:2,qualifies:true};
}
// Persistent rotating market scan: every eligible symbol is visited over successive batches.
const marketScanState={universe:[],cursor:0,cycle:0,results:new Map(),scanned:0,failed:0,counts:{},errors:[],loadedAt:0};
const MARKET_BATCH_LIMIT=90;
const MARKET_UNIVERSE_TTL=30*60*1000;
async function loadMarketUniverse(){
  const exchanges=[
    {name:"OKX",symbols:()=>getSymbols(),candles:getOKXMinuteCandles,pick:x=>x},
    {name:"KUCOIN",symbols:getKucoinSymbols,candles:getKucoinMinuteCandles,pick:x=>x.symbol},
    {name:"GATE.IO",symbols:getGateSymbols,candles:getGateMinuteCandles,pick:x=>x.symbol}
  ];
  const loaded=await Promise.allSettled(exchanges.map(async e=>({exchange:e,symbols:await e.symbols()})));
  const universe=[],errors=[];
  for(let i=0;i<loaded.length;i++){
    const r=loaded[i],exchange=exchanges[i];
    if(r.status==="rejected"){errors.push(exchange.name+": "+r.reason?.message);continue;}
    for(const item of r.value.symbols){
      const symbol=exchange.pick(item);
      if(symbol)universe.push({exchange:exchange.name,symbol,candles:exchange.candles});
    }
  }
  if(!universe.length)throw Error("Üç borsadan da uygun parite listesi alınamadı: "+errors.join(" | "));
  return {universe,errors};
}
async function scanScenarios(){
  if(scenarioCache.scanning)return;
  scenarioCache.scanning=true;
  try{
    if(!marketScanState.universe.length || (marketScanState.cursor>=marketScanState.universe.length && Date.now()-marketScanState.loadedAt>MARKET_UNIVERSE_TTL)){
      const loaded=await loadMarketUniverse();
      marketScanState.universe=loaded.universe;
      marketScanState.errors=loaded.errors;
      marketScanState.cursor=0;
      marketScanState.scanned=0;
      marketScanState.failed=0;
      marketScanState.counts={};
      marketScanState.results.clear();
      marketScanState.loadedAt=Date.now();
      marketScanState.cycle++;
    }
    const state=marketScanState;
    const start=state.cursor;
    const end=Math.min(start+MARKET_BATCH_LIMIT,state.universe.length);
    const batchItems=state.universe.slice(start,end);
    for(let i=0;i<batchItems.length;i+=5){
      const batch=await Promise.allSettled(batchItems.slice(i,i+5).map(async item=>{
        const candles=await item.candles(item.symbol);
        if(!Array.isArray(candles)||candles.length<30)throw Error("Eksik mum verisi");
        return analyzeEarlyMovement(item.symbol.replace(/[-_]USDT$/,"/USDT"),item.exchange,candles);
      }));
      batch.forEach((result,j)=>{
        const item=batchItems[i+j];
        if(result.status==="rejected"){state.failed++;return;}
        state.scanned++;
        state.counts[item.exchange]=(state.counts[item.exchange]||0)+1;
        const key=item.exchange+":"+item.symbol;
        if(result.value)state.results.set(key,result.value);
        else state.results.delete(key);
      });
      if(i+5<batchItems.length)await new Promise(resolve=>setTimeout(resolve,220));
    }
    state.cursor=end;
    const complete=state.cursor>=state.universe.length;
    const rows=[...state.results.values()].sort((a,b)=>b.score-a.score);
    const usdTryRate=await getUsdTryReference();
    const part={ok:state.scanned>0,scanned:state.scanned,rows:rows.slice(0,30),error:state.scanned?null:state.errors.join(" | ")};
    const empty={ok:state.scanned>0,scanned:state.scanned,rows:[],error:state.scanned?null:state.errors.join(" | ")};
    scenarioCache={updatedAt:Date.now(),scanning:false,exchange:"OKX + KUCOIN + GATE.IO",
      counts:{...state.counts},errors:[...state.errors],usdTryRate,failed:state.failed,
      universeTotal:state.universe.length,processed:state.cursor,complete,cycle:state.cycle,
      fxBasis:"USD/TRY referans kuru; USDT/TRY işlem fiyatı değildir",
      scenario1:part,scenario2:empty,scenario3:empty,scenario4:empty};
    console.log("Piyasa taraması",JSON.stringify({processed:state.cursor,total:state.universe.length,scanned:state.scanned,failed:state.failed,found:rows.length}));
  }catch(error){
    const part={ok:false,scanned:0,rows:[],error:error.message};
    scenarioCache={updatedAt:Date.now(),scanning:false,exchange:"OKX + KUCOIN + GATE.IO",
      scenario1:part,scenario2:part,scenario3:part,scenario4:part};
  }finally{scenarioCache.scanning=false;}
}
async function scanScenariosLegacy() {

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

/* =========================
   SENARYO BİLDİRİMLERİ
========================= */

await notifyScenarioChanges(
  scenarioCache
);
    
    recordSignals("scenario", [...scenario1Rows, ...scenario2Rows, ...scenario3Rows, ...scenario4Rows].filter(row => Number(row.score) >= 70));

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
/* =========================
   ERKEN HAREKET PUSH BİLDİRİMİ
========================= */
const earlyAlertSeen = new Map();
let earlyAlertPrimed = false;
async function notifyEarlyRadar(rows) {
  const now = Date.now();
  const active = Array.isArray(rows)
    ? rows.filter(row => row.earlyWatch && row.dataFresh && Number(row.earlyScore) >= 80)
    : [];
  // İlk taramada mevcut sinyalleri kaydet; eski sinyallerle bildirim yağdırma.
  for (const row of active) {
    const key = String(row.source || "") + ":" + String(row.symbol || "");
    const lastSent = earlyAlertSeen.get(key) || 0;
    if (earlyAlertPrimed && now - lastSent >= 30 * 60 * 1000) {
      await sendPush({
        title: "TradeRadar • Erken Hareket",
        body: row.symbol + " • " + row.source +
          " • Hazırlık " + row.earlyScore + "/100" +
          " • Hacim " + Number(row.volumeAcceleration || 0).toFixed(2) + "x" +
          " • Kırılım öncesi izleme, garanti değildir.",
        tag: "early-" + key,
        url: "/#radar"
      });
    }
    earlyAlertSeen.set(key, now);
  }
  earlyAlertPrimed = true;
  for (const [key, timestamp] of earlyAlertSeen) {
    if (now - timestamp > 2 * 60 * 60 * 1000) earlyAlertSeen.delete(key);
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
        [...finalResults].sort((a,b) =>
          Number(Boolean(b.earlyWatch)) - Number(Boolean(a.earlyWatch)) ||
          Number(b.score||0) - Number(a.score||0)
        ).slice(0,50),

      exchanges:
        exchangeStatus
    };


    await notifyEarlyRadar(finalResults);

    await notifyEarlyMovement(minuteRadarCache.rows);

    // Ölçüm: yalnız kırılım öncesi hazırlık sinyalleri, geç gelen teyitler değil.
    recordSignals("prepump", finalResults.filter(row =>
      row.dataFresh && row.setupPhase === "PRE_BREAKOUT" &&
      Number(row.setupScore)>=70 && !row.lateMove));

    recordSignals("radar", finalResults.filter(row => row.dataFresh && !row.lateMove && (row.earlyWatch || (row.stageNumber >= 2 && row.score >= 70))));

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

app.get("/api/signal-statistics", (req,res)=>{
  res.set("Cache-Control","no-store");
  res.json(getSignalStatistics());
});

app.get("/api/medium-watch",(req,res)=>{
  res.set("Cache-Control","no-store");
  const rows=mediumWatchCache.rows.map(item=>{
    const match=minuteRadarCache.rows.find(r=>
      String(r.symbol).replace(/[-_]USDT$/,"/USDT")===item.symbol &&
      String(r.source).toUpperCase().replace("GATE.IO","GATE")===item.source);
    const intraday=Boolean(match&&match.dataFresh&&!match.lateMove&&
      (match.earlyWatch||match.decisionMode==="AL")&&
      Number(match.volumeAcceleration)>=1.5);
    return {...item,
      status:intraday&&item.status==="YÜKSELİŞ HAZIRLIĞI"?
        "YÜKSELİŞ BAŞLIYOR":item.status,
      intradayConfirmed:intraday,
      minuteScore:match?.score??null,
      minuteVolume:match?.volumeAcceleration??null};
  });
  res.json({ok:mediumWatchCache.updatedAt>0,...mediumWatchCache,rows,
    note:"YÜKSELİŞ BAŞLIYOR: günlük hazırlık ve güncel dakikalık hareket birlikte. Kesin yükseliş tahmini değildir."});
});

// Medium-term research uses completed UTC daily candles and existing public exchange APIs.
app.get("/api/medium-trend",async(req,res)=>{
  res.set("Cache-Control","no-store");
  const raw=String(req.query.symbol||"").toUpperCase().trim();
  const source=String(req.query.exchange||"OKX").toUpperCase();
  const symbol=raw.replace(/[-_/](USDT|TRY)$/,"").replace(/[^A-Z0-9]/g,"");
  if(!/^[A-Z0-9]{2,20}$/.test(symbol)||!["OKX","KUCOIN","GATE"].includes(source))
    return res.status(400).json({ok:false,error:"Geçersiz coin veya borsa."});
  try{
    const pair=source==="GATE"?symbol+"_USDT":symbol+"-USDT";
    const candles=source==="OKX"?await getCandles(pair):
      source==="KUCOIN"?await getKucoinCandles(pair):await getGateCandles(pair);
    // Exclude today's unfinished UTC daily candle.
    const utcStart=Math.floor(Date.now()/86400000)*86400000;
    const closed=candles.filter(x=>Number(x.time)<utcStart);
    const result=analyzeMediumTrend(closed);
    if(!result)return res.json({ok:true,symbol:symbol+"/USDT",exchange:source,
      status:"VERİ YETERSİZ",reason:"En az 105 tamamlanmış günlük mum gerekli."});
    return res.json({ok:true,symbol:symbol+"/USDT",exchange:source,...result,
      note:"Geçmiş tamamlanmış mumların teknik yorumu; kesin yükseliş tahmini değildir."});
  }catch(e){return res.status(502).json({ok:false,error:"Borsa verisi alınamadı.",detail:e.message});}
});

app.get("/api/decision-plans",(req,res)=>{
  res.set("Cache-Control","no-store");
  res.json(buildDecisionPlans(cache,minuteRadarCache,scenarioCache));
});

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
   YÜKSELİŞ SENARYOLARI API
========================= */

app.get(
  "/api/scenarios",
  async (
    req,
    res
  ) => {

    res.set(
      "Cache-Control",
      "no-store"
    );


    /*
      İlk istek veya veri
      60 saniyeden eskiyse
      senaryoları yeniden tara.
    */

    if (
      !scenarioCache.updatedAt ||
      (
        Date.now() -
        scenarioCache.updatedAt
      ) >
      60 * 1000
    ) {

      await scanScenarios();
    }


    res.json(
      scenarioCache
    );
  }
);

/* =========================
   X MANAGER GERÇEK USDT GRAFİĞİ
========================= */
const xChartRequests = new Map();
app.get("/api/x/chart", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const raw = String(req.query.symbol || "").trim().toUpperCase();
  const exchange = String(req.query.exchange || "OKX").toUpperCase();
  const base = raw.replace(/[-_/]?(USDT|USD|TRY)$/i, "").replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{1,18}$/.test(base) || !["OKX", "KUCOIN", "GATE.IO"].includes(exchange)) {
    return res.status(400).json({ error: "Geçerli coin ve borsa seçin." });
  }
  const ip = req.ip || "unknown";
  const now = Date.now();
  const last = xChartRequests.get(ip) || 0;
  if (now - last < 2500) return res.status(429).json({ error: "Yeni grafik için birkaç saniye bekleyin." });
  xChartRequests.set(ip, now);
  if (xChartRequests.size > 2000) xChartRequests.clear();
  try {
    const pair = exchange === "GATE.IO" ? base + "_USDT" : base + "-USDT";
    const candles = exchange === "OKX"
      ? await getCandles(pair)
      : exchange === "KUCOIN"
        ? await getKucoinCandles(pair)
        : await getGateCandles(pair);
    const rows = candles.filter(x => [x.time,x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite) && x.low > 0).slice(-65);
    if (rows.length < 25) return res.status(404).json({ error: "Bu borsada yeterli USDT mum verisi bulunamadı." });
    const closes = rows.map(x => x.close);
    const volumes = rows.map(x => x.volume);
    const first = closes[0], lastPrice = closes.at(-1);
    const high = Math.max(...rows.map(x => x.high));
    const low = Math.min(...rows.map(x => x.low));
    const previousVolume = average(volumes.slice(-21, -1));
    const volumeRatio = previousVolume > 0 ? volumes.at(-1) / previousVolume : 0;
    const ema7 = ema(closes,7), ema25 = ema(closes,25);
    const change = (lastPrice / first - 1) * 100;
    // Yalnızca geçmiş mumlardan türetilmiş teyitli salınım seviyeleri.
    const pivotHighs = [], pivotLows = [];
    for (let i = 2; i < rows.length - 2; i++) {
      const window = rows.slice(i - 2, i + 3);
      if (rows[i].high === Math.max(...window.map(v => v.high))) pivotHighs.push({ index:i, price:rows[i].high });
      if (rows[i].low === Math.min(...window.map(v => v.low))) pivotLows.push({ index:i, price:rows[i].low });
    }
    const currentPrice = lastPrice;
    const clusterLevels = (pivots) => {
      const sorted = [...pivots].sort((a,b) => a.price - b.price);
      const clusters = [];
      for (const pivot of sorted) {
        const near = clusters.find(g => Math.abs(g.price-pivot.price)/pivot.price < 0.012);
        if (near) {
          near.price = (near.price * near.count + pivot.price)/(near.count+1);
          near.count++;
        } else clusters.push({price:pivot.price,count:1});
      }
      return clusters;
    };
    const supports = clusterLevels(pivotLows).filter(v => v.price < currentPrice).sort((a,b)=>b.price-a.price).slice(0,2);
    const resistances = clusterLevels(pivotHighs).filter(v => v.price > currentPrice).sort((a,b)=>a.price-b.price).slice(0,2);
    // Son 6-20 mum içinde, önceki 20 mumluk aralığa göre daralan ve
    // ardından yukarı kırılan en güncel bölgeyi seç.
    let compression = null;
    for (let end = rows.length - 4; end >= 9; end--) {
      for (let length = 6; length <= 16 && end-length >= 0; length++) {
        const segment = rows.slice(end-length,end);
        const segmentHigh = Math.max(...segment.map(v=>v.high));
        const segmentLow = Math.min(...segment.map(v=>v.low));
        const pct = (segmentHigh/segmentLow-1)*100;
        const prior = rows.slice(Math.max(0,end-length-15),end-length);
        const priorRange = prior.length >= 6
          ? (Math.max(...prior.map(v=>v.high))/Math.min(...prior.map(v=>v.low))-1)*100 : null;
        const after = rows.slice(end,Math.min(rows.length,end+6));
        const broke = after.some(v=>v.close > segmentHigh);
        if (pct <= 9 && priorRange !== null && pct < priorRange*.75 && broke) {
          compression = {start:end-length,end:end-1,low:segmentLow,high:segmentHigh,breakoutIndex:end+after.findIndex(v=>v.close>segmentHigh)};
          break;
        }
      }
      if(compression) break;
    }
    const technicalNotes = [];
    if (ema7 > ema25) technicalNotes.push("EMA7, EMA25 üzerinde: kısa vadeli eğilim pozitif.");
    else technicalNotes.push("EMA7, EMA25 altında: kısa vadeli eğilim zayıf.");
    if (volumeRatio >= 1.5) technicalNotes.push("Son mum hacmi önceki 20 mum ortalamasının " + volumeRatio.toFixed(1) + " katı.");
    else technicalNotes.push("Son mumda belirgin hacim sıçraması doğrulanmadı.");
    if (change > 0) technicalNotes.push("İncelenen dönemde fiyat %" + change.toFixed(2) + " yükseldi.");
    else technicalNotes.push("İncelenen dönemde fiyat %" + Math.abs(change).toFixed(2) + " geriledi.");
    res.json({ ok:true, symbol:base+"/USDT", exchange, timeframe:"1D", candles:rows, supports, resistances, compression,
      price:lastPrice, change, high, low, ema7, ema25, volumeRatio, notes:technicalNotes,
      disclaimer:"Teknik gözlemdir; kesin neden veya yatırım önerisi değildir." });
  } catch (error) {
    console.error("X grafik veri hatası:", error.message);
    res.status(502).json({ error:"Borsa verisi alınamadı: " + error.message });
  }
});

/* =========================
   PUSH BİLDİRİM API
========================= */


/*
  Telefonun kullanacağı
  public VAPID anahtarı.
*/

app.get(
  "/api/push/public-key",
  (
    req,
    res
  ) => {

    res.set(
      "Cache-Control",
      "no-store"
    );


    res.json({

      ok:
        Boolean(
          VAPID_PUBLIC_KEY
        ),

      publicKey:
        VAPID_PUBLIC_KEY
    });
  }
);


/*
  Telefonu bildirim sistemine
  kaydet.
*/

app.post(
  "/api/push/subscribe",
  (
    req,
    res
  ) => {

    const subscription =
      req.body;


    if (
      !subscription ||
      !subscription.endpoint
    ) {

      return res
        .status(400)
        .json({

          ok: false,

          error:
            "Geçersiz push aboneliği"
        });
    }


    const exists =
      pushSubscriptions.some(
        item =>
          item.endpoint ===
          subscription.endpoint
      );


    if (!exists) {

      pushSubscriptions.push(
        subscription
      );

      savePushSubscriptions();
    }


    res.json({

      ok: true,

      subscriptions:
        pushSubscriptions.length
    });
  }
);


/*
  Bildirim aboneliğini kaldır.
*/

app.post(
  "/api/push/unsubscribe",
  (
    req,
    res
  ) => {

    const endpoint =
      req.body?.endpoint;


    if (endpoint) {

      pushSubscriptions =
        pushSubscriptions.filter(
          item =>
            item.endpoint !==
            endpoint
        );


      savePushSubscriptions();
    }


    res.json({
      ok: true
    });
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

/* =========================
   7/24 SENARYO TARAMASI
========================= */

/*
  Sunucu açıldıktan 30 saniye
  sonra ilk senaryo taramasını
  başlat.
*/

setTimeout(
  () => {

    scanScenarios()
      .catch(
        error => {

          console.error(
            "Otomatik senaryo taraması:",
            error.message
          );
        }
      );
  },
  30 * 1000
);


/*
  Uygulama veya telefon açık
  olmasa da Railway üzerinde
  senaryoları 2 dakikada bir tara.
*/

setInterval(
  () => {

    scanScenarios()
      .catch(
        error => {

          console.error(
            "Otomatik senaryo taraması:",
            error.message
          );
        }
      );
  },
  2 * 60 * 1000
);

/* Sunucuda otomatik erken hareket taraması.
   Tam piyasa REST taraması uzun sürebileceği için üst üste başlatılmaz.
   Bir sonraki tur, önceki tur bittikten sonra planlanır. */
let backgroundMinuteRadarEnabled = true;
async function backgroundMinuteRadarLoop() {
  if (!backgroundMinuteRadarEnabled) return;
  try {
    if (!minuteRadarScanning) await scanMinuteRadar();
  } catch (error) {
    console.error("Erken hareket arka plan taraması:", error.message);
  } finally {
    if (backgroundMinuteRadarEnabled) {
      setTimeout(backgroundMinuteRadarLoop, 3 * 60 * 1000);
    }
  }
}
setTimeout(backgroundMinuteRadarLoop, 45 * 1000);


startFlowRadar();
startOkxFlow();
startKucoinFlow();
