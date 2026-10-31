export const NOW = Date.UTC(2026, 9, 30, 12);
export function bar(time, price = 100, quoteVolume = 100) {
  return { time, open: price, high: price, low: price, close: price, volume: quoteVolume / price, quoteVolume, buyQuote: quoteVolume * 0.7, last: time + 999 };
}
export function fixture(now = NOW) {
  const seconds = Array.from({ length: 300 }, (_, i) => bar(now - (300 - i) * 1000, 102, 10));
  const boundary = Math.floor(seconds[0].time / 60000) * 60000;
  const minutes = Array.from({ length: 30 }, (_, i) => bar(boundary - (30 - i) * 60000, 100, 600));
  return { seconds, minutes, now };
}
