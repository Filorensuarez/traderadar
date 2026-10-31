# TradeRadar Pro — native Android geliştirme sürümü

Güncel Play Protect kaynak denetimi ve sınırları: [güvenlik raporu](../docs/PLAY_PROTECT_GUVENLIK_RAPORU.md). Genel JavaScript interface, yerel ana-frame'e aktarılan WebMessagePort ile değiştirildi. Eski uzak WebView kabuğu artık `android/legacy/` altındadır ve APK'ya derlenmez. APK'nın temiz olduğu veya Play Protect onayı aldığı iddia edilmez; engellenen binary kimliği ve gerçek yeni build henüz doğrulanmadı.

Son talimat esas alındı: kullanıcı başlatmalı APK ve Android Foreground Service. Windows veya sürekli sunucu bağımlılığı yoktur. Önceki PWA planı son APK talimatıyla değiştirilmiştir.

**Durum:** Yerel motor, panel köprüsü ve hizmet kaynakları yazıldı. APK bu ortamda derlenemedi; Android framework derlemesi, kurulum ve gerçek cihaz testleri doğrulanmadı. Resmî Binance TR sözleşmesi doğrulanamadığından `OfficialSource.createVerifiedSession()` kapalıdır ve `null` döndürür. Başlat henüz canlı taramayı açamaz. Bu sürüm hazır/çalışan canlı APK olarak sunulmaz.

## Yeni mimari

- Mevcut Android projesi kullanılır: min SDK 26, compile/target SDK 35, AGP 8.7.3, Kotlin 2.0.21, Gradle 8.9. Yeni launcher `ProActivity`.
- `pro/public` mobil paneli build sırasında APK varlıklarına kopyalanır. WebView yalnız arayüzdür; motor Java'da, WebView'den bağımsızdır. Dış origin, dosya/cleartext erişimi ve keyfî URL çağrısı kapalıdır.
- `NativeScanModel` mevcut `pro/analysis.js` kurallarını taşır: 300 kapalı saniye/pencere öncesi 30 kapalı dakika, %2 eşik, hacim filtresi kapalı, EMA9/21, RSI14, MACD, momentum ve volatilite.
- `NativeOutcome` ve SQLite; yedi zaman aralığını, aynı hedef/maliyet formülünü ve İstanbul pazartesi hafta sınırını korur. Eksik veri başarısızlık yerine yetersiz veridir. Sunucudaki eski SQLite dosyası silinmez; yeni cihaz veritabanına otomatik aktarım yapılmaz.
- `ScanSessionController` kullanıcı isteği ve doğrulanmış REST/WS kapısını denetler. Durdur, taşıma oturumunu kapatır ve eski callback'leri reddeder.
- `ScanService` dataSync Foreground Service kaynağı; kalıcı bildirim, Stop aksiyonu, sınırlı kısmi wakelock ve Android 15 timeout yolunu içerir. `START_NOT_STICKY`; boot receiver, periyodik otomatik başlatma ve telefon yeniden açılınca tarama yoktur.
- Bildirim izni Android 13+ üzerinde istenir; ses Android bildirim kanalı ayarlarından yönetilir. Native sinyaller web ses/bildirim mekanizmasıyla çoğaltılmaz.

Bu bileşenlerin kaynakta bulunması Android'de çalıştıklarının doğrulandığı anlamına gelmez. Gerçek kaynak implementasyonu şu anda yoktur; yalnız kapalı sözleşme arayüzü vardır. Yeni native katmanda tahminî endpoint veya Binance Global fallback'i bulunmaz.

## Android sınırları

Activity kapanınca hizmeti durdurma yoktur; hizmet ancak kullanıcı başlatır ve Android izin verdiği ölçüde devam edebilir. Force-stop/üretici pil politikaları çalışmayı kesebilir. Android 15+, target 35 dataSync hizmetlerinde arka plan toplam süre kotası uygular (24 saatte genellikle 6 saat). `onTimeout` durdurma yolu vardır; farklı hizmet türü veya gizli yeniden başlatmayla kota aşılmaz.

Wakelock 10 dakika süreli alınır, etkin oturumda 9 dakikada bir yenilenir ve durdurmada bırakılır. Pil/ısı etkisi gerçek cihazda ölçülmelidir. Pil ayar ekranı sadece kullanıcının açık seçimiyle açılır; otomatik muafiyet alınmaz. Uygulama önceki hizmetin kesilmiş olabileceğini saklanan çalışma işaretiyle bildirir; otomatik yeniden başlatmaz.

Resmî platform referansları (bu ortamda ayrıca canlı okunmadı):

- https://developer.android.com/develop/background-work/services/fgs/service-types
- https://developer.android.com/develop/background-work/services/fgs/timeout
- https://developer.android.com/develop/ui/views/notifications/notification-permission

## Kaynak erişimi ve cihaz testi

Resmî belge: https://www.binance.tr/apidocs/ . Buluttaki son deneme CONNECT 200 ardından HTTP 451 ve CloudFront `/not-support` döndürdü. Eski WebSocket adayı bulut izinlerinde bulunmuyordu ve CONNECT 403 aldı; resmî destek doğrulanmadığından yeni native kaynakta kullanılmadı.

