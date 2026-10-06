/* =========================
   TRADERADAR SERVICE WORKER
========================= */


/*
  PUSH BİLDİRİMİ GELDİĞİNDE
*/

self.addEventListener(
  "push",
  event => {

    let data = {};


    try {

      if (event.data) {

        data =
          event.data.json();
      }

    } catch (error) {

      data = {
        title:
          "TradeRadar",

        body:
          event.data
            ? event.data.text()
            : "Yeni senaryo tespit edildi."
      };
    }


    const title =
      data.title ||
      "TradeRadar";


    const options = {

      body:
        data.body ||
        "Yeni yükseliş senaryosu tespit edildi.",

      icon:
        "/icon-192.png",

      badge:
        "/icon-192.png",

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
          "/#scenario",

        scenario:
          data.scenario ||
          null,

        symbol:
          data.symbol ||
          null
      }
    };


    event.waitUntil(

      self.registration
        .showNotification(
          title,
          options
        )
    );
  }
);


/* =========================
   BİLDİRİME TIKLANDIĞINDA
========================= */

self.addEventListener(
  "notificationclick",
  event => {

    event.notification.close();


    const targetUrl =
      event.notification
        .data?.url ||
      "/#scenario";


    event.waitUntil(

      clients
        .matchAll({

          type:
            "window",

          includeUncontrolled:
            true
        })

        .then(
          clientList => {

            /*
              TradeRadar zaten açıksa
              mevcut pencereyi öne getir.
            */

            for (
              const client
              of clientList
            ) {

              if (
                "focus" in client
              ) {

                client.navigate(
                  targetUrl
                );

                return client.focus();
              }
            }


            /*
              Uygulama kapalıysa
              yeni pencere aç.
            */

            if (
              clients.openWindow
            ) {

              return clients.openWindow(
                targetUrl
              );
            }


            return null;
          }
        )
    );
  }
);


/* =========================
   SERVICE WORKER AKTİFLEŞTİR
========================= */

self.addEventListener(
  "install",
  () => {

    self.skipWaiting();
  }
);


self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      self.clients.claim()
    );
  }
);
