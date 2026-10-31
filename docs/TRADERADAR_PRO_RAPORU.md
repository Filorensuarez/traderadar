# TradeRadar Pro teknik çalışma raporu

Tarih: 31 Ekim 2026 · Europe/Istanbul

## Sonuç ve kapsam

Mevcut TradeRadar'ın yanında ayrı çalışan, test edilmiş bir Pro analiz/izleme uygulaması geliştirildi. Eski strateji koşulları ve eşikleri değiştirilmedi. Gerçek Binance TR bağlantısı doğrulanamadığı için çalışma **tamamlanmış üretim platformu veya 7/24 canlı tarayıcı değildir**. Canlı adaptör, resmî servis sözleşmesi doğrulanana kadar kapalıdır. Harici sunucuya yayın veya GitHub'a push yapılmadı.

## İncelenen mimari ve sorunlar

Başlangıç: `a0e5c9e`. Takip edilen 143 dosyadan 137 metin dosyasının envanteri çıkarıldı; yaklaşık 37.331 satır. Bu envanter bütün kodun semantik olarak doğrulandığı iddiası değildir. Ayrıntılı inceleme başlangıç dosyaları, veri sağlayıcıları, mum modelleri, geçmiş/performance modülleri, testler, CI ve istemci girişleri üzerinde yoğunlaştı.

Mimari: Node.js ES modules, Express 5, `ws`, web-push; tarayıcı tarafında düz JavaScript/CSS ve PWA; ayrı Android WebView kabuğu. `server.js` 7.776 satırlık birden fazla tarayıcı ve veri sağlayıcıyı bir arada yönetiyordu. `ultimate/` içinde mevcut teknik analiz, risk, sanal işlem ve backtest araçları var. GitHub Pages statik istemci ve Render adreslerine yönlendirmeler mevcut; gerçekte kullanılan harici sunucu hesabı veya çalışma durumu bu incelemede doğrulanmadı.

Tespitler:

- Depo kökünün `express.static('.')` ile sunulması, sunucu kaynakları ve çalışma dizinine yazılan JSON geçmiş/bildirim dosyaları için gereksiz erişim oluşturuyordu.
- Kilit dosyası yoktu; tekrarlanabilir bağımlılık kurulumu ve `npm audit` sınırlıydı.
- Binance TR mevcut sağlayıcısında sabit parite eklemeleri, güncel katalog durumu belirsizliği ve farklı piyasa türlerine ilişkin birden çok host vardı. Pro bu eski sağlayıcıyı doğrulanmış kaynak saymıyor.
- Eski günlük model testleri, güncel dakika modelinde bulunmayan API'leri bekliyor. Diğer bir test, çalışan işçi döngüsünü davranış yerine eski kaynak metni üzerinden denetliyor.
- Eski modüllerde farklı zaman pencereleri, sınırlı örnek saklama ve başarının farklı tanımları bulunuyor. Yeni başarı raporları bunlarla birleştirilmedi.
- Ortamın etkin ağ politikası ile kaydedilmiş taslak farklıydı. Taslakta alan adı bulunması çalışma anında izin verildiği anlamına gelmiyordu.

## Eklenen ve düzeltilenler