APK derlenip kurulduğunda ProActivity'nin belge kontrol düğmesi bu adresi **Android cihazından** HTTPS ile test edecek şekilde yazıldı. Redirect otomatik izlenmez, TLS kontrolü kapatılmaz. Bu yalnız belge erişim testidir; HTTP 200 REST/WS doğrulaması değildir. Kod gerçek telefonda henüz çalıştırılmadı. Buluttaki 451 telefonun aynı yanıtı alacağını kanıtlamaz.

Canlı adaptör için erişilebilir resmî belge ve cihazdan gerçek salt okunur REST/WS gözlemleri; host/path/aktif spot/trade/mum/defter şeması, abonelik ve hız limitleri doğrulanmalıdır. Sadece bir ayar veya boolean ile doğrulamayı atlama seçeneği yoktur.

## Test ve APK

Güncel Actions/Wrapper durumu ve Android telefondan indirme adımları: [APK Actions raporu](../docs/APK_ACTIONS_DERLEME_RAPORU.md). Wrapper jar'ı bu ortamda ağ engeli nedeniyle henüz alınamadı. Actions, Gradle 8.9 ile eksik Wrapper'ı üretip resmî SHA-256 değerleriyle doğrulamadan derlemeye geçmez. Yeni iş akışı `assembleDebug`, `lintDebug`, APK imzası ve paketlenmiş panel kontrolünü içerir; başarıyla çalıştığı henüz doğrulanmadı.

Depo kökünden `npm run test:android:core`, `npm run test:pro`, `npm run test:pro:ui` çalıştırılır. Native core komutu Node 24 ve JDK compiler modülüyle Java 17 dil/hedef seviyesinde çekirdeği derler ve mevcut JS modeliyle karşılaştırır. Android framework sınıflarını derlemez veya cihazı emüle etmez.

APK için tam JDK 17, Gradle 8.9, SDK/platform 35 ve build-tools 35.0.0 gerekir. `android/` içinde `gradle :app:assembleDebug --no-daemon --stacktrace` kullanılır. Beklenen çıktı `app/build/outputs/apk/debug/app-debug.apk`; **bu çalışma sırasında üretilmedi**. Debug APK test imzalıdır, Play Store yayını değildir.

Bu ortamda Gradle ve SDK yoktur; resmî `services.gradle.org` ve `dl.google.com` edinme testleri CONNECT 403 aldı. JDK compiler modülü bulunduğundan yalnız saf Java çekirdek testleri çalıştırılabildi. Derleme için gerekli resmî Gradle/Android/Maven hostları: `services.gradle.org`, `downloads.gradle.org`, `dl.google.com`, `maven.google.com`, `repo.maven.apache.org`, `plugins.gradle.org`, `plugins-artifacts.gradle.org`. Bu listenin tamamı denenmiş veya izin verilmiş değildir; resmî redirect hedefleri ayrıca doğrulanmalıdır. Güvenlik kısıtları aşılmadı.

Mevcut GitHub Actions Android build iş akışı native parity kontrolü ve UI paketlemesi için güncellendi. Push, CI tetikleme veya yayın yapılmadı. Önceki bir APK artifact'inin yeni kaynakları içerdiğini varsaymayın.

## Gerçek cihaz kabul testleri — henüz çalıştırılmadı

Kurulum; bildirim izni kabul/ret; foreground başlatma; ekran kapatma/başka uygulama; Durdur ile socket/timer/wakelock kapanması; Android 15 timeout; force-stop; yeniden başlatmada otomatik tarama olmaması; ağ kaybı/geri gelişi; gerçek trade ve 300 saniye ısınma; alarm tekilleştirme/ses; süreç öldürülünce sonuç boşlukları; uzun süreli CPU/pil/ısı/bellek. Bu kontroller yapılmadan arka plan taraması veya gerçek cihaz uyumu doğrulanmış sayılmaz.

## Önceki web kabuğu — tarihçe

Aşağıdaki eski kabuk açıklaması kaynak geçmişi içindir; yeni native sürümün derlendiği veya çalıştığına kanıt değildir.

TradeRadar'ın Android'de ayrı simgeyle açılan, adres çubuğu olmayan uygulama sürümüdür.

- Uygulama canlı sistemin HTTPS adresini Android WebView içinde çalıştırır.
- Android 8.0 (API 26) veya üzeri gerektirir.
- GitHub Actions, `.github/workflows/android-build.yml` ile otomatik **test/debug APK** derler.
- GitHub > Actions > Android build > ilgili çalıştırma > Artifacts > `traderadar-android-debug-apk` üzerinden indirilebilir.
- ZIP içinde `app-debug.apk` yer alır. Android'de yükleme iznini yalnızca güvenilir kaynaklar için verin.
- İnternet gerekir. Kripto API'si kaynaklı tarama sorunları native uygulamada da devam edebilir.
- Android WebView, normal Chrome'dan farklı olarak **Web Push bildirimlerini garanti etmez**. Bu sürüm arka planda bildirim garantisi vermez.
- APK debug anahtarıyla imzalı **test sürümüdür**, Google Play için imzalı yayın sürümü değildir.
- Google Play için üretim imzası, politika/gizlilik kontrolleri, kullanıcı testleri ve yayın yapılandırması ayrıca gerekir.

Alternatif: Android Chrome üzerinden https://traderadar-v3-production.up.railway.app/ adresini açıp **Uygulamayı Yükle** seçeneğini kullanarak PWA olarak yükleyebilirsiniz.
