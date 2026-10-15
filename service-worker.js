self.addEventListener(
  "push",
  event => {

    let data = {};

    try {

      data =
        event.data
          ? event.data.json()
          : {};

    } catch {

      data = {
        title:
          "TradeRadar",

        body:
          event.data
            ? event.data.text()
            : "Yeni senaryo bulundu."
      };
    }


    const title =
      data.title ||
      "TradeRadar";


    const options = {

      body:
        data.body ||
        "Yeni yükseliş senaryosu bulundu.",

      tag:
        data.tag ||
        "traderadar-scenario",

      renotify:
        true,

      requireInteraction:
        false,

      data: {

        url:
          data.url ||
          "/#scenario"
      }
    };


    event.waitUntil(
      self.registration.showNotification(
        title,
        options
      )
    );
  }
);


self.addEventListener(
  "notificationclick",
  event => {

    event.notification.close();


    const targetUrl =
      event.notification.data?.url ||
      "/#scenario";


    event.waitUntil(

      clients.matchAll({
        type:
          "window",

        includeUncontrolled:
          true
      })

      .then(
        windowClients => {

          for (
            const client
            of windowClients
          ) {

            if (
              "focus"
              in client
            ) {

              client.navigate(
                targetUrl
              );

              return client.focus();
            }
          }


          if (
            clients.openWindow
          ) {

            return clients.openWindow(
              targetUrl
            );
          }
        }
      )
    );
  }
);


/* PWA install/activation. Do not cache market data or trading signals. */
self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => new Response(
      '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07101f"><title>TradeRadar - Bağlantı yok</title></head><body style="margin:0;background:#07101f;color:#eaf4ff;font:16px system-ui;display:grid;place-items:center;min-height:100vh"><main style="padding:30px;max-width:480px;text-align:center"><h1>İnternet bağlantısı yok</h1><p>TradeRadar canlı piyasa verileri için internet bağlantısına ihtiyaç duyar. Bağlantınızı kontrol edip yeniden deneyin.</p><button onclick="location.reload()" style="background:#20bfa8;border:0;border-radius:10px;padding:12px 22px;font-weight:700">Yeniden dene</button></main></body></html>',
      {status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}}
    ))
  );
});
