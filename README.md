# TradeRadar — Teknik Yükseliş Sistemi

TradeRadar halka açık borsa verilerinden teknik sinyaller üretir; otomatik emir göndermez ve kâr garantisi vermez.

## Erken Yükseliş Radarı (Haftalık SMA200)

- Kaynak: Binance, OKX, KuCoin spot USDT 1 haftalık mumları; Gate.io spot USDT 7 günlük periyotları (takvim hizalaması farklıdır). Bitget v3 spot API haftalık mum sağlamadığı için bu radara dahil değildir.
- SMA200: son 200 kapanmış haftalık mumun kapanış ortalaması. 200 haftanın altındaki veriye BUY/SELL işareti konmaz.
- BUY: iki tamamlanmış haftanın MA200 üstünde kapanması, daha önce ortalamanın altına iniş, ortalama bölgesine temas, olumlu RSI14/MACD histogram ve yeterli hacim teyidi.
- SELL: MA200 altındaki iki tamamlanmış hafta, öncesinde MA200 üzerinde kalmış fiyat ve zayıflayan momentum. SELL bir teknik risk uyarısıdır.
- İZLE: MA200 yakını ancak tam BUY/SELL teyidi henüz yok.
- Coin kartına basılınca gerçek OHLC mumları, kırmızı MA200 çizgisi ve yalnızca ilgili tarihe kadar oluşmuş tarihsel BUY/SELL işaretleri açılır.
- Grafik yakınlaştırılabilir, sürüklenebilir, log/doğrusal ölçekte incelenebilir.
- Gerçek 200 haftalık geçmiş yoksa yapay çizgi üretilmez. Geçmiş BUY/SELL etiketleri kazanç garantisi değildir.
- GET /api/early-pump tarama sonuçları; GET /api/early-pump/chart?exchange=BINANCE&symbol=BTCUSDT mumları verir.
- Otomatik tarama üç saatte bir yenilenir. POST /api/early-pump/scan elle tarama başlatır.

## Kurulum

Node.js 22+ ile npm install ve npm start komutlarını kullanın. Yerelde http://localhost:3000 adresini açın.
Web sürümü PWA olarak ana ekrana kurulabilir. Android APK geliştirme projesi android/ klasöründedir.

## Test

node --test weekly-ma200-model.test.js early-pump-watch.test.js

Diğer momentum, V tipi dip ve USDT işlem planı bölümleri bağımsızdır. Hiçbir sinyal yatırım tavsiyesi, kesin teknik dönüş veya otomatik işlem değildir.
