# TradeRadar — Teknik Yükseliş Sistemi

TradeRadar halka açık borsa verilerinden teknik sinyaller üretir; otomatik emir göndermez ve kâr garantisi vermez.

## Erken Yükseliş Radarı (Haftalık SMA200 / SMA50 / SMA20)

- Kaynak: Binance, OKX, KuCoin spot USDT 1 haftalık mumları; Gate.io spot USDT 7 günlük periyotları (takvim hizalaması farklıdır). Bitget v3 spot API haftalık mum sağlamadığı için bu radara dahil değildir.
- Uyarlanabilir ortalama: 206+ kapanmış hafta için MA200, 56–205 hafta için MA50, 26–55 hafta için MA20. Bu ortalamalar eşdeğer değildir. 26 hafta altında sinyal verilmez.
- BUY: iki kapalı haftanın kullanılan MA çizgisi üzerinde kapanması, daha önce çizginin altında kalmış fiyat, RSI/MACD ve hacim teyidi.
- SELL: iki kapalı haftanın kullanılan MA çizgisi altında kapanması, daha önce çizginin üzerinde kalmış fiyat ve zayıflayan momentum.
- İZLE: seçilmiş ortalama yakını ancak tam BUY/SELL teyidi henüz yok.
- Coin kartına basılınca gerçek OHLC mumları, kırmızı gerçek MA200/50/20 çizgisi, tarihsel BUY/SELL işaretleri ve geçmiş sinyallerin tarihli listesi açılır.
- Grafik yakınlaştırılabilir, sürüklenebilir, log/doğrusal ölçekte incelenebilir.
- Gerçek yeterli geçmiş yoksa yapay çizgi üretilmez; MA50 asla MA200 gibi etiketlenmez. Geçmiş BUY/SELL etiketleri kazanç garantisi değildir.
- GET /api/early-pump tarama sonuçları; GET /api/early-pump/chart?exchange=BINANCE&symbol=BTCUSDT mumları verir.
- Otomatik tarama üç saatte bir yenilenir. POST /api/early-pump/scan elle tarama başlatır.

## Kurulum

Node.js 22+ ile npm install ve npm start komutlarını kullanın. Yerelde http://localhost:3000 adresini açın.
Web sürümü PWA olarak ana ekrana kurulabilir. Android APK geliştirme projesi android/ klasöründedir.

## Test

node --test weekly-ma200-model.test.js early-pump-watch.test.js

Diğer momentum, V tipi dip ve USDT işlem planı bölümleri bağımsızdır. Hiçbir sinyal yatırım tavsiyesi, kesin teknik dönüş veya otomatik işlem değildir.

## 1 Dakikalık Momentum (yalnız fiyat teyidi)

- Binance ve OKX spot piyasalarda 30 tamamlanmış, gerçek ve ardışık 1 saniyelik kapanışın ortalaması; bu pencereden önceki 30 kapalı, ardışık 1 dakikalık mumun kapanış ortalamasıyla karşılaştırılır.
- Fiyat farkı en az **+%2** olunca, veri güncel ve eksiksizse `confirmed: true` üretilir.
- **Minimum hacim, hacim oranı ve hacim ivmesi teyidi kaldırılmıştır**; hacim yüzünden coin elenmez. Alış-satış farkı filtresi (%0,45) korunur.
- Eşiğe yaklaşan fakat teyit almamış coinler arayüzde veya sonuç API'sinde paylaşılmaz.
- Böyle bir sinyal daha az teyit koşulu taşıdığından yanlış sinyal ihtimali artabilir. İşlem veya getiri garantisi yoktur.
