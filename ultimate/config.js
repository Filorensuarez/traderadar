// TradeRadar Ultimate
// Merkezi Konfigürasyon
//
// Bu dosya Ultimate modüllerinin ortak ayarlarını tutar.
// Canlı kurallar kullanıcı onayı olmadan otomatik değiştirilmez.

export const ULTIMATE_CONFIG = {

  // ===================================
  // SİSTEM
  // ===================================

  system: {
    version: "1.0.0",
    mode: "paper",

    failSafe: true,

    allowAutomaticTrading: false,

    maxActiveWatch: 10
  },


  // ===================================
  // VERİ KALİTESİ
  // ===================================

  dataQuality: {
    maxTickAgeMs: 15000,

    maxFutureTimestampMs: 5000,

    duplicateWindowMs: 3000,

    maxPriceJumpPct: 20,

    maxSpreadPct: 5,

    requireVolume: true,

    historyLimit: 100
  },


  // ===================================
  // SİSTEM SAĞLIĞI
  // ===================================

  health: {
    maxTickAgeMs: 15000,

    maxLatencyMs: 5000,

    maxConsecutiveErrors: 5,

    staleAfterMs: 30000
  },


  // ===================================
  // ZAMAN DİLİMLERİ
  // ===================================

  timeframes: {
    micro: [
      "5s",
      "10s",
      "30s",
      "60s",
      "120s"
    ],

    entry: [
      "1m",
      "3m",
      "5m"
    ],

    trend: [
      "15m",
      "1h",
      "4h"
    ]
  },


  // ===================================
  // TEKNİK ANALİZ
  // ===================================

  technical: {
    ema: [
      9,
      20,
      50,
      200
    ],

    rsiPeriod: 14,

    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,

    bollingerPeriod: 20,
    bollingerStdDev: 2,

    atrPeriod: 14,

    adxPeriod: 14
  },


  // ===================================
  // HACİM
  // ===================================

  volume: {
    minRelativeVolume: 1.5,

    strongRelativeVolume: 2.0,

    minVolumeAcceleration: 1.2,

    strongVolumeAcceleration: 1.4,

    zScoreWarning: 3.5
  },


  // ===================================
  // ORDER FLOW
  // ===================================

  orderFlow: {
    minBuyRatio: 55,

    strongBuyRatio: 65,

    minTradeAcceleration: 1.15,

    strongTradeAcceleration: 1.30,

    imbalanceWarning: 0.80
  },


  // ===================================
  // LİKİDİTE
  // ===================================

  liquidity: {
    maxSpreadPct: 1.0,

    preferredSpreadPct: 0.50,

    minDepthUsd: 10000,

    maxEstimatedSlippagePct: 0.50,

    rejectLowLiquidity: true
  },


  // ===================================
  // PUMP / MANİPÜLASYON
  // ===================================

  manipulation: {
    enabled: true,

    max120sMovePct: 5,

    extreme60sMovePct: 4,

    extreme30sMovePct: 3,

    maxSpreadPct: 2,

    disappearingBidWallPct: 60,

    rejectSuspiciousMovement: true
  },


  // ===================================
  // BREAKOUT
  // ===================================

  breakout: {
    minRelativeVolume: 2.0,

    minBuyRatio: 65,

    minTradeAcceleration: 1.30,

    maxResistanceDistancePct: 2.0,

    requireHigherTimeframeSupport: true,

    requireVolumeConfirmation: true
  },


  // ===================================
  // BTC FİLTRESİ
  // ===================================

  btcFilter: {
    enabled: true,

    timeframes: [
      "1m",
      "5m",
      "15m",
      "1h"
    ],

    hardStopDrop1mPct: -2.0,

    hardStopDrop5mPct: -3.5,

    reduceRiskInDowntrend: true
  },


  // ===================================
  // KORELASYON
  // ===================================

  correlation: {
    enabled: true,

    lookbackPeriods: 100,

    highCorrelation: 0.80,

    maxHighlyCorrelatedPositions: 2
  },


  // ===================================
  // TEKNİK UYUM PUANI
  // ===================================

  scoring: {
    minimumWatchScore: 60,

    minimumPreparationScore: 70,

    minimumEntryScore: 82,

    weights: {
      trend: 20,
      volume: 20,
      orderFlow: 15,
      momentum: 15,
      breakout: 10,
      liquidity: 10,
      market: 5,
      riskReward: 5
    }
  },


  // ===================================
  // SİNYAL AŞAMALARI
  // ===================================

  signalStages: [
    "NORMAL",
    "İZLE",
    "HAZIRLANIYOR",
    "KIRILIM BEKLENİYOR",
    "TEYİT BEKLENİYOR",
    "GİRİŞ KOŞULLARI OLUŞTU",
    "POZİSYON TAKİBİ",
    "KÂR KORUMA",
    "SİNYAL İPTAL"
  ],


  // ===================================
  // GİRİŞ
  // ===================================

  entry: {
    maxSignalAgeMs:
      5 * 60 * 1000,

    maxChaseAtrMultiple: 0.50,

    requireRetestWhenPossible: true,

    rejectAboveMaximumEntry: true
  },


  // ===================================
  // STOP
  // ===================================

  stop: {
    atrBufferMultiple: 0.50,

    minimumAtrMultiple: 1.0,

    maximumStopPct: 5,

    neverWidenStopAfterEntry: true
  },


  // ===================================
  // HEDEFLER
  // ===================================

  targets: {
    targetCount: 3,

    minimumR1: 1.0,

    preferredR2: 2.0,

    preferredR3: 3.0
  },


  // ===================================
  // RİSK / GETİRİ
  // ===================================

  riskReward: {
    minimumNetRR: 1.50,

    preferredNetRR: 2.0,

    rejectBelowMinimum: true
  },


  // ===================================
  // KOMİSYON
  // ===================================

  fees: {
    buyCommissionPct: 0.10,

    sellCommissionPct: 0.10,

    includeCommission: true
  },


  // ===================================
  // SLIPPAGE
  // ===================================

  slippage: {
    defaultPct: 0.10,

    maximumAcceptedPct: 0.50,

    includeSlippage: true
  },


  // ===================================
  // POZİSYON BOYUTU
  // ===================================

  positionSizing: {
    defaultCapital: 200000,

    riskPerTradePct: 0.50,

    maximumRiskPerTradePct: 1.0,

    maximumCapitalPerPositionPct: 20
  },


  // ===================================
  // GÜNLÜK RİSK KORUMASI
  // ===================================

  dailyRisk: {
    maximumDailyLossPct: 2.0,

    maximumConsecutiveLosses: 3,

    maximumOpenRiskPct: 2.0,

    maximumSimultaneousPositions: 3,

    stopNewTradesWhenLimitReached: true
  },


  // ===================================
  // TRAILING STOP
  // ===================================

  trailingStop: {
    enabled: false,

    atrMultiple: 1.5,

    activateAfterR: 1.0,

    neverMoveDown: true
  },


  // ===================================
  // PAPER TRADING
  // ===================================

  paperTrading: {
    enabled: true,

    startingCapital: 200000,

    useRealTimePrice: true,

    includeCommission: true,

    includeSlippage: true
  },


  // ===================================
  // BACKTEST
  // ===================================

  backtest: {
    includeCommission: true,

    includeSlippage: true,

    preventLookAhead: true,

    conservativeIntrabarExecution: true,

    minimumTradesForEvaluation: 100
  },


  // ===================================
  // WALK-FORWARD
  // ===================================

  walkForward: {
    enabled: true,

    trainingPct: 60,

    validationPct: 20,

    outOfSamplePct: 20
  },


  // ===================================
  // PERFORMANS
  // ===================================

  performance: {
    minimumSampleSize: 100,

    scoreGroups: [
      {
        min: 90,
        max: 100
      },
      {
        min: 80,
        max: 89
      },
      {
        min: 70,
        max: 79
      },
      {
        min: 60,
        max: 69
      }
    ]
  },


  // ===================================
  // OTOMATİK ÖĞRENME GÜVENLİĞİ
  // ===================================

  learning: {
    automaticLiveRuleChanges: false,

    requireBacktest: true,

    requireValidation: true,

    requireOutOfSample: true,

    requireWalkForward: true,

    requirePaperTrading: true,

    requireUserApproval: true
  }
};


