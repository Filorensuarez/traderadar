// TradeRadar Ultimate
// Target + Risk/Reward Engine
//
// Teknik hedefleri hesaplar.
// Komisyon ve slippage dahil NET R/R üretir.

export class TargetRiskEngine {
  constructor(options = {}) {
    this.config = {
      minimumNetRR:
        options.minimumNetRR ?? 1.50,

      preferredNetRR:
        options.preferredNetRR ?? 2.0,

      buyCommissionPct:
        options.buyCommissionPct ?? 0.10,

      sellCommissionPct:
        options.sellCommissionPct ?? 0.10,

      defaultSlippagePct:
        options.defaultSlippagePct ?? 0.10,

      target1R:
        options.target1R ?? 1.0,

      target2R:
        options.target2R ?? 2.0,

      target3R:
        options.target3R ?? 3.0,

      atrTarget1:
        options.atrTarget1 ?? 1.0,

      atrTarget2:
        options.atrTarget2 ?? 2.0,

      atrTarget3:
        options.atrTarget3 ?? 3.0
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
  // SWING HIGH
  // ===================================

  getSwingHigh(
    technical = {}
  ) {
    const value =
      this.number(
        technical.structure
          ?.swings
          ?.lastHigh
          ?.price
      );


    return (
      value !== null &&
      value > 0
    )
      ? value
      : null;
  }


  // ===================================
  // KOMİSYON MALİYETİ
  // ===================================

  commissionCostPct() {
    return (
      this.config
        .buyCommissionPct +
      this.config
        .sellCommissionPct
    );
  }


  // ===================================
  // TOPLAM İŞLEM MALİYETİ
  // ===================================

  totalCostPct(
    slippagePct = null
  ) {
    const slippage =
      this.number(
        slippagePct,
        this.config
          .defaultSlippagePct
      );


    return (
      this.commissionCostPct() +
      Math.max(
        0,
        slippage
      )
    );
  }


  // ===================================
  // NET R/R
  // ===================================

  calculateRR({
    entry,
    stop,
    target,
    slippagePct = null
  } = {}) {

    const e =
      this.number(entry);

    const s =
      this.number(stop);

    const t =
      this.number(target);


    if (
      e === null ||
      s === null ||
      t === null ||
      e <= 0 ||
      s <= 0 ||
      t <= 0 ||
      s >= e ||
      t <= e
    ) {
      return {
        ready: false,
        grossRR: null,
        netRR: null
      };
    }


    const grossRisk =
      e - s;


    const grossReward =
      t - e;


    const grossRR =
      grossReward /
      grossRisk;


    const costPct =
      this.totalCostPct(
        slippagePct
      );


    const costValue =
      e *
      (
        costPct /
        100
      );


    // Komisyon + slippage:
    // riski artırır,
    // net ödülü azaltır.
    const netRisk =
      grossRisk +
      costValue;


    const netReward =
      grossReward -
      costValue;


    const netRR =
      (
        netRisk > 0 &&
        netReward > 0
      )
        ? netReward /
          netRisk
        : 0;


    return {
      ready: true,

      grossRisk,
      grossReward,

      grossRR,

      costPct,
      costValue,

      netRisk,
      netReward,

      netRR
    };
  }


  // ===================================
  // HEDEF HESABI
  // ===================================

  calculate({
    entryPrice = null,
    stopPrice = null,
    technical = {},
    slippagePct = null
  } = {}) {

    const entry =
      this.number(
        entryPrice
      );


    const stop =
      this.number(
        stopPrice
      );


    if (
      entry === null ||
      stop === null ||
      entry <= 0 ||
      stop <= 0 ||
      stop >= entry
    ) {
      return {
        ready: false,

        valid: false,

        reason:
          "GİRİŞ/STOP VERİSİ GEÇERSİZ"
      };
    }


    const risk =
      entry - stop;


    const riskPct =
      (
        risk /
        entry
      ) * 100;


    const atr =
      this.number(
        technical.atr
      );


    const resistance =
      this.number(
        technical.resistance
      );


    const swingHigh =
      this.getSwingHigh(
        technical
      );


    // =================================
    // R TABANLI HEDEFLER
    // =================================

    const rTarget1 =
      entry +
      risk *
      this.config
        .target1R;


    const rTarget2 =
      entry +
      risk *
      this.config
        .target2R;


    const rTarget3 =
      entry +
      risk *
      this.config
        .target3R;


    // =================================
    // ATR TABANLI HEDEFLER
    // =================================

    const atrTarget1 =
      atr !== null &&
      atr > 0
        ? entry +
          atr *
          this.config
            .atrTarget1
        : null;


    const atrTarget2 =
      atr !== null &&
      atr > 0
        ? entry +
          atr *
          this.config
            .atrTarget2
        : null;


    const atrTarget3 =
      atr !== null &&
      atr > 0
        ? entry +
          atr *
          this.config
            .atrTarget3
        : null;


    // =================================
    // HEDEF 1
    // =================================

    const target1Candidates =
      [
        rTarget1,
        atrTarget1,
        resistance,
        swingHigh
      ]
        .filter(
          value =>
            value !== null &&
            value >
              entry
        );


    let target1 =
      target1Candidates.length
        ? Math.min(
            ...target1Candidates
          )
        : rTarget1;


    // Çok yakın direnç hedefi,
    // maliyet sonrası anlamsızsa
    // en az 1R hedefe taşı.
    if (
      target1 <=
      entry +
      risk * 0.50
    ) {
      target1 =
        rTarget1;
    }


    // =================================
    // HEDEF 2
    // =================================

    const target2Candidates =
      [
        rTarget2,
        atrTarget2,
        swingHigh
      ]
        .filter(
          value =>
            value !== null &&
            value >
              target1
        );


    const target2 =
      target2Candidates.length
        ? Math.min(
            ...target2Candidates
          )
        : rTarget2;


    // =================================
    // HEDEF 3
    // =================================

    const target3Candidates =
      [
        rTarget3,
        atrTarget3
      ]
        .filter(
          value =>
            value !== null &&
            value >
              target2
        );


    const target3 =
      target3Candidates.length
        ? Math.min(
            ...target3Candidates
          )
        : rTarget3;


    // =================================
    // R/R HESAPLARI
    // =================================

    const rr1 =
      this.calculateRR({
        entry,
        stop,
        target:
          target1,
        slippagePct
      });


    const rr2 =
      this.calculateRR({
        entry,
        stop,
        target:
          target2,
        slippagePct
      });


    const rr3 =
      this.calculateRR({
        entry,
        stop,
        target:
          target3,
        slippagePct
      });


    // Ana R/R için Hedef 2 kullanılır.
    // Hedef 1 genellikle kısmi kâr,
    // Hedef 3 geniş hedef olarak düşünülür.
    const netRR =
      rr2.netRR;


    const grossRR =
      rr2.grossRR;


    // =================================
    // İŞLEM UYGUNLUĞU
    // =================================

    const valid =
      Number.isFinite(
        netRR
      ) &&
      netRR >=
        this.config
          .minimumNetRR;


    let status =
      "RR_ACCEPTABLE";


    let reason =
      "NET RİSK/GETİRİ UYGUN";


    if (
      !valid
    ) {
      status =
        "RR_REJECTED";

      reason =
        "RİSK/GETİRİ YETERSİZ";

    } else if (
      netRR >=
      this.config
        .preferredNetRR
    ) {
      status =
        "RR_STRONG";

      reason =
        "NET RİSK/GETİRİ GÜÇLÜ";
    }


    return {
      ready: true,

      valid,

      status,

      reason,

      entry,

      stop,

      risk,

      riskPct,

      targets: {
        target1,
        target2,
        target3
      },

      riskReward: {
        grossRR,
        netRR,

        target1:
          rr1,

        target2:
          rr2,

        target3:
          rr3
      },

      costs: {
        buyCommissionPct:
          this.config
            .buyCommissionPct,

        sellCommissionPct:
          this.config
            .sellCommissionPct,

        commissionPct:
          this.commissionCostPct(),

        slippagePct:
          this.number(
            slippagePct,
            this.config
              .defaultSlippagePct
          ),

        totalCostPct:
          this.totalCostPct(
            slippagePct
          )
      },

      references: {
        atr,
        resistance,
        swingHigh,

        rTarget1,
        rTarget2,
        rTarget3,

        atrTarget1,
        atrTarget2,
        atrTarget3
      },

      warning:
        valid
          ? null
          : "YÜKSEK TEKNİK PUAN OLSA BİLE İŞLEMİ REDDET",

      calculatedAt:
        Date.now()
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createTargetRiskEngine(
  options = {}
) {
  return new TargetRiskEngine(
    options
  );
}
