// TradeRadar Ultimate
// Market Data Engine

export class MarketDataEngine {
  constructor(options = {}) {
    this.config = {
      tickRetentionMs:
        options.tickRetentionMs ??
        60 * 60 * 1000,

      maxTicksPerSymbol:
        options.maxTicksPerSymbol ??
        20000,

      orderBookLevels:
        options.orderBookLevels ??
        20
    };

    this.symbols = new Map();

    this.stats = {
      ticksReceived: 0,
      booksReceived: 0,
      rejected: 0,
      lastUpdateAt: 0
    };
  }


  // ===================================
  // COİN DURUMU
  // ===================================

  getSymbol(symbol) {
    const key =
      String(symbol || "")
        .trim()
        .toUpperCase();

    if (!key) return null;

    if (
      !this.symbols.has(key)
    ) {
      this.symbols.set(
        key,
        {
          symbol: key,

          price: null,
          bid: null,
          ask: null,

          spread: null,
          spreadPct: null,

          totalVolume: 0,
          buyVolume: 0,
          sellVolume: 0,

          tradeCount: 0,

          lastTickAt: 0,
          exchangeTimestamp: 0,

          ticks: [],

          orderBook: {
            bids: [],
            asks: [],
            bidDepth: 0,
            askDepth: 0,
            imbalance: 0,
            updatedAt: 0
          }
        }
      );
    }

    return this.symbols.get(
      key
    );
  }


  // ===================================
  // TICK EKLE
  // ===================================

  addTick(input = {}) {
    const symbol =
      String(
        input.symbol || ""
      )
        .trim()
        .toUpperCase();

    const price =
      Number(input.price);

    const quantity =
      Number(
        input.quantity ?? 0
      );

    const quoteVolume =
      Number.isFinite(
        Number(input.quoteVolume)
      )
        ? Number(input.quoteVolume)
        : price * quantity;

    const timestamp =
      Number(
        input.timestamp ||
        Date.now()
      );

    const side =
      String(
        input.side || ""
      ).toLowerCase();


    if (
      !symbol ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(timestamp)
    ) {
      this.stats.rejected += 1;

      return {
        ok: false,
        reason:
          "INVALID_TICK"
      };
    }


    const state =
      this.getSymbol(symbol);


    const tick = {
      timestamp,
      price,

      quantity:
        Number.isFinite(quantity)
          ? quantity
          : 0,

      quoteVolume:
        Number.isFinite(
          quoteVolume
        )
          ? Math.max(
              0,
              quoteVolume
            )
          : 0,

      side:
        side === "buy" ||
        side === "sell"
          ? side
          : "unknown"
    };


    state.price =
      price;

    state.lastTickAt =
      Date.now();

    state.exchangeTimestamp =
      timestamp;

    state.tradeCount += 1;

    state.totalVolume +=
      tick.quoteVolume;


    if (
      tick.side === "buy"
    ) {
      state.buyVolume +=
        tick.quoteVolume;
    }


    if (
      tick.side === "sell"
    ) {
      state.sellVolume +=
        tick.quoteVolume;
    }


    state.ticks.push(
      tick
    );


    this.cleanupTicks(
      state
    );


    this.stats.ticksReceived += 1;

    this.stats.lastUpdateAt =
      Date.now();


    return {
      ok: true,
      tick,
      state
    };
  }


  // ===================================
  // TICK TEMİZLE
  // ===================================

  cleanupTicks(state) {
    const cutoff =
      Date.now() -
      this.config
        .tickRetentionMs;


    while (
      state.ticks.length &&
      state.ticks[0]
        .timestamp <
        cutoff
    ) {
      state.ticks.shift();
    }


    if (
      state.ticks.length >
      this.config
        .maxTicksPerSymbol
    ) {
      state.ticks.splice(
        0,
        state.ticks.length -
          this.config
            .maxTicksPerSymbol
      );
    }
  }


  // ===================================
  // BID / ASK
  // ===================================

