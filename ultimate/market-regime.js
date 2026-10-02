// TradeRadar Ultimate
// Market Regime + BTC Environment Engine

export class MarketRegimeEngine {
  constructor(options = {}) {
    this.config = {
      strongTrendScore:
        options.strongTrendScore ?? 75,

      trendScore:
        options.trendScore ?? 60,

      highVolatilityAtrPct:
        options.highVolatilityAtrPct ?? 3,

      lowVolatilityAtrPct:
        options.lowVolatilityAtrPct ?? 1,

      btcHardStop1mPct:
        options.btcHardStop1mPct ?? -2,

      btcHardStop5mPct:
        options.btcHardStop5mPct ?? -3.5,

      btcRiskReduction15mPct:
        options.btcRiskReduction15mPct ?? -3,

      btcStrongBuyRatio:
        options.btcStrongBuyRatio ?? 60,

      btcWeakBuyRatio:
        options.btcWeakBuyRatio ?? 40
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


  clamp(
    value,
    min = 0,
    max = 100
  ) {
    return Math.max(
      min,
      Math.min(
        max,
        Number(value) || 0
      )
    );
  }


  // ===================================
  // TEK ZAMAN DİLİ TREND PUANI
  // ===================================

  timeframeScore(
    analysis = {}
  ) {
    if (
      !analysis ||
      analysis.ready === false
    ) {
      return {
        ready: false,
        score: 50,
        direction: "UNKNOWN"
      };
    }


    let score = 50;


    const trend =
      String(
        analysis.trend ||
        analysis.trend
          ?.direction ||
        ""
      );


    const longTrend =
      String(
        analysis.longTrend ||
        ""
      );


    const momentum =
      String(
        analysis.momentum ||
        ""
      );


    const structure =
      String(
        analysis.structure
          ?.structure ||
        ""
      );


    const rsi =
      this.number(
        analysis.rsi
      );


    const adx =
      this.number(
        analysis.adx
      );


    const histogram =
      this.number(
        analysis.macd
          ?.histogram
      );


    // Trend
    if (
      trend === "UPTREND"
    ) {
      score += 15;
    }


    if (
      trend === "DOWNTREND"
    ) {
      score -= 15;
    }


    // EMA 200
    if (
      longTrend ===
      "ABOVE_EMA200"
    ) {
      score += 10;
    }


    if (
      longTrend ===
      "BELOW_EMA200"
    ) {
      score -= 10;
    }


    // Momentum
    if (
      momentum ===
      "POSITIVE"
    ) {
      score += 10;
    }


    if (
      momentum ===
      "NEGATIVE"
    ) {
      score -= 10;
    }


    // Market structure
    if (
      structure ===
      "UPTREND" ||
      structure ===
      "RISING_BASE"
    ) {
      score += 10;
    }


    if (
      structure ===
      "DOWNTREND" ||
      structure ===
      "FALLING_TOP"
    ) {
      score -= 10;
    }


    // RSI
    if (
      rsi !== null
    ) {
      if (
        rsi >= 55 &&
        rsi <= 75
      ) {
        score += 5;
      }


      if (
        rsi <= 45
      ) {
        score -= 5;
      }
    }


    // MACD
    if (
      histogram !== null
    ) {
      if (
        histogram > 0
      ) {
        score += 5;
      }


      if (
        histogram < 0
      ) {
        score -= 5;
      }
    }


    // ADX trendin gücünü artırır.
    if (
      adx !== null &&
      adx >= 25
    ) {
      if (
        score > 50
      ) {
        score += 5;
      }


      if (
        score < 50
      ) {
        score -= 5;
      }
    }


    score =
      this.clamp(
        score
      );


    let direction =
      "RANGE";


    if (
      score >=
      this.config
        .strongTrendScore
    ) {
      direction =
        "STRONG_UPTREND";

    } else if (
      score >=
      this.config
        .trendScore
    ) {
      direction =
        "UPTREND";

    } else if (
      score <=
      100 -
      this.config
        .strongTrendScore
    ) {
      direction =
        "STRONG_DOWNTREND";

    } else if (
      score <=
      100 -
      this.config
        .trendScore
    ) {
      direction =
        "DOWNTREND";
    }


    return {
      ready: true,
      score,
      direction
    };
  }


  // ===================================
  // ÇOKLU ZAMAN DİLİ REJİMİ
  // ===================================

  classifyMarket(
    timeframes = {}
  ) {
    const weights = {
      "1m": 0.10,
      "3m": 0.10,
      "5m": 0.15,
      "15m": 0.25,
      "1h": 0.25,
      "4h": 0.15
    };


    let weightedScore = 0;
    let usedWeight = 0;

    const details = {};


    for (
      const [
        timeframe,
        weight
      ] of Object.entries(
        weights
      )
    ) {
      const result =
        this.timeframeScore(
          timeframes[
            timeframe
          ]
        );


      details[
        timeframe
      ] =
        result;


      if (
        result.ready
      ) {
        weightedScore +=
          result.score *
          weight;

        usedWeight +=
          weight;
      }
    }


    const score =
      usedWeight > 0
        ? weightedScore /
          usedWeight
        : 50;


    let regime =
      "RANGE";


    if (
      score >= 75
    ) {
      regime =
        "STRONG_UPTREND";

    } else if (
      score >= 60
    ) {
      regime =
        "UPTREND";

    } else if (
      score <= 25
    ) {
      regime =
        "STRONG_DOWNTREND";

    } else if (
      score <= 40
    ) {
      regime =
        "DOWNTREND";
    }


    // =================================
    // VOLATİLİTE
    // =================================

    const volatilityValues =
      Object.values(
        timeframes
      )
        .map(
          item =>
            this.number(
              item?.atrPct
            )
        )
        .filter(
          value =>
            value !== null
        );


    const averageAtrPct =
      volatilityValues.length
        ? volatilityValues
            .reduce(
              (
                total,
                value
              ) =>
                total +
                value,
              0
            ) /
          volatilityValues
            .length
        : null;


    let volatility =
      "NORMAL_VOLATILITY";


    if (
      averageAtrPct !== null &&
      averageAtrPct >=
        this.config
          .highVolatilityAtrPct
    ) {
      volatility =
        "HIGH_VOLATILITY";

    } else if (
      averageAtrPct !== null &&
      averageAtrPct <=
        this.config
          .lowVolatilityAtrPct
    ) {
      volatility =
        "LOW_VOLATILITY";
    }


    return {
      ready:
        usedWeight > 0,

      score:
        this.clamp(
          score
        ),

      regime,

      volatility,

      averageAtrPct,

      timeframes:
        details,

      analyzedAt:
        Date.now()
    };
  }


  // ===================================
  // BTC ORTAMI
  // ===================================

  analyzeBTC({
    priceChanges = {},
    timeframes = {},
    orderFlow = {},
    volume = {}
  } = {}) {

    const change1m =
      this.number(
        priceChanges["1m"],
        0
      );


    const change5m =
      this.number(
        priceChanges["5m"],
        0
      );


    const change15m =
      this.number(
        priceChanges["15m"],
        0
      );


    const change1h =
      this.number(
        priceChanges["1h"],
        0
      );


    const market =
      this.classifyMarket(
        timeframes
      );


    const buyRatio =
      this.number(
        orderFlow
          ?.buySell
          ?.s30
          ?.buyRatio,
        50
      );


    const orderFlowScore =
      this.number(
        orderFlow?.score,
        50
      );


    const volumeScore =
      this.number(
        volume?.score,
        50
      );


    let riskLevel =
      "NORMAL";


    let tradingAllowed =
      true;


    let riskMultiplier =
      1;


    const reasons = [];


    // =================================
    // BTC ACİL DURDURMA
    // =================================

    if (
      change1m <=
      this.config
        .btcHardStop1mPct
    ) {
      tradingAllowed =
        false;

      riskLevel =
        "CRITICAL";

      riskMultiplier =
        0;

      reasons.push(
        "BTC_1M_HARD_DROP"
      );
    }


    if (
      change5m <=
      this.config
        .btcHardStop5mPct
    ) {
      tradingAllowed =
        false;

      riskLevel =
        "CRITICAL";

      riskMultiplier =
        0;

      reasons.push(
        "BTC_5M_HARD_DROP"
      );
    }


    // =================================
    // BTC RİSK AZALTMA
    // =================================

    if (
      tradingAllowed &&
      (
        change15m <=
          this.config
            .btcRiskReduction15mPct ||

        market.regime ===
          "DOWNTREND" ||

        market.regime ===
          "STRONG_DOWNTREND"
      )
    ) {
      riskLevel =
        "HIGH";

      riskMultiplier =
        0.50;

      reasons.push(
        "BTC_DOWNTREND"
      );
    }


    // =================================
    // SATIŞ BASKISI
    // =================================

    if (
      tradingAllowed &&
      (
        buyRatio <
          this.config
            .btcWeakBuyRatio ||

        orderFlowScore < 35
      )
    ) {
      riskLevel =
        "ELEVATED";

      riskMultiplier =
        Math.min(
          riskMultiplier,
          0.70
        );

      reasons.push(
        "BTC_SELL_PRESSURE"
      );
    }


    // =================================
    // POZİTİF BTC ORTAMI
    // =================================

    let supportive =
      false;


    if (
      tradingAllowed &&
      (
        market.regime ===
          "UPTREND" ||

        market.regime ===
          "STRONG_UPTREND"
      ) &&
      buyRatio >=
        this.config
          .btcStrongBuyRatio &&
      orderFlowScore >= 60 &&
      volumeScore >= 50
    ) {
      supportive =
        true;

      reasons.push(
        "BTC_SUPPORTIVE"
      );
    }


    return {
      tradingAllowed,

      riskLevel,

      riskMultiplier,

      supportive,

      market,

      priceChanges: {
        "1m":
          change1m,

        "5m":
          change5m,

        "15m":
          change15m,

        "1h":
          change1h
      },

      buyRatio,

      orderFlowScore,

      volumeScore,

      reasons,

      message:
        !tradingAllowed
          ? "BTC RİSKİ – YENİ İŞLEM DURDURULDU"
          : riskLevel ===
              "HIGH"
            ? "BTC RİSKİ YÜKSEK – RİSK AZALTILDI"
            : supportive
              ? "BTC ORTAMI DESTEKLİYOR"
              : "BTC ORTAMI NÖTR",

      analyzedAt:
        Date.now()
    };
  }


  // ===================================
  // COİN + BTC BİRLEŞİK REJİM
  // ===================================

  evaluate({
    coinTimeframes = {},
    btc = {}
  } = {}) {

    const coinMarket =
      this.classifyMarket(
        coinTimeframes
      );


    const btcMarket =
      this.analyzeBTC(
        btc
      );


    let environmentScore =
      coinMarket.score;


    if (
      !btcMarket
        .tradingAllowed
    ) {
      environmentScore =
        Math.min(
          environmentScore,
          25
        );

    } else {

      environmentScore *=
        btcMarket
          .riskMultiplier;


      if (
        btcMarket.supportive
      ) {
        environmentScore +=
          10;
      }
    }


    environmentScore =
      this.clamp(
        environmentScore
      );


    let status =
      "NEUTRAL";


    if (
      !btcMarket
        .tradingAllowed
    ) {
      status =
        "TRADING_STOPPED";

    } else if (
      environmentScore >= 70
    ) {
      status =
        "FAVORABLE";

    } else if (
      environmentScore >= 50
    ) {
      status =
        "ACCEPTABLE";

    } else if (
      environmentScore >= 35
    ) {
      status =
        "CAUTION";

    } else {
      status =
        "UNFAVORABLE";
    }


    return {
      ready:
        coinMarket.ready,

      score:
        environmentScore,

      status,

      coinMarket,

      btcMarket,

      tradingAllowed:
        btcMarket
          .tradingAllowed,

      analyzedAt:
        Date.now()
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createMarketRegimeEngine(
  options = {}
) {
  return new MarketRegimeEngine(
    options
  );
}
