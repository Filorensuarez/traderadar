// TradeRadar - gerçekleşmiş büyük işlem gözlemcisi (Binance Spot)
(() => {
  const $ = id => document.getElementById(id);
  const section = $("whale"), button = $("whaleButton");
  if (!section || !button) return;
  let running = false, controller = null;
  const money = n => Number(n).toLocaleString("tr-TR",{maximumFractionDigits:2});
  const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function json(url,signal) {
    const r=await fetch(url,{signal,cache:"no-store"});
    if(!r.ok) throw Error("HTTP "+r.status);
    return r.json();
  }
  function show() {
    document.querySelectorAll("main.container > section").forEach(el=>el.hidden=el!==section);
    document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
    section.hidden=false;
  }
  button.addEventListener("click",show);
  document.querySelectorAll("nav.tabs .tab").forEach(el=>{
    if(el!==button) el.addEventListener("click",()=>{section.hidden=true;button.classList.remove("active");});
  });
  async function scan(){
    if(running)return;
    running=true;controller=new AbortController();
    const signal=controller.signal;
    $("whaleScan").disabled=true;
    $("whaleStatus").textContent="24 saatlik hacme göre pariteler belirleniyor...";
    $("whaleCards").replaceChildren();
    try {
      const [info,tickers]=await Promise.all([
        json("https://data-api.binance.vision/api/v3/exchangeInfo",signal),
        json("https://data-api.binance.vision/api/v3/ticker/24hr",signal)
      ]);
      const active=new Set(info.symbols.filter(x=>x.status==="TRADING"&&x.quoteAsset==="USDT"&&x.isSpotTradingAllowed!==false).map(x=>x.symbol));
      const symbols=tickers.filter(x=>active.has(x.symbol)&&Number(x.quoteVolume)>=1000000)
        .sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume));
      const minTrade=Math.max(1000,Number($("whaleMin").value)||10000);
      const cards=$("whaleCards");
      let found=0,checked=0,errors=0;
      $("whaleStatus").textContent=symbols.length+" parite incelenecek. Geçmişteki son 1000 toplulaştırılmış işlem taranıyor...";
      // Sıralı ve sınırlı istek hızı: API ağırlık sınırına saygı.
      for(const t of symbols){
        if(signal.aborted)break;
        try{
          const trades=await json("https://data-api.binance.vision/api/v3/aggTrades?symbol="+encodeURIComponent(t.symbol)+"&limit=1000",signal);
          let buy=0,sell=0,largeBuy=0,largeSell=0,biggest=0,latest=0;
          const seen=new Set();
          for(const x of trades){
            if(seen.has(x.a))continue;seen.add(x.a);
            const amount=Number(x.p)*Number(x.q);
            if(!Number.isFinite(amount))continue;
            if(x.m) {sell+=amount;if(amount>=minTrade)largeSell++;}
            else {buy+=amount;if(amount>=minTrade)largeBuy++;}
            biggest=Math.max(biggest,amount);latest=Math.max(latest,Number(x.T)||0);
          }
          checked++;
          if(largeBuy>0||largeSell>0){
            found++;
            const article=document.createElement("article");
            article.className="info-box";
            const total=buy+sell,ratio=total?buy/total*100:0;
            article.innerHTML='<h3>'+esc(t.symbol)+'</h3><p>Agresif alış: '+money(buy)+' USDT · Agresif satış: '+money(sell)+' USDT</p><p>Alış payı: %'+money(ratio)+' · Büyük alış: '+largeBuy+' · Büyük satış: '+largeSell+'</p><p>En büyük toplulaştırılmış işlem: '+money(biggest)+' USDT</p><p>Son işlem: '+(latest?new Date(latest).toLocaleString("tr-TR"):"Bilinmiyor")+'</p><small>Yalnız son 1000 toplulaştırılmış işlem; sabit zaman aralığı değildir. Alıcı kimliği bilinmez.</small>';
            cards.append(article);
          }
        }catch(e){if(signal.aborted)break;errors++;}
        $("whaleStatus").textContent=checked+"/"+symbols.length+" incelendi · "+found+" sonuç · "+errors+" hata";
        await new Promise(resolve=>setTimeout(resolve,170));
      }
      if(!signal.aborted){
        $("whaleStatus").textContent+=" · Tarama tamamlandı ("+new Date().toLocaleTimeString("tr-TR")+")";
        if(!found)cards.textContent="Eşiği aşan işlem bulunamadı.";
      }
    }catch(e){if(!signal.aborted)$("whaleStatus").textContent="Veri alınamadı: "+e.message;}
    finally{running=false;$("whaleScan").disabled=false;}
  }
  $("whaleScan").addEventListener("click",scan);
  $("whaleStop").addEventListener("click",()=>{controller?.abort();$("whaleStatus").textContent="Tarama durduruldu.";});
})();
