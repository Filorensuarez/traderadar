// TradeRadar Ultimate
// Technical Score + Signal Engine
//
// ÖNEMLİ:
// Teknik Uyum Puanı kazanma olasılığı değildir.
// Sadece mevcut teknik koşulların uyum derecesidir.

export class SignalEngine {
  constructor(options = {}) {
    this.config = {
      minimumWatchScore:
        options.minimumWatchScore ?? 60,

      minimumPreparationScore:
        options.minimumPreparationScore ?? 70,

      minimumEntryScore:
        options.minimumEntryScore ?? 82,

      weights: {
        trend:
          options.weights?.trend ?? 20,

        volume:
          options.weights?.volume ?? 20,

        orderFlow:
          options.weights?.orderFlow ?? 15,

        momentum:
          options.weights?.momentum ?? 15,

        breakout:
          options.weights?.breakout ?? 10,

        liquidity:
          options.weights?.liquidity ?? 10,

        market:
          options.weights?.market ?? 5,

        riskReward:
          options.weights?.riskReward ?? 5
      }
    };
  }


  // ===================================
  // YARDIMCILAR
  // ===================================

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


  scale(
    value,
    maxPoints
  ) {
    return (
      this.clamp(value) /
      100
    ) * maxPoints;
  }


  // ===================================
  // TREND PUANI
  // ===================================

  trendScore(
    technical = {}
  ) {
    let score = 50;


    const trend =
      String(
        technical.trend ||
        ""
      );


    const longTrend =
      String(
        technical.longTrend ||
        ""
      );


    const structure =
      String(
        technical.structure
          ?.structure ||
        ""
      );


    const adx =
      Number(
        technical.adx
      );


    if (
      trend === "UPTREND"
    ) {
      score += 20;
    }


    if (
      trend === "DOWNTREND"
    ) {
      score -= 20;
    }


    if (
      longTrend ===
      "ABOVE_EMA200"
    ) {
      score += 15;
    }


    if (
      longTrend ===
      "BELOW_EMA200"
    ) {
      score -= 15;
    }


    if (
      structure ===
        "UPTREND" ||
      structure ===
        "RISING_BASE"
    ) {
      score += 15;
    }


    if (
      structure ===
        "DOWNTREND" ||
      structure ===
        "FALLING_TOP"
    ) {
      score -= 15;
    }


    if (
      Number.isFinite(adx) &&
      adx >= 25 &&
      score > 50
    ) {
      score += 10;
    }


    return this.clamp(
      score
    );
  }


  // ===================================
  // MOMENTUM PUANI
  // ===================================

  momentumScore(
    technical = {},
    market = {}
  ) {
    let score = 50;


    const rsi =
      Number(
        technical.rsi
      );


    const histogram =
      Number(
        technical.macd
          ?.histogram
      );


    const momentum =
      String(
        technical.momentum ||
        ""
      );


    const s10 =
      Number(
        market.windows
          ?.s10
          ?.priceChangePct ||
        0
      );


    const s30 =
      Number(
        market.windows
          ?.s30
          ?.priceChangePct ||
        0
      );


    const s60 =
      Number(
        market.windows
          ?.s60
          ?.priceChangePct ||
        0
      );


    if (
      Number.isFinite(rsi)
    ) {
      if (
        rsi >= 55 &&
        rsi <= 70
      ) {
        score += 15;

      } else if (
        rsi > 80
      ) {
        score -= 15;

      } else if (
        rsi < 40
      ) {
        score -= 15;
      }
    }


    if (
      Number.isFinite(
        histogram
      )
    ) {
      score +=
        histogram > 0
          ? 10
          : -10;
    }


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


    if (
      s10 > 0 &&
      s30 >= 0 &&
      s60 >= 0
    ) {
      score += 10;
    }


    // Çoktan uçmuşsa düşür.
    if (
      s60 >= 4
    ) {
      score -= 25;
    }


    return this.clamp(
      score
    );
  }


  // ===================================
  // BREAKOUT PUANI
  // ===================================