- **İzolasyon:** Pro sunucusu, herkese açık ayrı `pro/public` dizini ve HTTP kökünün dışındaki SQLite WAL veritabanı. Eski sunucuda yalnız tarayıcı varlıklarını sunan filtre; strateji kodunda değişiklik yok.
- **Mum doğruluğu:** İşlem kimliğiyle tekrar engelleme, zaman/pozitif fiyat/miktar kontrolü, sırasız işlemden deterministik OHLC, kapalı mum doğrulaması, veri boşluğu ve bağlantı kesintisinde kullanılabilirliği kapatma. İşlemsiz saniyeye fiyat taşınmıyor. İşlem kimliği önbelleği kaynak sınırını aşarsa sessiz örnek düşürmek yerine analiz devre dışı kalıyor.
- **Hesaplama:** 300 kapalı saniyenin kapanış ortalaması / bu pencere öncesi 30 kapalı dakikanın kapanış ortalaması; %2 varsayılan eşik. 300 saniye gerçek değişimi ayrı. Hacim filtresi varsayılan kapalı; hacim oranı aynı birim/saniye üzerinden.
- **Teknik koşullar:** EMA9/21, RSI14, MACD, trend, kırılım, destek/direnç, volatilite, mevcutsa taker alış oranı, spread ve derinlik. Fiyat göstergeleri tek kanıt grubu; puan olasılık değil. Üç kategori, ana ekranda yalnız iki uygun kategori.
- **Veri motoru:** Katalog yenileme, bütün uygun pariteler için abonelik gruplama, artan beklemeli yeniden bağlantı, heartbeat, ortak REST kuyruğu, aynı isteği birleştiren önbellek, 418/429 Retry-After beklemesi, adil aday derinlik sırası. Bunların gerçek sağlayıcı sınırlarıyla uyumu henüz doğrulanmadı.
- **Başarı:** 1/3/5/10/15/30/60 dakika gözlemleri, olumlu/olumsuz hareket, hedef zamanı, başarısız/bekleyen/yetersiz veri ayrımı; ayarların sinyal anında kopyası; haftalık arşiv. Aynı aktif sinyal tekrar örnek sayılmıyor. Aynı zaman damgalı kayıtlar bileşik cursor ile kaybolmadan sayfalanıyor.
- **Maliyet:** Komisyon ve kayma yön başına ayrı; spread ayrı alan. Canlı net sonuç, giriş spreadinin iki yönde kullanıldığı tahmini modeldir; gerçekleşmiş dolum maliyeti değildir. Eksik spread sıfır yapılmaz.
- **Backtest aracı:** Geçmiş kapalı veriyle replay, zaman sıralı %60/%20/%20 dönemler, sınır aşan sonuç pencerelerinin temizlenmesi, likidite eksikse net sonuç vermeme. Kaynak bilgisi zorunlu; araç dosya özgünlüğünü doğrulayamaz. Gerçek veriyle başarı raporu üretilmedi.
- **Panel:** Türkçe koyu tema, mobil yerleşim, kategori/parite filtresi ve sıralama, gerçek gözlemler için boşluklu çizgi grafik, geçmiş/haftalık rapor/sistem sağlığı/strateji ayarları. Eksik veri ana listeyi doldurmuyor.
- **Alarmlar:** Çoklu teyitte tekil bildirim kaydı, tarayıcı izniyle oturum içi bildirim ve kullanıcı etkileşiminden sonra ses; eski kayıtları tekrar alarm yapmayan istemci tekilleştirmesi. 7/24 arka plan teslimi iddiası yok.
- **Güvenlik:** Özel dosyaların HTTP'den ayrılması, girdi sınırları, CSRF ve yerel Host kontrolü, ters proxy üzerinden yönetici yetkisinin kapatılması, CSP/nosniff, güvenli DOM metin yazımı, hata metni sadeleştirme, anahtarsız salt okunur tasarım ve paket kilidi.
- **İşletim:** Kurulum/yayınlama belgesi, Node 24 için Pro CI iş akışı, güncel bulut kurulum ve başlatma taslağı. Dış CI çalıştırılmadı; yerel komutları doğrulandı.

## Test ve ölçüm kanıtı

| Kontrol | Sonuç |
|---|---|
| `npm run test:pro` | **29 geçti, 0 başarısız, 0 atlandı** |
| Yerel WebSocket testi | Gerçek yerel handshake ve fixture trade aktarımı geçti; Binance TR testi değildir |
| `npm run test:pro:ui` | Chromium masaüstü ve 393×851 mobil: boş durum, ayar kaydı, kategori/arama, grafik, yatay taşma kontrolü geçti; konsol hatası yok |
| `npm run test:ultimate` | **24 geçti, 0 başarısız** |
| Eski kök ve `tests/` testleri | **73 geçti, 2 başarısız**; aşağıdaki başlangıç kusurları devam ediyor |
| `npm audit` | Üretim ve geliştirme bağımlılıklarında raporlanan **0 açık**; tarama tarihine ait sonuç |
| Çalışan eski panel | Ana sayfa/durum API HTTP 200; `app.js` 200; `server.js` ve `package.json` 404 |
| Çalışan Pro panel | Ana sayfa/durum/geçmiş HTTP 200; `adapterEnabled:false`, 0 gerçek işlem, 0 canlı sinyal |

