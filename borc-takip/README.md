# BütçePilot — Yerel Borç Takip Uygulaması

Bir tarayıcı üzerinden kişisel nakit akışı ve KMH ödeme takvimi oluşturur. Kaynaklar `index.html`, `style.css`, `app.js`, `model.mjs` dosyalarındadır.

## Gizlilik

**Bu herkese açık GitHub klasöründe hiçbir gerçek kişi finansal verisi yoktur.** Uygulama boş gelir ve borç alanlarıyla başlar. Veriler yalnızca tarayıcı `localStorage` alanında tutulur, sunucuya API çağrısı yapılmaz. Başka cihazda açmak için uygulamadaki "Yedeği indir" ve "Yedek yükle" seçeneklerini kullanın. Tarayıcı verileri silinirse girişler kaybolabilir; her cihazda otomatik senkronizasyon yoktur. Ortak kullanılan cihazlarda kullanmayın.

## İşleyiş

- Aylık nakit akışı: gelir - kira - aile gideri - rezerv - kredi taksitleri - tek seferlik ödemeler - planlanan kart ödemesi.
- KMH faiz tahmini, dönem açılış KMH bakiyeleri × (aylık oran) × (1 + faiz üzerinden vergi yüzdesi) formülüyle hesaplanır.
- Yeterli nakit varsa önce hesaplanan faizin tamamı, kalan tutar varsa seçilen yöntemle KMH anaparası ödenir.
- İlk ay oluşan ödenemeyen KMH faizini sadece senaryo hesabında KMH anaparasına ekler. Bu, gerçek banka ekstre modelinin eşdeğeri değildir.
- Kredi kartı planı yalnızca **nakit çıkışı** olarak alınır; kartın gelecekteki kalan anaparası ve onun faizi modellenmez. Kartın gelecek dönem ve taksit rakamları çakışıyor olabilir, bankanızdan teyit edin.
- "Ödeme kayıtları" ayrı not defteridir; gerçekleşen ödemenin bankadaki yeni KMH bakiyesini otomatik düşürmez. Güncel KMH borcunu Borçlarım bölümünden değiştirin.

## Kullanım

Express statik dizinden servis sunar: `/borc-takip/`. Herhangi bir modern statik sunucuda da çalışır. Harici paket veya harici API gerektirmez.

## Not

Kredi, faiz, vergi ve yapılandırma koşulları değişebilir. Bu bir finansal karar motoru değildir; ödeme vadesi, tahakkuk ve zorunlu tutarlarda banka kayıtları esastır.