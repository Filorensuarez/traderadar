// TradeRadar Ultimate
// Data Quality Engine
//
// Amaç:
// Piyasa verisini sinyal motoruna ulaşmadan önce
// doğrulamak ve güvenilir olmayan veride işlemi durdurmak.

export class DataQualityEngine {
  constructor(options = {}) {
    this.config = {
      maxTickAgeMs:
        options.maxTickAgeMs ?? 15000,

      maxFutureTimestampMs:
        options.maxFutureTimestampMs ?? 5000,

      duplicateWindowMs:
        options.duplicateWindowMs ?? 3000,

      maxPriceJumpPct:
        options.maxPriceJumpPct ?? 20,

      maxSpreadPct:
        options.maxSpreadPct ?? 5,

      requireVolume:
        options.requireVolume ?? true,

      historyLimit:
        options.historyLimit ?? 100
    };


    this.symbolState =
      new Map();


    this.stats = {
      checked: 0,
      accepted: 0,
      rejected: 0,

      stale: 0,
      futureTimestamp: 0,
      invalidPrice: 0,
      zeroVolume: 0,
      duplicate: 0,
      abnormalJump: 0,
      invalidSpread: 0
    };
  }


  // ===================================
  // SAYI KONTROLÜ
  // ===================================

  number(value) {
    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : null;
  }


  // ===================================
  // SEMBOL DURUMU
  // ===================================

  getState(symbol) {
    if (
      !this.symbolState.has(symbol)
    ) {
      this.symbolState.set(
        symbol,
        {
          lastPrice: null,
          lastTimestamp: 0,
          lastFingerprint: null,
          lastAcceptedAt: 0,
          rejectedCount: 0,
          acceptedCount: 0,
          history: []
        }
      );
    }

    return this.symbolState.get(
      symbol
    );
  }


  // ===================================
  // TICK FINGERPRINT
  // ===================================

  fingerprint(tick) {
    return [
      tick.symbol,
      tick.timestamp,
      tick.price,
      tick.volume,
      tick.bid,
      tick.ask
    ].join("|");
  }


  // ===================================
  // ANA VERİ KONTROLÜ
  // ===================================

  validateTick(input = {}) {
    this.stats.checked += 1;

    const now =
      Date.now();


    const symbol =
      String(
        input.symbol || ""
      )
        .trim()
        .toUpperCase();


    const price =
      this.number(
        input.price
      );


    const volume =
      this.number(
        input.volume
      );


    const timestamp =
      this.number(
        input.timestamp
      );


    const bid =
      this.number(
        input.bid
      );


    const ask =
      this.number(
        input.ask
      );


    const reasons = [];
    const warnings = [];


    // =================================
    // SEMBOL
    // =================================

    if (!symbol) {
      reasons.push(
        "INVALID_SYMBOL"
      );
    }


    // =================================
    // FİYAT
    // =================================

    if (
      price === null ||
      price <= 0
    ) {
      reasons.push(
        "INVALID_PRICE"
      );

      this.stats.invalidPrice += 1;
    }


    // =================================
    // HACİM
    // =================================

    if (
      this.config.requireVolume &&
      (
        volume === null ||
        volume <= 0
      )
    ) {
      reasons.push(
        "ZERO_OR_INVALID_VOLUME"
      );

      this.stats.zeroVolume += 1;
    }


    // =================================
    // TIMESTAMP
    // =================================

    if (
      timestamp === null ||
      timestamp <= 0
    ) {
      reasons.push(
        "INVALID_TIMESTAMP"
      );

    } else {

      const age =
        now - timestamp;


      if (
        age >
        this.config.maxTickAgeMs
      ) {
        reasons.push(
          "STALE_DATA"
        );

        this.stats.stale += 1;
      }


      if (
        timestamp - now >
        this.config
          .maxFutureTimestampMs
      ) {
        reasons.push(
          "FUTURE_TIMESTAMP"
        );

        this.stats.futureTimestamp += 1;
      }
    }


    // =================================
    // BID / ASK
    // =================================

    let spreadPct = null;


    if (
      bid !== null &&
      ask !== null
    ) {

      if (
        bid <= 0 ||
        ask <= 0 ||
        ask < bid
      ) {
        reasons.push(
          "INVALID_BID_ASK"
        );

      } else {

        const mid =
          (
            bid +
            ask
          ) / 2;


        spreadPct =
          mid > 0
            ? (
                (
                  ask -
                  bid
                ) /
                mid
              ) * 100
            : null;


        if (
          spreadPct !== null &&
          spreadPct >
            this.config
              .maxSpreadPct
        ) {
          warnings.push(
            "WIDE_SPREAD"
          );

          this.stats.invalidSpread += 1;
        }
      }
    }


    // =================================
    // SEMBOL GEÇMİŞİ
    // =================================

    const state =
      symbol
        ? this.getState(
            symbol
          )
        : null;


    // =================================
    // DUPLICATE
    // =================================

    const normalizedTick = {
      symbol,
      timestamp,
      price,
      volume,
      bid,
      ask
    };


    const fp =
      this.fingerprint(
        normalizedTick
      );


    if (
      state &&
      state.lastFingerprint === fp &&
      now -
        state.lastAcceptedAt <
        this.config
          .duplicateWindowMs
    ) {
      reasons.push(
        "DUPLICATE_TICK"
      );

      this.stats.duplicate += 1;
    }


    // =================================
    // ANORMAL FİYAT SIÇRAMASI
    // =================================

    let priceJumpPct = null;


    if (
      state &&
      price !== null &&
      price > 0 &&
      state.lastPrice !== null &&
      state.lastPrice > 0
    ) {

      priceJumpPct =
        Math.abs(
          (
            price -
            state.lastPrice
          ) /
          state.lastPrice
        ) * 100;


      if (
        priceJumpPct >
        this.config
          .maxPriceJumpPct
      ) {
        reasons.push(
          "ABNORMAL_PRICE_JUMP"
        );

        this.stats.abnormalJump += 1;
      }
    }


    // =================================
    // ZAMAN GERİ GİDİYOR MU?
    // =================================

    if (
      state &&
      timestamp !== null &&
      state.lastTimestamp > 0 &&
      timestamp <
        state.lastTimestamp
    ) {
      reasons.push(
        "OUT_OF_ORDER_TIMESTAMP"
      );
    }


    // =================================
    // SONUÇ
    // =================================

    const valid =
      reasons.length === 0;


    if (valid) {
      this.stats.accepted += 1;


      if (state) {
        state.lastPrice =
          price;

        state.lastTimestamp =
          timestamp;

        state.lastFingerprint =
          fp;

        state.lastAcceptedAt =
          now;

        state.acceptedCount += 1;


        state.history.push({
          timestamp,
          price,
          volume,
          bid,
          ask,
          spreadPct
        });


        if (
          state.history.length >
          this.config.historyLimit
        ) {
          state.history.splice(
            0,
            state.history.length -
              this.config.historyLimit
          );
        }
      }

    } else {

      this.stats.rejected += 1;


      if (state) {
        state.rejectedCount += 1;
      }
    }


    return {
      valid,

      tradingAllowed:
        valid,

      symbol,

      normalized: {
        symbol,
        price,
        volume,
        timestamp,
        bid,
        ask,
        spreadPct
      },

      diagnostics: {
        reasons,
        warnings,
        priceJumpPct,

        tickAgeMs:
          timestamp
            ? now -
              timestamp
            : null
      },

      checkedAt:
        now
    };
  }


