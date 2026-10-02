// TradeRadar Ultimate
// Ana Modül Merkezi
//
// Bu dosya Ultimate motorlarını tek noktadan
// oluşturur ve birbirine bağlar.
// Mevcut TradeRadar server.js henüz bu dosyayı kullanmaz.

import {
  ULTIMATE_CONFIG,
  validateUltimateConfig
} from "./config.js";

import {
  createSystemHealth
} from "./system-health.js";

import {
  createDataQuality
} from "./data-quality.js";

import {
  createMarketDataEngine
} from "./market-data.js";

import {
  createTechnicalAnalysis
} from "./technical-analysis.js";

import {
  createVolumeEngine
} from "./volume-engine.js";

import {
  createOrderFlowEngine
} from "./order-flow.js";

import {
  createMarketRegimeEngine
} from "./market-regime.js";

import {
  createRiskFiltersEngine
} from "./risk-filters.js";

import {
  createSignalEngine
} from "./signal-engine.js";

import {
  createEntryEngine
} from "./entry-engine.js";

import {
  createStopEngine
} from "./stop-engine.js";

import {
  createTargetRiskEngine
} from "./target-risk-engine.js";

import {
  createRiskEngine
} from "./risk-engine.js";

import {
  createPositionManager
} from "./position-manager.js";

import {
  createHistoryEngine
} from "./history-engine.js";

import {
  createPaperTradingEngine
} from "./paper-trading.js";

import {
  createPerformanceEngine
} from "./performance-engine.js";

import {
  createBacktestEngine
} from "./backtest-engine.js";


// =====================================
// CONFIG KONTROLÜ
// =====================================

const configCheck =
  validateUltimateConfig(
    ULTIMATE_CONFIG
  );


if (!configCheck.valid) {
  throw new Error(
    "TradeRadar Ultimate config hatası: " +
    configCheck.errors.join(
      " | "
    )
  );
}


// =====================================
// MOTORLARI OLUŞTUR
// =====================================

const systemHealth =
  createSystemHealth(
    ULTIMATE_CONFIG.health
  );


const dataQuality =
  createDataQuality(
    ULTIMATE_CONFIG
      .dataQuality
  );


const marketData =
  createMarketDataEngine();


const technical =
  createTechnicalAnalysis(
    ULTIMATE_CONFIG
      .technical
  );


const volume =
  createVolumeEngine({
    minimumRvol:
      ULTIMATE_CONFIG
        .volume
        .minRelativeVolume,

    strongRvol:
      ULTIMATE_CONFIG
        .volume
        .strongRelativeVolume,

    strongAcceleration:
      ULTIMATE_CONFIG
        .volume
        .strongVolumeAcceleration
  });


const orderFlow =
  createOrderFlowEngine({
    minBuyRatio:
      ULTIMATE_CONFIG
        .orderFlow
        .minBuyRatio,

    strongBuyRatio:
      ULTIMATE_CONFIG
        .orderFlow
        .strongBuyRatio,

    minTradeAcceleration:
      ULTIMATE_CONFIG
        .orderFlow
        .minTradeAcceleration,

    strongTradeAcceleration:
      ULTIMATE_CONFIG
        .orderFlow
        .strongTradeAcceleration,

    minimumDepthUsd:
      ULTIMATE_CONFIG
        .liquidity
        .minDepthUsd
  });


const marketRegime =
  createMarketRegimeEngine({
    btcHardStop1mPct:
      ULTIMATE_CONFIG
        .btcFilter
        .hardStopDrop1mPct,

    btcHardStop5mPct:
      ULTIMATE_CONFIG
        .btcFilter
        .hardStopDrop5mPct
  });


const riskFilters =
  createRiskFiltersEngine({
    maxSpreadPct:
      ULTIMATE_CONFIG
        .liquidity
        .maxSpreadPct,

    preferredSpreadPct:
      ULTIMATE_CONFIG
        .liquidity
        .preferredSpreadPct,

    minDepthUsd:
      ULTIMATE_CONFIG
        .liquidity
        .minDepthUsd,

    maxSlippagePct:
      ULTIMATE_CONFIG
        .liquidity
        .maxEstimatedSlippagePct,

    max120sMovePct:
      ULTIMATE_CONFIG
        .manipulation
        .max120sMovePct
  });


const signal =
  createSignalEngine({
    minimumWatchScore:
      ULTIMATE_CONFIG
        .scoring
        .minimumWatchScore,

    minimumPreparationScore:
      ULTIMATE_CONFIG
        .scoring
        .minimumPreparationScore,

    minimumEntryScore:
      ULTIMATE_CONFIG
        .scoring
        .minimumEntryScore,

    weights:
      ULTIMATE_CONFIG
        .scoring
        .weights
  });


const entry =
  createEntryEngine({
    maxSignalAgeMs:
      ULTIMATE_CONFIG
        .entry
        .maxSignalAgeMs,

    maxChaseAtrMultiple:
      ULTIMATE_CONFIG
        .entry
        .maxChaseAtrMultiple,

    requireRetestWhenPossible:
      ULTIMATE_CONFIG
        .entry
        .requireRetestWhenPossible
  });


const stop =
  createStopEngine({
    atrBufferMultiple:
      ULTIMATE_CONFIG
        .stop
        .atrBufferMultiple,

    minimumAtrMultiple:
      ULTIMATE_CONFIG
        .stop
        .minimumAtrMultiple,

    maximumStopPct:
      ULTIMATE_CONFIG
        .stop
        .maximumStopPct,

    neverWidenAfterEntry:
      ULTIMATE_CONFIG
        .stop
        .neverWidenStopAfterEntry
  });


