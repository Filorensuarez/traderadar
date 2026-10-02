// TradeRadar Ultimate
// History + MFE / MAE Engine

export class HistoryEngine {
  constructor(options = {}) {
    this.config = {
      maxRecords:
        options.maxRecords ?? 10000,

      checkpoints:
        options.checkpoints ?? {
          "1m": 60 * 1000,
          "5m": 5 * 60 * 1000,
          "15m": 15 * 60 * 1000,
          "30m": 30 * 60 * 1000,
          "1h": 60 * 60 * 1000,
          "4h": 4 * 60 * 60 * 1000
        }
    };

    this.records = [];
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


  createId(
    symbol,
    timestamp
  ) {
    return (
      String(symbol)
        .toUpperCase() +
      "-" +
      String(timestamp) +
      "-" +
      Math.random()
        .toString(36)
        .slice(2, 8)
    );
  }


  // ===================================
  // SİNYAL KAYDET
  // ===================================

  recordSignal({
    symbol,
    timestamp = Date.now(),

    price = null,

    entry = {},
    stop = {},
    targets = {},

    technicalScore = 0,
    scoreDetails = {},

    technical = {},
    volume = {},
    orderFlow = {},
    btc = {},
    regime = {},
    liquidity = {},
    spreadPct = null,

    stage = "İZLE",
    actionable = false
  } = {}) {

    if (!symbol) {
      return {
        ok: false,
        reason:
          "COİN SEMBOLÜ EKSİK"
      };
    }


    const time =
      Number(timestamp) ||
      Date.now();


    const signalPrice =
      this.number(
        price
      );


    const record = {
      id:
        this.createId(
          symbol,
          time
        ),

      symbol:
        String(symbol)
          .toUpperCase(),

      timestamp:
        time,

      stage,
      actionable,

      price:
        signalPrice,

      entry: {
        low:
          this.number(
            entry.low
          ),

        ideal:
          this.number(
            entry.ideal
          ),

        high:
          this.number(
            entry.high
          ),

        maximum:
          this.number(
            entry.maximum
          )
      },

      stop: {
        price:
          this.number(
            stop.stop ??
            stop.price
          ),

        distancePct:
          this.number(
            stop.stopDistancePct ??
            stop.distancePct
          ),

        reason:
          stop.reason ||
          null
      },

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

      technicalScore:
        Number(
          technicalScore ||
          0
        ),

      scoreDetails,

      indicators: {
        rsi:
          this.number(
            technical.rsi
          ),

        atr:
          this.number(
            technical.atr
          ),

        atrPct:
          this.number(
            technical.atrPct
          ),

        vwap:
          this.number(
            technical.vwap
          ),

        adx:
          this.number(
            technical.adx
          ),

        macd:
          technical.macd ||
          null,

        ema:
          technical.ema ||
          null,

        structure:
          technical.structure
            ?.structure ||
          null,

        compression:
          technical.compression ||
          null,

        breakout:
          technical.breakout ||
          null,

        retest:
          technical.retest ||
          null
      },

      volume: {
        score:
          this.number(
            volume.score
          ),

        relativeVolume:
          this.number(
            volume.relativeVolume
          ),

        volumeZScore:
          this.number(
            volume.volumeZScore
          ),

        acceleration:
          volume.acceleration ||
          null
      },

      orderFlow: {
        score:
          this.number(
            orderFlow.score
          ),

        buyRatio:
          this.number(
            orderFlow.buySell
              ?.s30
              ?.buyRatio
          ),

        cvd:
          orderFlow.cvd ||
          null,

        bookImbalance:
          this.number(
            orderFlow.orderBook
              ?.imbalance
          ),

        tradeAcceleration:
          orderFlow
            .tradeAcceleration ||
          null
      },

      btc: {
        tradingAllowed:
          btc.tradingAllowed,

        riskLevel:
          btc.riskLevel ||
          null,

        riskMultiplier:
          this.number(
            btc.riskMultiplier
          ),

        supportive:
          btc.supportive,

        priceChanges:
          btc.priceChanges ||
          null
      },

      regime: {
        status:
          regime.status ||
          null,

        score:
          this.number(
            regime.score
          ),

        coinMarket:
          regime.coinMarket ||
          null
      },

      spreadPct:
        this.number(
          spreadPct
        ),

      liquidity,

      checkpoints: {},

      excursion: {
        highestPrice:
          signalPrice,

        lowestPrice:
          signalPrice,

        mfePct: 0,
        maePct: 0,

        mfeR: null,
        maeR: null
      },

      outcome: {
        target1Hit: false,
        target2Hit: false,
        target3Hit: false,
        stopHit: false,

        closed: false,
        exitPrice: null,
        netPnL: null,
        resultR: null
      },

      createdAt:
        Date.now(),

      updatedAt:
        Date.now()
    };


    this.records.unshift(
      record
    );


    if (
      this.records.length >
      this.config.maxRecords
    ) {
      this.records.length =
        this.config.maxRecords;
    }


    return {
      ok: true,
      record
    };
  }


  // ===================================
  // KAYIT BUL
  // ===================================

  get(id) {
    return (
      this.records.find(
        record =>
          record.id === id
      ) ||
      null
    );
  }


  // ===================================
  // FİYAT GÜNCELLE
  // ===================================

  updatePrice({
    id,
    price,
    timestamp = Date.now()
  } = {}) {

    const record =
      this.get(id);


    if (!record) {
      return {
        ok: false,
        reason:
          "SİNYAL KAYDI BULUNAMADI"
      };
    }


    const currentPrice =
      this.number(
        price
      );


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


    const basePrice =
      record.entry.ideal ||
      record.price;


    // =================================
    // MFE / MAE
    // =================================

    if (
      record.excursion
        .highestPrice === null ||
      currentPrice >
        record.excursion
          .highestPrice
    ) {
      record.excursion
        .highestPrice =
        currentPrice;
    }


    if (
      record.excursion
        .lowestPrice === null ||
      currentPrice <
        record.excursion
          .lowestPrice
    ) {
      record.excursion
        .lowestPrice =
        currentPrice;
    }


    if (
      basePrice &&
      basePrice > 0
    ) {
      record.excursion.mfePct =
        (
          (
            record.excursion
              .highestPrice -
            basePrice
          ) /
          basePrice
        ) * 100;


      record.excursion.maePct =
        (
          (
            basePrice -
            record.excursion
              .lowestPrice
          ) /
          basePrice
        ) * 100;
    }


    const stopPrice =
      record.stop.price;


    if (
      basePrice &&
      stopPrice &&
      basePrice >
        stopPrice
    ) {
      const initialRisk =
        basePrice -
        stopPrice;


      record.excursion.mfeR =
        (
          record.excursion
            .highestPrice -
          basePrice
        ) /
        initialRisk;


      record.excursion.maeR =
        (
          basePrice -
          record.excursion
            .lowestPrice
        ) /
        initialRisk;
    }


    // =================================
    // HEDEF / STOP
    // =================================

    if (
      record.targets
        .target1 &&
      currentPrice >=
        record.targets
          .target1
    ) {
      record.outcome
        .target1Hit =
        true;
    }


    if (
      record.targets
        .target2 &&
      currentPrice >=
        record.targets
          .target2
    ) {
      record.outcome
        .target2Hit =
        true;
    }


    if (
      record.targets
        .target3 &&
      currentPrice >=
        record.targets
          .target3
    ) {
      record.outcome
        .target3Hit =
        true;
    }


    if (
      record.stop.price &&
      currentPrice <=
        record.stop.price
    ) {
      record.outcome
        .stopHit =
        true;
    }


    // =================================
    // ZAMAN CHECKPOINTLERİ
    // =================================

    const elapsed =
      Number(timestamp) -
      record.timestamp;


    for (
      const [
        label,
        milliseconds
      ] of Object.entries(
        this.config
          .checkpoints
      )
    ) {
      if (
        elapsed >=
          milliseconds &&
        !record.checkpoints[
          label
        ]
      ) {
        record.checkpoints[
          label
        ] = {
          timestamp:
            Number(timestamp),

          price:
            currentPrice,

          changePct:
            record.price &&
            record.price > 0
              ? (
                  (
                    currentPrice -
                    record.price
                  ) /
                  record.price
                ) * 100
              : null
        };
      }
    }


    record.updatedAt =
      Date.now();


    return {
      ok: true,
      record
    };
  }


  // ===================================
  // İŞLEM SONUCU
  // ===================================

  close({
    id,
    exitPrice,
    netPnL = null
  } = {}) {

    const record =
      this.get(id);


    if (!record) {
      return {
        ok: false,
        reason:
          "SİNYAL KAYDI BULUNAMADI"
      };
    }


    const exit =
      this.number(
        exitPrice
      );


    if (
      exit === null ||
      exit <= 0
    ) {
      return {
        ok: false,
        reason:
          "ÇIKIŞ FİYATI GEÇERSİZ"
      };
    }


    const entry =
      record.entry.ideal ||
      record.price;


    const stop =
      record.stop.price;


    let resultR = null;


    if (
      entry &&
      stop &&
      entry > stop
    ) {
      resultR =
        (
          exit -
          entry
        ) /
        (
          entry -
          stop
        );
    }


    record.outcome.closed =
      true;

    record.outcome.exitPrice =
      exit;

    record.outcome.netPnL =
      this.number(
        netPnL
      );

    record.outcome.resultR =
      resultR;

    record.updatedAt =
      Date.now();


    return {
      ok: true,
      record
    };
  }


  // ===================================
  // PUAN GRUBU
  // ===================================

  scoreGroup(score) {
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
  // FİLTRELE
  // ===================================

  list({
    symbol = null,
    closed = null,
    limit = 100
  } = {}) {

    let result =
      [...this.records];


    if (symbol) {
      const key =
        String(symbol)
          .toUpperCase();


      result =
        result.filter(
          record =>
            record.symbol === key
        );
    }


    if (
      typeof closed ===
      "boolean"
    ) {
      result =
        result.filter(
          record =>
            record.outcome
              .closed === closed
        );
    }


    return result.slice(
      0,
      Math.max(
        1,
        Number(limit) || 100
      )
    );
  }


  // ===================================
  // ÖZET
  // ===================================

  snapshot() {
    const closed =
      this.records.filter(
        record =>
          record.outcome
            .closed
      );


    const open =
      this.records.length -
      closed.length;


    return {
      totalSignals:
        this.records.length,

      closed:
        closed.length,

      open,

      trackedSymbols:
        new Set(
          this.records.map(
            record =>
              record.symbol
          )
        ).size,

      checkedAt:
        Date.now()
    };
  }


  // ===================================
  // DIŞA AKTAR
  // ===================================

  exportData() {
    return JSON.parse(
      JSON.stringify(
        this.records
      )
    );
  }


  // ===================================
  // İÇE AKTAR
  // ===================================

  importData(
    records = []
  ) {
    if (
      !Array.isArray(
        records
      )
    ) {
      return {
        ok: false,
        reason:
          "GEÇERSİZ GEÇMİŞ VERİSİ"
      };
    }


    this.records =
      records
        .filter(
          record =>
            record &&
            record.id &&
            record.symbol
        )
        .slice(
          0,
          this.config
            .maxRecords
        );


    return {
      ok: true,

      count:
        this.records.length
    };
  }


  reset() {
    this.records = [];
  }
}


// =====================================
// FACTORY
// =====================================

export function createHistoryEngine(
  options = {}
) {
  return new HistoryEngine(
    options
  );
}
