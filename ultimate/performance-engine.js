// TradeRadar Ultimate
// Performance Engine
//
// Gerçekleşmiş işlemlerin performansını ölçer.
// Yetersiz örneklemde kesin sonuç üretmez.

export class PerformanceEngine {
  constructor(options = {}) {
    this.config = {
      minimumSampleSize:
        options.minimumSampleSize ?? 100,

      minimumGroupSampleSize:
        options.minimumGroupSampleSize ?? 30
    };
  }


  // ===================================
  // YARDIMCILAR
  // ===================================

  number(
    value,
    fallback = 0
  ) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }


  average(values = []) {
    const valid =
      values
        .map(Number)
        .filter(
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
      ) /
      valid.length
    );
  }


  // ===================================
  // PROFIT FACTOR
  // ===================================

  profitFactor(
    trades = []
  ) {
    let grossProfit = 0;
    let grossLoss = 0;


    for (
      const trade of trades
    ) {
      const pnl =
        this.number(
          trade.netPnL
        );


      if (pnl > 0) {
        grossProfit += pnl;
      }


      if (pnl < 0) {
        grossLoss +=
          Math.abs(pnl);
      }
    }


    let factor;


    if (
      grossLoss === 0
    ) {
      factor =
        grossProfit > 0
          ? Infinity
          : 0;

    } else {
      factor =
        grossProfit /
        grossLoss;
    }


    return {
      grossProfit,
      grossLoss,
      profitFactor:
        factor
    };
  }


  // ===================================
  // ARDIŞIK SONUÇLAR
  // ===================================

  consecutiveStats(
    trades = []
  ) {
    const ordered =
      [...trades]
        .sort(
          (a, b) =>
            Number(
              a.closedAt || 0
            ) -
            Number(
              b.closedAt || 0
            )
        );


    let currentWins = 0;
    let currentLosses = 0;

    let maxWins = 0;
    let maxLosses = 0;


    for (
      const trade of ordered
    ) {
      const pnl =
        this.number(
          trade.netPnL
        );


      if (pnl > 0) {
        currentWins += 1;
        currentLosses = 0;

        maxWins =
          Math.max(
            maxWins,
            currentWins
          );

      } else if (
        pnl < 0
      ) {
        currentLosses += 1;
        currentWins = 0;

        maxLosses =
          Math.max(
            maxLosses,
            currentLosses
          );

      } else {
        currentWins = 0;
        currentLosses = 0;
      }
    }


    return {
      consecutiveWins:
        maxWins,

      consecutiveLosses:
        maxLosses
    };
  }


  // ===================================
  // MAXIMUM DRAWDOWN
  // ===================================

  maximumDrawdown(
    equityCurve = []
  ) {
    if (
      !Array.isArray(
        equityCurve
      ) ||
      !equityCurve.length
    ) {
      return {
        maxDrawdown:
          0,

        maxDrawdownPct:
          0
      };
    }


    let peak =
      this.number(
        equityCurve[0]
          ?.equity
      );


    let maxDrawdown = 0;
    let maxDrawdownPct = 0;


    for (
      const point of
      equityCurve
    ) {
      const equity =
        this.number(
          point?.equity
        );


      if (
        equity > peak
      ) {
        peak = equity;
      }


      const drawdown =
        peak - equity;


      const drawdownPct =
        peak > 0
          ? (
              drawdown /
              peak
            ) * 100
          : 0;


      if (
        drawdown >
        maxDrawdown
      ) {
        maxDrawdown =
          drawdown;
      }


      if (
        drawdownPct >
        maxDrawdownPct
      ) {
        maxDrawdownPct =
          drawdownPct;
      }
    }


    return {
      maxDrawdown,
      maxDrawdownPct
    };
  }


  // ===================================
  // MALİYETLER
  // ===================================

  costs(
    trades = []
  ) {
    let commissionCost = 0;
    let estimatedSlippageCost = 0;


    for (
      const trade of trades
    ) {
      commissionCost +=
        this.number(
          trade.buyCommission
        ) +
        this.number(
          trade.sellCommission
        );


      const signalPrice =
        this.number(
          trade.signalPrice
        );


      const entryPrice =
        this.number(
          trade.entryPrice
        );


      const rawExit =
        this.number(
          trade.rawExitPrice
        );


      const exitPrice =
        this.number(
          trade.exitPrice
        );


      const quantity =
        this.number(
          trade.quantity
        );


      if (
        signalPrice > 0 &&
        entryPrice > 0 &&
        quantity > 0
      ) {
        estimatedSlippageCost +=
          Math.max(
            0,
            entryPrice -
            signalPrice
          ) *
          quantity;
      }


      if (
        rawExit > 0 &&
        exitPrice > 0 &&
        quantity > 0
      ) {
        estimatedSlippageCost +=
          Math.max(
            0,
            rawExit -
            exitPrice
          ) *
          quantity;
      }
    }


    return {
      commissionCost,
      slippageCost:
        estimatedSlippageCost,

      totalTradingCost:
        commissionCost +
        estimatedSlippageCost
    };
  }


  // ===================================
  // ANA PERFORMANS ANALİZİ
  // ===================================

  analyze({
    trades = [],
    equityCurve = []
  } = {}) {

    const closed =
      Array.isArray(trades)
        ? trades.filter(
            trade =>
              trade &&
              Number.isFinite(
                Number(
                  trade.netPnL
                )
              )
          )
        : [];


    const totalTrades =
      closed.length;


    const wins =
      closed.filter(
        trade =>
          Number(
            trade.netPnL
          ) > 0
      );


    const losses =
      closed.filter(
        trade =>
          Number(
            trade.netPnL
          ) < 0
      );


    const breakeven =
      totalTrades -
      wins.length -
      losses.length;


    const winRate =
      totalTrades > 0
        ? (
            wins.length /
            totalTrades
          ) * 100
        : 0;


    const averageWin =
      this.average(
        wins.map(
          trade =>
            trade.netPnL
        )
      );


    const averageLoss =
      this.average(
        losses.map(
          trade =>
            trade.netPnL
        )
      );


    const lossRate =
      totalTrades > 0
        ? (
            losses.length /
            totalTrades
          )
        : 0;


    const winRateDecimal =
      totalTrades > 0
        ? (
            wins.length /
            totalTrades
          )
        : 0;


    const expectancy =
      (
        winRateDecimal *
        averageWin
      ) +
      (
        lossRate *
        averageLoss
      );


    const pf =
      this.profitFactor(
        closed
      );


    const netProfit =
      closed.reduce(
        (
          sum,
          trade
        ) =>
          sum +
          this.number(
            trade.netPnL
          ),
        0
      );


    const averageR =
      this.average(
        closed
          .map(
            trade =>
              trade.resultR
          )
          .filter(
            value =>
              Number.isFinite(
                Number(value)
              )
          )
      );


    const averageMFE =
      this.average(
        closed
          .map(
            trade =>
              trade.mfeR
          )
          .filter(
            value =>
              Number.isFinite(
                Number(value)
              )
          )
      );


    const averageMAE =
      this.average(
        closed
          .map(
            trade =>
              trade.maeR
          )
          .filter(
            value =>
              Number.isFinite(
                Number(value)
              )
          )
      );


    const drawdown =
      this.maximumDrawdown(
        equityCurve
      );


    const consecutive =
      this.consecutiveStats(
        closed
      );


    const tradingCosts =
      this.costs(
        closed
      );


    const sufficientData =
      totalTrades >=
      this.config
        .minimumSampleSize;


    return {
      totalSignals:
        totalTrades,

      totalTrades,

      wins:
        wins.length,

      losses:
        losses.length,

      breakeven,

      winRate,

      averageWin,

      averageLoss,

      expectancy,

      profitFactor:
        pf.profitFactor,

      grossProfit:
        pf.grossProfit,

      grossLoss:
        pf.grossLoss,

      maximumDrawdown:
        drawdown
          .maxDrawdown,

      maximumDrawdownPct:
        drawdown
          .maxDrawdownPct,

      averageR,

      netProfit,

      commissionCost:
        tradingCosts
          .commissionCost,

      slippageCost:
        tradingCosts
          .slippageCost,

      totalTradingCost:
        tradingCosts
          .totalTradingCost,

      averageMFE,

      averageMAE,

      consecutiveWins:
        consecutive
          .consecutiveWins,

      consecutiveLosses:
        consecutive
          .consecutiveLosses,

      sufficientData,

      evaluation:
        sufficientData
          ? "ÖRNEKLEM YETERLİ"
          : "YETERSİZ VERİ",

      analyzedAt:
        Date.now()
    };
  }


  // ===================================
  // PUAN GRUBU
  // ===================================

  scoreGroup(
    score
  ) {
    const value =
      Number(score) || 0;


    if (value >= 90) {
      return "90-100";
    }


    if (value >= 80) {
      return "80-89";
    }


    if (value >= 70) {
      return "70-79";
    }


    if (value >= 60) {
      return "60-69";
    }


    return "0-59";
  }


  // ===================================
  // PUAN GRUBU ANALİZİ
  // ===================================

  analyzeScoreGroups(
    trades = []
  ) {
    const groups = {
      "90-100": [],
      "80-89": [],
      "70-79": [],
      "60-69": [],
      "0-59": []
    };


    for (
      const trade of trades
    ) {
      const group =
        this.scoreGroup(
          trade.technicalScore
        );


      groups[
        group
      ].push(
        trade
      );
    }


    const result = {};


    for (
      const [
        group,
        groupTrades
      ] of Object.entries(
        groups
      )
    ) {
      const total =
        groupTrades.length;


      const wins =
        groupTrades.filter(
          trade =>
            Number(
              trade.netPnL
            ) > 0
        );


      const losses =
        groupTrades.filter(
          trade =>
            Number(
              trade.netPnL
            ) < 0
        );


      const pf =
        this.profitFactor(
          groupTrades
        );


      const expectancy =
        total > 0
          ? groupTrades.reduce(
              (
                sum,
                trade
              ) =>
                sum +
                this.number(
                  trade.netPnL
                ),
              0
            ) /
            total
          : 0;


      const sufficient =
        total >=
        this.config
          .minimumGroupSampleSize;


      result[
        group
      ] = {
        tradeCount:
          total,

        wins:
          wins.length,

        losses:
          losses.length,

        winRate:
          total > 0
            ? (
                wins.length /
                total
              ) * 100
            : 0,

        expectancy,

        profitFactor:
          pf.profitFactor,

        sufficientData:
          sufficient,

        evaluation:
          sufficient
            ? "ÖRNEKLEM YETERLİ"
            : "YETERSİZ VERİ"
      };
    }


    return result;
  }


  // ===================================
  // SİNYAL KOMBİNASYONLARI
  // ===================================

  analyzeCombinations(
    trades = []
  ) {
    const combinations =
      new Map();


    for (
      const trade of trades
    ) {
      const tags = [];


      if (
        Number(
          trade.metadata
            ?.relativeVolume
        ) >= 2
      ) {
        tags.push(
          "HIGH_RVOL"
        );
      }


      if (
        trade.metadata
          ?.cvdPositive ===
        true
      ) {
        tags.push(
          "POSITIVE_CVD"
        );
      }


      if (
        trade.metadata
          ?.breakout ===
        true
      ) {
        tags.push(
          "BREAKOUT"
        );
      }


      if (
        trade.metadata
          ?.btcUptrend ===
        true
      ) {
        tags.push(
          "BTC_UPTREND"
        );
      }


      if (!tags.length) {
        tags.push(
          "NO_SPECIAL_COMBINATION"
        );
      }


      const key =
        tags
          .sort()
          .join("+");


      if (
        !combinations.has(
          key
        )
      ) {
        combinations.set(
          key,
          []
        );
      }


      combinations
        .get(key)
        .push(
          trade
        );
    }


    const result = {};


    for (
      const [
        key,
        list
      ] of combinations
    ) {
      const total =
        list.length;


      const wins =
        list.filter(
          trade =>
            Number(
              trade.netPnL
            ) > 0
        );


      const pf =
        this.profitFactor(
          list
        );


      result[key] = {
        tradeCount:
          total,

        winRate:
          total > 0
            ? (
                wins.length /
                total
              ) * 100
            : 0,

        expectancy:
          total > 0
            ? list.reduce(
                (
                  sum,
                  trade
                ) =>
                  sum +
                  this.number(
                    trade.netPnL
                  ),
                0
              ) /
              total
            : 0,

        profitFactor:
          pf.profitFactor,

        sufficientData:
          total >=
          this.config
            .minimumGroupSampleSize,

        warning:
          "Korelasyon nedensellik anlamına gelmez."
      };
    }


    return result;
  }
}


// =====================================
// FACTORY
// =====================================

export function createPerformanceEngine(
  options = {}
) {
  return new PerformanceEngine(
    options
  );
}
