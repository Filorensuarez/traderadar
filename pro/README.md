# TradeRadar Pro geliştirme ve işletim

Bu modül mevcut TradeRadar stratejilerinden ayrıdır. Eski uygulama `npm start`, Pro uygulaması `npm run start:pro` ile başlar. Gerçek emir yolu veya işlem API anahtarı yoktur. Canlı Binance TR bağlantısı bu ortamda doğrulanamadı; bu sürüm üretime hazır ilan edilmemiştir.

Kullanıcının sağladığı resmî kaynak: https://www.binance.tr/apidocs/ . Bu belgeye istek, hedef TLS bağlantısından önce bulut proxy'sinde `CONNECT ...:443` aşamasında 403 aldı. Belge içeriği alınmadı; dolayısıyla içerdiği resmî REST/WebSocket adresleri doğrulanmış gibi listelenmiyor. Üretim adaptörü `verified=false` ile kapalıdır; panel ve testler çalışır. Testler yalnız kendi yerel fixture adaptörlerini etkinleştirir. Ağ erişimi düzeldikten sonra önce resmî belge okunmalı, host/path/durum ve akış şemaları doğrulanmalı, ardından gerçek smoke testleriyle adaptör açılmalıdır. Ortam değişkeniyle doğrulamayı atlama seçeneği yoktur.

## Çalıştırma

Node.js 24 önerilir; doğrulanan sürüm 24.19.0. Pro, yerleşik `node:sqlite` gerektirir. Node 22 kullanılıyorsa en az 22.13 gerekir; Node 22 üzerinde bu çalışma sırasında ayrıca test yapılmadı.

```sh
cd /workspace/traderadar
npm ci --ignore-scripts
NODE_USE_ENV_PROXY=1 npm run start:pro
```

Pro varsayılan olarak yalnız yerel arayüzde 3001 portunu dinler; eski panelin varsayılan portu 3000'dir. `PRO_PORT` veya platformun `PORT` değişkeni portu seçer. Pro'da derleme adımı yoktur. Bulut ortamındaki proxy ve CA değişkenlerini koruyun. `NODE_USE_ENV_PROXY` Node 24'ün yerel fetch isteklerini proxy üzerinden yönlendirir; WebSocket istemcisi aynı HTTPS proxy için açık proxy agent kullanır. TLS doğrulaması kapatılmaz.

Windows PowerShell:

```powershell
npm ci --ignore-scripts
$env:NODE_USE_ENV_PROXY="1"
npm run start:pro
```

HTTP kontrolü: `/`, `/api/pro/status`, `/api/pro/history`, `/api/pro/reports`. Durum API'sindeki HTTP 200 uygulamanın çalıştığını gösterir; canlı veri kanıtı için `source.connected`, `source.fresh`, `source.receivedTrades`, `source.lastMessageAt`, katalog sayısı ve kaynağın güncel resmî desteği ayrıca doğrulanmalıdır. Gerçek veriler olmadan boş liste normaldir.

## Veri ve strateji sözleşmesi

