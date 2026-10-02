// TradeRadar Ultimate
// Position Management + Trailing Stop Engine

export class PositionManager {
  constructor(options = {}) {
    this.config = {
      trailingEnabled:
        options.trailingEnabled ??
        true,

      trailingAtrMultiple:
        options.trailingAtrMultiple ??
        1.5,

      activateTrailingAfterR:
        options.activateTrailingAfterR ??
        1.0,

      breakEvenAfterR:
        options.breakEvenAfterR ??
        1.0,

      protectProfitAfterR:
        options.protectProfitAfterR ??
        1.5,

      weakOrderFlowScore:
        options.weakOrderFlowScore ??
        35,

      weakVolumeScore:
        options.weakVolumeScore ??
        35,

      weakMomentumRsi:
        options.weakMomentumRsi ??
        45,

      neverLowerStop:
        true
    };

    this.positions =
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


  // ===================================
  // POZİSYON EKLE
  // ===================================

  open({
    id,
    symbol,
    entry,
    stop,
    targets = {},
    quantity = 0
  } = {}) {

    const entryPrice =
      this.number(entry);

    const stopPrice =
      this.number(stop);


    if (
      !id ||
      !symbol ||
      entryPrice === null ||
      stopPrice === null ||
      entryPrice <= 0 ||
      stopPrice <= 0 ||
      stopPrice >= entryPrice
    ) {
      return {
        ok: false,
        reason:
          "POZİSYON VERİSİ GEÇERSİZ"
      };
    }


    if (
      this.positions.has(id)
    ) {
      return {
        ok: false,
        reason:
          "POZİSYON ZATEN KAYITLI"
      };
    }


    const initialRisk =
      entryPrice -
      stopPrice;


    const position = {
      id,

      symbol:
        String(symbol)
          .toUpperCase(),

      entry:
        entryPrice,

      initialStop:
        stopPrice,

      currentStop:
        stopPrice,

      initialRisk,

      quantity:
        Number(quantity) || 0,

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

      highestPrice:
        entryPrice,

      lowestPrice:
        entryPrice,

      currentPrice:
        entryPrice,

      currentR: 0,

      mfe: 0,
      mae: 0,

      target1Hit: false,
      target2Hit: false,
      target3Hit: false,

      breakEvenActivated:
        false,

      trailingActivated:
        false,

      status:
        "POZİSYON TAKİBİ",

      warnings: [],

      openedAt:
        Date.now(),

      updatedAt:
        Date.now()
    };


    this.positions.set(
      id,
      position
    );


    return {
      ok: true,
      position
    };
  }


  // ===================================
  // R HESABI
  // ===================================

  calculateR(
    position,
    price
  ) {
    if (
      !position ||
      position.initialRisk <= 0
    ) {
      return 0;
    }


    return (
      price -
      position.entry
    ) /
    position.initialRisk;
  }


  // ===================================
  // MFE / MAE
  // ===================================

  updateExcursions(
    position
  ) {
    const favorable =
      position.highestPrice -
      position.entry;


    const adverse =
      position.entry -
      position.lowestPrice;


    position.mfe =
      position.initialRisk > 0
        ? favorable /
          position.initialRisk
        : 0;


    position.mae =
      position.initialRisk > 0
        ? adverse /
          position.initialRisk
        : 0;
  }


  // ===================================
  // TRAILING STOP
  // ===================================

  calculateTrailingStop({
    position,
    price,
    technical = {}
  } = {}) {

    if (
      !this.config
        .trailingEnabled
    ) {
      return {
        active: false,
        stop:
          position.currentStop
      };
    }


    const currentR =
      this.calculateR(
        position,
        price
      );


    if (
      currentR <
      this.config
        .activateTrailingAfterR
    ) {
      return {
        active: false,
        stop:
          position.currentStop
      };
    }


    const atr =
      this.number(
        technical.atr
      );


    const swingLow =
      this.number(
        technical.structure
          ?.swings
          ?.lastLow
          ?.price
      );


    const support =
      this.number(
        technical.support
      );


    const candidates = [];


    if (
      atr !== null &&
      atr > 0
    ) {
      candidates.push(
        price -
        atr *
        this.config
          .trailingAtrMultiple
      );
    }


    if (
      swingLow !== null &&
      swingLow > 0 &&
      swingLow < price
    ) {
      candidates.push(
        swingLow
      );
    }


    if (
      support !== null &&
      support > 0 &&
      support < price
    ) {
      candidates.push(
        support
      );
    }


    if (!candidates.length) {
      return {
        active: false,
        stop:
          position.currentStop
      };
    }


    // Long pozisyonda teknik
    // adayların en yükseği
    // kârı daha iyi korur.
    let proposedStop =
      Math.max(
        ...candidates
      );


    // Stop asla aşağı inmez.
    proposedStop =
      Math.max(
        proposedStop,
        position.currentStop
      );


    // Stop mevcut fiyatın
    // üstüne taşınamaz.
    proposedStop =
      Math.min(
        proposedStop,
        price *
        0.999
      );


    return {
      active: true,

      stop:
        proposedStop,

      previousStop:
        position.currentStop,

      raised:
        proposedStop >
        position.currentStop
    };
  }


  // ===================================
  // POZİSYON GÜNCELLE
  // ===================================

  update({
    id,
    price,
    technical = {},
    volume = {},
    orderFlow = {},
    regime = {}
  } = {}) {

    const position =
      this.positions.get(id);


    if (!position) {
      return {
        ok: false,
        reason:
          "POZİSYON BULUNAMADI"
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


    position.currentR =
      this.calculateR(
        position,
        currentPrice
      );


    this.updateExcursions(
      position
    );


    const warnings = [];


    // =================================
    // STOP
    // =================================

    if (
      currentPrice <=
      position.currentStop
    ) {
      position.status =
        "STOP";

      position.updatedAt =
        Date.now();


      return {
        ok: true,
        action:
          "EXIT",

        reason:
          "STOP",

        position
      };
    }


    // =================================
    // HEDEFLER
    // =================================

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


    // =================================
    // BREAK EVEN
    // =================================

    if (
      position.currentR >=
        this.config
          .breakEvenAfterR &&
      position.currentStop <
        position.entry
    ) {
      position.currentStop =
        position.entry;

      position.breakEvenActivated =
        true;
    }


    // =================================
    // TRAILING STOP
    // =================================

    const trailing =
      this.calculateTrailingStop({
        position,

        price:
          currentPrice,

        technical
      });


    if (
      trailing.active &&
      trailing.stop >
        position.currentStop
    ) {
      position.currentStop =
        trailing.stop;

      position.trailingActivated =
        true;
    }


    // =================================
    // MOMENTUM BOZULMASI
    // =================================

    const rsi =
      this.number(
        technical.rsi
      );


    const histogram =
      this.number(
        technical.macd
          ?.histogram
      );


    if (
      rsi !== null &&
      rsi <
        this.config
          .weakMomentumRsi &&
      histogram !== null &&
      histogram < 0
    ) {
      warnings.push(
        "MOMENTUM_ZAYIFLIYOR"
      );
    }


    // =================================
    // HACİM BOZULMASI
    // =================================

    if (
      Number(
        volume.score || 0
      ) <
      this.config
        .weakVolumeScore
    ) {
      warnings.push(
        "HACİM_DESTEĞİ_ZAYIFLIYOR"
      );
    }


    // =================================
    // SATICI BASKISI
    // =================================

    if (
      Number(
        orderFlow.score || 0
      ) <
      this.config
        .weakOrderFlowScore
    ) {
      warnings.push(
        "SATICI_BASKISI_ARTIYOR"
      );
    }


    if (
      orderFlow
        .sellerPressure
        ?.declining === false &&
      orderFlow
        .buySell
        ?.s30
        ?.buyRatio < 45
    ) {
      warnings.push(
        "ALICI_BASKISI_KAYBOLUYOR"
      );
    }


    // =================================
    // BTC / PİYASA RİSKİ
    // =================================

    if (
      regime.tradingAllowed ===
      false
    ) {
      warnings.push(
        "BTC_RİSKİ"
      );
    }


    if (
      regime.status ===
        "UNFAVORABLE" ||
      regime.status ===
        "TRADING_STOPPED"
    ) {
      warnings.push(
        "PİYASA_REJİMİ_BOZULDU"
      );
    }


    position.warnings =
      warnings;


    // =================================
    // KÂR KORUMA
    // =================================

    if (
      position.currentR >=
        this.config
          .protectProfitAfterR ||
      position.target1Hit ||
      position.trailingActivated
    ) {
      position.status =
        "KÂR KORUMA";

    } else {
      position.status =
        "POZİSYON TAKİBİ";
    }


    // =================================
    // ÇIKIŞ UYARISI
    // =================================

    let action =
      "HOLD";


    let reason =
      position.status;


    const severeWarnings =
      warnings.filter(
        warning =>
          [
            "BTC_RİSKİ",
            "PİYASA_REJİMİ_BOZULDU",
            "SATICI_BASKISI_ARTIYOR"
          ].includes(
            warning
          )
      );


    if (
      severeWarnings.length >= 2
    ) {
      action =
        "REDUCE_OR_EXIT";

      reason =
        "BİRDEN FAZLA RİSK FAKTÖRÜ";
    }


    position.updatedAt =
      Date.now();


    return {
      ok: true,

      action,

      reason,

      position,

      trailing,

      warnings,

      updatedAt:
        Date.now()
    };
  }


  // ===================================
  // POZİSYON KAPAT
  // ===================================

  close(
    id,
    exitPrice = null
  ) {
    const position =
      this.positions.get(id);


    if (!position) {
      return {
        ok: false,
        reason:
          "POZİSYON BULUNAMADI"
      };
    }


    const exit =
      this.number(
        exitPrice,
        position.currentPrice
      );


    const grossPnL =
      (
        exit -
        position.entry
      ) *
      position.quantity;


    const result = {
      ...position,

      exitPrice:
        exit,

      grossPnL,

      closedAt:
        Date.now()
    };


    this.positions.delete(
      id
    );


    return {
      ok: true,
      position:
        result
    };
  }


  // ===================================
  // TEK POZİSYON
  // ===================================

  get(id) {
    return (
      this.positions.get(id) ||
      null
    );
  }


  // ===================================
  // TÜM POZİSYONLAR
  // ===================================

  snapshot() {
    return {
      count:
        this.positions.size,

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
  // RESET
  // ===================================

  reset() {
    this.positions.clear();
  }
}


// =====================================
// FACTORY
// =====================================

export function createPositionManager(
  options = {}
) {
  return new PositionManager(
    options
  );
}