  updateBestBidAsk(
    symbol,
    bid,
    ask,
    timestamp = Date.now()
  ) {
    const state =
      this.getSymbol(symbol);

    if (!state) {
      return {
        ok: false
      };
    }


    const b =
      Number(bid);

    const a =
      Number(ask);


    if (
      !Number.isFinite(b) ||
      !Number.isFinite(a) ||
      b <= 0 ||
      a <= 0 ||
      a < b
    ) {
      return {
        ok: false,
        reason:
          "INVALID_BID_ASK"
      };
    }


    const mid =
      (a + b) / 2;


    state.bid = b;
    state.ask = a;

    state.spread =
      a - b;

    state.spreadPct =
      mid > 0
        ? (
            (
              a - b
            ) /
            mid
          ) * 100
        : null;


    state.lastTickAt =
      Math.max(
        state.lastTickAt,
        Number(timestamp) || 0
      );


    return {
      ok: true,

      bid: b,
      ask: a,

      spread:
        state.spread,

      spreadPct:
        state.spreadPct
    };
  }


  // ===================================
  // ORDER BOOK
  // ===================================

  updateOrderBook(
    symbol,
    bids = [],
    asks = [],
    timestamp = Date.now()
  ) {
    const state =
      this.getSymbol(symbol);

    if (!state) {
      return {
        ok: false
      };
    }


    const normalize =
      rows =>
        rows
          .map(
            row => {
              const price =
                Number(
                  Array.isArray(row)
                    ? row[0]
                    : row.price
                );

              const quantity =
                Number(
                  Array.isArray(row)
                    ? row[1]
                    : row.quantity
                );

              if (
                !Number.isFinite(price) ||
                !Number.isFinite(quantity) ||
                price <= 0 ||
                quantity < 0
              ) {
                return null;
              }


              return {
                price,
                quantity,

                quoteValue:
                  price *
                  quantity
              };
            }
          )
          .filter(Boolean)
          .slice(
            0,
            this.config
              .orderBookLevels
          );


    const normalizedBids =
      normalize(bids);

    const normalizedAsks =
      normalize(asks);


    const bidDepth =
      normalizedBids.reduce(
        (
          total,
          level
        ) =>
          total +
          level.quoteValue,
        0
      );


    const askDepth =
      normalizedAsks.reduce(
        (
          total,
          level
        ) =>
          total +
          level.quoteValue,
        0
      );


    const totalDepth =
      bidDepth +
      askDepth;


    const imbalance =
      totalDepth > 0
        ? (
            bidDepth -
            askDepth
          ) /
          totalDepth
        : 0;


    state.orderBook = {
      bids:
        normalizedBids,

      asks:
        normalizedAsks,

      bidDepth,
      askDepth,
      imbalance,

      updatedAt:
        Number(timestamp) ||
        Date.now()
    };


    if (
      normalizedBids.length &&
      normalizedAsks.length
    ) {
      this.updateBestBidAsk(
        symbol,
        normalizedBids[0].price,
        normalizedAsks[0].price,
        timestamp
      );
    }


    this.stats.booksReceived += 1;

    this.stats.lastUpdateAt =
      Date.now();


    return {
      ok: true,
      orderBook:
        state.orderBook
    };
  }


  // ===================================
  // ZAMAN PENCERESİ
  // ===================================

