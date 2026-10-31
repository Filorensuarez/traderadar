# TradeRadar Pro — gerçek Android cihaz test planı

Bu belge uygulanacak planı tanımlar; maddeler **henüz cihazda geçti** anlamına gelmez. Test kayıtlarında APK SHA-256, sertifika SHA-256, commit/run, paket sürümü, telefon modeli, Android/API ve Android System WebView sürümü bulunmalıdır. Kişisel hesap/anahtar/parola kaydetmeyin.

## Ön koşullar

- Test sahibinin onayı, uygun yedek ve kontrollü cihaz gerekir. APK'nın yetkili Actions run'ından geldiği, hash ve imzası doğrulanmalıdır; bunların eşleşmesi malware yokluğu kanıtı değildir.
- Play Protect engellerse kurulumu zorlamayın; korumayı kapatmayın, farklı paket adı/sertifika ile kararı aşmayı denemeyin. Önce gerçek APK ve Google sınıflandırması incelenmelidir.
- Debug yalnız teşhis paketidir. Release non-debuggable ve sahibinin korunan kalıcı anahtarıyla imzalı olmalıdır. Yanlış sertifikayla güncelleme reddini veri silerek aşmaya çalışmayın; dağıtım kimliğini ve veri korumasını çözün.
- Test matrisi: mümkünse API 26, 33, 34, 35+; en az hedeflenen gerçek telefon. Üretici güç politikaları ve GMS/WebView farklılıkları ayrıca kaydedilir. Windows veya sürekli sunucu test/çalışma bağımlılığı değildir.

## A — şu anki kilitli kaynak durumunda yapılabilecekler

1. Güvenlik incelemesinden sonra izin verilen test kurulumunda paket adını `com.traderadar.pro`, sürümü ve kaynak commit'ini doğrulayın. Play Protect engeli varsa burada durun.
2. Açılışta Türkçe/koyu yerel paneli, dikey/yatay yerleşimi, grafik boş durumunu ve cihazda hata/ANR olmadığını kontrol edin. Native panelin uzak web uygulamasına yönlenmediğini doğrulayın.
3. Kullanıcı Başlat demeden servis/bildirim/tarama olmamalı. Yeniden açılış ve telefon yeniden başlatması otomatik taramayı açmamalı.
4. Resmî adaptör kilidi kapalıyken Başlat'ın veri doğrulama engelini bildirmesi ve sahte fiyat/sinyal/başarı oranı üretmemesi beklenir. Kilidi test için kaldırmayın.
5. Mevcut strateji değerlerini değiştirmeden ayarların/kayıtların kapat-aç sonrasında korunmasını kontrol edin. Eski sunucu verisinin otomatik taşındığını varsaymayın; test kayıtlarını canlı geçmişe eklemeyin.
6. Yerel bölüm bağlantıları, filtreler, sıralama, geçmiş ve haftalık boş/yetersiz veri durumlarını kontrol edin. Uzak URL, file/content/intent, iframe veya keyfî yerel dosya geçişi uygulama içinde açılmamalı. Hassas veri üzerinde saldırı denemesi yapmayın; güvenlik fixture'ları ayrı testte tutulur.
7. Kullanıcının belge kontrol düğmesiyle `https://www.binance.tr/apidocs/` yanıtını telefondan kaydedin. Bu test Codex bulutundan ayrıdır; HTTP 200 bile REST/WebSocket doğrulaması değildir. Yönlendirme/TLS güvenliğini gevşetmeyin.

## B — yalnız resmî kaynak ve gerçek cihaz REST/WS doğrulandıktan sonra

1. Güncel resmî dokümandaki host/path, aktif spot şeması, zaman, trade, mum ve defter formatlarıyla hız/abonelik limitlerini doğrulayın. Binance Global'e geçmeyin; desteklenmeyen veri uydurmayın.
2. Kullanıcı Başlat ile bildirim izni isteğini gözlesin. Android 13+ izin ret ve kabul ayrı testlerdir. Ret halinde beklenmeyen tarama veya bildirim olmamalı. Oturum sırasında iznin kaldırılması çökme oluşturmamalı.
3. Doğrulanmış gerçek akışla kalıcı tarama bildirimi, bildirime dokunma ve Durdur aksiyonunu kontrol edin. Sinyal kanalı ses/kapalı ayarı Android tarafından yönetilmeli; aynı sinyal tekrarlanan ses üretmemeli.
4. İşlem kimliği/tekrar, sırasız teslim, negatif/NaN fiyat-miktar, gelecekteki ve eski zaman, eksik saniye, açık mum ve akış kopması için fixture testleri ayrı yürütülmeli; üretim akışına sahte trade enjekte edilmemeli.
5. 300 tamamlanmış ardışık gerçek saniye ve bu pencere öncesi 30 kapalı dakika olmadan sinyal beklenmemeli. %2 ortalama farkı ve ayrı 300s gerçek değişim ölçümü, hacim filtresi varsayılan kapalı, EMA/RSI/MACD kuralları bağımsız referansla karşılaştırılmalı.
6. Ekranı kapatın, Home ile çıkın ve başka uygulamaya geçin. Android izin verdiği ölçüde hizmet/bildirim sürmeli; işlem/güncelleme gecikmesini kaydedin. En az 30–60 dakika gözlem yapılmadan uzun süre/pil iddiası kurulmaz.
7. Ağ kapatma/geri açma testinde bağlantı durumu güncel olmalı, eski sonuçlar canlı gösterilmemeli; kontrollü yeniden bağlanma ve 300 saniyelik yeni süreklilik şartı aranmalı. Eksik tarih fiyatla doldurulmamalı.
8. Uygulama ve bildirim Durdur düğmelerini ayrı deneyin. Socket, timer, CPU kilidi ve kalıcı bildirim kapanmalı; gecikmiş callback yeni sinyal üretmemeli. Force-stop ve yeniden başlatma sonrası tarama otomatik dönmemeli.
9. Android 15+ dataSync toplam süre kotası ve üretici durdurması gözlenirse uygulama bunu gerçek durum olarak bildirmeli. Kota/koruma ayarlarını gizlice değiştirmeyin veya farklı hizmet türüyle sınırı aşmayın.
10. 1/3/5/10/15/30/60 dakika sonuçları, en yüksek/en düşük, brüt hedef, maliyet ve İstanbul pazartesi hafta sınırı kontrol edilmeli. Veri toplanmayan süreler başarısız/başarılı diye değerlendirilmemeli. Aynı aktif sinyal örnek sayısını şişirmemeli.
11. CPU/RSS, pil, sıcaklık, istek/hata oranı ve gecikme en az bir uzun oturumda başlangıç/son değerleriyle kaydedilmeli. Cihaz rahatsız edici ısınırsa veya Android uyarırsa testi durdurun. Foreground Service kesintisizlik garantisi değildir.

## Kabul kaydı

Her madde için `geçti / başarısız / engelli / çalıştırılmadı`, gerçek süre, saat, gözlem ve hassas olmayan kanıt yazılır. APK checksum/imza, CVE sorgusu veya unit testlerin geçmesi Play Protect onayı ya da gerçek cihaz testi yerine geçmez. Mevcut canlı adaptör doğrulanmamışsa B grubu **engelli** kalır; uygulama canlı taramaya hazır ilan edilmez.
