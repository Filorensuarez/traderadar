// TradeRadar Ultimate
// Bağımsız Self-Test
//
// Gerçek emir göndermez.
// Mevcut TradeRadar'a müdahale etmez.

import Ultimate, {
  ultimateStatus,
  ultimateCanGenerateSignal
} from "./index.js";


const tests = [];


function test(
  name,
  condition,
  details = null
) {
  const passed =
    Boolean(condition);

  tests.push({
    name,
    passed,
    details
  });

  console.log(
    passed
      ? `PASS: ${name}`
      : `FAIL: ${name}`,
    details ?? ""
  );

  return passed;
}


// =====================================
// 1. CONFIG
// =====================================

test(
  "Config geçerli",
  Ultimate.configCheck
    .valid === true,
  Ultimate.configCheck
);


const weightTotal =
  Object.values(
    Ultimate.config
      .scoring
      .weights
  ).reduce(
    (
      total,
      value
    ) =>
      total +
      Number(value),
    0
  );


test(
  "Teknik puan ağırlıkları 100",
  weightTotal === 100,
  weightTotal
);


// =====================================
// 2. DATA QUALITY
// =====================================

const goodTick =
  Ultimate.dataQuality
    .validateTick({
      symbol:
        "BTC-USDT",

      price:
        60000,

      volume:
        1000,

      timestamp:
        Date.now(),

      bid:
        59999,

      ask:
        60001
    });


test(
  "Geçerli tick kabul ediliyor",
  goodTick.valid === true,
  goodTick
);


const badTick =
  Ultimate.dataQuality
    .validateTick({
      symbol:
        "TEST-USDT",

      price:
        0,

      volume:
        0,

      timestamp:
        Date.now() -
        60000
    });


test(
  "Bozuk tick reddediliyor",
  badTick.valid === false,
  badTick
);


// =====================================
// 3. MARKET DATA
// =====================================

const marketTick =
  Ultimate.marketData
    .addTick({
      symbol:
        "TEST-USDT",

      price:
        100,

      quantity:
        10,

      quoteVolume:
        1000,

      side:
        "buy",

      timestamp:
        Date.now()
    });


test(
  "Market Data tick kabul ediyor",
  marketTick.ok === true,
  marketTick
);


Ultimate.marketData
  .updateBestBidAsk(
    "TEST-USDT",
    99.9,
    100.1
  );


const marketSnapshot =
  Ultimate.marketData
    .snapshot(
      "TEST-USDT"
    );


test(
  "Bid/Ask spread hesaplanıyor",
  Number.isFinite(
    Number(
      marketSnapshot
        ?.spreadPct
    )
  ),
  marketSnapshot
);


// =====================================
// 4. ENTRY ENGINE
// =====================================

const entryResult =
  Ultimate.entry
    .calculate({
      price:
        100,

      technical: {
        atr:
          2,

        vwap:
          99,

        ema: {
          ema9:
            99.5,

          ema20:
            98.5
        },

        support:
          97,

        resistance:
          104,

        breakout: {
          breakout:
            false
        },

        retest: {
          detected:
            false,

          level:
            null
        }
      },

      market: {
        spreadPct:
          0.10
      },

      signalTime:
        Date.now()
    });


test(
  "Entry Engine sonuç üretiyor",
  entryResult.ready === true,
  entryResult
);


test(
  "İdeal giriş hesaplanıyor",
  Number.isFinite(
    Number(
      entryResult
        .entry
        ?.ideal
    )
  ),
  entryResult.entry
);


// =====================================
// 5. STOP ENGINE
// =====================================

const stopResult =
  Ultimate.stop
    .calculate({
      entryPrice:
        entryResult
          .entry
          .ideal,

      technical: {
        atr:
          2,

        atrPct:
          2,

        support:
          96,

        structure: {
          structure:
            "UPTREND",

          swings: {
            lastLow: {
              price:
                97
            }
          }
        }
      },

      regime: {
        volatility:
          "NORMAL_VOLATILITY"
      }
    });


test(
  "Stop Engine sonuç üretiyor",
  stopResult.ready === true,
  stopResult
);


test(
  "Stop girişin altında",
  stopResult.stop <
  entryResult.entry.ideal,
  {
    entry:
      entryResult.entry.ideal,

    stop:
      stopResult.stop
  }
);


// =====================================
// 6. TARGET + R/R
// =====================================

const targetResult =
  Ultimate.targetRisk
    .calculate({
      entryPrice:
        entryResult
          .entry
          .ideal,

      stopPrice:
        stopResult.stop,

      technical: {
        atr:
          2,

        resistance:
          110,

        structure: {
          swings: {
            lastHigh: {
              price:
                112
            }
          }
        }
      },

      slippagePct:
        0.10
    });


test(
  "Target Engine sonuç üretiyor",
  targetResult.ready === true,
  targetResult
);