  window(
    symbol,
    milliseconds
  ) {
    const state =
      this.getSymbol(symbol);

    if (!state) {
      return null;
    }


    const cutoff =
      Date.now() -
      milliseconds;


    const ticks =
      state.ticks.filter(
        tick =>
          tick.timestamp >=
          cutoff
      );


    if (!ticks.length) {
      return {
        symbol:
          state.symbol,

        milliseconds,

        tradeCount: 0,

        totalVolume: 0,
        buyVolume: 0,
        sellVolume: 0,

        buyRatio: 50,

        priceChangePct: 0,

        firstPrice: null,
        lastPrice:
          state.price
      };
    }


    const firstPrice =
      ticks[0].price;

    const lastPrice =
      ticks[
        ticks.length - 1
      ].price;


    let totalVolume = 0;
    let buyVolume = 0;
    let sellVolume = 0;


    for (
      const tick of ticks
    ) {
      totalVolume +=
        tick.quoteVolume;


      if (
        tick.side === "buy"
      ) {
        buyVolume +=
          tick.quoteVolume;
      }


      if (
        tick.side === "sell"
      ) {
        sellVolume +=
          tick.quoteVolume;
      }
    }


    const priceChangePct =
      firstPrice > 0
        ? (
            (
              lastPrice -
              firstPrice
            ) /
            firstPrice
          ) * 100
        : 0;


    const buyRatio =
      totalVolume > 0
        ? (
            buyVolume /
            totalVolume
          ) * 100
        : 50;


    return {
      symbol:
        state.symbol,

      milliseconds,

      tradeCount:
        ticks.length,

      totalVolume,
      buyVolume,
      sellVolume,
      buyRatio,

      priceChangePct,

      firstPrice,
      lastPrice
    };
  }


  // ===================================
  // STANDART PENCERELER
  // ===================================

  windows(symbol) {
    return {
      s5:
        this.window(
          symbol,
          5000
        ),

      s10:
        this.window(
          symbol,
          10000
        ),

      s30:
        this.window(
          symbol,
          30000
        ),

      s60:
        this.window(
          symbol,
          60000
        ),

      s120:
        this.window(
          symbol,
          120000
        ),

      m3:
        this.window(
          symbol,
          3 * 60000
        ),

      m5:
        this.window(
          symbol,
          5 * 60000
        ),

      m15:
        this.window(
          symbol,
          15 * 60000
        ),

      h1:
        this.window(
          symbol,
          60 * 60000
        )
    };
  }


  // ===================================
  // CVD BENZERİ NET AKIŞ
  // ===================================

  cvdLike(
    symbol,
    milliseconds =
      5 * 60000
  ) {
    const w =
      this.window(
        symbol,
        milliseconds
      );


    if (!w) {
      return null;
    }


    return {
      buyVolume:
        w.buyVolume,

      sellVolume:
        w.sellVolume,

      net:
        w.buyVolume -
        w.sellVolume,

      ratio:
        w.sellVolume > 0
          ? w.buyVolume /
            w.sellVolume
          : w.buyVolume > 0
            ? Infinity
            : 1
    };
  }


  // ===================================
  // COİN SNAPSHOT
  // ===================================

  snapshot(symbol) {
    const state =
      this.getSymbol(symbol);

    if (!state) {
      return null;
    }


    return {
      symbol:
        state.symbol,

      price:
        state.price,

      bid:
        state.bid,

      ask:
        state.ask,

      spread:
        state.spread,

      spreadPct:
        state.spreadPct,

      tradeCount:
        state.tradeCount,

      totalVolume:
        state.totalVolume,

      buyVolume:
        state.buyVolume,

      sellVolume:
        state.sellVolume,

      orderBook: {
        bidDepth:
          state.orderBook
            .bidDepth,

        askDepth:
          state.orderBook
            .askDepth,

        imbalance:
          state.orderBook
            .imbalance,

        updatedAt:
          state.orderBook
            .updatedAt
      },

      windows:
        this.windows(
          symbol
        ),

      cvd:
        this.cvdLike(
          symbol
        ),

      lastTickAt:
        state.lastTickAt,

      exchangeTimestamp:
        state.exchangeTimestamp
    };
  }


  // ===================================
  // TÜM MARKET SNAPSHOT
  // ===================================

  marketSnapshot() {
    return {
      trackedSymbols:
        this.symbols.size,

      stats: {
        ...this.stats
      },

      updatedAt:
        Date.now()
    };
  }
}


export function createMarketDataEngine(
  options = {}
) {
  return new MarketDataEngine(
    options
  );
}