// =====================================
// CONFIG DOĞRULAMA
// =====================================

export function validateUltimateConfig(
  config = ULTIMATE_CONFIG
) {
  const errors = [];


  const weights =
    config.scoring?.weights ||
    {};


  const totalWeight =
    Object.values(
      weights
    ).reduce(
      (
        total,
        value
      ) =>
        total +
        Number(
          value || 0
        ),
      0
    );


  if (
    totalWeight !== 100
  ) {
    errors.push(
      `Teknik puan ağırlıkları 100 olmalı. Mevcut: ${totalWeight}`
    );
  }


  if (
    config.riskReward
      ?.minimumNetRR <= 0
  ) {
    errors.push(
      "Minimum R/R sıfırdan büyük olmalı."
    );
  }


  if (
    config.positionSizing
      ?.riskPerTradePct <= 0
  ) {
    errors.push(
      "İşlem başına risk sıfırdan büyük olmalı."
    );
  }


  if (
    config.positionSizing
      ?.riskPerTradePct >
    config.positionSizing
      ?.maximumRiskPerTradePct
  ) {
    errors.push(
      "Varsayılan işlem riski maksimum riskten büyük olamaz."
    );
  }


  const splitTotal =
    Number(
      config.walkForward
        ?.trainingPct || 0
    ) +
    Number(
      config.walkForward
        ?.validationPct || 0
    ) +
    Number(
      config.walkForward
        ?.outOfSamplePct || 0
    );


  if (
    splitTotal !== 100
  ) {
    errors.push(
      `Walk-forward veri dağılımı 100 olmalı. Mevcut: ${splitTotal}`
    );
  }


  return {
    valid:
      errors.length === 0,

    errors,

    checkedAt:
      Date.now()
  };
}


// =====================================
// GÜVENLİ CONFIG KOPYASI
// =====================================

export function getUltimateConfig() {
  return structuredClone(
    ULTIMATE_CONFIG
  );
  }
