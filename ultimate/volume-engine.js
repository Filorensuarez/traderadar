// TradeRadar Ultimate
// Volume Engine

export class VolumeEngine {
  constructor(options = {}) {
    this.config = {
      baselinePeriods:
        options.baselinePeriods ?? 20,

      strongRvol:
        options.strongRvol ?? 2.0,

      minimumRvol:
        options.minimumRvol ?? 1.5,

      strongAcceleration:
        options.strongAcceleration ?? 1.4,

      zScoreStrong:
        options.zScoreStrong ?? 2.0,

      zScoreExtreme:
        options.zScoreExtreme ?? 3.5
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


  average(values = []) {
    const valid =
      values
        .map(Number)
        .filter(
          Number.isFinite
        );

    if (!valid.length) {
      return null;
    }

    return (
      valid.reduce(
        (total, value) =>
          total + value,
        0
      ) /
      valid.length
    );
  }


  standardDeviation(
    values = []
  ) {
    const valid =
      values
        .map(Number)
        .filter(
          Number.isFinite
        );

    if (
      valid.length < 2
    ) {
      return null;
    }

    const avg =
      this.average(valid);

    const variance =
      valid.reduce(
        (total, value) =>
          total +
          Math.pow(
            value - avg,
            2
          ),
        0
      ) /
      valid.length;

    return Math.sqrt(
      variance
    );
  }


  // ===================================
  // RELATIVE VOLUME
  // ===================================

  relativeVolume(
    currentVolume,
    historicalVolumes = []
  ) {
    const current =
      this.number(
        currentVolume
      );

    const baseline =
      historicalVolumes
        .map(Number)
        .filter(
          value =>
            Number.isFinite(value) &&
            value >= 0
        )
        .slice(
          -this.config
            .baselinePeriods
        );


    if (
      current === null ||
      current < 0 ||
      !baseline.length
    ) {
      return null;
    }


    const average =
      this.average(
        baseline
      );


    if (
      average === null ||
      average <= 0
    ) {
      return null;
    }


    return (
      current /
      average
    );
  }


  // ===================================
  // VOLUME Z-SCORE
  // ===================================

  zScore(
    currentVolume,
    historicalVolumes = []
  ) {
    const current =
      this.number(
        currentVolume
      );

    const baseline =
      historicalVolumes
        .map(Number)
        .filter(
          value =>
            Number.isFinite(value) &&
            value >= 0
        )
        .slice(
          -this.config
            .baselinePeriods
        );


    if (
      current === null ||
      baseline.length < 5
    ) {
      return null;
    }


    const average =
      this.average(
        baseline
      );


    const std =
      this.standardDeviation(
        baseline
      );


    if (
      average === null ||
      std === null ||
      std === 0
    ) {
      return 0;
    }


    return (
      current -
      average
    ) / std;
  }


  // ===================================
  // HACİM İVMESİ
  // ===================================

  acceleration(
    recentVolume,
    previousVolume
  ) {
    const recent =
      this.number(
        recentVolume
      );

    const previous =
      this.number(
        previousVolume
      );


    if (
      recent === null ||
      previous === null ||
      previous <= 0
    ) {
      return null;
    }


    return (
      recent /
      previous
    );
  }


  // ===================================
  // NORMALİZE HACİM İVMESİ
  // ===================================

  normalizedAcceleration(
    shortVolume,
    longVolume,
    shortSeconds,
    longSeconds
  ) {
    const short =
      this.number(
        shortVolume
      );

    const long =
      this.number(
        longVolume
      );


    if (
      short === null ||
      long === null ||
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
  // FİYAT / HACİM UYUMU
  // ===================================

  priceVolumeRelation({
    priceChangePct = 0,
    relativeVolume = null,
    volumeAcceleration = null
  } = {}) {

    const price =
      Number(
        priceChangePct
      ) || 0;


    const rvol =
      this.number(
        relativeVolume
      );


    const acceleration =
      this.number(
        volumeAcceleration
      );


    let relation =
      "NEUTRAL";


    let score = 50;


    if (
      price > 0 &&
      rvol !== null &&
      rvol >=
        this.config
          .minimumRvol &&
      acceleration !== null &&
      acceleration >= 1
    ) {
      relation =
        "POSITIVE_CONFIRMATION";

      score = 85;
    }


    if (
      price > 0 &&
      (
        (
          rvol !== null &&
          rvol < 1
        ) ||
        (
          acceleration !== null &&
          acceleration < 0.8
        )
      )
    ) {
      relation =
        "BEARISH_DIVERGENCE";

      score = 25;
    }


    if (
      price < 0 &&
      rvol !== null &&
      rvol >=
        this.config
          .strongRvol
    ) {
      relation =
        "SELLING_PRESSURE";

      score = 15;
    }


    if (
      Math.abs(price) <
        0.5 &&
      rvol !== null &&
      rvol >=
        this.config
          .strongRvol &&
      acceleration !== null &&
      acceleration >=
        this.config
          .strongAcceleration
    ) {
      relation =
        "ACCUMULATION_POSSIBLE";

      score = 90;
    }


    return {
      relation,
      score
    };
  }


  // ===================================
  // ANA ANALİZ
  // ===================================

  analyze({
    windows = {},
    historicalVolumes = []
  } = {}) {

    const s10 =
      windows.s10 || {};

    const s30 =
      windows.s30 || {};

    const s60 =
      windows.s60 || {};

    const s120 =
      windows.s120 || {};

    const m5 =
      windows.m5 || {};


    const volume10 =
      Number(
        s10.totalVolume || 0
      );


    const volume30 =
      Number(
        s30.totalVolume || 0
      );


    const volume60 =
      Number(
        s60.totalVolume || 0
      );


    const volume120 =
      Number(
        s120.totalVolume || 0
      );


    const volume5m =
      Number(
        m5.totalVolume || 0
      );


    const rvol =
      this.relativeVolume(
        volume60,
        historicalVolumes
      );


    const zScore =
      this.zScore(
        volume60,
        historicalVolumes
      );


    const acceleration10 =
      this.normalizedAcceleration(
        volume10,
        volume60,
        10,
        60
      );


    const acceleration30 =
      this.normalizedAcceleration(
        volume30,
        volume120,
        30,
        120
      );


    const acceleration60 =
      this.normalizedAcceleration(
        volume60,
        volume5m,
        60,
        300
      );


    const priceChange =
      Number(
        s60.priceChangePct ||
        0
      );


    const relation =
      this.priceVolumeRelation({
        priceChangePct:
          priceChange,

        relativeVolume:
          rvol,

        volumeAcceleration:
          acceleration30
      });


    // =================================
    // HACİM PUANI
    // =================================

    let score = 0;


    if (
      rvol !== null
    ) {
      if (
        rvol >=
        this.config
          .strongRvol
      ) {
        score += 35;

      } else if (
        rvol >=
        this.config
          .minimumRvol
      ) {
        score += 25;

      } else if (
        rvol >= 1
      ) {
        score += 15;
      }
    }


    if (
      acceleration10 !==
        null &&
      acceleration10 >=
        this.config
          .strongAcceleration
    ) {
      score += 20;
    }


    if (
      acceleration30 !==
        null &&
      acceleration30 >=
        this.config
          .strongAcceleration
    ) {
      score += 20;
    }


    if (
      acceleration60 !==
        null &&
      acceleration60 >=
        1.2
    ) {
      score += 10;
    }


    if (
      zScore !== null
    ) {
      if (
        zScore >=
        this.config
          .zScoreExtreme
      ) {
        score += 15;

      } else if (
        zScore >=
        this.config
          .zScoreStrong
      ) {
        score += 10;
      }
    }


    if (
      relation.relation ===
      "BEARISH_DIVERGENCE"
    ) {
      score -= 25;
    }


    if (
      relation.relation ===
      "SELLING_PRESSURE"
    ) {
      score -= 35;
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
      "NORMAL";


    if (
      score >= 80
    ) {
      status =
        "STRONG_VOLUME";

    } else if (
      score >= 60
    ) {
      status =
        "VOLUME_BUILDING";

    } else if (
      score >= 40
    ) {
      status =
        "WATCH";

    } else if (
      score <= 20
    ) {
      status =
        "WEAK_VOLUME";
    }


    return {
      ready: true,

      score,
      status,

      relativeVolume:
        rvol,

      volumeZScore:
        zScore,

      acceleration: {
        s10:
          acceleration10,

        s30:
          acceleration30,

        s60:
          acceleration60
      },

      volumes: {
        s10:
          volume10,

        s30:
          volume30,

        s60:
          volume60,

        s120:
          volume120,

        m5:
          volume5m
      },

      priceVolume:
        relation,

      strongRelativeVolume:
        rvol !== null &&
        rvol >=
          this.config
            .strongRvol,

      strongAcceleration:
        [
          acceleration10,
          acceleration30,
          acceleration60
        ].some(
          value =>
            value !== null &&
            value >=
              this.config
                .strongAcceleration
        ),

      analyzedAt:
        Date.now()
    };
  }
}


// =====================================
// FACTORY
// =====================================

export function createVolumeEngine(
  options = {}
) {
  return new VolumeEngine(
    options
  );
  }
