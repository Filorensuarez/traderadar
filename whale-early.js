// Sabit zaman pencereli alış baskısı ve erken birikim adayları
(() => {
 const $=id=>document.getElementById(id);
 const btn=$("whaleEarlyScan"); if(!btn)return;
 let controller=null,running=false;
 const fmt=n=>Number(n).toLocaleString("tr-TR",{maximumFractionDigits:2});
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 async function get(url,signal){const r=await fetch(url,{signal,cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json();}
 function measure(rows,n){
   const a=rows.slice(-n),vol=a.reduce((s,x)=>s+Number(x[7]),0),buy=a.reduce((s,x)=>s+Number(x[10]),0);
   const start=Number(a[0][1]),end=Number(a[a.length-1][4]);
   return {vol,buy,sell:vol-buy,ratio:vol?100*buy/vol:0,delta:2*buy-vol,change:start?100*(end/start-1):0};
 }
 btn.addEventListener("click",async()=>{
  if(running)return;running=true;controller=new AbortController();const signal=controller.signal;
  btn.disabled=true;$("whaleEarlyCards").replaceChildren();$("whaleEarlyStatus").textContent="Pariteler alınıyor...";
  try{
   const info=await get("https://data-api.binance.vision/api/v3/exchangeInfo",signal);
   const symbols=info.symbols.filter(x=>x.status==="TRADING"&&x.quoteAsset==="USDT"&&x.isSpotTradingAllowed!==false).map(x=>x.symbol);
   let checked=0,failed=0,candidates=0,insufficient=0;
   const results=[];
   for(const symbol of symbols){
    if(signal.aborted)break;
    try{
     const candles=await get("https://data-api.binance.vision/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=1m&limit=66",signal);
     const closed=candles.filter(x=>Number(x[6])<Date.now());
     if(closed.length<60){insufficient++;continue;}
     const recent=closed.slice(-15),baseline=closed.slice(-45,-15);
     const m1=measure(recent,1),m5=measure(recent,5),m15=measure(recent,15);
     const base=measure(baseline,30);
     const prior5=measure(closed.slice(-20,-15),5);
     const close=Number(recent[14][4]);
     const resistance=Math.max(...closed.slice(-35,-5).map(x=>Number(x[2])));
     const support=Math.min(...recent.slice(-10).map(x=>Number(x[3])));
     const last3=recent.slice(-3),last3Vol=last3.reduce((s,x)=>s+Number(x[7]),0);
     const avgPrevVol=base.vol/30;
     const breakout=close>resistance && last3Vol>3*avgPrevVol*1.2;
     const weak=m1.ratio<45||m5.ratio<50||close<support;
     const category=weak?"RİSK YÜKSEK":breakout&&m1.ratio>=55&&m5.ratio>=60?"ALIM KOŞULLARI GÜÇLENİYOR":"İZLE";
     const entry=close, stop=support, risk=entry-stop;
     const target=risk>0?entry+2*risk:null;
     const rr=target&&risk>0?(target-entry)/risk:null;
     const ratio=base.vol?m15.vol/(base.vol/2):0;
     const deltaBoost=m5.delta>0&&m5.delta>prior5.delta;
     // Filtre: önceki 30 dakikaya göre hacim artışı, alış üstünlüğü, sınırlı fiyat değişimi
     if(m5.ratio>=60&&m15.ratio>=55&&ratio>=1.5&&m15.change>=-0.5&&m15.change<=2&&deltaBoost&&m15.vol>=10000){
       candidates++;results.push({symbol,m1,m5,m15,ratio,deltaBoost,category,entry,stop,target,rr,resistance,breakout,asof:Number(recent[14][6])});
     }
    }catch(e){if(signal.aborted)break;failed++;}
    checked++;
    $("whaleEarlyStatus").textContent=checked+"/"+symbols.length+" incelendi · "+candidates+" aday · "+failed+" hata · "+insufficient+" yetersiz geçmiş";
    await new Promise(r=>setTimeout(r,170));
   }
   const rank={"ALIM KOŞULLARI GÜÇLENİYOR":0,"İZLE":1,"RİSK YÜKSEK":2};
   results.sort((a,b)=>rank[a.category]-rank[b.category]||b.ratio-a.ratio);
   for(const x of results){
    const el=document.createElement("article");el.className="info-box";
    const price=n=>Number.isFinite(n)&&n>0?Number(n).toLocaleString("tr-TR",{maximumSignificantDigits:9}):"Hesaplanamadı";
    el.innerHTML="<h3>"+escape(x.symbol)+" · Erken birikim adayı</h3>"+
     "<p>Durum: "+escape(x.category)+" · Son tamamlanmış mum: "+new Date(x.asof).toLocaleString("tr-TR")+"</p>"+
     "<p>Referans kapanış: "+price(x.entry)+" USDT · Son 30 dk direnç: "+price(x.resistance)+" USDT</p>"+
     "<p>Örnek zarar-kes: "+price(x.stop)+" USDT · 2:1 varsayımsal hedef: "+price(x.target)+" USDT</p>"+
     "<p>Risk/getiri: "+(x.rr?fmt(x.rr)+":1":"Hesaplanamadı")+" · Direnç kırılımı: "+(x.breakout?"Var":"Yok")+"</p>"+
     "<p>1 dk alış payı: %"+fmt(x.m1.ratio)+" · 5 dk: %"+fmt(x.m5.ratio)+" · 15 dk: %"+fmt(x.m15.ratio)+"</p>"+
     "<p>15 dk hacim / önceki 30 dk normalize hacmi: "+fmt(x.ratio)+" kat</p>"+
     "<p>15 dk fiyat değişimi: %"+fmt(x.m15.change)+" · 5 dk net agresif alış: "+fmt(x.m5.delta)+" USDT</p>"+
     "<small>Kaynak: Binance Spot tamamlanmış 1 dakikalık mumları. Net agresif alış, taker alış hacminin iki katından toplam hacmin çıkarılmasıyla hesaplanır. Referans kapanış anlık alış fiyatı değildir. Zarar-kes son 10 mumun en düşük seviyesidir; hedef varsayımsal 2:1 hesaplamasıdır. Komisyon, kayma ve emir defteri hesaba katılmaz. Kesin alım önerisi değildir.</small>";
    $("whaleEarlyCards").append(el);
   }
   if(!signal.aborted){
    $("whaleEarlyStatus").textContent+=" · Tarama tamamlandı.";
    if(!results.length)$("whaleEarlyCards").textContent="Koşulları sağlayan aday bulunamadı.";
   }
  }catch(e){if(!signal.aborted)$("whaleEarlyStatus").textContent="Veri hatası: "+e.message;}
  finally{running=false;btn.disabled=false;}
 });
 $("whaleEarlyStop").addEventListener("click",()=>{controller?.abort();$("whaleEarlyStatus").textContent="Tarama durduruldu.";});
})();