- Yalnız Binance TR etiketi kullanılır; Binance Global'e sessiz geçiş yapılmaz. Adaptör, mevcut deponun `www.binance.tr`, `api.binance.me`, `cloudme-tr.2meta.app` ve `stream-cloud.binance.tr` uç noktalarına dayanır. Güncel resmî destek, piyasa durum şeması, abonelik sınırları, API ağırlıkları ve depth uç noktası **henüz doğrulanmadı**. `sourceVerification` bunu açıkça bildirir. Kaynak değiştirmeden önce güncel resmî doküman ve gerçek salt okunur yanıt gereklidir.
- Katalog 15 dakikada bir yenilenir; yalnız açık aktif ve spot etkin durumlu pariteler kabul edilir. Sabit coin listesi veya toplam coin üst sınırı yoktur. Bir bağlantıya 80 abonelik taşıma grubu uygulanır; bu sayı resmî limit olarak sunulmaz. Sağlayıcının güncel limitiyle doğrulanmalıdır.
- Mevcut ikinci piyasa türünün (type 3) işlem akışı doğrulanmadı; katalogda bulunsa bile analizi kullanılamaz olur. Hatalı piyasa yönlendirmesi uydurulmaz.
- Bir saniyelik mumlar yalnız zaman damgalı, doğrulanmış gerçek işlemlerden oluşur. Açık saniye ve dakika dışarıda kalır. İşlemsiz saniyeye önceki kapanış taşınmaz. Kesinti sonrası 300 saniyelik kesintisiz pencere yeniden beklenir. Eksik geçmişi dolduracak doğrulanmış trade replay servisi yoksa ilgili analiz kapalı kalır.
- Formül: `(mean(son 300 kapalı 1s kapanışı) / mean(pencere başlangıcından önce kapanmış son 30 adet 1m kapanışı) - 1) * 100`. Her iki ortalamanın birimi aynı paritenin kotasyon parasıdır. Dakika sınırı nedeniyle referansın sonu, saniye penceresinin başlangıcından 0–59 saniye önce olabilir; örtüşme yoktur.
- Ayrı gerçek değişim: `(son saniye kapanışı / ilk saniye açılışı - 1) * 100`. Bu değer ortalamalar farkı değildir.
- Varsayılan eşik %2; zorunlu hacim çarpanı yoktur. İsteğe bağlı hacim oranı iki pencerede de kotasyon hacmi/saniye üzerinden hesaplanır.
- EMA9/21, Wilder RSI14, MACD12/26/9, kısa trend, fiyat kırılımı, destek/direnç ve log getirilerin 1 saniyelik standart sapması gösterilir. Bunlar ayrı bağımsız teyitler gibi sayılmaz. Dört kanıt grubu fiyat, hacim, gerçek taker yönü ve spread/derinliktir. Hacim ve taker yönü de aynı işlemlerden türediği için tam istatistiksel bağımsızlık iddiası yoktur.
- Çoklu teyit için güncel spread/derinlik gerekir. Sağlayıcı vermiyorsa likidite veya alış/satış yönü uydurulmaz. Depth yalnız uygun adaylar için, sıra ve cooldown paylaşan REST kuyruğunda istenir. Büyük aday evreninde her paritenin defteri aynı anda güncel tutulacağı garanti edilmez.
- Teknik koşul puanı dört grubun her biri için 25 puandır; başarı olasılığı değildir. Eşik geçmeyenler ana ekranda gösterilmez.

## Kalıcı kayıt ve başarı

`PRO_DATA_FILE` varsayılanı çalışma dizininin kardeşindeki `traderadar-pro-data/signals.sqlite` dosyasıdır. Bu yol HTTP ile sunulmaz. SQLite WAL, sinyalleri, ayar anlık görüntülerini ve bildirimleri saklar. Tek sunucu/tek tarayıcı motoru çalıştırın; yatay çoğaltma bu sürümün kapsamı değildir.

Her parite için bir saatlik aktif gözlem dönemi tek sinyal örneği sayılır; tekrar tarama örnek sayısını ve alarmı şişirmez. Bu örnekleme politikası eski stratejileri etkilemez. Sinyal zamanı son kapalı saniye sınırıdır; gerçek işlem emri veya o fiyattan dolum iddiası değildir.

1/3/5/10/15/30/60 dakika kapanış getirileri, gözlenen en yüksek/en düşük fiyat, olumlu/olumsuz hareket ve brüt hedef süresi saklanır. Hedef, ayarlanmış sürede sinyal fiyatına göre brüt artıştır. Gözlem boşluğu varsa başarısızlık yerine yetersiz veri raporlanır. Başlangıç ve yeniden bağlantı eksikleri doldurulmaz. Mum içi hedef zamanı 1 saniyelik çözünürlüktedir; fiyatın kesin işlem sırası veya dolum garantisi değildir.

Komisyon ve kayma her yön için ayrı parametredir; spread ayrıca saklanır. Net yüzde, bileşik giriş/çıkış maliyet modeliyle hesaplanır. Canlı takipte ileri tarihli defter gözlemi olmadığı için kayıtlı giriş spreadinin iki yönde kullanılması **bir tahmindir**; gerçekleşmiş işlem maliyeti değildir. Spread yoksa net getiri `null` olur. Gerçek para bazlı ücret ve gerçekleşmiş kayma hesabı emir/dolum verisi olmadan yapılamaz.

Haftalar Europe/Istanbul pazartesi 00.00'da başlar. Geçmiş silinmez; hedef/süre tanımları ayrı raporlanır. Asgari örnek sayısının altında arayüz güvenilir başarı yüzdesi sunmaz. Asgari sayının aşılması kalibrasyon veya istatistiksel bağımsızlık kanıtı değildir.

## Testler

```sh
npm run test:pro
npm run test:pro:ui
npm run test:ultimate
node --test *.test.js tests/*.test.js
npm audit --omit=dev
```

Tarayıcı testinde sistem Chromium'u varsa kullanılır. Yoksa `npx playwright install chromium` gerekir; alternatif kurulu ikili `PLAYWRIGHT_CHROMIUM_EXECUTABLE` ile seçilir. Bu ortamda CDN indirmesi ağ politikasınca engellendi; sistem Chromium'u ile test geçti. UI ve yük testleri açıkça sentetik fixture kullanır; üretim veritabanına örnek fiyat yazılmaz. Yerel WebSocket testinin geçmesi Binance TR bağlantısının geçtiği anlamına gelmez.

