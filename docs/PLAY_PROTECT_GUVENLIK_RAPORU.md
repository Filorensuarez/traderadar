# Play Protect güvenlik incelemesi — 31 Ekim 2026

## Sonuç ve kanıt sınırı

**Play Protect uyarısının kesin nedeni belirlenemedi.** Engellenen APK dosyası, SHA-256 değeri, imzalayan sertifika ve ilgili Actions run kimliği mevcut değil; bu dosya mevcut kaynaklarla eşleştirilemedi. Bu sohbette yeni APK'nın başarıyla oluşturulduğu doğrulanmış değildi. Dolayısıyla engellenen APK'nın bu commit'lerden derlendiği, temiz olduğu, zararlı olduğu veya yanlış pozitif olduğu sonucuna varılamaz.

Mevcut Android kaynakları, manifest, yerel panel, native köprü, servis, bağımlılık beyanları ve derleme/imzalama akışı incelendi. İncelenen uygulama kaynaklarında SMS/rehber/konum toplama, accessibility hizmeti, dinamik DEX/native kod indirme, shell çalıştırma veya APK kurdurma yolu saptanmadı. **Bu kaynak incelemesi, sağlanmayan APK üzerinde malware taraması yapıldığı anlamına gelmez.** Google'ın sınıflandırması kaynak incelemesinden tek başına çıkarılamaz.

Play Protect veya güvenli tarama kapatılmadı; paket kimliği değiştirilerek, sertifika döndürerek ya da koruma uyarısı atlatılarak çözüm aranmadı. `com.traderadar.pro` uygulama kimliği korundu. Normal güvenlik güncellemesi için versionCode 4 kullanılıyor. İmzayı veya sürümü değiştirmek Play Protect kararının düzeleceğini garanti etmez.

## İzin denetimi

| İzin | İşlev / karar |
|---|---|
| INTERNET | Yalnız doğrulanmış piyasa verisi ve kullanıcı başlatmalı resmî belge kontrolü için gerekli; korundu |
| POST_NOTIFICATIONS | Kalıcı tarama ve sinyal bildirimi; Android 13+ kullanıcı izni; korundu |
| FOREGROUND_SERVICE | Kullanıcı başlatmalı Android hizmeti; korundu |
| FOREGROUND_SERVICE_DATA_SYNC | Android 14+ doğru hizmet türü izni; korundu |
| WAKE_LOCK | İstenen ekran kapalı oturum için süreli kısmi CPU kilidi; korundu; pil etkisi cihazda ölçülmedi |

Bu beş iznin kaynakta tanımlı işlevi var; yalnız uyarıyı azaltmak amacıyla işlevi bozacak şekilde silinmedi. Gereksiz SMS/kişiler/konum/depolama, paket yükleme, tüm paketleri sorgulama, overlay, boot veya erişilebilirlik izni bulunmadı. Yeni izin eklenmedi. Artık CI, **derlenmiş birleşmiş manifestte** bu izin listesinin dışına çıkılırsa artifact öncesinde hata verecek; kaynak manifesti tek başına yeterli kanıt sayılmıyor.

## Somut risk alanları ve düzeltmeler