  breakoutScore({
    technical = {},
    riskFilters = {}
  } = {}) {
    const breakout =
      technical.breakout ||
      {};


    const retest =
      technical.retest ||
      {};


    const fake =
      riskFilters
        .fakeBreakout ||
      {};


    let score = 40;


    if (
      breakout.breakout ===
        true &&
      breakout.direction ===
        "UP"
    ) {
      score += 20;
    }


    if (
      fake.confirmed ===
      true
    ) {
      score += 30;
    }


    if (
      retest.detected ===
      true
    ) {
      score += 10;
    }


    if (
      fake.fakeBreakoutRisk ===
      true
    ) {
      score -= 50;
    }


    return this.clamp(
      score
    );
  }


  // ===================================
  // R/R PUANI
  // ===================================

  riskRewardScore(
    riskReward = {}
  ) {
    const rr =
      Number(
        riskReward.netRR
      );


    if (
      !Number.isFinite(rr)
    ) {
      return 0;
    }


    if (rr >= 3) {
      return 100;
    }


    if (rr >= 2) {
      return 85;
    }


    if (rr >= 1.5) {
      return 70;
    }


    if (rr >= 1) {
      return 40;
    }


    return 10;
  }


  // ===================================
  // TEKNİK UYUM PUANI
  // ===================================

  calculateScore({
    technical = {},
    market = {},
    volume = {},
    orderFlow = {},
    regime = {},
    riskFilters = {},
    riskReward = {}
  } = {}) {

    const raw = {
      trend:
        this.trendScore(
          technical
        ),

      volume:
        this.clamp(
          volume.score
        ),

      orderFlow:
        this.clamp(
          orderFlow.score
        ),

      momentum:
        this.momentumScore(
          technical,
          market
        ),

      breakout:
        this.breakoutScore({
          technical,
          riskFilters
        }),

      liquidity:
        this.clamp(
          riskFilters
            .liquidity
            ?.score
        ),

      market:
        this.clamp(
          regime.score
        ),

      riskReward:
        this.riskRewardScore(
          riskReward
        )
    };


    const w =
      this.config.weights;


    const points = {
      trend:
        this.scale(
          raw.trend,
          w.trend
        ),

      volume:
        this.scale(
          raw.volume,
          w.volume
        ),

      orderFlow:
        this.scale(
          raw.orderFlow,
          w.orderFlow
        ),

      momentum:
        this.scale(
          raw.momentum,
          w.momentum
        ),

      breakout:
        this.scale(
          raw.breakout,
          w.breakout
        ),

      liquidity:
        this.scale(
          raw.liquidity,
          w.liquidity
        ),

      market:
        this.scale(
          raw.market,
          w.market
        ),

      riskReward:
        this.scale(
          raw.riskReward,
          w.riskReward
        )
    };


    const total =
      Object.values(
        points
      ).reduce(
        (
          sum,
          value
        ) =>
          sum + value,
        0
      );


    return {
      total:
        Math.round(
          this.clamp(
            total
          )
        ),

      raw,

      points,

      weights: {
        ...w
      },

      disclaimer:
        "Teknik Uyum Puanı kazanma ihtimali değildir."
    };
  }


  // ===================================
  // SİNYAL AŞAMASI
  // ===================================

