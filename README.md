# TradeRadar – 2 Dakikalık Patlama Radarı

## Kurulum
Node.js 20+ gerekir.

    npm install
    npm start

Ardından tarayıcıdan http://localhost:3000 adresini açın.

## Sistem
Binance TR TRY paritelerini WebSocket üzerinden canlı izler. 5/10/30/60/120 saniyelik fiyat hareketi, göreli hacim, işlem hızı, taker alış baskısı, son 8 adet 15 dakikalık mum sıkışması ve direnç yakınlığını birlikte puanlar.

Sınıflar: İZLENİYOR, ADAY, ERKEN UYARI, GÜÇLÜ ERKEN UYARI, GEÇ KALINDI.

Bu sürüm otomatik emir vermez. Alarm puanları başlangıç eşikleridir; gerçek kullanım öncesinde geçmiş veri üzerinde backtest ve ileri dönem doğrulaması yapılmalıdır. Kesin yükseliş tahmini garanti edilemez.
