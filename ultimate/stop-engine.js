// TradeRadar Ultimate
// Stop Engine
//
// Sabit yüzde stop kullanmaz.
// ATR + destek + swing low +
// piyasa yapısı + volatilite kullanır.

export class StopEngine {
  constructor(options = {}) {
    this.config = {
      atrBufferMultiple:
        options.atrBufferMultiple ??
        0.50,

      minimumAtrMultiple:
        options.minimumAtrMultiple ??
        1.0,

      maximumStopPct:
        options.maximumStopPct ??
        5.0,

      minimumStopPct:
        options.minimumStopPct ??
        0.30,

      supportBufferAtr:
        options.supportBufferAtr ??
        0.25,

      swingBufferAtr:
        options.swingBufferAtr ??
        0.25,

      highVolatilityMultiplier:
        options.highVolatilityMultiplier ??
        1.25,

      lowVolatilityMultiplier:
        options.lowVolatilityMultiplier ??
        0.85,

      neverWidenAfterEntry:
        options.neverWidenAfterEntry ??
        true
    };
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
  // SWING LOW BUL
  // ===================================

  getSwingLow(
    technical = {}
  ) {
    const direct =
      this.number(
        technical.structure
          ?.swings
          ?.lastLow
          ?.price
      );


    if (
      direct !== null &&
      direct > 0
    ) {
      return direct;
    }


    return null;
  }


  // ===================================
  // STOP HESABI
  // ===================================

  calculate({
    entryPrice = null,
    technical = {},
    regime = {},
    previousStop = null
  } = {}) {

    const entry =
      this.number(
        entryPrice
      );


    if (
      entry === null ||
      entry <= 0
    ) {
      return {
        ready: false,
        valid: false,
        reason:
          "GEÇERSİZ GİRİŞ FİYATI"
      };
    }


    const atr =
      this.number(
        technical.atr
      );


    const atrPct =
      this.number(
        technical.atrPct
      );


    const support =
      this.number(
        technical.support
      );


    const swingLow =
      this.getSwingLow(
        technical
      );


    const structure =
      String(
        technical.structure
          ?.structure ||
        "UNDEFINED"
      );


    const volatility =
      String(
        regime.coinMarket
          ?.volatility ||
        regime.volatility ||
        "NORMAL_VOLATILITY"
      );


    // =================================
    // VOLATİLİTE KATSAYISI
    // =================================

    let volatilityMultiplier =
      1;


    if (
      volatility ===
      "HIGH_VOLATILITY"
    ) {
      volatilityMultiplier =
        this.config
          .highVolatilityMultiplier;
    }


    if (
      volatility ===
      "LOW_VOLATILITY"
    ) {
      volatilityMultiplier =
        this.config
          .lowVolatilityMultiplier;
    }


    // =================================
    // ATR STOP
    // =================================

    let atrStop = null;


    if (
      atr !== null &&
      atr > 0
    ) {
      const distance =
        atr *
        this.config
          .minimumAtrMultiple *
        volatilityMultiplier;


      atrStop =
        entry -
        distance;
    }


    // =================================
    // DESTEK STOP
    // =================================

    let supportStop = null;


    if (
      support !== null &&
      support > 0 &&
      support < entry
    ) {
      const buffer =
        atr !== null &&
        atr > 0
          ? atr *
            this.config
              .supportBufferAtr
          : entry *
            0.0025;


      supportStop =
        support -
        buffer;
    }


    // =================================
    // SWING LOW STOP
    // =================================

    let swingStop = null;


    if (
      swingLow !== null &&
      swingLow > 0 &&
      swingLow < entry
    ) {
      const buffer =
        atr !== null &&
        atr > 0
          ? atr *
            this.config
              .swingBufferAtr
          : entry *
            0.0025;


      swingStop =
        swingLow -
        buffer;
    }


    // =================================
    // ADAY STOPLAR
    // =================================

    const candidates =
      [];


    if (
      atrStop !== null &&
      atrStop > 0 &&
      atrStop < entry
    ) {
      candidates.push({
        type:
          "ATR",

        price:
          atrStop
      });
    }


    if (
      supportStop !== null &&
      supportStop > 0 &&
      supportStop < entry
    ) {
      candidates.push({
        type:
          "SUPPORT",

        price:
          supportStop
      });
    }


    if (
      swingStop !== null &&
      swingStop > 0 &&
      swingStop < entry
    ) {
      candidates.push({
        type:
          "SWING_LOW",

        price:
          swingStop
      });
    }


    // =================================
    // STOP SEÇİMİ
    // =================================

    let stopPrice;


    let reason;


    if (
      candidates.length
    ) {
      // En geniş ama hâlâ teknik
      // olarak anlamlı stop.
      const selected =
        candidates.reduce(
          (
            lowest,
            item
          ) =>
            item.price <
            lowest.price
              ? item
              : lowest
        );


      stopPrice =
        selected.price;


      if (
        selected.type ===
        "SUPPORT"
      ) {
        reason =
          "Son destek + ATR tamponu";

      } else if (
        selected.type ===
        "SWING_LOW"
      ) {
        reason =
          "Swing Low + ATR tamponu";

      } else {
        reason =
          "ATR tabanlı volatilite stopu";
      }

    } else {

      // Teknik veri yetersizse
      // güvenli fallback.
      const fallbackDistance =
        atr !== null &&
        atr > 0
          ? atr
          : entry *
            0.02;


      stopPrice =
        entry -
        fallbackDistance;


      reason =
        "Teknik veri sınırlı – ATR/fiyat tamponu";
    }


    // =================================
    // STOP MESAFESİ
    // =================================

    let stopDistance =
      entry -
      stopPrice;


    let stopDistancePct =
      (
        stopDistance /
        entry
      ) * 100;


    // =================================
    // MİNİMUM STOP MESAFESİ
    // =================================

    if (
      stopDistancePct <
      this.config
        .minimumStopPct
    ) {
      stopDistancePct =
        this.config
          .minimumStopPct;


      stopDistance =
        entry *
        (
          stopDistancePct /
          100
        );


      stopPrice =
        entry -
        stopDistance;


      reason +=
        " + minimum stop tamponu";
    }


    // =================================
    // ÇOK GENİŞ STOP
    // =================================

    const tooWide =
      stopDistancePct >
      this.config
        .maximumStopPct;


    // =================================
    // PİYASA YAPISI RİSKİ
    // =================================

    let structureRisk =
      false;


    if (
      structure ===
        "DOWNTREND" ||
      structure ===
        "FALLING_TOP"
    ) {
      structureRisk =
        true;
    }


    // =================================
    // STOPU AŞAĞI GENİŞLETME KORUMASI
    // =================================

    const oldStop =
      this.number(
        previousStop
      );


    let widened =
      false;


    if (
      this.config
        .neverWidenAfterEntry &&
      oldStop !== null &&
      oldStop > 0 &&
      stopPrice <
        oldStop
    ) {
      stopPrice =
        oldStop;


      stopDistance =
        entry -
        stopPrice;


      stopDistancePct =
        (
          stopDistance /
          entry
        ) * 100;


      widened =
        true;


      reason =
        "Mevcut stop korunuyor – risk genişletilmedi";
    }


    // =================================
    // SONUÇ
    // =================================

    const valid =
      stopPrice > 0 &&
      stopPrice < entry &&
      !tooWide;


    let status =
      "STOP_VALID";


    if (tooWide) {
      status =
        "STOP_TOO_WIDE";

    } else if (
      structureRisk
    ) {
      status =
        "STRUCTURE_RISK";
    }


    return {
      ready: true,

      valid,

      status,

      stop:
        stopPrice,

      stopDistance,

      stopDistancePct,

      reason,

      references: {
        atr,
        atrPct,

        support,
        swingLow,

        structure,
        volatility,

        atrStop,
        supportStop,
        swingStop
      },

      protection: {
        previousStop:
          oldStop,

        wideningPrevented:
          widened,

        neverWidenAfterEntry:
          this.config
            .neverWidenAfterEntry
      },

      warning:
        tooWide
          ? "STOP MESAFESİ ÇOK GENİŞ – İŞLEMİ REDDET"
          : structureRisk
            ? "PİYASA YAPISI ZAYIF – RİSK YÜKSEK"
            : null,

      calculatedAt:
        Date.now()
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createStopEngine(
  options = {}
) {
  return new StopEngine(
    options
  );
}