  determineStage({
    score = 0,
    technical = {},
    volume = {},
    orderFlow = {},
    regime = {},
    riskFilters = {},
    riskReward = {},
    dataReliable = true,
    systemHealthy = true
  } = {}) {

    // =================================
    // FAIL-SAFE
    // =================================

    if (
      !dataReliable ||
      !systemHealthy
    ) {
      return {
        stage:
          "SİNYAL İPTAL",

        actionable:
          false,

        reason:
          "VERİ GÜVENİLİR DEĞİL – İŞLEM DURDURULDU"
      };
    }


    if (
      regime.tradingAllowed ===
      false
    ) {
      return {
        stage:
          "SİNYAL İPTAL",

        actionable:
          false,

        reason:
          regime.btcMarket
            ?.message ||
          "PİYASA RİSKİ"
      };
    }


    if (
      riskFilters
        .tradingAllowed ===
      false
    ) {
      return {
        stage:
          "SİNYAL İPTAL",

        actionable:
          false,

        reason:
          riskFilters.message ||
          "RİSK FİLTRESİ"
      };
    }


    if (
      Number(
        riskReward.netRR
      ) > 0 &&
      Number(
        riskReward.netRR
      ) < 1.5
    ) {
      return {
        stage:
          "SİNYAL İPTAL",

        actionable:
          false,

        reason:
          "RİSK/GETİRİ YETERSİZ"
      };
    }


    // =================================
    // NORMAL
    // =================================

    if (
      score <
      this.config
        .minimumWatchScore
    ) {
      return {
        stage:
          "NORMAL",

        actionable:
          false,

        reason:
          "TEKNİK UYUM YETERSİZ"
      };
    }


    // =================================
    // İZLE
    // =================================

    if (
      score <
      this.config
        .minimumPreparationScore
    ) {
      return {
        stage:
          "İZLE",

        actionable:
          false,

        reason:
          "ERKEN TEKNİK UYUM"
      };
    }


    // =================================
    // HAZIRLANIYOR
    // =================================

    if (
      technical.compression
        ?.compressed &&
      (
        volume.status ===
          "VOLUME_BUILDING" ||
        volume.status ===
          "STRONG_VOLUME"
      )
    ) {
      return {
        stage:
          "HAZIRLANIYOR",

        actionable:
          false,

        reason:
          "SIKIŞMA + HACİM ARTIŞI"
      };
    }


    // =================================
    // KIRILIM BEKLENİYOR
    // =================================

    if (
      score >=
        this.config
          .minimumPreparationScore &&
      technical.breakout
        ?.breakout !== true &&
      volume
        .strongAcceleration ===
        true &&
      orderFlow
        .strongBuyerPressure ===
        true
    ) {
      return {
        stage:
          "KIRILIM BEKLENİYOR",

        actionable:
          false,

        reason:
          "HACİM + ORDER FLOW HAZIR"
      };
    }


    // =================================
    // TEYİT BEKLENİYOR
    // =================================

    if (
      technical.breakout
        ?.breakout === true &&
      riskFilters
        .fakeBreakout
        ?.confirmed !== true
    ) {
      return {
        stage:
          "TEYİT BEKLENİYOR",

        actionable:
          false,

        reason:
          riskFilters
            .fakeBreakout
            ?.message ||
          "KIRILIM TEYİDİ EKSİK"
      };
    }


    // =================================
    // GİRİŞ KOŞULLARI
    // =================================

    const entryConditions =
      score >=
        this.config
          .minimumEntryScore &&

      volume
        .strongRelativeVolume ===
        true &&

      volume
        .strongAcceleration ===
        true &&

      orderFlow
        .strongBuyerPressure ===
        true &&

      riskFilters
        .liquidity
        ?.sufficient ===
        true &&

      riskFilters
        .manipulation
        ?.suspicious !==
        true &&

      regime
        .tradingAllowed !==
        false;


    if (
      entryConditions
    ) {
      return {
        stage:
          "GİRİŞ KOŞULLARI OLUŞTU",

        actionable:
          true,

        reason:
          "TEKNİK + HACİM + ORDER FLOW + RİSK UYUMLU"
      };
    }


    return {
      stage:
        "İZLE",

      actionable:
        false,

      reason:
        "TÜM GİRİŞ KOŞULLARI HENÜZ OLUŞMADI"
    };
  }


  // ===================================
  // ANA DEĞERLENDİRME
  // ===================================

  evaluate(input = {}) {
    const score =
      this.calculateScore(
        input
      );


    const stage =
      this.determineStage({
        score:
          score.total,

        technical:
          input.technical,

        volume:
          input.volume,

        orderFlow:
          input.orderFlow,

        regime:
          input.regime,

        riskFilters:
          input.riskFilters,

        riskReward:
          input.riskReward,

        dataReliable:
          input.dataReliable,

        systemHealthy:
          input.systemHealthy
      });


    return {
      technicalScore:
        score.total,

      scoreDetails:
        score,

      stage:
        stage.stage,

      actionable:
        stage.actionable,

      reason:
        stage.reason,

      message:
        stage.actionable
          ? "GİRİŞ KOŞULLARI OLUŞTU"
          : stage.stage ===
              "NORMAL"
            ? "ŞU ANDA UYGUN İŞLEM YOK"
            : stage.reason,

      evaluatedAt:
        Date.now()
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createSignalEngine(
  options = {}
) {
  return new SignalEngine(
    options
  );
  }
