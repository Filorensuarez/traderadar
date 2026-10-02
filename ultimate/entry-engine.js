// TradeRadar Ultimate
// Entry Engine
//
// Amaç:
// Tek bir "AL" fiyatı vermek yerine
// giriş bölgesi, ideal giriş,
// maksimum kabul edilebilir giriş
// ve sinyal geçerliliğini hesaplamak.

export class EntryEngine {
  constructor(options = {}) {
    this.config = {
      maxSignalAgeMs:
        options.maxSignalAgeMs ??
        5 * 60 * 1000,

      maxChaseAtrMultiple:
        options.maxChaseAtrMultiple ??
        0.50,

      entryAtrBuffer:
        options.entryAtrBuffer ??
        0.20,

      maximumEntryAtrBuffer:
        options.maximumEntryAtrBuffer ??
        0.50,

      requireRetestWhenPossible:
        options.requireRetestWhenPossible ??
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
  // GİRİŞ HESABI
  // ===================================

  calculate({
    price = null,
    technical = {},
    market = {},
    signalTime = Date.now()
  } = {}) {

    const currentPrice =
      this.number(
        price
      );


    if (
      currentPrice === null ||
      currentPrice <= 0
    ) {
      return {
        ready: false,
        valid: false,
        reason:
          "GEÇERSİZ FİYAT"
      };
    }


    const atr =
      this.number(
        technical.atr
      );


    const vwap =
      this.number(
        technical.vwap
      );


    const ema9 =
      this.number(
        technical.ema
          ?.ema9
      );


    const ema20 =
      this.number(
        technical.ema
          ?.ema20
      );


    const support =
      this.number(
        technical.support
      );


    const resistance =
      this.number(
        technical.resistance
      );


    const retestLevel =
      this.number(
        technical.retest
          ?.level
      );


    const spreadPct =
      this.number(
        market.spreadPct,
        0
      );


    // =================================
    // REFERANS GİRİŞ SEVİYELERİ
    // =================================

    const candidates =
      [
        vwap,
        ema9,
        ema20,
        retestLevel,
        support
      ]
        .filter(
          value =>
            value !== null &&
            value > 0 &&
            value <=
              currentPrice *
              1.03
        );


    let idealEntry =
      candidates.length
        ? candidates.reduce(
            (
              total,
              value
            ) =>
              total + value,
            0
          ) /
          candidates.length
        : currentPrice;


    // İdeal giriş mevcut fiyatın
    // çok altında kalıyorsa
    // mevcut yapıya yaklaştır.
    if (
      atr !== null &&
      atr > 0 &&
      currentPrice -
        idealEntry >
        atr
    ) {
      idealEntry =
        currentPrice -
        atr *
        0.50;
    }


    // =================================
    // GİRİŞ BÖLGESİ
    // =================================

    const buffer =
      atr !== null &&
      atr > 0
        ? atr *
          this.config
            .entryAtrBuffer
        : currentPrice *
          0.0025;


    let entryLow =
      idealEntry -
      buffer;


    let entryHigh =
      idealEntry +
      buffer;


    if (
      entryLow <= 0
    ) {
      entryLow =
        idealEntry;
    }


    // =================================
    // MAKSİMUM GİRİŞ
    // =================================

    const maximumBuffer =
      atr !== null &&
      atr > 0
        ? atr *
          this.config
            .maximumEntryAtrBuffer
        : currentPrice *
          0.005;


    let maximumEntry =
      entryHigh +
      maximumBuffer;


    // Direnç çok yakınsa
    // maksimum giriş kontrolü.
    if (
      resistance !== null &&
      resistance > 0 &&
      resistance >
        idealEntry
    ) {
      maximumEntry =
        Math.min(
          maximumEntry,
          resistance +
            maximumBuffer
        );
    }


    // Spread tamponu
    maximumEntry *=
      1 +
      (
        Math.max(
          0,
          spreadPct
        ) /
        100
      );


    // =================================
    // SİNYAL YAŞI
    // =================================

    const ageMs =
      Date.now() -
      Number(
        signalTime ||
        Date.now()
      );


    const expired =
      ageMs >
      this.config
        .maxSignalAgeMs;


    // =================================
    // FİYATI KOVALAMA KONTROLÜ
    // =================================

    const chaseDistance =
      currentPrice -
      maximumEntry;


    const chaseAtr =
      atr !== null &&
      atr > 0
        ? chaseDistance /
          atr
        : null;


    const chasing =
      currentPrice >
      maximumEntry ||
      (
        chaseAtr !== null &&
        chaseAtr >
          this.config
            .maxChaseAtrMultiple
      );


    // =================================
    // RETEST
    // =================================

    const retestDetected =
      technical.retest
        ?.detected === true;


    let waitingRetest =
      false;


    if (
      this.config
        .requireRetestWhenPossible &&
      technical.breakout
        ?.breakout === true &&
      !retestDetected
    ) {
      waitingRetest =
        true;
    }


    // =================================
    // GİRİŞ DURUMU
    // =================================

    let status =
      "ENTRY_AVAILABLE";


    let valid =
      true;


    let reason =
      "GİRİŞ BÖLGESİ UYGUN";


    if (expired) {
      status =
        "SIGNAL_EXPIRED";

      valid =
        false;

      reason =
        "SİNYAL SÜRESİ DOLDU";

    } else if (
      chasing
    ) {
      status =
        "DO_NOT_CHASE";

      valid =
        false;

      reason =
        "FİYATI KOVALAMA";

    } else if (
      waitingRetest
    ) {
      status =
        "WAIT_RETEST";

      valid =
        false;

      reason =
        "RETEST BEKLENİYOR";

    } else if (
      currentPrice <
      entryLow
    ) {
      status =
        "WAIT_ENTRY";

      valid =
        false;

      reason =
        "GİRİŞ BÖLGESİ BEKLENİYOR";
    }


    return {
      ready: true,

      valid,

      status,

      reason,

      currentPrice,

      entry: {
        low:
          entryLow,

        ideal:
          idealEntry,

        high:
          entryHigh,

        maximum:
          maximumEntry
      },

      references: {
        vwap,
        ema9,
        ema20,
        support,
        resistance,
        retestLevel,
        atr,
        spreadPct
      },

      signal: {
        time:
          Number(
            signalTime
          ),

        ageMs,

        expiresInMs:
          Math.max(
            0,
            this.config
              .maxSignalAgeMs -
            ageMs
          ),

        expired
      },

      chase: {
        chasing,
        distance:
          chaseDistance,

        atrMultiple:
          chaseAtr
      },

      retest: {
        required:
          this.config
            .requireRetestWhenPossible,

        detected:
          retestDetected,

        waiting:
          waitingRetest
      },

      calculatedAt:
        Date.now()
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createEntryEngine(
  options = {}
) {
  return new EntryEngine(
    options
  );
        }