test(
  "Üç hedef hesaplanıyor",
  Number.isFinite(
    Number(
      targetResult
        .targets
        ?.target1
    )
  ) &&
  Number.isFinite(
    Number(
      targetResult
        .targets
        ?.target2
    )
  ) &&
  Number.isFinite(
    Number(
      targetResult
        .targets
        ?.target3
    )
  ),
  targetResult.targets
);


test(
  "Net R/R hesaplanıyor",
  Number.isFinite(
    Number(
      targetResult
        .riskReward
        ?.netRR
    )
  ),
  targetResult.riskReward
);


// =====================================
// 7. POSITION SIZE
// =====================================

const positionSize =
  Ultimate.risk
    .calculatePositionSize({
      capital:
        200000,

      entryPrice:
        entryResult
          .entry
          .ideal,

      stopPrice:
        stopResult.stop,

      riskPerTradePct:
        0.50
    });


test(
  "Pozisyon büyüklüğü hesaplanıyor",
  positionSize.ready === true,
  positionSize
);


test(
  "Tek işleme tüm sermaye verilmiyor",
  positionSize.positionValue <
  positionSize.capital,
  positionSize
);


// =====================================
// 8. DAILY RISK
// =====================================

const dailyRisk =
  Ultimate.risk
    .dailyRiskCheck({
      capital:
        200000
    });


test(
  "Başlangıç günlük riski uygun",
  dailyRisk
    .tradingAllowed ===
    true,
  dailyRisk
);


// =====================================
// 9. PAPER TRADING
// =====================================

const paperOpen =
  Ultimate.paperTrading
    .open({
      id:
        "SELF-TEST-1",

      symbol:
        "TEST-USDT",

      price:
        entryResult
          .entry
          .ideal,

      stop:
        stopResult.stop,

      targets:
        targetResult.targets,

      positionValue:
        Math.min(
          10000,
          positionSize
            .positionValue
        ),

      technicalScore:
        85,

      metadata: {
        relativeVolume:
          2.5,

        cvdPositive:
          true,

        breakout:
          true,

        btcUptrend:
          true
      }
    });


test(
  "Paper Trading sanal pozisyon açıyor",
  paperOpen.ok === true,
  paperOpen
);


if (paperOpen.ok) {
  const paperClose =
    Ultimate.paperTrading
      .close({
        id:
          "SELF-TEST-1",

        price:
          targetResult
            .targets
            .target1,

        reason:
          "SELF_TEST"
      });


  test(
    "Paper Trading sanal pozisyon kapatıyor",
    paperClose.ok === true,
    paperClose
  );
}


// =====================================
// 10. PERFORMANCE
// =====================================

const performance =
  Ultimate.performance
    .analyze({
      trades:
        Ultimate
          .paperTrading
          .closedTrades,

      equityCurve:
        Ultimate
          .paperTrading
          .equityCurve
    });


test(
  "Performance Engine çalışıyor",
  Number.isFinite(
    Number(
      performance
        .totalTrades
    )
  ),
  performance
);


// =====================================
// 11. BACKTEST
// =====================================

const candles = [];


for (
  let i = 0;
  i < 200;
  i++
) {
  const base =
    100 +
    i * 0.02;


  candles.push({
    timestamp:
      Date.now() -
      (
        200 - i
      ) *
      60000,

    open:
      base,

    high:
      base + 1,

    low:
      base - 1,

    close:
      base + 0.2,

    volume:
      1000 + i
  });
}


const split =
  Ultimate.backtest
    .splitData(
      candles
    );


test(
  "Backtest Training verisi var",
  split.training.length > 0,
  split.counts
);


test(
  "Backtest Validation verisi var",
  split.validation.length > 0,
  split.counts
);


test(
  "Backtest Out-of-Sample verisi var",
  split.outOfSample.length > 0,
  split.counts
);


// =====================================
// 12. FAIL-SAFE
// =====================================

const failSafe =
  ultimateCanGenerateSignal();


test(
  "Fail-safe fonksiyonu çalışıyor",
  typeof failSafe.allowed ===
    "boolean",
  failSafe
);


// =====================================
// 13. ULTIMATE STATUS
// =====================================

const status =
  ultimateStatus();


test(
  "Ultimate Status oluşturuluyor",
  typeof status.ready ===
    "boolean",
  status
);


// =====================================
// SONUÇ
// =====================================

const passed =
  tests.filter(
    item =>
      item.passed
  ).length;


const failed =
  tests.length -
  passed;


const result = {
  passed,
  failed,

  total:
    tests.length,

  success:
    failed === 0,

  tests
};


console.log(
  "\n=============================="
);

console.log(
  "TRADERADAR ULTIMATE SELF TEST"
);

console.log(
  "=============================="
);

console.log(
  `Başarılı: ${passed}`
);

console.log(
  `Başarısız: ${failed}`
);

console.log(
  `Toplam: ${tests.length}`
);


if (
  failed === 0
) {
  console.log(
    "SONUÇ: TÜM TESTLER BAŞARILI"
  );

} else {
  console.error(
    "SONUÇ: HATA VAR – CANLI SİSTEME BAĞLAMA"
  );
}


export default result;
