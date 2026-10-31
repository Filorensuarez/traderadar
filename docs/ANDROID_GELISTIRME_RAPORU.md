# Android geliştirme raporu — 31 Ekim 2026

Son talimat esas alındı: Windows veya sürekli sunucu olmadan APK, kullanıcı başlatmalı native Foreground Service, ekran kapalıyken Android'in izin verdiği ölçüde tarama. Önceki PWA/7x24 sunucu planı uygulanmadı.

**Çalışan APK teslim edilemedi; canlı Binance TR entegrasyonu tamamlanmadı.** Mevcut Android projesinde yerel motor, panel köprüsü ve hizmet altyapısı geliştirildi. Framework derlemesi ve gerçek cihaz testi engelli olduğu için bu kaynaklar çalışır/üretime hazır APK olarak sunulmaz.

## Değişiklikler

- Mevcut Android ve `pro/public` paneli yeniden kullanıldı. Native Java motoru WebView'den bağımsız; WebView yalnız yerel arayüzdür.
- `NativeScanModel.java`: mevcut Pro stratejisinin karşılığı. %2, 300s/30m, kapalı hacim filtresi ve gösterge kuralları JS çıktılarıyla karşılaştırıldı.
- `NativeOutcome.java`, `NativeStore.java`, `NativeRuntime.java`, `NativeJson.java`: aynı yedi zaman aralığı, hedef/maliyet/hafta tanımı, yerel SQLite, eksik veriyi yetersiz sayma, ayar snapshot'ı ve alarm tekilleştirme kaynakları.
- `ScanSessionController.java`, `ScanService.java`: kullanıcı isteği ve REST/WS doğrulama kapısı, durdurmada oturum kapatma, eski callback reddi, kalıcı bildirim/Stop aksiyonu, sınırlı wakelock ve Android timeout yolu. Gerçek Android üzerinde test edilmedi.
- `OfficialSource.java`: kapalı kaynak arayüzü. Gerçek adaptör implementasyonu yoktur; factory null döndürür. Tahminî endpoint veya Binance Global fallback'i eklenmedi. Başlat henüz canlı taramayı açmaz.
- `ProActivity.java`: yerel panel, Başlat/Durdur, izin/pil açıklaması ve cihazdan resmî belgeyi test etme kodu. Dış origin/keyfî URL/dosya/cleartext erişimi kapalı.
- Android manifest/build, eski MainActivity, Android CI, `.gitignore`, package script ve native test kaynakları güncellendi. Yeni launcher Pro ekranıdır. Eski web ve strateji kaynakları silinmedi; bütün eski web modüllerinin Android native eşdeğerliği iddia edilmiyor.
- Ortak UI'da NativePro köprüsü, Türkçe sonuç durumları ve native/web alarm ayrımı eklendi. Tarayıcı modu korunur.

İlk geri dönüş checkpoint'i `df43e8c`; ilk native kaynak commit'i `0f2f470`. Son commit'ler `git log` ile görülebilir. Başlangıçtaki `daily-signal-history.json` korunmuştur ve Git'e eklenmemiştir.

## Çalıştırılan testler

| Kontrol | Sonuç ve sınır |
|---|---|
| Native core | **1.458 assertion geçti.** 10 fixture'da JS/Java parity; mum, sıralama/tekrar, boşluk, maliyet, yedi checkpoint, hafta ve oturum kapısı. Bunlar 1.458 ayrı Android testi değildir. |
| JVM fixture yükü | 1.000 analiz son ölçümde **166,12 ms**. Telefon/pil/uzun süre ölçümü değildir. |
| Pro regresyon | **29 geçti, 0 başarısız.** |
| Chromium | Masaüstü/mobil ve NativePro köprü fixture sözleşmesi geçti; native arayüzün uzak backend çağırmadığı doğrulandı. Android WebView/JNI testi değildir. |
| APK derlemesi | **Engelli:** Gradle komutu ve SDK yok. Android framework kaynakları tam derleyiciden geçirilmedi. |
| Resmî araç indirmesi | Gradle ve SDK kaynakları **CONNECT 403**; araç edinilemedi. |
| Android cihaz/emülatör | **Çalıştırılmadı.** Kurulum, izin, bildirim, ekran kapalı tarama, wakelock ve pil/ısı ölçülmedi. |
| Canlı Binance TR | **Doğrulanamadı.** Gerçek trade alınmadı, sahte canlı sinyal üretilmedi. |

Android SQLite/izin/hizmet kodunun bulunması bu özelliklerin cihazda çalıştığının kanıtı değildir. Mevcut web testlerindeki daha önce raporlanan iki günlük/dakikalık model uyuşmazlığı strateji değiştirilerek gizlenmedi.

## Engeller ve sonraki gerekli işler

1. Resmî `https://www.binance.tr/apidocs/` son bulut denemesinde CONNECT 200 sonrası **HTTP 451**, CloudFront ve `/not-support` döndürdü. Kesin ülke/IP/politika nedeni Binance TR desteğiyle teyit edilmelidir. Telefon erişimi ayrı test edilmelidir.
2. Önceki WebSocket adayının CONNECT 403 sonucu alan adı izniyle ilgilidir; güncel resmî destek doğrulanmadığından native katmanda kullanılmadı. Erişilebilir resmî belge ve cihazdan gerçek REST/WS gözlemleriyle sözleşme doğrulanmadan adapter yazılıp açılmamalıdır.
3. APK için JDK 17, Gradle 8.9, SDK 35/build-tools 35.0.0 kurulmalı veya güncellenen GitHub Actions işi kullanıcı tarafından incelenip çalıştırılmalıdır. Resmî Gradle/SDK indirmeleri mevcut bulut izinlerinde 403 aldı; güvenlik kısıtları aşılmadı. Bu çalışma push/yayın yapmadı.
4. Tam Android build/lint çalıştırılıp framework sorunları giderilmeli. Derlenmiş APK yokken dosya üretilmiş gibi bağlantı verilmedi.
5. `android/README.md` gerçek cihaz kabul listesi uygulanmalı. Android 15 dataSync süre kotası ve üretici pil kısıtları nedeniyle kesintisiz çalışma garantisi verilmemeli.
6. Gerçek trade sürekliliği, kapalı mum ve tarama koşulları sinyal üretmeden doğrulanmalı. Kapalı/kesilen dönemler başarı hesabına gerçek veri gibi katılmamalı.

Kapsamlı talimatın tüm özellikleri tamamlanmış değildir. Canlı kaynak, Android derlemesi ve cihaz doğrulaması çözülmeden hedef APK hazır sayılamaz.
