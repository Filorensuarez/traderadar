// TradeRadar Ultimate
// Backtest + Walk-Forward Engine
//
// Temel ilkeler:
// - Look-ahead bias engellenir.
// - Komisyon ve slippage hesaba katılır.
// - Aynı mumda stop ve hedef görülürse
//   fiyat sırası bilinmiyorsa muhafazakâr
//   olarak STOP önce gerçekleşmiş kabul edilir.
// - Training / Validation / Out-of-Sample
//   birbirinden ayrılır.

export class BacktestEngine {
  constructor(options = {}) {
    this.config = {
      buyCommissionPct:
        options.buyCommissionPct ?? 0.10,

      sellCommissionPct:
        options.sellCommissionPct ?? 0.10,

      slippagePct:
        options.slippagePct ?? 0.10,

      trainingPct:
        options.trainingPct ?? 60,

      validationPct:
        options.validationPct ?? 20,

      outOfSamplePct:
        options.outOfSamplePct ?? 20,

      minimumTrades:
        options.minimumTrades ?? 100,

      conservativeIntrabar:
        options.conservativeIntrabar ??
        true
    };
  }


  // ===================================
  // YARDIMCILAR
  // ===================================

  number(
    value,
    fallback = null
  ) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }


  // ===================================
  // VERİYİ KRONOLOJİK SIRALA
  // ===================================

  sortCandles(
    candles = []
  ) {
    return [...candles]
      .filter(
        candle =>
          candle &&
          Number.isFinite(
            Number(
              candle.timestamp
            )
          )
      )
      .sort(
        (a, b) =>
          Number(a.timestamp) -
          Number(b.timestamp)
      );
  }


  // ===================================
  // VERİ BÖLME
  // ===================================

  splitData(
    candles = []
  ) {
    const sorted =
      this.sortCandles(
        candles
      );


    const total =
      sorted.length;


    const trainEnd =
      Math.floor(
        total *
        (
          this.config
            .trainingPct /
          100
        )
      );


    const validationEnd =
      trainEnd +
      Math.floor(
        total *
        (
          this.config
            .validationPct /
          100
        )
      );


    return {
      training:
        sorted.slice(
          0,
          trainEnd
        ),

      validation:
        sorted.slice(
          trainEnd,
          validationEnd
        ),

      outOfSample:
        sorted.slice(
          validationEnd
        ),

      counts: {
        total,

        training:
          trainEnd,

        validation:
          validationEnd -
          trainEnd,

        outOfSample:
          total -
          validationEnd
      }
    };
  }


  // ===================================
  // İŞLEM MALİYETİ
  // ===================================

  buyExecutionPrice(
    price
  ) {
    return (
      price *
      (
        1 +
        this.config
          .slippagePct /
        100
      )
    );
  }


  sellExecutionPrice(
    price
  ) {
    return (
      price *
      (
        1 -
        this.config
          .slippagePct /
        100
      )
    );
  }


  commission(
    value,
    pct
  ) {
    return (
      value *
      (
        pct /
        100
      )
    );
  }


  // ===================================
  // MUM İÇİ STOP / HEDEF
  // ===================================

  resolveIntrabar({
    candle,
    stop,
    target
  } = {}) {

    const high =
      this.number(
        candle?.high
      );


    const low =
      this.number(
        candle?.low
      );


    if (
      high === null ||
      low === null
    ) {
      return {
        hit: false,
        type: null,
        price: null
      };
    }


    const stopHit =
      low <= stop;


    const targetHit =
      high >= target;


    // Aynı mumda hem stop
    // hem hedef varsa sıralama
    // bilinmiyor.
    if (
      stopHit &&
      targetHit
    ) {
      if (
        this.config
          .conservativeIntrabar
      ) {
        return {
          hit: true,
          type: "STOP",
          price: stop,
          ambiguous: true
        };
      }


      return {
        hit: true,
        type: "AMBIGUOUS",
        price: null,
        ambiguous: true
      };
    }


    if (stopHit) {
      return {
        hit: true,
        type: "STOP",
        price: stop,
        ambiguous: false
      };
    }


    if (targetHit) {
      return {
        hit: true,
        type: "TARGET",
        price: target,
        ambiguous: false
      };
    }


    return {
      hit: false,
      type: null,
      price: null,
      ambiguous: false
    };
  }


  // ===================================
  // TEK İŞLEM SİMÜLASYONU
  // ===================================

  simulateTrade({
    candles = [],
    signalIndex,
    entry,
    stop,
    target,
    positionValue = 10000
  } = {}) {

    const sorted =
      this.sortCandles(
        candles
      );


    const index =
      Number(signalIndex);


    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >=
        sorted.length - 1
    ) {
      return {
        ok: false,
        reason:
          "SİNYAL İNDEKSİ GEÇERSİZ"
      };
    }


    const rawEntry =
      this.number(entry);


    const stopPrice =
      this.number(stop);


    const targetPrice =
      this.number(target);


    if (
      rawEntry === null ||
      stopPrice === null ||
      targetPrice === null ||
      stopPrice >= rawEntry ||
      targetPrice <= rawEntry
    ) {
      return {
        ok: false,
        reason:
          "İŞLEM SEVİYELERİ GEÇERSİZ"
      };
    }


    const executionEntry =
      this.buyExecutionPrice(
        rawEntry
      );


    const quantity =
      positionValue /
      executionEntry;


    const buyCommission =
      this.commission(
        positionValue,
        this.config
          .buyCommissionPct
      );


    let highestPrice =
      executionEntry;

    let lowestPrice =
      executionEntry;


    let exitType =
      "END_OF_DATA";


    let rawExit =
      sorted.at(-1)
        ?.close;


    let exitIndex =
      sorted.length - 1;


    // =================================
    // LOOK-AHEAD KORUMASI
    // =================================
    //
    // Sinyal mumunun kendisini
    // kullanmıyoruz.
    // Yalnız sonraki mumlardan
    // itibaren işlem sonucunu
    // değerlendiriyoruz.

    for (
      let i = index + 1;
      i < sorted.length;
      i++
    ) {
      const candle =
        sorted[i];


      const high =
        this.number(
          candle.high
        );


      const low =
        this.number(
          candle.low
        );


      if (
        high !== null
      ) {
        highestPrice =
          Math.max(
            highestPrice,
            high
          );
      }


      if (
        low !== null
      ) {
        lowestPrice =
          Math.min(
            lowestPrice,
            low
          );
      }


      const event =
        this.resolveIntrabar({
          candle,

          stop:
            stopPrice,

          target:
            targetPrice
        });


      if (event.hit) {
        exitType =
          event.type;

        rawExit =
          event.price;

        exitIndex =
          i;

        break;
      }
    }


    const rawExitNumber =
      this.number(
        rawExit,
        executionEntry
      );


    const executionExit =
      this.sellExecutionPrice(
        rawExitNumber
      );


    const grossExitValue =
      executionExit *
      quantity;


    const sellCommission =
      this.commission(
        grossExitValue,
        this.config
          .sellCommissionPct
      );


    const netEntryCost =
      positionValue +
      buyCommission;


    const netExitValue =
      grossExitValue -
      sellCommission;


    const netPnL =
      netExitValue -
      netEntryCost;


    const initialRisk =
      executionEntry -
      stopPrice;


    const resultR =
      initialRisk > 0
        ? (
            executionExit -
            executionEntry
          ) /
          initialRisk
        : null;


    const mfeR =
      initialRisk > 0
        ? (
            highestPrice -
            executionEntry
          ) /
          initialRisk
        : null;


    const maeR =
      initialRisk > 0
        ? (
            executionEntry -
            lowestPrice
          ) /
          initialRisk
        : null;


    return {
      ok: true,

      signalIndex:
        index,

      exitIndex,

      entry:
        executionEntry,

      stop:
        stopPrice,

      target:
        targetPrice,

      exit:
        executionExit,

      exitType,

      quantity,

      buyCommission,

      sellCommission,

      netPnL,

      resultR,

      mfeR,

      maeR
    };
  }


  // ===================================
  // ÖZET
  // ===================================

  summarize(
    trades = []
  ) {
    const valid =
      trades.filter(
        trade =>
          trade?.ok
      );


    const wins =
      valid.filter(
        trade =>
          trade.netPnL > 0
      );


    const losses =
      valid.filter(
        trade =>
          trade.netPnL < 0
      );


    const netProfit =
      valid.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          Number(
            trade.netPnL ||
            0
          ),
        0
      );


    const grossProfit =
      wins.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          trade.netPnL,
        0
      );


    const grossLoss =
      Math.abs(
        losses.reduce(
          (
            sum,
            trade
          ) =>
            sum +
            trade.netPnL,
          0
        )
      );


    const profitFactor =
      grossLoss > 0
        ? grossProfit /
          grossLoss
        : grossProfit > 0
          ? Infinity
          : 0;


    const averageR =
      valid.length
        ? valid.reduce(
            (
              sum,
              trade
            ) =>
              sum +
              Number(
                trade.resultR ||
                0
              ),
            0
          ) /
          valid.length
        : 0;


    return {
      trades:
        valid.length,

      wins:
        wins.length,

      losses:
        losses.length,

      winRate:
        valid.length
          ? (
              wins.length /
              valid.length
            ) * 100
          : 0,

      netProfit,

      profitFactor,

      averageR,

      sufficientData:
        valid.length >=
        this.config
          .minimumTrades,

      evaluation:
        valid.length >=
        this.config
          .minimumTrades
          ? "ÖRNEKLEM YETERLİ"
          : "YETERSİZ VERİ"
    };
  }


  // ===================================
  // WALK-FORWARD BÖLÜMLERİ
  // ===================================

  walkForwardSplit(
    candles = []
  ) {
    const split =
      this.splitData(
        candles
      );


    return {
      training: {
        candles:
          split.training,

        purpose:
          "PARAMETRE GELİŞTİRME"
      },

      validation: {
        candles:
          split.validation,

        purpose:
          "PARAMETRE DOĞRULAMA"
      },

      outOfSample: {
        candles:
          split.outOfSample,

        purpose:
          "NİHAİ TARAFSIZ TEST"
      },

      counts:
        split.counts,

      rules: {
        optimizeOn:
          "TRAINING",

        selectOn:
          "VALIDATION",

        finalEvaluationOn:
          "OUT_OF_SAMPLE",

        reuseOutOfSampleForOptimization:
          false
      }
    };
  }


  // ===================================
  // PARAMETRE DAYANIKLILIK KONTROLÜ
  // ===================================

  robustnessCheck(
    results = []
  ) {
    const valid =
      results.filter(
        result =>
          result &&
          Number.isFinite(
            Number(
              result.expectancy
            )
          ) &&
          Number.isFinite(
            Number(
              result.profitFactor
            )
          )
      );


    if (
      valid.length < 3
    ) {
      return {
        stable: false,

        evaluation:
          "YETERSİZ VERİ"
      };
    }


    const expectancies =
      valid.map(
        result =>
          Number(
            result.expectancy
          )
      );


    const profitFactors =
      valid.map(
        result =>
          Number(
            result.profitFactor
          )
      );


    const positive =
      expectancies.filter(
        value =>
          value > 0
      ).length;


    const positiveRatio =
      positive /
      valid.length;


    const pfAboveOne =
      profitFactors.filter(
        value =>
          value > 1
      ).length /
      valid.length;


    const stable =
      positiveRatio >= 0.70 &&
      pfAboveOne >= 0.70;


    return {
      stable,

      positiveExpectancyRatio:
        positiveRatio,

      profitableFactorRatio:
        pfAboveOne,

      evaluation:
        stable
          ? "PARAMETRELER DAYANIKLI GÖRÜNÜYOR"
          : "OVERFITTING / KARARSIZLIK RİSKİ"
    };
  }


  // ===================================
  // CANLI KURAL DEĞİŞİKLİĞİ KORUMASI
  // ===================================

  approveCandidate({
    backtestPassed = false,
    validationPassed = false,
    outOfSamplePassed = false,
    walkForwardPassed = false,
    paperTradingPassed = false,
    userApproved = false
  } = {}) {

    const checks = {
      backtestPassed:
        Boolean(
          backtestPassed
        ),

      validationPassed:
        Boolean(
          validationPassed
        ),

      outOfSamplePassed:
        Boolean(
          outOfSamplePassed
        ),

      walkForwardPassed:
        Boolean(
          walkForwardPassed
        ),

      paperTradingPassed:
        Boolean(
          paperTradingPassed
        ),

      userApproved:
        Boolean(
          userApproved
        )
    };


    const approved =
      Object.values(
        checks
      ).every(Boolean);


    return {
      approved,

      checks,

      message:
        approved
          ? "YENİ PARAMETRE CANLI KULLANIMA UYGUN"
          : "CANLI KURAL DEĞİŞİKLİĞİ REDDEDİLDİ"
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createBacktestEngine(
  options = {}
) {
  return new BacktestEngine(
    options
  );
}