Eski başarısız testler:

1. `daily-touch-model.test.js`: günlük `DAY_MS`, `TOUCH_RULES`, `analyzeDailyTouch`, `closedDailyCandles` API'si bekleniyor; güncel modül dakika tabanlı `dailyContact` sağlıyor. Hangi eski günlük davranışın korunacağı belirlenmeden strateji geri yüklenmedi veya test silinmedi.
2. `daily-touch-markets.test.js`: `for(const market of all)` metni bekleniyor; güncel kod sıralı evren üzerinde işçi havuzu kullanıyor. Mevcut stratejinin eşikleri değiştirilerek test yeşile çevrilmedi.

Son sentetik yük testi: **1.000 parite, 224,52 ms tarama, yaklaşık 162 MiB süreç RSS**. Bu tek makinede test fixture ölçümüdür; canlı Binance TR gecikmesi, internet performansı veya kapasite garantisi değildir. Önce/sonra eşdeğer bir canlı ölçüm olmadığından yüzde performans kazancı iddiası yoktur. Çalışma anında son tarama süresi, son 300 örneğin P95'i, istek/hata sayısı, trade gecikmesi ve RSS API'de ölçülür. Canlı veri gecikmesi **ölçülemedi**.

## Resmî belge ve 403 teşhisi

Kullanıcı resmî belge adresini sağladı: **https://www.binance.tr/apidocs/**.

Güvenli proxy üzerinden gözlenen aşama:

```text
CONNECT www.binance.tr:443 HTTP/1.1
HTTP/1.1 403 Forbidden
server: envoy
CONNECT tunnel failed, response 403
Alınan belge: 0 byte
```

Güncel ortam durumu `observations_current:true`, ağ `restricted/enforced`, etkin özel alan adları `[]`; `www.binance.tr` etkin izinler arasında yok. Bu istek **Binance TR'ye TLS kurulmadan bulut proxy'sinde reddedildi**. Dolayısıyla bu 403, Binance TR'nin kullanıcı hesabını veya sunucu IP'sini engellediğini kanıtlamaz. Mevcut WebSocket adresi denemesi de 403 aldı ve hiç işlem gelmedi. VPN, doğrudan ağ, alternatif host veya Binance Global üzerinden engel aşılmadı; TLS doğrulaması değiştirilmedi.

| Adres | Kanıt durumu |
|---|---|
| `www.binance.tr/apidocs/` | Kullanıcının resmî belge adresi; içerik proxy engeli nedeniyle okunamadı |
| `www.binance.tr/open/v1/common/symbols` | Eski depoda var; güncel resmî destek ve şema doğrulanmadı |
| `api.binance.me/api/v1/*` | Eski depoda var; ping/mum/depth sözleşmesi güncel belgeyle doğrulanmadı |
| `cloudme-tr.2meta.app/api/v1/*` | Eski ikinci piyasa yönlendirmesi; güncel destek doğrulanmadı |
| `stream-cloud.binance.tr` | Eski depoda var; deneme 403, resmî abonelik ve limit sözleşmesi doğrulanmadı |

Bu adresler **doğrulanmış resmî API listesi değildir**. Pro'nun üretim adaptörü bu yüzden kapalı tutuluyor. Yeni Pro veri kaynağı Binance Global ile karıştırılmadı; eski uygulamanın açıkça ayrı borsa etiketli mevcut modülleri korundu.

Bulut taslağına önceki alan adları korunarak `stream-cloud.binance.tr` eklendi. `install_script` kilitli `npm ci` için, `start_skill` iki uygulama, SQLite, testler ve bağlantı doğrulama koşulu için güncellendi. Taslak kaydı doğrulandı ve `requires_publish:true` döndü. Bu, çalışma anında ağ izninin etkinleştirildiği veya ortamın yayımlandığı anlamına gelmez.