## Geçmiş test

```sh
npm run backtest:pro -- /tam/yol/gercek-veri.json /tam/yol/yeni-rapor.json
```

Girdi nesnesi `kind: "historical-observations"`, `source`, `seconds`, `minutes` içerir; net sonuç için `books` ve isteğe bağlı `notional` gerekir. Mumlar `time` (Unix ms), `open/high/low/close`, `volume`, `quoteVolume` alanlarını kullanır. Saniyelerde `buyQuote` varsa taker baskısı ölçülür. Defter nesnesi `time/bid/ask/depthQuote` alanlarını içerir. Uydurma veriyi gerçek olarak etiketlemeyin; aracın kaynak metnini kabul etmesi veri özgünlüğünü doğrulamaz.

Özellikler sadece sinyal anında kapanmış veriyi görür. Dönemler zamana göre %60 eğitim/%20 doğrulama/%20 dış örnek olarak ayrılır; sonuç penceresi sınırları aşan örnekler temizlenir. Parametre araması veya otomatik optimizasyon yoktur. Bu, zaman sıralı replay ve ayrılmış dönem değerlendirmesidir; çok pencereli yeniden eğitimli profesyonel walk-forward araştırması, rejim başına yeterli örnek, istatistiksel kalibrasyon ve bağımsız veri doğrulaması henüz tamamlanmadı. Likidite eksikse net sonuç yerine kullanılamaz durumu üretilir. Arayüz canlı raporlarını geçmiş test raporlarıyla birleştirmez.

## Yayınlama

Sürekli veri toplayıcı için Node 24 çalıştıran bir sunucu gerekir. GitHub Pages yalnız `pro/public` içeriğini sunabilir; tek başına tarama veya SQLite çalıştırmaz. Ayrı statik yayın için `pro/public/config.js` içindeki `API_BASE` değerini HTTPS backend origin'i yapın; backend'de `PRO_FRONTEND_ORIGIN` değerini bu statik sitenin origin'i olarak ayarlayın. Gizli bilgi eklemeyin. Tek origin üzerinden TLS reverse proxy kullanmak daha basittir.

Sunucu sağlayıcısında build komutu `npm ci --omit=dev --ignore-scripts`, start komutu `npm run start:pro`; `PRO_HOST=0.0.0.0`, platformun `PORT` değeri ve kalıcı diske bakan `PRO_DATA_FILE` gerekir. HTTPS reverse proxy, WebSocket için dışarı 443 erişimi ve yeniden başlatma izleyicisi sağlayın. TLS olmadan halka açık yayın yapmayın. SQLite yedeğini `VACUUM INTO`/SQLite backup API ile tutarlı alın; WAL açıkken yalnız ana dosyayı kopyalamayın. Kalıcı diskin bağlılığını ve yeniden başlatma sonrası kayıtları gerçek sağlayıcıda ayrıca test edin.

Ücretsiz uyuyan web hizmetleri deneme paneli için kullanılabilir; uyku, kota ve geçici dosya sistemi nedeniyle 7/24 tarama veya kalıcı haftalık geçmiş garantisi vermez. Kendi açık bilgisayarınız ücretsiz sunucu olabilir, ancak cihaz ve internet açık kalmalıdır. Bu çalışmada harici sunucuya yayın yapılmadı.

Windows 11 ve Android aynı HTTPS panelini tarayıcıdan kullanabilir. Yerel yönetici ayar API'si yalnız gerçek loopback erişiminde, loopback Host ve CSRF kontrolüyle açıktır; uzak ziyaretçi salt okunurdur. Uzak ayar yönetimi için ayrıca kimlik doğrulamalı yönetim tasarımı gerekir. Reverse proxy Host'u korumalı ve Forwarded/X-Forwarded-For göndermelidir. Tarayıcı bildirimleri izin ve açık oturum gerektirir; ses ilk kullanıcı etkileşiminden sonra çalışır. Arka planda Android push garantisi, servis tabanlı bildirim gönderimi ve bildirim teslim ölçümü bu sürümde yoktur.

Yayın ön koşulları: güncel resmî Binance TR dokümanıyla adaptörü doğrulamak; ağ izinlerini etkinleştirip REST ve gerçek WebSocket smoke testlerini yapmak; her piyasa türünün kapsamasını ölçmek; hız/ağırlık sınırlarına göre grupları ve kuyruğu ayarlamak; geçmiş gerçek veriyle bağımsız performans testini tamamlamak; eski test/strateji uyuşmazlığını kullanıcı stratejisini değiştirmeden çözmek.
