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

## 1 Dakikalık Momentum — Genişletilmiş tarama

- Her turda en fazla **Binance 70 + OKX 16 = 86** farklı spot USDT çiftini hedefler; önceki kapasite Binance 28 + OKX 12 idi.
- 1 dakikalık tarama döngüsü ve dönüşümlü piyasa seçimi sayesinde zaman içinde daha fazla coin kontrol edilir.
- OKX istekleri arasında en az 1,5 saniye, Binance istekleri arasında en az 140 milisaniye bırakılır. Diğer TradeRadar modülleriyle paylaşılan IP'de API hız sınırı yine oluşabilir.
- 1 dakikalık referans mumları önce, taze 1 saniyelik mumlar sonra alınır; 1 saniyelik seri beklerken eskimez.
- Sadece kapanmış gerçek mumlarla **%2 fiyat teyidi** üretilir; hacim şartı ve teyitsiz aday listesi geri getirilmedi.
- Tarama sayısı hedef değerdir; uygun coin azsa veya API 429 yanıtı gelirse o tur daha az parite değerlendirilebilir.

## 1 Dakikalık Momentum — 216 borsa/parite tarama hedefi
- Her taramada en fazla **Binance 200 + OKX 16 = 216** spot USDT **borsa/parite eşleşmesi** kontrol edilir. Aynı coin iki borsada bulunabilir.
- Tarama periyodu 120 saniye; Binance istekleri arası asgari 180 ms, OKX asgari 1500 ms. Destekli mumlar yalnızca gerçek borsa verileridir; 1 saniyelik mumlar sentezlenmez.
- API 429, borsa veri eksikliği veya piyasada uygun parite azlığı nedeniyle gerçek taranan sayı daha düşük olabilir.
- Hacim teyidi aranmaz, fiyat +%2 koşulu korunur, yalnızca tam teyitliler listelenir. Daha geniş evrende seyrek kontrol edilen coinlerde kısa süreli hareketler taramalar arasında kaçabilir.

### API 429 kontrolü
- Son canlı kayıtlar Binance **200/200** ve OKX **16/16** başarılı turlar olduğunu doğruladı.
- OKX'te aralıklı HTTP 429 istek sınırı hataları saptandı. Farklı modüllerin ortak IP kotası etkili olabilir.
- OKX istekleri arası minimum bekleme **2,6 saniyeye** çıkarıldı; 429 halinde **3 dakikalık** korumalı bekleme uygulanır.
- Bu durumun tamamen ortadan kalkması garanti değildir. Sistem API engelini aşmaya çalışmaz, hatalı/gecikmiş mumları gerçek sinyal olarak yayımlamaz.

## 1 Dakikalık Momentum — EMA7/25/99 sıkışma kırılımı

- +%2 fiyat momentumu ayrı bir sinyal olarak kalır.
- İkinci sinyal: 18 tamamlanmış 1 dakikalık mumda fiyat ve EMA sıkışması, ardından önceki direnç üzerinde iki kapanmış 1 dakika, EMA7 > EMA25 ve fiyat EMA99 üzerinde.
- En az 130 ardışık tamamlanmış 1 dakikalık mum gerekir. Binance ve OKX 160 adet gerçek 1 dakikalık OHLCV mum alınır; 1s mumlar ayrıca sorgulanır.
- Yeni EMA sinyali %2 fiyat şartı gerektirmez ve hacim şartı uygulanmaz. İki koşul birbirinden bağımsızdır ve yalnız tam teyitliler gösterilir.
- EMA kırılımı adayının geçmişe ait direnç fiyatı ve geçmiş yatay bölge alt sınırı gösterilir; bunlar garanti edilmiş zarar durdurma noktaları değildir.
- EMA eşikleri görsel örnekten türetilmiş deneysel değerlerdir. İleri dönük performans, maliyet ve kayma testleri yapılmadan kesin kazanç beklentisi kurulamaz.

## Temas Araması — tüm uygun spot pariteler

- Ayrı **Temas Araması** sekmesi ve `/api/daily-touch` canlı durum API'si.
- Binance'te işlem gören bütün uygun USDT/TRY spot çiftleri taranır; **coin sayısı ve hacim alt sınırı yoktur**. Sınırsız ifadesi, borsanın sonlu ve güncel listesinde bütün uygun çiftlerin dahil edilmesi anlamına gelir.
- Kapanmış 1 günlük mumlar üzerinde EMA7/EMA25 teması ve EMA99 altında yükseliş başlamamış durumu aranır; en az 110 günlük geçmiş gerekir.
- API hız sınırlarında bekleyip **aynı coinden devam eder**. İlerleme, kalan, hata ve eşleşme sayıları görünür. 30 dakikada bir yeni tam tarama; önceki bitmemişse eşzamanlı tekrar başlatılmaz.
- Binance dışındaki borsalar henüz bu modüle dahil değildir. Mum teması bir alım garantisi değildir.
