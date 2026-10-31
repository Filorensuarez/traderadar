# APK / GitHub Actions raporu — 31 Ekim 2026

**Sonuç:** Derleme iş akışı ve Wrapper hazırlama yolu geliştirildi; GitHub'a push ağ proxy'sinde engellendi. Actions çalıştırılmadı, APK ve Actions artifact'i henüz oluşturulmadı. Bu rapor kurulabilir APK teslim edildiği iddiası taşımaz.

## Korunan çalışma

Önceki Android/Pro kaynakları, stratejiler ve hesaplamalar korundu; reset/force-push yapılmadı. Kullanıcının mevcut `daily-signal-history.json` dosyası değiştirilmedi ve commit'e alınmadı. Gönderim için ayrı yerel dal: **`codex/android-debug-apk`**. Pipeline kaynak commit'i: **`4c38030`**; son belge/yedek commit'i `git log` ile görülebilir.

## Sürümler

| Bileşen | Seçim |
|---|---|
| Runner | Ubuntu 24.04 |
| Java | Temurin 17 |
| Gradle | 8.9 |
| Android Gradle Plugin | 8.7.3 |
| Kotlin | 2.0.21 |
| Android compile/target | 35 / 35 |
| Build Tools | 35.0.0 |
| Minimum Android | API 26 |
| Node test ortamı | 24 |

Mevcut proje sürümleri değiştirilmedi; Actions bu sürümlere sabitlendi. Derleme iki worker ve mevcut 2 GiB Gradle heap ayarıyla çalışacak şekilde sınırlandı.

## İş akışı

`.github/workflows/android-build.yml`: elle dispatch, ilgili push veya PR ile çalışabilir. Sıra:

1. Checkout; Java 17 ve Node 24; kilitli `npm ci`.
2. Native model/parity ve Pro regresyon testleri; pipefail ile gerçek çıkış kodunu koruyan loglar.
3. `gradle/actions/setup-gradle@v4` ile Gradle 8.9.
4. `npm run prepare:android:wrapper`: Gradle'ın resmî servisinden dağıtım ve Wrapper SHA-256 değerlerini alır. Eksik Wrapper'ı Android eklentisine bağımlı olmayan geçici minimal projede Gradle 8.9 ile üretir; jar hash'ini doğrular, sonra dört standart dosyayı `android/` altına kopyalar. Hatalı hash veya erişim hatasında çalışmayı durdurur.
5. Gradle'ın Wrapper validation aksiyonu; SDK/platform 35 ve Build Tools 35.0.0 kurulumu.
6. `./gradlew --no-daemon --max-workers=2 --console=plain :app:assembleDebug :app:lintDebug --stacktrace`.
7. APK varlığı, `apksigner verify`, paketlenmiş yerel Pro UI kontrolü; APK SHA-256 ve commit/run bilgisi.
8. Başarılı APK, doğrulanmış Wrapper ve build diagnostics için ayrı Artifacts yüklemeleri.

Artifact adları:

- **`traderadar-android-debug-apk`**: ZIP kökünde `app-debug.apk` ve `android-build-info.json`; 30 gün saklama ayarı.
- **`traderadar-gradle-wrapper-8.9`**: SHA-256 doğrulamasından geçmiş tam dört Wrapper dosyası; hazırlık adımı gerçekten başarılıysa yüklenir.
- **`traderadar-android-build-diagnostics`**: test/build logları, lint/manifest raporları; hata olsa da mevcut dosyalar yüklenir.

Bu isimler henüz oluşmuş artifact'leri değil, yapılandırılmış çıktıları belirtir. APK adımı hataları yutmaz; başarısız veya eksik APK başarı gibi yayımlanmaz. Debug imzası üretim/Play Store imzası değildir.

## Wrapper durumu

Başlangıçta `gradlew`, `gradlew.bat`, Wrapper properties ve jar yoktu. Properties ile açık hata veren başlangıç launcher'ları eklendi. **Resmî `gradle-wrapper.jar` bu bulut makinesinde hâlâ yoktur.** Resmî dosya/checksum indirmesi 403 aldı; uydurma binary/hash eklenmedi.

Dolayısıyla yerel Wrapper'ın tam olduğu veya burada APK derlediği söylenemez. Workflow, güvenilir Gradle kurulumu olan Actions runner'ında eksikliği tamamlayacak şekilde hazırlandı. Ağ erişimi sağlanmış geliştirici ortamında da depo kökünde `npm run prepare:android:wrapper`, sonra `android/` içinde `./gradlew :app:assembleDebug :app:lintDebug` kullanılabilir. Başarıyla üretilen tam Wrapper'ın dört dosyası sonradan source control'e alınabilir; bu iş akışı repo yazma izni istemez ve kendiliğinden commit/push yapmaz.

## Tekrar çalıştırılan kontroller

