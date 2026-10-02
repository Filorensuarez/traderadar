// TradeRadar Ultimate
// Paper Trading Engine
//
// Gerçek emir göndermez.
// Sinyalleri sanal işlemlerle test eder.
// Komisyon ve slippage hesaba katılır.

export class PaperTradingEngine {
  constructor(options = {}) {
    this.config = {
      startingCapital:
        options.startingCapital ??
        200000,

      buyCommissionPct:
        options.buyCommissionPct ??
        0.10,

      sellCommissionPct:
        options.sellCommissionPct ??
        0.10,

      defaultSlippagePct:
        options.defaultSlippagePct ??
        0.10,

      maxPositions:
        options.maxPositions ??
        3
    };


    this.cash =
      this.config
        .startingCapital;


    this.equity =
      this.config
        .startingCapital;


    this.positions =
      new Map();


    this.closedTrades = [];


    this.equityCurve = [
      {
        timestamp:
          Date.now(),

        equity:
          this.equity
      }
    ];
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
  // MALİYET
  // ===================================

  commission(
    value,
    pct
  ) {
    return (
      Number(value) *
      (
        Number(pct) /
        100
      )
    );
  }


  applyBuySlippage(
    price,
    slippagePct
  ) {
    return (
      price *
      (
        1 +
        slippagePct /
        100
      )
    );
  }


  applySellSlippage(
    price,
    slippagePct
  ) {
    return (
      price *
      (
        1 -
        slippagePct /
        100
      )
    );
  }


  // ===================================
  // SANAL POZİSYON AÇ
  // ===================================

  open({
    id,
    symbol,

    price,
    stop,

    targets = {},

    positionValue,
    quantity = null,

    technicalScore = null,

    scoreDetails = null,

    slippagePct = null,

    metadata = {}
  } = {}) {

    if (
      !id ||
      !symbol
    ) {
      return {
        ok: false,
        reason:
          "İŞLEM KİMLİĞİ EKSİK"
      };
    }


    if (
      this.positions.has(id)
    ) {
      return {
        ok: false,
        reason:
          "İŞLEM ZATEN AÇIK"
      };
    }


    if (
      this.positions.size >=
      this.config
        .maxPositions
    ) {
      return {
        ok: false,
        reason:
          "MAKSİMUM SANAL POZİSYON SAYISI"
      };
    }


    const rawPrice =
      this.number(price);


    const stopPrice =
      this.number(stop);


    const requestedValue =
      this.number(
        positionValue
      );


    if (
      rawPrice === null ||
      rawPrice <= 0 ||
      stopPrice === null ||
      stopPrice <= 0 ||
      stopPrice >= rawPrice
    ) {
      return {
        ok: false,
        reason:
          "GİRİŞ/STOP VERİSİ GEÇERSİZ"
      };
    }


    const slip =
      this.number(
        slippagePct,
        this.config
          .defaultSlippagePct
      );


    const executionPrice =
      this.applyBuySlippage(
        rawPrice,
        slip
      );


    let qty =
      this.number(
        quantity
      );


    let grossValue;


    if (
      qty !== null &&
      qty > 0
    ) {
      grossValue =
        qty *
        executionPrice;

    } else if (
      requestedValue !== null &&
      requestedValue > 0
    ) {
      grossValue =
        requestedValue;

      qty =
        grossValue /
        executionPrice;

    } else {
      return {
        ok: false,
        reason:
          "POZİSYON BÜYÜKLÜĞÜ EKSİK"
      };
    }


    const buyCommission =
      this.commission(
        grossValue,
        this.config
          .buyCommissionPct
      );


    const totalDebit =
      grossValue +
      buyCommission;


    if (
      totalDebit >
      this.cash
    ) {
      return {
        ok: false,
        reason:
          "SANAL BAKİYE YETERSİZ"
      };
    }


    this.cash -=
      totalDebit;


    const initialRisk =
      executionPrice -
      stopPrice;


    const position = {
      id,

      symbol:
        String(symbol)
          .toUpperCase(),

      signalPrice:
        rawPrice,

      entryPrice:
        executionPrice,

      stop:
        stopPrice,

      targets: {
        target1:
          this.number(
            targets.target1
          ),

        target2:
          this.number(
            targets.target2
          ),

        target3:
          this.number(
            targets.target3
          )
      },

      quantity:
        qty,

      grossValue,

      buyCommission,

      buySlippagePct:
        slip,

      initialRisk,

      technicalScore:
        this.number(
          technicalScore
        ),

      scoreDetails,

      metadata,

      highestPrice:
        executionPrice,

      lowestPrice:
        executionPrice,

      mfeR: 0,
      maeR: 0,

      target1Hit: false,
      target2Hit: false,
      target3Hit: false,

      openedAt:
        Date.now(),

      updatedAt:
        Date.now()
    };


    this.positions.set(
      id,
      position
    );


    this.markToMarket();


    return {
      ok: true,
      position
    };
  }


  // ===================================
  // FİYAT GÜNCELLE
  // ===================================

  updatePrice({
    id,
    price
  } = {}) {

    const position =
      this.positions.get(id);


    if (!position) {
      return {
        ok: false,
        reason:
          "SANAL POZİSYON BULUNAMADI"
      };
    }


    const currentPrice =
      this.number(price);


    if (
      currentPrice === null ||
      currentPrice <= 0
    ) {
      return {
        ok: false,
        reason:
          "GEÇERSİZ FİYAT"
      };
    }


    position.currentPrice =
      currentPrice;


    position.highestPrice =
      Math.max(
        position.highestPrice,
        currentPrice
      );


    position.lowestPrice =
      Math.min(
        position.lowestPrice,
        currentPrice
      );


    if (
      position.initialRisk > 0
    ) {
      position.mfeR =
        (
          position.highestPrice -
          position.entryPrice
        ) /
        position.initialRisk;


      position.maeR =
        (
          position.entryPrice -
          position.lowestPrice
        ) /
        position.initialRisk;
    }


    if (
      position.targets
        .target1 !== null &&
      currentPrice >=
        position.targets
          .target1
    ) {
      position.target1Hit =
        true;
    }


    if (
      position.targets
        .target2 !== null &&
      currentPrice >=
        position.targets
          .target2
    ) {
      position.target2Hit =
        true;
    }


    if (
      position.targets
        .target3 !== null &&
      currentPrice >=
        position.targets
          .target3
    ) {
      position.target3Hit =
        true;
    }


    position.updatedAt =
      Date.now();


    let action =
      "HOLD";


    let reason =
      null;


    if (
      currentPrice <=
      position.stop
    ) {
      action =
        "STOP";

      reason =
        "STOP_HIT";

    } else if (
      position.targets
        .target3 !== null &&
      currentPrice >=
        position.targets
          .target3
    ) {
      action =
        "TARGET3";

      reason =
        "TARGET3_HIT";
    }


    this.markToMarket();


    return {
      ok: true,

      action,
      reason,

      position
    };
  }


  // ===================================
  // POZİSYON KAPAT
  // ===================================

  close({
    id,
    price,
    reason = "MANUAL",
    slippagePct = null
  } = {}) {

    const position =
      this.positions.get(id);


    if (!position) {
      return {
        ok: false,
        reason:
          "SANAL POZİSYON BULUNAMADI"
      };
    }


    const rawExit =
      this.number(price);


    if (
      rawExit === null ||
      rawExit <= 0
    ) {
      return {
        ok: false,
        reason:
          "ÇIKIŞ FİYATI GEÇERSİZ"
      };
    }


    const slip =
      this.number(
        slippagePct,
        this.config
          .defaultSlippagePct
      );


    const exitPrice =
      this.applySellSlippage(
        rawExit,
        slip
      );


    const grossExitValue =
      exitPrice *
      position.quantity;


    const sellCommission =
      this.commission(
        grossExitValue,
        this.config
          .sellCommissionPct
      );


    const netExitValue =
      grossExitValue -
      sellCommission;


    this.cash +=
      netExitValue;


    const grossPnL =
      (
        exitPrice -
        position.entryPrice
      ) *
      position.quantity;


    const netPnL =
      netExitValue -
      (
        position.grossValue +
        position.buyCommission
      );


    const resultR =
      position.initialRisk > 0
        ? (
            exitPrice -
            position.entryPrice
          ) /
          position.initialRisk
        : null;


    const trade = {
      ...position,

      rawExitPrice:
        rawExit,

      exitPrice,

      sellCommission,

      sellSlippagePct:
        slip,

      grossExitValue,

      netExitValue,

      grossPnL,

      netPnL,

      resultR,

      reason,

      closedAt:
        Date.now()
    };


    this.positions.delete(
      id
    );


    this.closedTrades.unshift(
      trade
    );


    this.markToMarket();


    return {
      ok: true,
      trade
    };
  }


  // ===================================
  // MARKET-TO-MARKET
  // ===================================

  markToMarket() {
    let openValue = 0;


    for (
      const position of
      this.positions.values()
    ) {
      const price =
        this.number(
          position.currentPrice,
          position.entryPrice
        );


      openValue +=
        price *
        position.quantity;
    }


    this.equity =
      this.cash +
      openValue;


    this.equityCurve.push({
      timestamp:
        Date.now(),

      equity:
        this.equity
    });


    if (
      this.equityCurve.length >
      100000
    ) {
      this.equityCurve.splice(
        0,
        this.equityCurve.length -
        100000
      );
    }


    return this.equity;
  }


  // ===================================
  // SNAPSHOT
  // ===================================

  snapshot() {
    this.markToMarket();


    return {
      startingCapital:
        this.config
          .startingCapital,

      cash:
        this.cash,

      equity:
        this.equity,

      netProfit:
        this.equity -
        this.config
          .startingCapital,

      openPositions:
        this.positions.size,

      closedTrades:
        this.closedTrades.length,

      positions:
        [
          ...this.positions
            .values()
        ],

      checkedAt:
        Date.now()
    };
  }


  // ===================================
  // DIŞA AKTAR
  // ===================================

  exportData() {
    return {
      cash:
        this.cash,

      equity:
        this.equity,

      positions:
        [
          ...this.positions
            .entries()
        ],

      closedTrades:
        this.closedTrades,

      equityCurve:
        this.equityCurve
    };
  }


  // ===================================
  // İÇE AKTAR
  // ===================================

  importData(
    data = {}
  ) {
    if (
      !data ||
      typeof data !==
        "object"
    ) {
      return {
        ok: false,
        reason:
          "GEÇERSİZ PAPER TRADING VERİSİ"
      };
    }


    this.cash =
      this.number(
        data.cash,
        this.config
          .startingCapital
      );


    this.equity =
      this.number(
        data.equity,
        this.cash
      );


    this.positions =
      new Map(
        Array.isArray(
          data.positions
        )
          ? data.positions
          : []
      );


    this.closedTrades =
      Array.isArray(
        data.closedTrades
      )
        ? data.closedTrades
        : [];


    this.equityCurve =
      Array.isArray(
        data.equityCurve
      )
        ? data.equityCurve
        : [];


    this.markToMarket();


    return {
      ok: true,

      positions:
        this.positions.size,

      closedTrades:
        this.closedTrades.length
    };
  }


  // ===================================
  // RESET
  // ===================================

  reset() {
    this.cash =
      this.config
        .startingCapital;


    this.equity =
      this.config
        .startingCapital;


    this.positions.clear();

    this.closedTrades = [];


    this.equityCurve = [
      {
        timestamp:
          Date.now(),

        equity:
          this.equity
      }
    ];
  }
}


// =====================================
// FACTORY
// =====================================

export function createPaperTradingEngine(
  options = {}
) {
  return new PaperTradingEngine(
    options
  );
}
