const button=document.querySelector("#pullbackButton");
const section=document.querySelector("#hourlyPullback");
const status=document.querySelector("#pullbackStatus");
const cards=document.querySelector("#pullbackCards");
let busy=false;
const fmt=n=>Number(n).toLocaleString("tr-TR",{maximumFractionDigits:8});
async function refresh(){
 if(section.hidden)return;
 try{
  const r=await fetch("/api/hourly-pullback",{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  const total=Object.values(d.universe||{}).reduce((a,b)=>a+Number(b||0),0);
  status.textContent="Borsalar: "+Object.entries(d.universe||{}).map(([name,count])=>name+" "+count).join(" | ")+
   "\n"+(d.running?"Tarama sürüyor | ":"")+"Son tarama: "+(d.updatedAt?new Date(d.updatedAt).toLocaleString("tr-TR"):"Henüz tamamlanmadı")+
   " | Denenen: "+d.checked+"/"+total+" | Analiz edilen: "+d.successful+" | Eksik mum: "+d.missing+" | Hatalı: "+d.failed+
   " | Geri çekilme takibi: "+(d.rows||[]).filter(x=>!x.alerted).length+" | Alım fırsatı: "+(d.rows||[]).filter(x=>x.alerted).length+
   (d.errors?.length?" | İlk hata: "+d.errors[0]:"");
  cards.replaceChildren();
  const rows=d.rows||[];
  for(const x of rows){
   const card=document.createElement("article");card.className="coin-card";
   const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange;card.append(title);
   const decision=document.createElement("p");decision.className="first-reaction-decision "+(x.alerted?"decision-watch-buy":"");
   decision.textContent=x.alerted?"ALIM FIRSATI: %20+ DÜŞÜŞ SONRASI YEŞİL SAATLİK MUM":"%20+ GERİ ÇEKİLME • YEŞİL MUM BEKLENİYOR";card.append(decision);
   const details=document.createElement("p");
   details.textContent="Geri çekilme: %"+x.pullbackPct+" | Tepe: "+fmt(x.peakPrice)+" | Son fiyat: "+fmt(x.price);
   card.append(details);
   const timing=document.createElement("p");timing.className="description";
   timing.textContent="Geri çekilme tespiti: "+new Date(x.triggeredAt).toLocaleString("tr-TR")+
    (x.alerted?" | Yeşil mum kapanışı: "+new Date(x.signalCandleTime+3600000).toLocaleString("tr-TR")+" | Tespit edilen fiyat: "+fmt(x.signalPrice):
    " | Son kontrol: "+(x.lastCheckedAt?new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR"):"-"));
   card.append(timing);cards.append(card);
  }
  if(!rows.length){
   const p=document.createElement("p");p.className="empty-card";
   p.textContent="Şu anda son 168 tamamlanmış saatlik mumun tepesinden %20'den fazla düşmüş uygun parite bulunmadı. "+d.notice;
   cards.append(p);
  }
 }catch(e){status.textContent="Saatlik tarama verisi alınamadı: "+e.message;}
}
button?.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(el=>el.hidden=el!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
 refresh();
});
document.querySelectorAll("nav.tabs .tab:not(#pullbackButton)").forEach(el=>el.addEventListener("click",()=>{section.hidden=true;button.classList.remove("active");}));
document.querySelector("#pullbackScan")?.addEventListener("click",async()=>{
 if(busy)return;busy=true;
 const scanButton=document.querySelector("#pullbackScan");scanButton.disabled=true;
 try{
  const r=await fetch("/api/hourly-pullback/scan",{method:"POST",cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  status.textContent="Tarama başlatıldı. Borsalar ve saatlik mumlar kontrol ediliyor...";
 }catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{busy=false;scanButton.disabled=false;setTimeout(refresh,1200);}
});
setInterval(refresh,30000);