- Native core: **1.458 assertion geçti**. Son JVM fixture yükü 1.000 analiz / 149,81 ms; Android pil veya arka plan testi değildir.
- Önceki **29 Pro testi geçti**; eklenen checksum/URL güvenlik testiyle güncel toplam **30/30**.
- Wrapper hazırlığının gerçek bulut denemesi bağlantı hatasıyla durdu; binary üretilmedi veya yürütülmedi.
- Workflow YAML, manifest XML, shell/JavaScript sözdizimi ve whitespace kontrolleri geçti. Bunlar Actions veya Android build kanıtı değildir.
- Gerçek Android derleme/lint hatası logu alınamadı; Actions henüz çalışmadığından derleme hatalarının giderildiği iddia edilmiyor.

## Android sürümü incelemesi

Kaynak incelemesinde API 26 kullanıcı başlatmalı foreground giriş yolu, API 29 dataSync türü, API 33 bildirim izni isteği, API 34 foreground dataSync manifest izni ve API 35 timeout callback'i bulunuyor. Servis exported değil; boot receiver yok ve `START_NOT_STICKY` kullanılıyor. Stop, oturum kapatma ve wakelock bırakma yollarını içeriyor.

Ek olarak sinyal bildirimi gönderilmeden önce API 33+ bildirim izni tekrar kontrol edilir; kullanıcı izni oturum sırasında geri çekmişse bildirim gönderilmez. Bunlar **kod incelemesi sonuçlarıdır**; framework lint/cihaz testi yapılmış gibi sunulmaz. Ekran kapalı çalışma, gerçek Android bildirimleri, durdurma, üretici pil kısıtları ve Android 15 süre kotası cihazda hâlâ doğrulanmalıdır.

## GitHub erişim engeli

Etkin bulut ağı restricted/enforced; yalnız `www.binance.tr` özel izni var. Gözlenen sonuçlar:

- `git ls-remote origin HEAD`: **CONNECT 403**.
- GitHub Actions workflow API okuması: **Forbidden**.
- `git push --set-upstream origin HEAD:refs/heads/codex/android-debug-apk`: **CONNECT 403**.

GitHub sunucusundan yazma yetkisini değerlendirecek yanıt alınamadı. Bu nedenle eksik token/yetki sonucu çıkarılmadı ve token istenmedi. Actions dispatch, log inceleme ve artifact indirme push ön koşulu sağlanamadığı için yapılmadı.

Mevcut `www.binance.tr` korunarak şu gerekli ek ağ izinleri **yalnız yeni yapılandırma taslağına** kaydedildi: `github.com`, `api.github.com`, `raw.githubusercontent.com`, `release-assets.githubusercontent.com`, `services.gradle.org`, `downloads.gradle.org`. Kaydetme sonucu doğrulandı; çalışma ağına uygulanmadı, ortam yayınlanmadı. Kullanıcı bu taslağı ortam ayarlarında kaydedip yayımladıktan sonra Git erişimi tekrar test edilmelidir. GitHub'a erişim açılması tek başına yazma veya workflow yetkisini kanıtlamaz; o aşamada gerçek işlem sonucu değerlendirilir.

## Binance TR — ayrı engel

Resmî `https://www.binance.tr/apidocs/` son testte proxy CONNECT 200 ardından **HTTP 451** ve CloudFront `/not-support` döndürdü. Bu, GitHub/Gradle CONNECT 403'ünden farklıdır. Resmî REST/WebSocket uç noktaları doğrulanamadı; native kaynak kapısı açılmadı. Binance Global kullanılmadı, sahte sinyal üretilmedi. APK derlenebilmesi bu veri engelinin çözüldüğü anlamına gelmez.

## APK'yı Android telefondan indirme adımları

**Ön koşul:** Yeni dalın GitHub'a gerçekten gönderilmiş ve bu dal için build'in başarılı olması gerekir. Şu anda bu koşullar sağlanmadı; eski bir run/artifact bu değişiklikleri içeriyor diye kabul edilmemelidir.

1. GitHub hesabınızla [deponun Android build sayfasını](https://github.com/Filorensuarez/traderadar/actions/workflows/android-build.yml) açın.
2. **Actions → Android build → Run workflow** seçin. Dal olarak **`codex/android-debug-apk`** seçin; listede yoksa henüz gönderilmemiştir.
3. **Run workflow** ile başlatın veya dal push'uyla otomatik oluşan run'ı açın. Run'ın commit'inin gönderilen son kaynaklarla eşleştiğini kontrol edin.
4. `debug-build` işinin başarılı olmasını bekleyin. Hata varsa ilgili adımı ve varsa `traderadar-android-build-diagnostics` artifact'ini açın; APK'nın oluştuğunu varsaymayın.
5. Başarılı run sayfasının altındaki **Artifacts → traderadar-android-debug-apk** bağlantısına dokunun.
6. ZIP'i açıp kökündeki **`app-debug.apk`** dosyasını çıkarın. JSON dosyasındaki commit ve SHA-256 bu pakete aittir.
7. APK'ya dokunun; Android isterse yalnız kullandığınız tarayıcı/dosya yöneticisi için uygulama yükleme iznini kendiniz verin. Bu bir debug test paketidir. Canlı adaptör doğrulanmadığı için Başlat hâlâ veri doğrulama engelini gösterebilir.

Bu çalışma sonunda gerçek run URL'si veya indirilebilir APK olmadığı için uydurma run/artifact bağlantısı verilmemiştir.