  // ===================================
  // MUM KONTROLÜ
  // ===================================

  validateCandle(
    candle = {}
  ) {
    const open =
      this.number(
        candle.open
      );

    const high =
      this.number(
        candle.high
      );

    const low =
      this.number(
        candle.low
      );

    const close =
      this.number(
        candle.close
      );

    const volume =
      this.number(
        candle.volume
      );

    const timestamp =
      this.number(
        candle.timestamp
      );


    const reasons = [];


    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0
    ) {
      reasons.push(
        "INVALID_OHLC"
      );
    }


    if (
      high !== null &&
      low !== null &&
      high < low
    ) {
      reasons.push(
        "HIGH_BELOW_LOW"
      );
    }


    if (
      open !== null &&
      high !== null &&
      open > high
    ) {
      reasons.push(
        "OPEN_ABOVE_HIGH"
      );
    }


    if (
      open !== null &&
      low !== null &&
      open < low
    ) {
      reasons.push(
        "OPEN_BELOW_LOW"
      );
    }


    if (
      close !== null &&
      high !== null &&
      close > high
    ) {
      reasons.push(
        "CLOSE_ABOVE_HIGH"
      );
    }


    if (
      close !== null &&
      low !== null &&
      close < low
    ) {
      reasons.push(
        "CLOSE_BELOW_LOW"
      );
    }


    if (
      volume === null ||
      volume < 0
    ) {
      reasons.push(
        "INVALID_VOLUME"
      );
    }


    if (
      timestamp === null ||
      timestamp <= 0
    ) {
      reasons.push(
        "INVALID_TIMESTAMP"
      );
    }


    return {
      valid:
        reasons.length === 0,

      reasons
    };
  }


  // ===================================
  // İSTATİSTİKLER
  // ===================================

  snapshot() {
    const checked =
      this.stats.checked || 0;


    const rejectionRate =
      checked > 0
        ? (
            this.stats.rejected /
            checked
          ) * 100
        : 0;


    return {
      ...this.stats,

      rejectionRate,

      trackedSymbols:
        this.symbolState.size,

      checkedAt:
        Date.now()
    };
  }


  // ===================================
  // SEMBOL TEMİZLE
  // ===================================

  clearSymbol(symbol) {
    this.symbolState.delete(
      String(
        symbol || ""
      )
        .trim()
        .toUpperCase()
    );
  }


  // ===================================
  // TÜMÜNÜ TEMİZLE
  // ===================================

  reset() {
    this.symbolState.clear();

    this.stats = {
      checked: 0,
      accepted: 0,
      rejected: 0,

      stale: 0,
      futureTimestamp: 0,
      invalidPrice: 0,
      zeroVolume: 0,
      duplicate: 0,
      abnormalJump: 0,
      invalidSpread: 0
    };
  }
}


export function createDataQuality(
  options = {}
) {
  return new DataQualityEngine(
    options
  );
}