## Değişen dosyalar ve geri dönüş

İlk geri dönüş kaydı: `d51da8e` (başlangıç uygulama içeriğini koruyan checkpoint). Sonraki uygulama/test/düzeltme aşamaları ayrı yerel Git commit'lerine alındı. Çalışmanın final commit'i `git log` ile görülebilir. Geri dönüş gerekiyorsa commit'ler üzerinde `git revert` kullanın; kullanıcı veritabanını silmeyin. Bu commit'ler GitHub'a gönderilmedi.

- `.gitignore`, `package.json`, `package-lock.json`, `README.md`
- `server.js`: yalnız statik sunucu middleware'i değişti
- `.github/workflows/pro-tests.yml`
- `pro/config.js`, `candles.js`, `analysis.js`, `provider.js`, `engine.js`, `history.js`, `backtest.js`, `server.js`, `legacy-static.js`
- `pro/public/index.html`, `style.css`, `app.js`, `config.js`
- `pro/tests/helpers.js`, `model.test.js`, `provider.test.js`, `history.test.js`, `integration.test.js`, `backtest.test.js`, `browser.mjs`
- `pro/README.md`, `docs/TRADERADAR_PRO_RAPORU.md`

Çalışma çıktıları ve SQLite deposu Git'e alınmadı. Tarayıcı ekran görüntüleri test sırasında `/tmp` altında üretildi; sentetik masaüstü fixture'ı gerçek piyasa görüntüsü olarak sunulmadı.

## Devam eden işler ve yayın ön koşulları

1. **Dış engel:** Ortam ayarlarında ağ taslağını inceleyip kaydetmek ve ortamı yayımlamak. Ardından aynı resmî belge isteğini tekrar denemek. Aynı kısıt dururken değişmeyen istekleri tekrarlamak çözüm değildir.
2. Belgeden gerçek REST/WebSocket base URL'lerini, aktif spot alanlarını, piyasa türlerini ve limitleri doğrulamak; geçici adaptörü buna göre düzeltmek. Şu anda resmî uç noktaların doğrulandığı iddia edilemez.
3. Salt okunur katalog/mum/defter ve gerçek trade stream smoke testleri; kaynak kimliği, zaman damgaları, yinelenen işlemler, eksik veri, 300 saniye ısınma, yeniden bağlantı ve bütün parite kapsamasını canlı test etmek. Başarılı olmadan adaptörü açmamak.
4. Doğrulanmış trade replay/backfill; type 3 işlem akışı desteği, yoğun akışta olay zamanı/geç gelen veri doğruluğu ve gerçek sağlayıcı ağırlık limitleri hâlâ eksik. Veri yoksa kullanılabilirlik kapalı kalır.
5. Gerçek tarihsel veri toplamak; farklı rejimler, çok pencereli ileriye doğrulama, likidite etkisi, istatistiksel bağımsızlık, aşırı uyum ve kalibrasyonu bağımsız test etmek. Mevcut replay aracı bu araştırmanın tamamlandığı anlamına gelmez.
6. Uzak yönetici kimlik doğrulaması, arka plan push teslimi ve gözlem altyapısı sonraki işlerdir. Mevcut ayar değişimi yerel yöneticiyle sınırlıdır; ses/izinli bildirim açık tarayıcı oturumuna bağlıdır.
7. Eski günlük/dakika test uyuşmazlığını istenen eski stratejiyi netleştirerek çözmek. Eski davranışı varsayarak değiştirmek yerine iki hata görünür bırakıldı.
8. HTTPS sunucu, kalıcı SQLite diski, yedek/geri yükleme ve yeniden başlatma testi. GitHub Pages backend çalıştırmaz; ücretsiz uyuyan sunucular sürekli tarama ve kalıcı geçmiş garantisi vermez. Windows/Android tarayıcı arayüzü test edildi; Android APK ve gerçek cihaz arka plan davranışı test edilmedi.

Kapsamlı talimattaki bütün araştırma, canlı entegrasyon ve üretim işletimi tamamlanmış gibi gösterilmemiştir. Ayrıntılı kullanım ve yayın adımları `pro/README.md` içindedir.
