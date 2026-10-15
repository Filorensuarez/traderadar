# TradeRadar — Android uygulaması

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