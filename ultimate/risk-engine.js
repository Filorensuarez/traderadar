// TradeRadar Ultimate
// Position Sizing + Daily Risk Engine

export class RiskEngine {
  constructor(options = {}) {
    this.config = {
      defaultCapital:
        options.defaultCapital ?? 200000,

      riskPerTradePct:
        options.riskPerTradePct ?? 0.50,

      maximumRiskPerTradePct:
        options.maximumRiskPerTradePct ?? 1.0,

      maximumCapitalPerPositionPct:
        options.maximumCapitalPerPositionPct ?? 20,

      maximumDailyLossPct:
        options.maximumDailyLossPct ?? 2.0,

      maximumConsecutiveLosses:
        options.maximumConsecutiveLosses ?? 3,

      maximumOpenRiskPct:
        options.maximumOpenRiskPct ?? 2.0,

      maximumSimultaneousPositions:
        options.maximumSimultaneousPositions ?? 3
    };

    this.state = {
      day:
        this.dayKey(),

      realizedPnL: 0,

      consecutiveLosses: 0,

      openPositions: []
    };
  }


  // ===================================
  // GÜN ANAHTARI
  // ===================================

  dayKey() {
    return new Date()
      .toISOString()
      .slice(0, 10);
  }


  // ===================================
  // GÜN DEĞİŞTİ Mİ?
  // ===================================

  ensureDay() {
    const today =
      this.dayKey();

    if (
      this.state.day !==
      today
    ) {
      this.state.day =
        today;

      this.state.realizedPnL =
        0;

      this.state.consecutiveLosses =
        0;
    }
  }


  // ===================================
  // YARDIMCI
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
  // POZİSYON BOYUTU
  // ===================================

  calculatePositionSize({
    capital = null,
    entryPrice = null,
    stopPrice = null,
    riskPerTradePct = null
  } = {}) {
    this.ensureDay();


    const totalCapital =
      this.number(
        capital,
        this.config
          .defaultCapital
      );


    const entry =
      this.number(
        entryPrice
      );


    const stop =
      this.number(
        stopPrice
      );


    let riskPct =
      this.number(
        riskPerTradePct,
        this.config
          .riskPerTradePct
      );


    if (
      totalCapital === null ||
      totalCapital <= 0 ||
      entry === null ||
      entry <= 0 ||
      stop === null ||
      stop <= 0 ||
      stop >= entry
    ) {
      return {
        ready: false,
        valid: false,
        reason:
          "POZİSYON BOYUTU İÇİN VERİ YETERSİZ"
      };
    }


    riskPct =
      Math.min(
        riskPct,
        this.config
          .maximumRiskPerTradePct
      );


    const stopDistance =
      entry - stop;


    const stopDistancePct =
      (
        stopDistance /
        entry
      ) * 100;


    // İşlemde kaybedilebilecek
    // maksimum para.
    const riskAmount =
      totalCapital *
      (
        riskPct /
        100
      );


    // Stop mesafesine göre
    // teorik adet.
    let quantity =
      riskAmount /
      stopDistance;


    let positionValue =
      quantity *
      entry;


    // =================================
    // POZİSYON SERMAYE SINIRI
    // =================================

    const maxPositionValue =
      totalCapital *
      (
        this.config
          .maximumCapitalPerPositionPct /
        100
      );


    let cappedByCapital =
      false;


    if (
      positionValue >
      maxPositionValue
    ) {
      positionValue =
        maxPositionValue;

      quantity =
        positionValue /
        entry;

      cappedByCapital =
        true;
    }


    const actualRiskAmount =
      quantity *
      stopDistance;


    const actualRiskPct =
      (
        actualRiskAmount /
        totalCapital
      ) * 100;


    return {
      ready: true,
      valid: true,

      capital:
        totalCapital,

      entry,

      stop,

      stopDistance,

      stopDistancePct,

      requestedRiskPct:
        riskPct,

      riskAmount,

      quantity,

      positionValue,

      positionCapitalPct:
        (
          positionValue /
          totalCapital
        ) * 100,

      actualRiskAmount,

      actualRiskPct,

      cappedByCapital,

      maxPositionValue,

      calculatedAt:
        Date.now()
    };
  }


  // ===================================
  // AÇIK RİSK
  // ===================================

  openRiskAmount() {
    return this.state
      .openPositions
      .reduce(
        (
          total,
          position
        ) =>
          total +
          Math.max(
            0,
            Number(
              position.riskAmount ||
              0
            )
          ),
        0
      );
  }


  // ===================================
  // GÜNLÜK RİSK KONTROLÜ
  // ===================================

