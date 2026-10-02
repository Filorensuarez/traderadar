
// TradeRadar Ultimate
// System Health Engine
// Mevcut TradeRadar'dan bağımsız çalışacak şekilde tasarlanmıştır.

export class SystemHealthEngine {
  constructor(options = {}) {
    this.config = {
      maxTickAgeMs:
        options.maxTickAgeMs ?? 15000,

      maxLatencyMs:
        options.maxLatencyMs ?? 5000,

      maxConsecutiveErrors:
        options.maxConsecutiveErrors ?? 5,

      staleAfterMs:
        options.staleAfterMs ?? 30000
    };

    this.startedAt = Date.now();

    this.websocket = {
      connected: false,
      lastConnectedAt: 0,
      lastDisconnectedAt: 0,
      reconnectAttempts: 0
    };

    this.api = {
      ok: true,
      lastSuccessAt: 0,
      lastErrorAt: 0
    };

    this.database = {
      ok: true,
      lastSuccessAt: 0,
      lastErrorAt: 0
    };

    this.scanner = {
      running: false,
      trackedCoins: 0,
      lastScanAt: 0
    };

    this.market = {
      lastTickAt: 0,
      latencyMs: null
    };

    this.errors = {
      total: 0,
      consecutive: 0,
      lastError: null,
      lastErrorAt: 0
    };
  }


  // ===================================
  // WEBSOCKET
  // ===================================

  websocketConnected() {
    this.websocket.connected = true;

    this.websocket.lastConnectedAt =
      Date.now();

    this.websocket.reconnectAttempts = 0;
  }


  websocketDisconnected() {
    this.websocket.connected = false;

    this.websocket.lastDisconnectedAt =
      Date.now();
  }


  websocketReconnectAttempt() {
    this.websocket.reconnectAttempts += 1;
  }


  // ===================================
  // MARKET TICK
  // ===================================

  marketTick(exchangeTimestamp) {
    const now = Date.now();

    this.market.lastTickAt = now;

    if (
      Number.isFinite(
        Number(exchangeTimestamp)
      )
    ) {
      this.market.latencyMs =
        Math.max(
          0,
          now -
            Number(
              exchangeTimestamp
            )
        );
    }

    this.success();
  }


  // ===================================
  // API
  // ===================================

  apiSuccess() {
    this.api.ok = true;

    this.api.lastSuccessAt =
      Date.now();

    this.success();
  }


  apiError(error) {
    this.api.ok = false;

    this.api.lastErrorAt =
      Date.now();

    this.error(
      "API",
      error
    );
  }


  // ===================================
  // DATABASE
  // ===================================

  databaseSuccess() {
    this.database.ok = true;

    this.database.lastSuccessAt =
      Date.now();
  }


  databaseError(error) {
    this.database.ok = false;

    this.database.lastErrorAt =
      Date.now();

    this.error(
      "DATABASE",
      error
    );
  }


  // ===================================
  // SCANNER
  // ===================================

  scannerStarted() {
    this.scanner.running = true;

    this.scanner.lastScanAt =
      Date.now();
  }


  scannerStopped() {
    this.scanner.running = false;
  }


  scannerUpdate(
    trackedCoins
  ) {
    this.scanner.running = true;

    this.scanner.trackedCoins =
      Math.max(
        0,
        Number(
          trackedCoins
        ) || 0
      );

    this.scanner.lastScanAt =
      Date.now();
  }


  // ===================================
  // ERROR
  // ===================================

  error(
    source,
    error
  ) {
    this.errors.total += 1;

    this.errors.consecutive += 1;

    this.errors.lastErrorAt =
      Date.now();

    this.errors.lastError = {
      source,

      message:
        error instanceof Error
          ? error.message
          : String(
              error || "Unknown error"
            )
    };
  }


  success() {
    this.errors.consecutive = 0;
  }


  // ===================================
  // DURUM HESABI
  // ===================================

  snapshot() {
    const now = Date.now();

    const tickAgeMs =
      this.market.lastTickAt
        ? now -
          this.market.lastTickAt
        : null;


    const scannerAgeMs =
      this.scanner.lastScanAt
        ? now -
          this.scanner.lastScanAt
        : null;


    const tickFresh =
      tickAgeMs !== null &&
      tickAgeMs <=
        this.config.maxTickAgeMs;


    const latencyGood =
      this.market.latencyMs === null ||
      this.market.latencyMs <=
        this.config.maxLatencyMs;


    const scannerFresh =
      this.scanner.running &&
      scannerAgeMs !== null &&
      scannerAgeMs <=
        this.config.staleAfterMs;


    const errorsHealthy =
      this.errors.consecutive <
      this.config.maxConsecutiveErrors;


    const healthy =
      this.websocket.connected &&
      this.api.ok &&
      this.database.ok &&
      tickFresh &&
      latencyGood &&
      scannerFresh &&
      errorsHealthy;


    const problems = [];


    if (
      !this.websocket.connected
    ) {
      problems.push(
        "WEBSOCKET_DISCONNECTED"
      );
    }


    if (!this.api.ok) {
      problems.push(
        "API_ERROR"
      );
    }


    if (!this.database.ok) {
      problems.push(
        "DATABASE_ERROR"
      );
    }


    if (!tickFresh) {
      problems.push(
        "STALE_MARKET_DATA"
      );
    }


    if (!latencyGood) {
      problems.push(
        "HIGH_LATENCY"
      );
    }


    if (!scannerFresh) {
      problems.push(
        "SCANNER_STALE"
      );
    }


    if (!errorsHealthy) {
      problems.push(
        "TOO_MANY_ERRORS"
      );
    }


    return {
      healthy,

      tradingAllowed:
        healthy,

      message:
        healthy
          ? "VERİ GÜVENİLİR"
          : "VERİ GÜVENİLİR DEĞİL – İŞLEM DURDURULDU",

      websocket: {
        ...this.websocket
      },

      api: {
        ...this.api
      },

      database: {
        ...this.database
      },

      scanner: {
        ...this.scanner,

        ageMs:
          scannerAgeMs
      },

      market: {
        ...this.market,

        tickAgeMs
      },

      errors: {
        ...this.errors
      },

      uptimeMs:
        now -
        this.startedAt,

      checkedAt:
        now,

      problems
    };
  }


  // ===================================
  // FAIL-SAFE
  // ===================================

  canGenerateNewSignal() {
    return (
      this.snapshot()
        .tradingAllowed === true
    );
  }
}


export function createSystemHealth(
  options = {}
) {
  return new SystemHealthEngine(
    options
  );
}
