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
