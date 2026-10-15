/* Install TradeRadar as a PWA. Scanning requires an internet connection. */
(() => {
  const btn = document.getElementById("installTradeRadar");
  const help = document.getElementById("installHelp");
  if (!btn || !help) return;
  let installPrompt = null;
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const message = text => { help.hidden = false; help.textContent = text; };
  const setVisibility = () => { btn.hidden = standalone(); if (standalone()) help.hidden = true; };
  setVisibility();
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    setVisibility();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    btn.hidden = true;
    message("TradeRadar cihazınıza yüklendi.");
  });
  btn.addEventListener("click", async () => {
    if (standalone()) return;
    if (installPrompt) {
      const candidate = installPrompt;
      installPrompt = null;
      try {
        await candidate.prompt();
        const result = await candidate.userChoice;
        message(result && result.outcome === "accepted" ? "Uygulama yükleme isteği kabul edildi." : "Yükleme iptal edildi. Tarayıcınızın menüsünden yükleyebilirsiniz.");
      } catch (err) {
        message("Tarayıcınızın ⋮ menüsünden 'Uygulamayı yükle' seçeneğini kullanın.");
      }
      return;
    }
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) {
      message("Safari'de Paylaş simgesine dokunun ve 'Ana Ekrana Ekle' seçeneğini kullanın.");
    } else {
      message("Chrome menüsünü (⋮) açıp 'Uygulamayı yükle' veya 'Ana ekrana ekle' seçeneğine dokunun.");
    }
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(error => {
        console.warn("Uygulama hizmeti başlatılamadı:", error);
      });
    }, {once:true});
  }
})();