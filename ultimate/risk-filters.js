// TradeRadar Ultimate
// Liquidity + Manipulation + Fake Breakout Engine

export class RiskFiltersEngine {
  constructor(options = {}) {
    this.config = {
      maxSpreadPct:
        options.maxSpreadPct ?? 1.0,

      preferredSpreadPct:
        options.preferredSpreadPct ?? 0.5,

      minDepthUsd:
        options.minDepthUsd ?? 10000,

      maxSlippagePct:
        options.maxSlippagePct ?? 0.50,

      max30sMovePct:
        options.max30sMovePct ?? 3,

      max60sMovePct:
        options.max60sMovePct ?? 4,

      max120sMovePct:
        options.max120sMovePct ?? 5,

      minimumBreakoutRvol:
        options.minimumBreakoutRvol ?? 2.0,

      minimumBreakoutBuyRatio:
        options.minimumBreakoutBuyRatio ?? 65,

      minimumBreakoutTradeAccel:
        options.minimumBreakoutTradeAccel ?? 1.30,

      minimumBookImbalance:
        options.minimumBookImbalance ?? 0,

      bidWallDisappearPct:
        options.bidWallDisappearPct ?? 60
    };

    this.bookHistory =
      new Map();
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
  // SLIPPAGE TAHMİNİ
  // ===================================

  estimateSlippage({
    side = "buy",
    notionalUsd = 0,
    orderBook = {}
  } = {}) {
    const notional =
      Math.max(
        0,
        Number(
          notionalUsd || 0
        )
      );


    const levels =
      side === "sell"
        ? orderBook.bids || []
        : orderBook.asks || [];


    if (
      notional <= 0 ||
      !levels.length
    ) {
      return {
        ready: false,
        slippagePct: null,
        averagePrice: null,
        filledUsd: 0
      };
    }


    const bestPrice =
      Number(
        levels[0]?.price ||
        levels[0]?.[0]
      );


    if (
      !Number.isFinite(
        bestPrice
      ) ||
      bestPrice <= 0
    ) {
      return {
        ready: false,
        slippagePct: null,
        averagePrice: null,
        filledUsd: 0
      };
    }


    let remaining =
      notional;

    let filledUsd = 0;
    let quantity = 0;


    for (
      const level of levels
    ) {
      const price =
        Number(
          level?.price ??
          level?.[0]
        );

      const levelQuantity =
        Number(
          level?.quantity ??
          level?.[1]
        );


      if (
        !Number.isFinite(price) ||
        !Number.isFinite(
          levelQuantity
        ) ||
        price <= 0 ||
        levelQuantity <= 0
      ) {
        continue;
      }


      const levelUsd =
        price *
        levelQuantity;


      const useUsd =
        Math.min(
          remaining,
          levelUsd
        );


      quantity +=
        useUsd /
        price;

      filledUsd +=
        useUsd;

      remaining -=
        useUsd;


      if (
        remaining <= 0
      ) {
        break;
      }
    }


    if (
      filledUsd <= 0 ||
      quantity <= 0
    ) {
      return {
        ready: false,
        slippagePct: null,
        averagePrice: null,
        filledUsd
      };
    }


    const averagePrice =
      filledUsd /
      quantity;


    const slippagePct =
      side === "sell"
        ? (
            (
              bestPrice -
              averagePrice
            ) /
            bestPrice
          ) * 100
        : (
            (
              averagePrice -
              bestPrice
            ) /
            bestPrice
          ) * 100;


    return {
      ready: true,

      complete:
        remaining <= 0,

      slippagePct:
        Math.max(
          0,
          slippagePct
        ),

      averagePrice,

      filledUsd,

      requestedUsd:
        notional,

      unfilledUsd:
        Math.max(
          0,
          remaining
        )
    };
  }


  // ===================================
  // LİKİDİTE
  // ===================================

  liquidity({
    spreadPct = null,
    bidDepth = 0,
    askDepth = 0,
    slippagePct = null,
    tradeCount = 0,
    volume = 0
  } = {}) {
    const spread =
      this.number(
        spreadPct
      );

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

    const slippage =
      this.number(
        slippagePct
      );


    const minimumDepth =
      Math.min(
        bid,
        ask
      );


    const reasons = [];

    let score = 100;


    if (
      spread === null
    ) {
      score -= 15;

      reasons.push(
        "SPREAD_UNKNOWN"
      );

    } else if (
      spread >
      this.config
        .maxSpreadPct
    ) {
      score -= 45;

      reasons.push(
        "SPREAD_TOO_WIDE"
      );

    } else if (
      spread >
      this.config
        .preferredSpreadPct
    ) {
      score -= 15;

      reasons.push(
        "SPREAD_ELEVATED"
      );
    }


    if (
      minimumDepth <
      this.config
        .minDepthUsd
    ) {
      score -= 40;

      reasons.push(
        "LOW_ORDER_BOOK_DEPTH"
      );
    }


    if (
      slippage !== null &&
      slippage >
      this.config
        .maxSlippagePct
    ) {
      score -= 40;

      reasons.push(
        "SLIPPAGE_TOO_HIGH"
      );
    }


    if (
      Number(tradeCount) <= 0
    ) {
      score -= 20;

      reasons.push(
        "NO_RECENT_TRADES"
      );
    }


    if (
      Number(volume) <= 0
    ) {
      score -= 20;

      reasons.push(
        "NO_RECENT_VOLUME"
      );
    }


    score =
      this.clamp(
        score
      );


    const sufficient =
      score >= 60 &&
      !reasons.includes(
        "SPREAD_TOO_WIDE"
      ) &&
      !reasons.includes(
        "LOW_ORDER_BOOK_DEPTH"
      ) &&
      !reasons.includes(
        "SLIPPAGE_TOO_HIGH"
      );


    return {
      score,

      sufficient,

      message:
        sufficient
          ? "LİKİDİTE UYGUN"
          : "LİKİDİTE YETERSİZ",

      spreadPct:
        spread,

      bidDepth:
        bid,

      askDepth:
        ask,

      minimumDepth,

      slippagePct:
        slippage,

      reasons
    };
  }


  // ===================================
  // ORDER BOOK DUVAR TAKİBİ
  // ===================================

  trackBook(
    symbol,
    orderBook = {}
  ) {
    const key =
      String(
        symbol || ""
      )
        .trim()
        .toUpperCase();


    if (!key) {
      return null;
    }


    const current = {
      bidDepth:
        Math.max(
          0,
          Number(
            orderBook.bidDepth ||
            0
          )
        ),

      askDepth:
        Math.max(
          0,
          Number(
            orderBook.askDepth ||
            0
          )
        ),

      timestamp:
        Date.now()
    };


    const previous =
      this.bookHistory.get(
        key
      ) || null;


    this.bookHistory.set(
      key,
      current
    );


    if (!previous) {
      return {
        ready: false,
        current
      };
    }


    const bidDropPct =
      previous.bidDepth > 0
        ? (
            (
              previous.bidDepth -
              current.bidDepth
            ) /
            previous.bidDepth
          ) * 100
        : 0;


    const askDropPct =
      previous.askDepth > 0
        ? (
            (
              previous.askDepth -
              current.askDepth
            ) /
            previous.askDepth
          ) * 100
        : 0;


    return {
      ready: true,

      bidDropPct,
      askDropPct,

      disappearingBidWall:
        bidDropPct >=
        this.config
          .bidWallDisappearPct,

      previous,
      current
    };
  }


  // ===================================
  // MANİPÜLASYON / PUMP FİLTRESİ
  // ===================================

  manipulation({
    symbol = "",
    windows = {},
    spreadPct = null,
    relativeVolume = null,
    volumeAcceleration = null,
    buyRatio = 50,
    orderBook = {}
  } = {}) {
    const reasons = [];

    let riskScore = 0;


    const move30 =
      Number(
        windows.s30
          ?.priceChangePct ||
        0
      );


    const move60 =
      Number(
        windows.s60
          ?.priceChangePct ||
        0
      );


    const move120 =
      Number(
        windows.s120
          ?.priceChangePct ||
        0
      );


    const spread =
      this.number(
        spreadPct
      );


    const rvol =
      this.number(
        relativeVolume
      );


    const volAccel =
      this.number(
        volumeAcceleration
      );


    const buyers =
      Number(
        buyRatio || 0
      );


    if (
      Math.abs(move30) >=
      this.config
        .max30sMovePct
    ) {
      riskScore += 30;

      reasons.push(
        "EXTREME_30S_MOVE"
      );
    }


    if (
      Math.abs(move60) >=
      this.config
        .max60sMovePct
    ) {
      riskScore += 30;

      reasons.push(
        "EXTREME_60S_MOVE"
      );
    }


    if (
      Math.abs(move120) >=
      this.config
        .max120sMovePct
    ) {
      riskScore += 30;

      reasons.push(
        "EXTREME_120S_MOVE"
      );
    }


    if (
      spread !== null &&
      spread >
      this.config
        .maxSpreadPct
    ) {
      riskScore += 25;

      reasons.push(
        "WIDE_SPREAD"
      );
    }


    // Fiyat sert yükseliyor ama
    // hacim desteklemiyor.
    if (
      move60 > 1.5 &&
      (
        (
          rvol !== null &&
          rvol < 1
        ) ||
        (
          volAccel !== null &&
          volAccel < 0.8
        )
      )
    ) {
      riskScore += 35;

      reasons.push(
        "PRICE_VOLUME_DIVERGENCE"
      );
    }


    // Fiyat yükseliyor ancak
    // alıcı devamlılığı zayıf.
    if (
      move60 > 1 &&
      buyers < 50
    ) {
      riskScore += 25;

      reasons.push(
        "BUYER_CONTINUATION_LOST"
      );
    }


    const bookChange =
      this.trackBook(
        symbol,
        orderBook
      );


    if (
      bookChange
        ?.disappearingBidWall
    ) {
      riskScore += 35;

      reasons.push(
        "DISAPPEARING_BID_WALL"
      );
    }


    riskScore =
      this.clamp(
        riskScore
      );


    const suspicious =
      riskScore >= 60;


    return {
      riskScore,

      suspicious,

      message:
        suspicious
          ? "ANORMAL HAREKET – İŞLEME GİRME"
          : "ANORMAL HAREKET TESPİT EDİLMEDİ",

      reasons,

      priceMoves: {
        s30:
          move30,

        s60:
          move60,

        s120:
          move120
      },

      bookChange
    };
  }


  // ===================================
  // SAHTE KIRILIM
  // ===================================

  fakeBreakout({
    breakout = {},
    relativeVolume = null,
    tradeAcceleration = null,
    buyRatio = 50,
    cvd = {},
    spreadPct = null,
    orderBook = {},
    candleClosed = false,
    retest = {},
    higherTimeframeBullish = false
  } = {}) {
    const reasons = [];

    let confirmationScore = 0;


    if (
      breakout.breakout !==
        true ||
      breakout.direction !==
        "UP"
    ) {
      return {
        breakoutDetected: false,

        confirmationScore: 0,

        confirmed: false,

        fakeBreakoutRisk: false,

        message:
          "YUKARI KIRILIM YOK",

        reasons: []
      };
    }


    const rvol =
      this.number(
        relativeVolume
      );


    const tradeAccel =
      this.number(
        tradeAcceleration
      );


    const buyers =
      Number(
        buyRatio || 0
      );


    const spread =
      this.number(
        spreadPct
      );


    const imbalance =
      this.number(
        orderBook.imbalance,
        0
      );


    // Hacim
    if (
      rvol !== null &&
      rvol >=
        this.config
          .minimumBreakoutRvol
    ) {
      confirmationScore += 20;
    } else {
      reasons.push(
        "BREAKOUT_VOLUME_WEAK"
      );
    }


    // İşlem sayısı
    if (
      tradeAccel !== null &&
      tradeAccel >=
        this.config
          .minimumBreakoutTradeAccel
    ) {
      confirmationScore += 15;
    } else {
      reasons.push(
        "TRADE_ACCELERATION_WEAK"
      );
    }


    // Alıcı baskısı
    if (
      buyers >=
      this.config
        .minimumBreakoutBuyRatio
    ) {
      confirmationScore += 15;
    } else {
      reasons.push(
        "BUY_PRESSURE_WEAK"
      );
    }


    // CVD
    if (
      cvd.direction ===
        "RISING" &&
      Number(cvd.net) > 0
    ) {
      confirmationScore += 15;
    } else {
      reasons.push(
        "CVD_NOT_CONFIRMING"
      );
    }


    // Spread
    if (
      spread !== null &&
      spread <=
        this.config
          .maxSpreadPct
    ) {
      confirmationScore += 10;
    } else {
      reasons.push(
        "SPREAD_NOT_CONFIRMING"
      );
    }


    // Order book
    if (
      imbalance >=
      this.config
        .minimumBookImbalance
    ) {
      confirmationScore += 10;
    } else {
      reasons.push(
        "ORDER_BOOK_NOT_CONFIRMING"
      );
    }


    // Mum kapanışı
    if (candleClosed) {
      confirmationScore += 5;
    } else {
      reasons.push(
        "CANDLE_NOT_CLOSED"
      );
    }


    // Retest
    if (
      retest.detected ===
      true
    ) {
      confirmationScore += 5;
    }


    // Üst zaman dilimi
    if (
      higherTimeframeBullish
    ) {
      confirmationScore += 5;
    } else {
      reasons.push(
        "HIGHER_TIMEFRAME_NOT_SUPPORTIVE"
      );
    }


    confirmationScore =
      this.clamp(
        confirmationScore
      );


    const confirmed =
      confirmationScore >= 70;


    const fakeBreakoutRisk =
      confirmationScore < 55;


    return {
      breakoutDetected:
        true,

      confirmationScore,

      confirmed,

      fakeBreakoutRisk,

      message:
        confirmed
          ? "KIRILIM TEYİTLİ"
          : fakeBreakoutRisk
            ? "SAHTE KIRILIM RİSKİ"
            : "TEYİT BEKLENİYOR",

      reasons
    };
  }


  // ===================================
  // BİRLEŞİK GÜVENLİK KONTROLÜ
  // ===================================

  evaluate({
    symbol = "",
    market = {},
    volume = {},
    orderFlow = {},
    technical = {},
    notionalUsd = 0,
    candleClosed = false,
    higherTimeframeBullish = false
  } = {}) {

    const orderBook =
      market.orderBook || {};


    const slippage =
      this.estimateSlippage({
        side: "buy",

        notionalUsd,

        orderBook
      });


    const liquidity =
      this.liquidity({
        spreadPct:
          market.spreadPct,

        bidDepth:
          orderBook.bidDepth,

        askDepth:
          orderBook.askDepth,

        slippagePct:
          slippage.slippagePct,

        tradeCount:
          market.windows
            ?.s60
            ?.tradeCount,

        volume:
          market.windows
            ?.s60
            ?.totalVolume
      });


    const manipulation =
      this.manipulation({
        symbol,

        windows:
          market.windows,

        spreadPct:
          market.spreadPct,

        relativeVolume:
          volume.relativeVolume,

        volumeAcceleration:
          volume.acceleration
            ?.s30,

        buyRatio:
          orderFlow.buySell
            ?.s30
            ?.buyRatio,

        orderBook
      });


    const fakeBreakout =
      this.fakeBreakout({
        breakout:
          technical.breakout,

        relativeVolume:
          volume.relativeVolume,

        tradeAcceleration:
          orderFlow
            .tradeAcceleration
            ?.s10,

        buyRatio
