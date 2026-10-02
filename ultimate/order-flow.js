// TradeRadar Ultimate
// Order Flow Engine

export class OrderFlowEngine {
  constructor(options = {}) {
    this.config = {
      minBuyRatio:
        options.minBuyRatio ?? 55,

      strongBuyRatio:
        options.strongBuyRatio ?? 65,

      strongImbalance:
        options.strongImbalance ?? 0.20,

      extremeImbalance:
        options.extremeImbalance ?? 0.50,

      minTradeAcceleration:
        options.minTradeAcceleration ?? 1.15,

      strongTradeAcceleration:
        options.strongTradeAcceleration ?? 1.30,

      minimumDepthUsd:
        options.minimumDepthUsd ?? 10000
    };
  }


  // ===================================
  // YARDIMCILAR
  // ===================================

  number(value) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : null;
  }


  safeRatio(
    numerator,
    denominator,
    fallback = null
  ) {
    const a =
      this.number(
        numerator
      );

    const b =
      this.number(
        denominator
      );

    if (
      a === null ||
      b === null ||
      b <= 0
    ) {
      return fallback;
    }

    return a / b;
  }


  // ===================================
  // BUY / SELL RATIO
  // ===================================

  buySellRatio(
    buyVolume,
    sellVolume
  ) {
    const buy =
      Math.max(
        0,
        Number(
          buyVolume || 0
        )
      );

    const sell =
      Math.max(
        0,
        Number(
          sellVolume || 0
        )
      );

    const total =
      buy + sell;


    const buyRatio =
      total > 0
        ? (
            buy /
            total
          ) * 100
        : 50;


    const sellRatio =
      total > 0
        ? (
            sell /
            total
          ) * 100
        : 50;


    const ratio =
      sell > 0
        ? buy / sell
        : buy > 0
          ? Infinity
          : 1;


    return {
      buyVolume:
        buy,

      sellVolume:
        sell,

      buyRatio,
      sellRatio,

      buySellRatio:
        ratio,

      net:
        buy - sell
    };
  }


  // ===================================
  // ORDER BOOK IMBALANCE
  // ===================================

  orderBookImbalance(
    bidDepth,
    askDepth
  ) {
    const bid =
      Math.max(
        0,
        Number(
          bidDepth || 0
        )
      );

    const ask =
      Math.max(
        0,
        Number(
          askDepth || 0
        )
      );

    const total =
      bid + ask;


    const imbalance =
      total > 0
        ? (
            bid -
            ask
          ) /
          total
        : 0;


    let state =
      "BALANCED";


    if (
      imbalance >=
      this.config
        .extremeImbalance
    ) {
      state =
        "EXTREME_BUY";

    } else if (
      imbalance >=
      this.config
        .strongImbalance
    ) {
      state =
        "BUY";

    } else if (
      imbalance <=
      -this.config
        .extremeImbalance
    ) {
      state =
        "EXTREME_SELL";

    } else if (
      imbalance <=
      -this.config
        .strongImbalance
    ) {
      state =
        "SELL";
    }


    return {
      bidDepth:
        bid,

      askDepth:
        ask,

      totalDepth:
        total,

      imbalance,

      state
    };
  }


  // ===================================
  // CVD BENZERİ AKIŞ
  // ===================================

  cvd({
    buyVolume = 0,
    sellVolume = 0,
    previousNet = 0
  } = {}) {
    const buy =
      Number(
        buyVolume || 0
      );

    const sell =
      Number(
        sellVolume || 0
      );

    const previous =
      Number(
        previousNet || 0
      );


    const net =
      buy - sell;


    const delta =
      net - previous;


    let direction =
      "FLAT";


    if (delta > 0) {
      direction =
        "RISING";

    } else if (
      delta < 0
    ) {
      direction =
        "FALLING";
    }


    return {
      net,
      previousNet:
        previous,

      delta,
      direction
    };
  }


  // ===================================
  // TRADE COUNT ACCELERATION
  // ===================================

  tradeAcceleration({
    shortCount = 0,
    longCount = 0,
    shortSeconds = 10,
    longSeconds = 60
  } = {}) {
    const short =
      Number(
        shortCount || 0
      );

    const long =
      Number(
        longCount || 0
      );


    if (
      shortSeconds <= 0 ||
      longSeconds <= 0 ||
      long <= 0
    ) {
      return null;
    }


    const shortRate =
      short /
      shortSeconds;


    const longRate =
      long /
      longSeconds;


    if (
      longRate <= 0
    ) {
      return null;
    }


    return (
      shortRate /
      longRate
    );
  }


  // ===================================
  // ALIŞ BASKISI HIZLANIYOR MU?
  // ===================================

  pressureAcceleration({
    shortBuyRatio = 50,
    mediumBuyRatio = 50,
    longBuyRatio = 50
  } = {}) {
    const short =
      Number(
        shortBuyRatio || 0
      );

    const medium =
      Number(
        mediumBuyRatio || 0
      );

    const long =
      Number(
        longBuyRatio || 0
      );


    const shortVsMedium =
      short - medium;


    const mediumVsLong =
      medium - long;


    let state =
      "STABLE";


    if (
      short >
        medium &&
      medium >=
        long &&
      short >=
        this.config
          .minBuyRatio
    ) {
      state =
        "BUY_PRESSURE_ACCELERATING";

    } else if (
      short <
        medium &&
      medium <=
        long
    ) {
      state =
        "SELL_PRESSURE_ACCELERATING";

    } else if (
      short >=
        this.config
          .strongBuyRatio
    ) {
      state =
        "BUY_PRESSURE_HIGH";
    }


    return {
      short,
      medium,
      long,

      shortVsMedium,
      mediumVsLong,

      state
    };
  }


  // ===================================
  // SATICI BASKISI AZALIYOR MU?
  // ===================================

  sellerPressureDeclining({
    shortBuyRatio = 50,
    mediumBuyRatio = 50,
    longBuyRatio = 50
  } = {}) {
    const shortSell =
      100 -
      Number(
        shortBuyRatio || 50
      );

    const mediumSell =
      100 -
      Number(
        mediumBuyRatio || 50
      );

    const longSell =
      100 -
      Number(
        longBuyRatio || 50
      );


    return {
      declining:
        shortSell <
          mediumSell &&
        mediumSell <=
          longSell,

      shortSell,
      mediumSell,
      longSell
    };
  }


  // ===================================
  // LİKİDİTE / DEPTH KONTROLÜ
  // ===================================

  depthQuality(
    bidDepth,
    askDepth
  ) {
    const bid =
      Math.max(
        0,
        Number(
          bidDepth || 0
        )
      );

    const ask =
      Math.max(
        0,
        Number(
          askDepth || 0
        )
      );


    const minimum =
      Math.min(
        bid,
        ask
      );


    return {
      sufficient:
        minimum >=
        this.config
          .minimumDepthUsd,

      minimumSideDepth:
        minimum,

      bidDepth:
        bid,

      askDepth:
        ask
    };
  }


  // ===================================
  // ANA ANALİZ
  // ===================================

  analyze({
    windows = {},
    orderBook = {},
    previousCvdNet = 0
  } = {}) {

    const s10 =
      windows.s10 || {};

    const s30 =
      windows.s30 || {};

    const s60 =
      windows.s60 || {};


    const flow10 =
      this.buySellRatio(
        s10.buyVolume,
        s10.sellVolume
      );


    const flow30 =
      this.buySellRatio(
        s30.buyVolume,
        s30.sellVolume
      );


    const flow60 =
      this.buySellRatio(
        s60.buyVolume,
        s60.sellVolume
      );


    const book =
      this.orderBookImbalance(
        orderBook.bidDepth,
        orderBook.askDepth
      );


    const cvd =
      this.cvd({
        buyVolume:
          s60.buyVolume,

        sellVolume:
          s60.sellVolume,

        previousNet:
          previousCvdNet
      });


    const tradeAccel10 =
      this.tradeAcceleration({
        shortCount:
          s10.tradeCount,

        longCount:
          s60.tradeCount,

        shortSeconds: 10,
        longSeconds: 60
      });


    const tradeAccel30 =
      this.tradeAcceleration({
        shortCount:
          s30.tradeCount,

        longCount:
          s60.tradeCount,

        shortSeconds: 30,
        longSeconds: 60
      });


    const pressure =
      this.pressureAcceleration({
        shortBuyRatio:
          flow10.buyRatio,

        mediumBuyRatio:
          flow30.buyRatio,

        longBuyRatio:
          flow60.buyRatio
      });


    const sellerPressure =
      this.sellerPressureDeclining({
        shortBuyRatio:
          flow10.buyRatio,

        mediumBuyRatio:
          flow30.buyRatio,

        longBuyRatio:
          flow60.buyRatio
      });


    const depth =
      this.depthQuality(
        book.bidDepth,
        book.askDepth
      );


    // =================================
    // PUAN
    // =================================

    let score = 0;


    // Alış baskısı
    if (
      flow30.buyRatio >=
      this.config
        .strongBuyRatio
    ) {
      score += 25;

    } else if (
      flow30.buyRatio >=
      this.config
        .minBuyRatio
    ) {
      score += 15;
    }


    // Order book
    if (
      book.imbalance >=
      this.config
        .extremeImbalance
    ) {
      score += 20;

    } else if (
      book.imbalance >=
      this.config
        .strongImbalance
    ) {
      score += 15;
    }


    // Trade acceleration
    if (
      tradeAccel10 !== null &&
      tradeAccel10 >=
        this.config
          .strongTradeAcceleration
    ) {
      score += 20;

    } else if (
      tradeAccel10 !== null &&
      tradeAccel10 >=
        this.config
          .minTradeAcceleration
    ) {
      score += 10;
    }


    // CVD
    if (
      cvd.direction ===
      "RISING" &&
      cvd.net > 0
    ) {
      score += 15;
    }


    // Alış baskısı hızlanması
    if (
      pressure.state ===
      "BUY_PRESSURE_ACCELERATING"
    ) {
      score += 10;
    }


    // Satıcı baskısının azalması
    if (
      sellerPressure.declining
    ) {
      score += 5;
    }


    // Depth
    if (
      depth.sufficient
    ) {
      score += 5;
    }


    // Negatif durumlar
    if (
      book.state ===
        "SELL" ||
      book.state ===
        "EXTREME_SELL"
    ) {
      score -= 20;
    }


    if (
      flow30.buyRatio < 40
    ) {
      score -= 20;
    }


    if (
      cvd.direction ===
        "FALLING" &&
      cvd.net < 0
    ) {
      score -= 15;
    }


    score =
      Math.max(
        0,
        Math.min(
          100,
          score
        )
      );


    // =================================
    // DURUM
    // =================================

    let status =
      "NEUTRAL";


    if (
      score >= 80
    ) {
      status =
        "STRONG_BUY_FLOW";

    } else if (
      score >= 60
    ) {
      status =
        "BUY_FLOW";

    } else if (
      score <= 20
    ) {
      status =
        "STRONG_SELL_FLOW";

    } else if (
      score <= 40
    ) {
      status =
        "SELL_FLOW";
    }


    return {
      ready: true,

      score,
      status,

      buySell: {
        s10:
          flow10,

        s30:
          flow30,

        s60:
          flow60
      },

      orderBook:
        book,

      cvd,

      tradeAcceleration: {
        s10:
          tradeAccel10,

        s30:
          tradeAccel30
      },

      pressure,

      sellerPressure,

      depth,

      strongBuyerPressure:
        flow30.buyRatio >=
        this.config
          .strongBuyRatio,

      buyerPressureAccelerating:
        pressure.state ===
        "BUY_PRESSURE_ACCELERATING",

      sellerPressureDeclining:
        sellerPressure.declining,

      analyzedAt:
        Date.now()
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createOrderFlowEngine(
  options = {}
) {
  return new OrderFlowEngine(
    options
  );
}
