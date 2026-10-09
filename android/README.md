# TradeRadar Pro — Android başlangıç projesi

Bu klasör Android Studio'da açılabilen ilk geliştirme iskeletidir; Google Play'e hazır ürün değildir.

## Kurulum
1. Android Studio'da `android/` klasörünü açın.
2. Android SDK 35 ve JDK 17 kurulu olmalıdır.
3. Gradle eşitlemesinden sonra test cihazında çalıştırın.
4. İmzalı AAB için Android Studio > Build > Generate Signed Bundle/APK kullanın; özel anahtarları GitHub'a yüklemeyin.

## Yayın öncesi zorunlu işler
- Native Android bildirimleri, Android 13+ izinleri ve arka plan davranışını uygulama/test etme.
- Uygulama çevrimdışı ve bağlantı hatası ekranı, erişilebilirlik ve kullanıcı testleri.
- Borsa API kullanım ve ticari veri lisanslarını doğrulama.
- Veri güvenliği, gizlilik politikası, finansal özellikler beyanı ve uygulama içeriği kontrolleri.
- Kullanıcıya gösterilen puanları olasılık gibi sunmama; performans ölçümlerini denetleme.
- Google Play geliştirici hesabı, fiyatlandırma ve gerekli kapalı testleri tamamlama.

Başlangıç modeli: Tek seferlik ücretli indirme (fiyat sonradan belirlenecek). Uygulama içi ödeme veya otomatik alım-satım bu iskelette yoktur.
