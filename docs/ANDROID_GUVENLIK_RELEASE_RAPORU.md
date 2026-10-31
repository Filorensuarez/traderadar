# Android güvenlik / debug-release sonuç raporu

Tarih: 31 Ekim 2026, Europe/Istanbul. Bu rapor gerçek CI sonuçları ile eksik kalan işlemleri ayırır; kurulum veya Play Protect onayı vermez.

## GitHub aktarımı

- Güvenlik commit'i `91128ab3a9dc20ef337e5edfb4ab864b4202bc62` GitHub API üzerinden doğrulandı.
- `codex/android-debug-apk` dalı GitHub'da mevcut; önceki başarılı build `ab5bc81` kaynaklıydı. Bu aşamanın CI/bağımlılık/test planı commit'i `053ccfa73c05f0e06906a798ee3f2ca497165443` de gönderildi.
- `main` değiştirilmedi. Kaynaklar, kullanıcı geçmiş dosyası ve önceki commit'ler korundu. Tarama/config, JavaScript analiz modeli, NativeScanModel ve NativeOutcome önceki güvenlik sürümüyle değişmedi.

## Debug — tamamlandı

[Gerçek başarılı Actions run'ı](https://github.com/Filorensuarez/traderadar/actions/runs/41209731361)

[traderadar-android-debug-apk artifact'i](https://github.com/Filorensuarez/traderadar/actions/runs/41209731361/artifacts/13045558040)

- APK: `app-debug.apk`, 865.289 bayt.
- Commit: `053ccfa73c05f0e06906a798ee3f2ca497165443`.
- Tür: **debug**, `debuggable=true`, anahtar algoritması **RSA**. Release/Play Store paketi değildir.
- APK SHA-256: `d1e6fb50403e9e89493dbb908d0626403bd17a2a24739406c7b00452653e7798`.
- İmzalayan sertifika SHA-256: `f5910a23b940272bf75d58109adc576c663609948ae0eefdc7e0c157ea97a3f3`.
- Artifact ZIP SHA-256 (APK hash'inden farklıdır): `12d0c9367796c3a3523c82ce83bc6414d531d3aa5376f9b1ad004c3833fbdcb5`.
- Derleme, lint, Wrapper/dağıtım SHA kontrolü, apksigner, gerçek birleşmiş manifest ve paketlenmiş UI kaynağı denetimleri CI'da geçti. Native parity/lifecycle, Pro regresyon ve dokuz Python güvenlik testi adımları geçti. Bu sonuçlar gerçek cihaz testinin yerine geçmez.

Bu değerler gerçek runner çıktılarından GitHub Checks/Artifacts API metadata'sıyla alındı. Buluttan artifact binary indirme alan adları etkin izinlerde olmadığından burada APK yeniden indirilip hash'i hesaplanmadı. Tam sertifika DN ve imza çıktısı `apk-signature.log`, metadata `android-build-info.json` içinde artifact'tedir. Private key veya parola alınmadı/paylaşılmadı. Yeni debug sertifikasının önceki run'dan farklı olması debug anahtarının dağıtım kimliği olarak kullanılmaması gerektiğini gösterir; bu, önceki Play Protect uyarısının nedenini açıklamaz.

## Release — güvenli ön koşulda engelli

[Gerçek release denemesi](https://github.com/Filorensuarez/traderadar/actions/runs/41209731819)

Çalışma `Check release signing bindings without reading values` adımında durdu. Gerçek CI annotation'ı, bu workflow bağlamında şu dört gereksinimin eksik olduğunu bildirdi:

1. `ANDROID_KEYSTORE_BASE64`
2. `ANDROID_KEYSTORE_PASSWORD`
3. `ANDROID_KEY_ALIAS`
4. `ANDROID_KEY_PASSWORD`

GitHub repository ve mevcut production environment secret metadata'sını okuma denemeleri integration yetki hatası aldı. Bu yüzden **bütün depoda hiç secret yok** sonucuna varılmadı. Somut bulgu, mevcut release workflow'una gereken bağların verilmemiş olmasıdır. Yerel execution ortamında da bu signing değişkenleri bulunmadı. Release APK, release hash'i veya sahibi doğrulanmış bir release sertifikası **oluşmadı**.

Hazırlanan yöntem: non-debuggable release, sahibinin kalıcı private keystore'u, GitHub Actions secret bağları, build bittikten sonra yalnız signing adımında geçici mode-0600 dosya, parolaların komut satırında açık değer yerine env adından SDK apksigner'a verilmesi, trap/always temizliği ve imza/paket kontrolleri. Gradle build adımına private signing değerleri verilmez. Anahtar/parola kaynak veya artifact'e eklenmez. Geçici test anahtarı üretilerek release tamamlanmış gibi gösterilmedi.

Sahibinin yapması gereken: varsa mevcut kalıcı anahtarı koruyarak [repository Actions secrets](https://github.com/Filorensuarez/traderadar/settings/secrets/actions) alanında bu adlarla güvenli bağlama yapmak. Secret'lar başka environment'taysa sahibinin bu environment'ı workflow'a doğru bağlaması gerekir; onları chat'e veya kaynak koduna taşımayın. Base64 şifreleme değildir; yalnız secret kanalında tutulmalıdır. Anahtar yoksa güvenli oluşturma, yedekleme ve sahiplik planı gerekir; bu çalışmada yeni bir signing kimliği oluşturulmadı.

Bağlar hazır olduğunda **Actions → Android build → Run workflow → `codex/android-debug-apk` → variant `release`** seçilir. Runtime/Node güvenlik kontrolleri tamamlanmaz veya release için engelleyici bulgu çıkarsa akış artifact üretmeden durur. İmzalama ve tüm kontroller geçerse artifact adı `traderadar-android-release-apk` olur. Bu ad şu anda var olan bir release artifact'ini ifade etmez.

## Debug ve release ayrımı / CI tedarik zinciri

İki varyant artık ayrı concurrency grubundadır; biri diğerini iptal etmez ve run/job adları varyantı gösterir. Artifact'ler farklı adlardadır. Release secret gereksinimleri masraflı kurulum/derlemeden önce, değerleri ifşa etmeden kontrol edilir. Debug secret kullanmaz. Release kullanıcı seçimiyle dispatch edilir.

Android workflow action referansları resmî GitHub ref metadata'sından doğrulanan commit SHA'larına sabitlendi. Gradle v4 → v4.4.3 tag zincirinin GitHub imza doğrulaması da okundu. Deprecated setup-java v4, resmî v5 commit'ine taşındı; Java 17 / Gradle 8.9 / AGP 8.7.3 / Kotlin 2.0.21 / SDK 35 proje uyumu korundu. Diğer bazı v4 action'ların Node20-deprecation uyarısı CI'da kalıyor; hosted runner bunları Node24 ile çalıştırdı ve build geçti. Tüm araçların en güncel veya CVE'siz olduğu iddia edilmez.

## Gerçek APK izinleri

CI tarafından birleşmiş APK manifestinden okunan liste tam olarak beş izindir:

| İzin | Gerekçe |
|---|---|
| INTERNET | Doğrulanmış kaynak erişimi / kullanıcı başlatmalı resmî belge kontrolü |
| POST_NOTIFICATIONS | Tarama ve sinyal bildirimi; Android 13+ runtime izin |
| FOREGROUND_SERVICE | Kullanıcı başlatmalı hizmet |
| FOREGROUND_SERVICE_DATA_SYNC | Android 14+ dataSync türü |
| WAKE_LOCK | İstenen ekran kapalı oturum için süreli kısmi kilit |

SMS/rehber/konum/erişilebilirlik/depolama/APK kurdurma/boot izni listede yok. Yeni izin eklenmedi. Bunlar tek başlarına malware veya Play Protect sınıflandırmasının nedeni değildir. Paket denetimi beklenmeyen izin/component/asset/private dosya/native kütüphane ve duplicate girişleri reddeder.

## Bağımlılık güvenlik kontrolleri

- Gradle yeni rapor task'ı gerçek çözümlenmiş **APK runtime Maven artifact** kimlik/sürümlerini ve SHA-256'larını çıkarır. Tahminî sürüm kullanılmaz.
- Debug CI'da OSV batch sorgusu **iki runtime bağımlılığı, sıfır bilinen bulgu** raporladı. Sorguya yalnız public Maven ad/sürüm metadata'sı gönderilir; APK, kaynak kodu veya private key gönderilmez.
- npm audit, **Node sunucu/build bağımlılıklarında sıfır bulgu** bildirdi. Bu Android runtime taraması değildir.
- `android-runtime-dependencies.json`, `android-dependency-audit.json`, `npm-audit.json` artifact'e eklendi. Release, runtime sorgusu tamamlanamaz/bulgu çıkarsa; Node audit tamamlanamaz veya high/critical çıkarsa durur. Debug, inceleme paketi olduğundan eksik/bulgu durumunu temiz saymadan raporlar.
- OSV query/result kapsam ve eksik yanıt testleri dahil dokuz Python testi yerelde geçti; gerçek CI güvenlik testi adımı da geçti. Yalnız kaynak ve şema testine dayanarak temiz rapor uydurulmaz.
- Kapsam: bilinen advisory kayıtları ve sürüm eşleşmeleri. Gradle dağıtımı, JDK/OS, AGP/Kotlin build-tool transitif graph'ının tamamı, malware, davranış analizi ve Play Protect kapsam dışıdır. Sıfır bilinen bulgu güvenli/zararsız APK kanıtı değildir.

## Play Protect — kesin neden hâlâ bilinmiyor

Engellenen önceki APK'nın hash'i, sertifikası, gerçek binary'si ve Google değerlendirme ayrıntıları sağlanmadığından kaynakla eşleştirme yapılamadı. Debug imzası, foreground izinleri veya yeni imza tek başına bu uyarıyı açıklamaz. Önceki uyarı yanlış pozitif olarak ilan edilmedi. Güvenlik kontrolleri kapatılmadı, paket adı/anahtar döndürmeyle uyarı aşılmadı ve Google'a otomatik dosya gönderilmedi.

Sertifika, kaynak ve dağıtım zinciri eşleştirildikten sonra gerekirse Google'ın resmî Play Protect inceleme/itiraz kanalı kullanılabilir. Yeni APK için henüz gerçek cihaz veya Play Protect onayı yoktur; kurulum önerisi verilmez.

## Binance TR — ayrı doğrulama

`https://www.binance.tr/apidocs/` yeniden test edildi: proxy CONNECT **200**, ardından HTTP **451**, CloudFront `Error` ve `/not-support`. Önceki GitHub CONNECT 403'üyle aynı aşama değildir. Güncel resmî REST/WebSocket sözleşmesi hâlâ okunup doğrulanamadı; Android telefon erişimi ayrı test edilmelidir.

`OfficialSource.createVerifiedSession()` null ve `isConfigured()` false kaldı. Gerçek trade alınmadı, doğrulanmamış endpoint veya Binance Global verisi kullanılmadı, sahte sinyal üretilmedi. Bu yalnız bir erişim sorunu değil; doğrulanmış sözleşmeye dayalı native canlı adapter implementasyonu da henüz tamamlanmamış durumdadır.

## Gerçek cihaz test planı ve eksikler

[Android cihaz test planı](ANDROID_CIHAZ_TEST_PLANI.md) hazırlandı ve aynı dalda GitHub'a gönderildi. APK hash/imza kaydı; Play Protect engelinde durma; yerel panel; başlangıçta otomatik tarama olmaması; izin kabul/ret; native köprü; ağ kaybı; ekran kapalı/başka uygulama; kalıcı bildirim/Stop; Android 15 süre sınırı; wakelock/pil/ısı; hafta ve yedi sonuç penceresi içerir.

**Çalıştırılmayanlar:** gerçek cihaz kurulum/Android WebView, foreground bildirim ve ekran kapalı canlı çalışma, pil/ısı ölçümü, Play Protect yeniden değerlendirmesi. Doğrulanmış kaynak olmadığı için planın canlı veri gerektiren B grubu engellidir. Test etmek için kaynak kilidini kaldırmak veya üretime fixture fiyatı vermek önerilmez.

Tamamlanan: GitHub kaynak doğrulaması, ayrı debug/release yolları, yeni debug APK, gerçek paket/hash/imza/izin kontrolleri, sınırlı bağımlılık taraması, test planı. Eksik: sahip tarafından signing bağlarının verilmesi ve gerçek signed release, Binance TR sözleşmesi/adapter/akış doğrulaması, eski Play Protect kararının kesin nedeni ve gerçek cihaz kabul testleri.