const targetRisk =
  createTargetRiskEngine({
    minimumNetRR:
      ULTIMATE_CONFIG
        .riskReward
        .minimumNetRR,

    preferredNetRR:
      ULTIMATE_CONFIG
        .riskReward
        .preferredNetRR,

    buyCommissionPct:
      ULTIMATE_CONFIG
        .fees
        .buyCommissionPct,

    sellCommissionPct:
      ULTIMATE_CONFIG
        .fees
        .sellCommissionPct,

    defaultSlippagePct:
      ULTIMATE_CONFIG
        .slippage
        .defaultPct
  });


const risk =
  createRiskEngine({
    defaultCapital:
      ULTIMATE_CONFIG
        .positionSizing
        .defaultCapital,

    riskPerTradePct:
      ULTIMATE_CONFIG
        .positionSizing
        .riskPerTradePct,

    maximumRiskPerTradePct:
      ULTIMATE_CONFIG
        .positionSizing
        .maximumRiskPerTradePct,

    maximumCapitalPerPositionPct:
      ULTIMATE_CONFIG
        .positionSizing
        .maximumCapitalPerPositionPct,

    maximumDailyLossPct:
      ULTIMATE_CONFIG
        .dailyRisk
        .maximumDailyLossPct,

    maximumConsecutiveLosses:
      ULTIMATE_CONFIG
        .dailyRisk
        .maximumConsecutiveLosses,

    maximumOpenRiskPct:
      ULTIMATE_CONFIG
        .dailyRisk
        .maximumOpenRiskPct,

    maximumSimultaneousPositions:
      ULTIMATE_CONFIG
        .dailyRisk
        .maximumSimultaneousPositions
  });


const positionManager =
  createPositionManager({
    trailingEnabled:
      ULTIMATE_CONFIG
        .trailingStop
        .enabled,

    trailingAtrMultiple:
      ULTIMATE_CONFIG
        .trailingStop
        .atrMultiple,

    activateTrailingAfterR:
      ULTIMATE_CONFIG
        .trailingStop
        .activateAfterR
  });


const history =
  createHistoryEngine();


const paperTrading =
  createPaperTradingEngine({
    startingCapital:
      ULTIMATE_CONFIG
        .paperTrading
        .startingCapital,

    buyCommissionPct:
      ULTIMATE_CONFIG
        .fees
        .buyCommissionPct,

    sellCommissionPct:
      ULTIMATE_CONFIG
        .fees
        .sellCommissionPct,

    defaultSlippagePct:
      ULTIMATE_CONFIG
        .slippage
        .defaultPct,

    maxPositions:
      ULTIMATE_CONFIG
        .dailyRisk
        .maximumSimultaneousPositions
  });


const performance =
  createPerformanceEngine({
    minimumSampleSize:
      ULTIMATE_CONFIG
        .performance
        .minimumSampleSize
  });


const backtest =
  createBacktestEngine({
    buyCommissionPct:
      ULTIMATE_CONFIG
        .fees
        .buyCommissionPct,

    sellCommissionPct:
      ULTIMATE_CONFIG
        .fees
        .sellCommissionPct,

    slippagePct:
      ULTIMATE_CONFIG
        .slippage
        .defaultPct,

    trainingPct:
      ULTIMATE_CONFIG
        .walkForward
        .trainingPct,

    validationPct:
      ULTIMATE_CONFIG
        .walkForward
        .validationPct,

    outOfSamplePct:
      ULTIMATE_CONFIG
        .walkForward
        .outOfSamplePct,

    minimumTrades:
      ULTIMATE_CONFIG
        .backtest
        .minimumTradesForEvaluation,

    conservativeIntrabar:
      ULTIMATE_CONFIG
        .backtest
        .conservativeIntrabarExecution
  });


// =====================================
// ULTIMATE ENGINE
// =====================================

export const Ultimate = {
  config:
    ULTIMATE_CONFIG,

  configCheck,

  systemHealth,

  dataQuality,

  marketData,

  technical,

  volume,

  orderFlow,

  marketRegime,

  riskFilters,

  signal,

  entry,

  stop,

  targetRisk,

  risk,

  positionManager,

  history,

  paperTrading,

  performance,

  backtest
};


// =====================================
// SİSTEM ÖZETİ
// =====================================

export function ultimateStatus() {
  return {
    ready:
      configCheck.valid,

    mode:
      ULTIMATE_CONFIG
        .system
        .mode,

    automaticTrading:
      ULTIMATE_CONFIG
        .system
        .allowAutomaticTrading,

    config:
      configCheck,

    health:
      systemHealth.snapshot(),

    market:
      marketData
        .marketSnapshot(),

    paper:
      paperTrading
        .snapshot(),

    history:
      history.snapshot(),

    checkedAt:
      Date.now()
  };
}


// =====================================
// FAIL-SAFE
// =====================================

export function ultimateCanGenerateSignal() {
  const health =
    systemHealth.snapshot();


  if (
    ULTIMATE_CONFIG
      .system
      .failSafe &&
    !health.tradingAllowed
  ) {
    return {
      allowed: false,

      reason:
        "VERİ GÜVENİLİR DEĞİL – İŞLEM DURDURULDU"
    };
  }


  return {
    allowed: true,
    reason: null
  };
}


export default Ultimate;
