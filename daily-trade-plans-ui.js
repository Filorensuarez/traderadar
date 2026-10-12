const section=document.querySelector("#dailyPlans");
const button=document.querySelector("#dailyPlansButton");
const status=document.querySelector("#dailyPlansStatus");
const cards=document.querySelector("#dailyPlansCards");
const scanButton=document.querySelector("#dailyPlansScan");
let refreshing=false;

async function refreshPlans(){
 if(!section||section.hidden||refreshing)return;
 refreshing=true;
 try{
  const [planResult,statsResult]=await Promise.allSettled([
   fetch("/api/daily-plans",{cache:"no-store",signal:AbortSignal.timeout(9000)}),
   fetch("/api/paper-performance-72h",{cache:"no-store",signal:AbortSignal.timeout(9000)})
  ]);
  if(planResult.status!=="fulfilled"||!planResult.value.ok)throw Error("Plan verileri alınamadı");
  const d=await planResult.value.json();
  const sourceText=Object.entries(d.sources||{}).map(([name,v])=>
   name+": "+(v.error?"HATA ("+v.error+")":v.checked+"/"+v.eligible+" tarandı")).join(" | ");
  status.textContent="USDT spot | "+(d.running?"Tarama sürüyor | ":"")+
   "Son kontrol: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"İlk tarama bekleniyor")+
   " | Kaynaklar: "+(sourceText||"Henüz tarama başlamadı")+
   " | Açık plan: "+d.plans.length+" | Kapanan: "+d.history.length;
  if(statsResult.status==="fulfilled"&&statsResult.value.ok){
   const st=await statsResult.value.json();
   status.textContent+=" | 3 GÜNLÜK SANAL TAKİP: "+st.completed+" sonuçlanan (hedef "+st.wins+", stop "+st.losses+
    ") | Başarı: "+(st.winRatePct===null?"Hesaplanamadı":"%"+st.winRatePct)+
    " | Sinyal: "+st.totalSignals+" | Sanal giriş: "+st.virtualEntries+
    (st.persistence==="ephemeral"?" | Kalıcı disk yok":"");
  }
  cards.replaceChildren();
  if(!d.plans.length){
   const p=document.createElement("p");
   p.textContent=d.running?"USDT borsaları taranıyor, adaylar bulundukça gösterilecek.":"Şu anda koşulları karşılayan USDT işlem adayı bulunamadı.";
   cards.append(p);
  }
  for(const x of d.plans){
   const card=document.createElement("article");card.className="coin-card";
   const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange;card.append(title);
   const state=document.createElement("p");state.style.fontWeight="700";state.textContent="DURUM: "+x.status;card.append(state);
   const line=document.createElement("p");
   line.textContent="Alış referansı: "+x.entry+" USDT | Hedef (+%3): "+x.target+
    " USDT | Stop (-%1,5): "+x.stop+" USDT";
   card.append(line);
   const meta=document.createElement("p");meta.className="description";
   meta.textContent="Alış kotasyonu: "+(x.currentAsk??"Veri yok")+" USDT | Son fiyat: "+x.lastPrice+
    " USDT | "+(x.reason||"")+
    " | Tespit: "+new Date(x.createdAt).toLocaleString("tr-TR")+
    " | Kontrol: "+new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR");
   card.append(meta);
   const risk=document.createElement("p");risk.className="description";
   risk.textContent="EMA7/25: "+(x.ema7??"—")+"/"+(x.ema25??"—")+
    " | RSI: "+(x.rsi??"—")+" | Hacim çarpanı: "+(x.volumeRatio??"—")+
    " | Spread: %"+(x.spreadPct??"—")+
    " | Tahmini net hedef: %"+(x.estimatedNetTargetPct??"—")+
    " | Tahmini net stop: %"+(x.estimatedNetStopPct??"—")+
    " | İşlem risk bütçesi: %"+(x.riskPerTradePct??"—")+
    " | Azami işlem payı: %"+(x.maxAllocationPct??"—");
   card.append(risk);cards.append(card);
  }
  if(d.history?.length){
   const heading=document.createElement("h3");heading.textContent="Listeden çıkarılan planlar";cards.append(heading);
   for(const x of d.history.slice(0,12)){
    const p=document.createElement("p");
    p.textContent=x.symbol+" • "+x.exchange+" | "+x.status+
     " | Alış: "+x.entry+" USDT | Hedef: "+x.target+" USDT | Stop: "+x.stop+" USDT";
    cards.append(p);
   }
  }
 }catch(e){status.textContent="USDT planları alınamadı: "+e.message+" (Sayfayı yenileyin veya tekrar tarayın.)";}
 finally{refreshing=false;}
}
button?.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(el=>el.hidden=el!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
 refreshPlans();
});
document.querySelectorAll("nav.tabs .tab:not(#dailyPlansButton)").forEach(el=>el.addEventListener("click",()=>{
 section.hidden=true;button?.classList.remove("active");
}));
scanButton?.addEventListener("click",async()=>{
 scanButton.disabled=true;scanButton.textContent="Tarama başlatılıyor...";
 status.textContent="Beş borsada USDT taraması başlatılıyor...";
 try{
  const r=await fetch("/api/daily-plans/scan",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  await refreshPlans();
 }catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{scanButton.disabled=false;scanButton.textContent="Şimdi Tara";}
});
setInterval(refreshPlans,5000);
refreshPlans();
