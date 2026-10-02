// TradeRadar Ultimate
// Technical Analysis Engine

export class TechnicalAnalysisEngine {
  constructor(options = {}) {
    this.config = {
      emaPeriods:
        options.emaPeriods ??
        [9, 20, 50, 200],

      rsiPeriod:
        options.rsiPeriod ?? 14,

      macdFast:
        options.macdFast ?? 12,

      macdSlow:
        options.macdSlow ?? 26,

      macdSignal:
        options.macdSignal ?? 9,

      bollingerPeriod:
        options.bollingerPeriod ?? 20,

      bollingerStdDev:
        options.bollingerStdDev ?? 2,

      atrPeriod:
        options.atrPeriod ?? 14,

      adxPeriod:
        options.adxPeriod ?? 14,

      swingLookback:
        options.swingLookback ?? 5,

      supportResistanceLookback:
        options.supportResistanceLookback ??
        50
    };
  }


  // ===================================
  // YARDIMCILAR
  // ===================================

  number(value) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : null;
  }


  closes(candles) {
    return candles
      .map(
        candle =>
          this.number(
            candle.close
          )
      )
      .filter(
        value =>
          value !== null &&
          value > 0
      );
  }


  average(values) {
    const valid =
      values.filter(
        value =>
          Number.isFinite(
            Number(value)
          )
      );

    if (!valid.length) {
      return null;
    }

    return (
      valid.reduce(
        (total, value) =>
          total +
          Number(value),
        0
      ) /
      valid.length
    );
  }


  standardDeviation(
    values
  ) {
    const avg =
      this.average(values);

    if (avg === null) {
      return null;
    }

    const variance =
      values.reduce(
        (total, value) =>
          total +
          Math.pow(
            Number(value) -
            avg,
            2
          ),
        0
      ) /
      values.length;

    return Math.sqrt(
      variance
    );
  }


  // ===================================
  // SMA
  // ===================================

  sma(
    values,
    period
  ) {
    if (
      !Array.isArray(values) ||
      values.length < period
    ) {
      return null;
    }

    return this.average(
      values.slice(
        -period
      )
    );
  }


  // ===================================
  // EMA SERIES
  // ===================================

  emaSeries(
    values,
    period
  ) {
    if (
      !Array.isArray(values) ||
      values.length < period
    ) {
      return [];
    }

    const multiplier =
      2 /
      (period + 1);

    const seed =
      this.average(
        values.slice(
          0,
          period
        )
      );

    if (seed === null) {
      return [];
    }

    const result = [];

    for (
      let i = 0;
      i < period - 1;
      i++
    ) {
      result.push(null);
    }

    result.push(seed);

    let previous =
      seed;

    for (
      let i = period;
      i < values.length;
      i++
    ) {
      const current =
        (
          Number(values[i]) -
          previous
        ) *
        multiplier +
        previous;

      result.push(
        current
      );

      previous =
        current;
    }

    return result;
  }


  ema(
    values,
    period
  ) {
    const series =
      this.emaSeries(
        values,
        period
      );

    if (!series.length) {
      return null;
    }

    return series[
      series.length - 1
    ];
  }


  // ===================================
  // RSI
  // ===================================

  rsi(
    values,
    period =
      this.config.rsiPeriod
  ) {
    if (
      !Array.isArray(values) ||
      values.length <
        period + 1
    ) {
      return null;
    }

    let gains = 0;
    let losses = 0;

    const start =
      values.length -
      period -
      1;

    for (
      let i = start + 1;
      i < values.length;
      i++
    ) {
      const change =
        Number(values[i]) -
        Number(
          values[i - 1]
        );

      if (change > 0) {
        gains += change;
      } else {
        losses +=
          Math.abs(change);
      }
    }

    const averageGain =
      gains / period;

    const averageLoss =
      losses / period;

    if (
      averageLoss === 0
    ) {
      return averageGain > 0
        ? 100
        : 50;
    }

    const rs =
      averageGain /
      averageLoss;

    return (
      100 -
      100 /
      (1 + rs)
    );
  }


  // ===================================
  // MACD
  // ===================================

  macd(values) {
    const fastSeries =
      this.emaSeries(
        values,
        this.config.macdFast
      );

    const slowSeries =
      this.emaSeries(
        values,
        this.config.macdSlow
      );

    if (
      !fastSeries.length ||
      !slowSeries.length
    ) {
      return {
        macd: null,
        signal: null,
        histogram: null
      };
    }

    const macdSeries = [];

    for (
      let i = 0;
      i < values.length;
      i++
    ) {
      const fast =
        fastSeries[i];

      const slow =
        slowSeries[i];

      if (
        fast === null ||
        slow === null ||
        fast === undefined ||
        slow === undefined
      ) {
        continue;
      }

      macdSeries.push(
        fast - slow
      );
    }

    if (
      macdSeries.length <
      this.config.macdSignal
    ) {
      return {
        macd:
          macdSeries.at(-1) ??
          null,

        signal: null,
        histogram: null
      };
    }

    const signalSeries =
      this.emaSeries(
        macdSeries,
        this.config.macdSignal
      );

    const macdValue =
      macdSeries.at(-1);

    const signalValue =
      signalSeries.at(-1);

    return {
      macd:
        macdValue,

      signal:
        signalValue,

      histogram:
        Number.isFinite(
          signalValue
        )
          ? macdValue -
            signalValue
          : null
    };
  }


  // ===================================
  // BOLLINGER BANDS
  // ===================================

  bollinger(values) {
    const period =
      this.config
        .bollingerPeriod;

    if (
      values.length <
      period
    ) {
      return {
        upper: null,
        middle: null,
        lower: null,
        widthPct: null
      };
    }

    const sample =
      values.slice(
        -period
      );

    const middle =
      this.average(sample);

    const std =
      this.standardDeviation(
        sample
      );

    if (
      middle === null ||
      std === null
    ) {
      return {
        upper: null,
        middle: null,
        lower: null,
        widthPct: null
      };
    }

    const upper =
      middle +
      std *
      this.config
        .bollingerStdDev;

    const lower =
      middle -
      std *
      this.config
        .bollingerStdDev;

    const widthPct =
      middle > 0
        ? (
            (
              upper -
              lower
            ) /
            middle
          ) * 100
        : null;

    return {
      upper,
      middle,
      lower,
      widthPct
    };
  }


  // ===================================
  // TRUE RANGE
  // ===================================

  trueRanges(candles) {
    const result = [];

    for (
      let i = 0;
      i < candles.length;
      i++
    ) {
      const high =
        this.number(
          candles[i].high
        );

      const low =
        this.number(
          candles[i].low
        );

      if (
        high === null ||
        low === null
      ) {
        continue;
      }

      if (i === 0) {
        result.push(
          high - low
        );

        continue;
      }

      const previousClose =
        this.number(
          candles[
            i - 1
          ].close
        );

      if (
        previousClose ===
        null
      ) {
        result.push(
          high - low
        );

        continue;
      }

      result.push(
        Math.max(
          high - low,
          Math.abs(
            high -
            previousClose
          ),
          Math.abs(
            low -
            previousClose
          )
        )
      );
    }

    return result;
  }


  // ===================================
  // ATR
  // ===================================

  atr(candles) {
    const ranges =
      this.trueRanges(
        candles
      );

    return this.sma(
      ranges,
      this.config.atrPeriod
    );
  }


  // ===================================
  // VWAP
  // ===================================

  vwap(candles) {
    let priceVolume = 0;
    let volumeTotal = 0;

    for (
      const candle of candles
    ) {
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

      if (
        high === null ||
        low === null ||
        close === null ||
        volume === null ||
        volume <= 0
      ) {
        continue;
      }

      const typicalPrice =
        (
          high +
          low +
          close
        ) / 3;

      priceVolume +=
        typicalPrice *
        volume;

      volumeTotal +=
        volume;
    }

    return volumeTotal > 0
      ? priceVolume /
        volumeTotal
      : null;
  }


  // ===================================
  // ADX
  // ===================================

  adx(candles) {
    const period =
      this.config.adxPeriod;

    if (
      candles.length <
      period + 1
    ) {
      return null;
    }

    const tr = [];
    const plusDM = [];
    const minusDM = [];

    for (
      let i = 1;
      i < candles.length;
      i++
    ) {
      const current =
        candles[i];

      const previous =
        candles[i - 1];

      const high =
        Number(
          current.high
        );

      const low =
        Number(
          current.low
        );

      const previousHigh =
        Number(
          previous.high
        );

      const previousLow =
        Number(
          previous.low
        );

      const previousClose =
        Number(
          previous.close
        );

      if (
        ![
          high,
          low,
          previousHigh,
          previousLow,
          previousClose
        ].every(
          Number.isFinite
        )
      ) {
        continue;
      }

      const upMove =
        high -
        previousHigh;

      const downMove =
        previousLow -
        low;

      plusDM.push(
        upMove >
          downMove &&
        upMove > 0
          ? upMove
          : 0
      );

      minusDM.push(
        downMove >
          upMove &&
        downMove > 0
          ? downMove
          : 0
      );

      tr.push(
        Math.max(
          high - low,
          Math.abs(
            high -
            previousClose
          ),
          Math.abs(
            low -
            previousClose
          )
        )
      );
    }

    if (
      tr.length <
      period
    ) {
      return null;
    }

    const atr =
      this.sma(
        tr,
        period
      );

    const plus =
      this.sma(
        plusDM,
        period
      );

    const minus =
      this.sma(
        minusDM,
        period
      );

    if (
      !atr ||
      atr <= 0 ||
      plus === null ||
      minus === null
    ) {
      return null;
    }

    const plusDI =
      100 *
      plus /
      atr;

    const minusDI =
      100 *
      minus /
      atr;

    const denominator =
      plusDI +
      minusDI;

    if (
      denominator === 0
    ) {
      return 0;
    }

    return (
      100 *
      Math.abs(
        plusDI -
        minusDI
      ) /
      denominator
    );
  }


  // ===================================
  // DESTEK / DİRENÇ
  // ===================================

  supportResistance(
    candles
  ) {
    const lookback =
      Math.min(
        this.config
          .supportResistanceLookback,

        candles.length
      );

    const sample =
      candles.slice(
        -lookback
      );

    const highs =
      sample
        .map(
          candle =>
            this.number(
              candle.high
            )
        )
        .filter(
          value =>
            value !== null
        );

    const lows =
      sample
        .map(
          candle =>
            this.number(
              candle.low
            )
        )
        .filter(
          value =>
            value !== null
        );

    if (
      !highs.length ||
      !lows.length
    ) {
      return {
        support: null,
        resistance: null
      };
    }

    return {
      support:
        Math.min(
          ...lows
        ),

      resistance:
        Math.max(
          ...highs
        )
    };
  }


  // ===================================
  // SWING HIGH / LOW
  // ===================================

  swings(candles) {
    const n =
      this.config.swingLookback;

    const swingHighs = [];
    const swingLows = [];

    for (
      let i = n;
      i <
        candles.length - n;
      i++
    ) {
      const currentHigh =
        Number(
          candles[i].high
        );

      const currentLow =
        Number(
          candles[i].low
        );

      if (
        !Number.isFinite(
          currentHigh
        ) ||
        !Number.isFinite(
          currentLow
        )
      ) {
        continue;
      }

      let isHigh = true;
      let isLow = true;

      for (
        let j = i - n;
        j <= i + n;
        j++
      ) {
        if (j === i) {
          continue;
        }

        const high =
          Number(
            candles[j].high
          );

        const low =
          Number(
            candles[j].low
          );

        if (
          Number.isFinite(high) &&
          high >= currentHigh
        ) {
          isHigh = false;
        }

        if (
          Number.isFinite(low) &&
          low <= currentLow
        ) {
          isLow = false;
        }
      }

      if (isHigh) {
        swingHighs.push({
          index: i,
          price:
            currentHigh
        });
      }

      if (isLow) {
        swingLows.push({
          index: i,
          price:
            currentLow
        });
      }
    }

    return {
      highs:
        swingHighs,

      lows:
        swingLows,

      lastHigh:
        swingHighs.at(-1) ??
        null,

      previousHigh:
        swingHighs.at(-2) ??
        null,

      lastLow:
        swingLows.at(-1) ??
        null,

      previousLow:
        swingLows.at(-2) ??
        null
    };
  }


  // ===================================
  // PİYASA YAPISI
  // ===================================

  marketStructure(
    candles
  ) {
    const swing =
      this.swings(
        candles
      );

    const {
      lastHigh,
      previousHigh,
      lastLow,
      previousLow
    } = swing;

    const higherHigh =
      Boolean(
        lastHigh &&
        previousHigh &&
        lastHigh.price >
          previousHigh.price
      );

    const lowerHigh =
      Boolean(
        lastHigh &&
        previousHigh &&
        lastHigh.price <
          previousHigh.price
      );

    const higherLow =
      Boolean(
        lastLow &&
        previousLow &&
        lastLow.price >
          previousLow.price
      );

    const lowerLow =
      Boolean(
        lastLow &&
        previousLow &&
        lastLow.price <
          previousLow.price
      );

    let structure =
      "UNDEFINED";

    if (
      higherHigh &&
      higherLow
    ) {
      structure =
        "UPTREND";

    } else if (
      lowerHigh &&
      lowerLow
    ) {
      structure =
        "DOWNTREND";

    } else if (
      higherLow &&
      !lowerLow
    ) {
      structure =
        "RISING_BASE";

    } else if (
      lowerHigh &&
      !higherHigh
    ) {
      structure =
        "FALLING_TOP";
    }

    return {
      structure,

      higherHigh,
      higherLow,
      lowerHigh,
      lowerLow,

      swings:
        swing
    };
  }


  // ===================================
  // VOLATİLİTE SIKIŞMASI
  // ===================================

  compression(
    candles
  ) {
    const closes =
      this.closes(
        candles
      );

    const bb =
      this.bollinger(
        closes
      );

    const atr =
      this.atr(
        candles
      );

    const lastPrice =
      closes.at(-1) ??
      null;

    const atrPct =
      (
        atr !== null &&
        lastPrice
      )
        ? (
            atr /
            lastPrice
          ) * 100
        : null;

    let score = 0;

    if (
      bb.widthPct !== null
    ) {
      if (
        bb.widthPct <= 2
      ) {
        score += 60;

      } else if (
        bb.widthPct <= 4
      ) {
        score += 40;

      } else if (
        bb.widthPct <= 6
      ) {
        score += 