  dailyRiskCheck({
    capital = null
  } = {}) {
    this.ensureDay();


    const totalCapital =
      this.number(
        capital,
        this.config
          .defaultCapital
      );


    if (
      totalCapital === null ||
      totalCapital <= 0
    ) {
      return {
        tradingAllowed:
          false,

        reason:
          "SERMAYE VERİSİ GEÇERSİZ"
      };
    }


    const dailyLoss =
      Math.min(
        0,
        this.state
          .realizedPnL
      );


    const dailyLossPct =
      (
        Math.abs(
          dailyLoss
        ) /
        totalCapital
      ) * 100;


    const openRisk =
      this.openRiskAmount();


    const openRiskPct =
      (
        openRisk /
        totalCapital
      ) * 100;


    const blockers = [];


    if (
      dailyLossPct >=
      this.config
        .maximumDailyLossPct
    ) {
      blockers.push(
        "MAXIMUM_DAILY_LOSS"
      );
    }


    if (
      this.state
        .consecutiveLosses >=
      this.config
        .maximumConsecutiveLosses
    ) {
      blockers.push(
        "MAXIMUM_CONSECUTIVE_LOSSES"
      );
    }


    if (
      openRiskPct >=
      this.config
        .maximumOpenRiskPct
    ) {
      blockers.push(
        "MAXIMUM_OPEN_RISK"
      );
    }


    if (
      this.state
        .openPositions
        .length >=
      this.config
        .maximumSimultaneousPositions
    ) {
      blockers.push(
        "MAXIMUM_SIMULTANEOUS_POSITIONS"
      );
    }


    const tradingAllowed =
      blockers.length === 0;


    return {
      tradingAllowed,

      message:
        tradingAllowed
          ? "GÜNLÜK RİSK UYGUN"
          : "GÜNLÜK RİSK LİMİTİ – YENİ İŞLEM DURDURULDU",

      blockers,

      daily: {
        realizedPnL:
          this.state
            .realizedPnL,

        dailyLoss,

        dailyLossPct,

        consecutiveLosses:
          this.state
            .consecutiveLosses
      },

      open: {
        positions:
          this.state
            .openPositions
            .length,

        openRisk,

        openRiskPct
      },

      limits: {
        maximumDailyLossPct:
          this.config
            .maximumDailyLossPct,

        maximumConsecutiveLosses:
          this.config
            .maximumConsecutiveLosses,

        maximumOpenRiskPct:
          this.config
            .maximumOpenRiskPct,

        maximumSimultaneousPositions:
          this.config
            .maximumSimultaneousPositions
      },

      checkedAt:
        Date.now()
    };
  }


  // ===================================
  // YENİ POZİSYON İZNİ
  // ===================================

  canOpenPosition({
    capital = null,
    proposedRiskAmount = 0
  } = {}) {
    const check =
      this.dailyRiskCheck({
        capital
      });


    if (
      !check.tradingAllowed
    ) {
      return check;
    }


    const totalCapital =
      this.number(
        capital,
        this.config
          .defaultCapital
      );


    const proposed =
      Math.max(
        0,
        Number(
          proposedRiskAmount ||
          0
        )
      );


    const futureOpenRisk =
      this.openRiskAmount() +
      proposed;


    const futureOpenRiskPct =
      (
        futureOpenRisk /
        totalCapital
      ) * 100;


    if (
      futureOpenRiskPct >
      this.config
        .maximumOpenRiskPct
    ) {
      return {
        tradingAllowed:
          false,

        message:
          "GÜNLÜK RİSK LİMİTİ – YENİ İŞLEM DURDURULDU",

        blockers: [
          "PROPOSED_POSITION_EXCEEDS_OPEN_RISK"
        ],

        futureOpenRisk,

        futureOpenRiskPct
      };
    }


    return {
      tradingAllowed:
        true,

      message:
        "YENİ POZİSYON RİSKİ UYGUN",

      futureOpenRisk,

      futureOpenRiskPct
    };
  }


  // ===================================
  // POZİSYON AÇ
  // ===================================

  registerOpenPosition({
    id,
    symbol,
    entryPrice,
    stopPrice,
    quantity,
    riskAmount
  } = {}) {
    this.ensureDay();


    if (
      !id ||
      !symbol
    ) {
      return {
        ok: false,
        reason:
          "POZİSYON KİMLİĞİ EKSİK"
      };
    }


    const exists =
      this.state
        .openPositions
        .some(
          position =>
            position.id === id
        );


    if (exists) {
      return {
        ok: false,
        reason:
          "POZİSYON ZATEN KAYITLI"
      };
    }


    const position = {
      id,

      symbol,

      entryPrice:
        Number(entryPrice),

      stopPrice:
        Number(stopPrice),

      quantity:
        Number(quantity),

      riskAmount:
        Number(
          riskAmount || 0
        ),

      openedAt:
        Date.now()
    };


    this.state
      .openPositions
      .push(
        position
      );


    return {
      ok: true,
      position
    };
  }


  // ===================================
  // POZİSYON KAPAT
  // ===================================

  registerClosedPosition({
    id,
    netPnL = 0
  } = {}) {
    this.ensureDay();


    const index =
      this.state
        .openPositions
        .findIndex(
          position =>
            position.id === id
        );


    if (
      index === -1
    ) {
      return {
        ok: false,
        reason:
          "AÇIK POZİSYON BULUNAMADI"
      };
    }


    const [
      position
    ] =
      this.state
        .openPositions
        .splice(
          index,
          1
        );


    const pnl =
      Number(
        netPnL || 0
      );


    this.state
      .realizedPnL +=
      pnl;


    if (
      pnl < 0
    ) {
      this.state
        .consecutiveLosses +=
        1;

    } else if (
      pnl > 0
    ) {
      this.state
        .consecutiveLosses =
        0;
    }


    return {
      ok: true,

      position,

      netPnL:
        pnl,

      realizedPnL:
        this.state
          .realizedPnL,

      consecutiveLosses:
        this.state
          .consecutiveLosses
    };
  }


  // ===================================
  // DURUM
  // ===================================

  snapshot({
    capital = null
  } = {}) {
    this.ensureDay();


    return {
      day:
        this.state.day,

      realizedPnL:
        this.state
          .realizedPnL,

      consecutiveLosses:
        this.state
          .consecutiveLosses,

      openPositions:
        [
          ...this.state
            .openPositions
        ],

      risk:
        this.dailyRiskCheck({
          capital
        }),

      checkedAt:
        Date.now()
    };
  }


  // ===================================
  // PAPER / TEST RESET
  // ===================================

  reset() {
    this.state = {
      day:
        this.dayKey(),

      realizedPnL: 0,

      consecutiveLosses: 0,

      openPositions: []
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createRiskEngine(
  options = {}
) {
  return new RiskEngine(
    options
  );
}