1. **Genel JavaScript–Java nesne köprüsü:** Önceki `addJavascriptInterface` zaten yerel içerikle sınırlıydı; dış saldırganın eriştiği kanıtlanmadı. Yine de frame'lere genel native nesne açma yüzeyini kaldırmak için SDK `WebMessagePort` kullanıldı. Port yalnız sabit yerel ana sayfa origin'ine aktarılır; gezinmede/yok edilmede kapatılır. Request ID, yöntem, boyut, eşzamanlı istek ve timeout sınırları var. Bu değişiklik ek Android kütüphanesi getirmedi.
2. **Yerel URL doğrulaması:** Scheme/host/port/userinfo/path/query kontrolleri tek saf Java politikada toplandı. Yalnız beş sabit dosya ve izinli sayfa içi bağlantılar kabul edilir; keyfî URL/POST/encoded path/alternatif port/remote frame reddedilir.
3. **Kullanılmayan uzak WebView:** Eski Railway WebView kabuğu yeni launcher tarafından kullanılmıyordu fakat APK kaynak alanında kalıyordu. `android/legacy/MainActivity.kt` altına taşındı ve manifestten çıkarıldı; kaynak tarihi korunurken yeni APK'ya derlenmez. Bu kodun zararlı olduğu iddia edilmiyor. Depodaki eski `android/index.html` de APK asset allowlist'inde değildir.
4. **WebView güvenliği:** Güvenli tarama açık; WebView debugging kapalı; cookie/third-party cookie, dosya/içerik/universal file erişimi ve otomatik pencere kapalı. TLS hataları iptal edilir, `proceed()` kullanılmaz. Yerel CSP remote bağlantı/frame/object'i kapatır; MIME ve no-store başlıkları eklenir. JavaScript yalnız mevcut panel için açık kalır; veri metinleri textContent ile yazılır.
5. **Ağ güvenliği:** Cleartext kapalı, network-security-config yalnız sistem trust anchor'larını kullanır. Kullanıcı sertifikaları veya TLS doğrulamasını gevşeten TrustManager/HostnameVerifier eklenmedi. Native katmanda yalnız resmî belge adresi bulunur; canlı adaptör hâlâ kapalıdır. Binance Global fallback'i yoktur.
6. **Paket kanıtı eksikliği:** CI APK hash'i, commit/run, sertifika SHA/fingerprint çıktısı, çözümlenmiş bağımlılık raporu ve birleşmiş manifest üretir. Paketlenmiş beş UI dosyasının hash'i checkout kaynağıyla karşılaştırılır. Beklenmeyen asset/component/izin, duplicate ZIP, native .so veya private keystore/credential dosyası bulunursa artifact adımı durur. Bu politika kontrolü bir antivirüs değildir.

## Foreground Service incelemesi

Hizmet exported değil, yalnız kullanıcı Başlat isteği ve doğrulanmış kaynak kapısıyla açılıyor. Boot receiver yok; `START_NOT_STICKY`. Durdur, oturum/timer/wakelock kapatma yollarını içeriyor. Android 13 bildirim izni hem girişte hem sinyal gönderiminden önce kontrol edilir. Android 14 dataSync izni ve Android 15 süre aşımı yolu var. Wakelock süreli ve durdurmada bırakılır; otomatik pil muafiyeti istenmez.

Bunlar kaynak ve platformdan bağımsız lifecycle testleridir. Android framework, ekran kapalı gerçek kullanım, üretici kısıtları, pil ve bildirim davranışı cihazda doğrulanmadı. Foreground Service/WAKE_LOCK izinlerinin varlığı tek başına zararlı davranış veya bu uyarının nedeni değildir.

## Bağımlılıklar ve imzalama

Android build AGP 8.7.3/Kotlin 2.0.21/Gradle 8.9, Java 17, SDK/target 35 kullanır. Açık Android implementation/api ile eklenmiş reklam/analitik kütüphanesi yok; Kotlin stdlib gibi otomatik/transitif bağımlılıklar gerçek CI dependency raporuyla incelenmelidir. Yeni mesaj kanalı platform SDK'sını kullanır; yeni dış Android bağımlılığı eklenmedi. Node bağımlılıkları kilitlidir ve APK'ya node_modules paketlenmez. Güncel `npm audit` denemesi HTTP 403 nedeniyle tamamlanmadı; güncel CVE temizliği iddia edilmiyor. Gradle transitif graph/CVE analizi bu ortamda SDK/indirilebilir araçlar olmadığı için tamamlanamadı. Actions sürüm etiketlerinin doğrulanmış commit SHA'larına sabitlenmesi de GitHub kaynağına erişim sağlanınca ayrıca değerlendirilmelidir; SHA uydurulmadı.

Önceki debug derlemesi varsayılan test sertifikasına dayanıyordu; temiz runner'larda debug anahtarı değişebilir. Bu dağıtım kimliği açısından sınırlamadır, malware tespiti kanıtı değildir. `apksigner verify` yalnız imzanın tutarlılığını doğrular; güvenilir geliştirici, zararsız uygulama veya Play Protect onayı göstermez.

Workflow'a elle seçilebilen **release** yolu eklendi: non-debuggable APK, sahibinin korunan sabit anahtarıyla Android SDK apksigner kullanılarak build'den sonra imzalanır. Gradle build adımına signing secret verilmez. Keystore yalnız signing adımında private geçici dosyaya yazılır ve trap/always temizliğiyle silinir; artifact'e konmaz. Gerekli GitHub repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Bunlar chat'e veya kaynak koduna yazılmamalı; mevcut anahtar varsa korunmalı. Secret'ların GitHub'da varlığı bu ortamdan doğrulanamadı; eksikse release açık hata ile durur. Yeni geçici anahtar üretip uyarıyı atlatma yolu eklenmedi. Yerel release build için isteğe bağlı env signing config vardır; private değerler kaynakta bulunmaz.

## Gerçekten çalıştırılan testler

| Kontrol | Sonuç |
|---|---|
| Native core/parity/lifecycle | **1.479 assertion geçti**: önceki 1.458 + 21 yerel URL politikası kontrolü |
| Pro | **33/33 geçti**: önceki testler + native mesaj kanalı güvenlik kontrolleri |
| APK politika unit testleri | **5/5 geçti**: izin/component/asset/debuggable/private dosya ve duplicate kontrolleri; fixture testidir |
| Chromium mobil/masaüstü | Geçti; port capability fixture, filtre/ayar/grafik ve backend izolasyonu; Android WebView testi değil |
| YAML/XML/JS/shell ve diff kontrolü | Geçti |
| npm CVE yenilemesi | **Tamamlanamadı: HTTP 403**; temiz raporu yok |
| Android build/lint/apksigner ve gerçek APK taraması | **Çalıştırılamadı**; derlenmiş yeni APK yok |
| Play Protect yeniden değerlendirme / gerçek cihaz | **Yapılmadı** |

Tarama formülü, eşik/config, NativeScanModel ve NativeOutcome dosyalarının önceki kaynakla değişmediği ayrıca kontrol edildi. Sahte fiyat/sinyal üretilmedi.

## Actions ve kalan engel

GitHub Git erişimi CONNECT 403, Actions API erişimi Forbidden vermeye devam etti. Bu nedenle engellenen APK'nın önceki run'ı okunamadı, yeni Actions build tetiklenemedi. Düzeltmeler `codex/android-debug-apk` dalında hazırlandı. Mevcut ağ taslağındaki GitHub/Gradle izinleri çalışma ortamına uygulanmadan push ve gerçek build mümkün değil. Bir APK artifact'i veya Play Protect onayı uydurulmadı.

Erişim sağlandıktan sonra Android build iş akışı `variant=debug` veya korunan anahtarlar hazırsa `variant=release` ile çalıştırılır. Başarılı run'da `traderadar-android-debug-apk` veya `traderadar-android-release-apk` artifact'i APK/hash/sertifika/paket denetim raporunu içerir. Bunlar önce engellenen APK'nın kimliğiyle karşılaştırılmalı, gerçek cihaz ve Play Protect kontrolü ayrıca yapılmalıdır.

Somut binary/sertifika/dağıtım zinciri incelendikten sonra hâlâ yanlış pozitif şüphesi varsa Google'ın resmî Play Protect itiraz/inceleme kanalı kullanılabilir: https://support.google.com/googleplay/android-developer/contact/protectappeals . Bu çalışmada Google'a dosya veya veri gönderilmedi ve karar verilmedi. Korumanın kapatılması veya engellenen kurulumun zorlanması çözüm değildir.
