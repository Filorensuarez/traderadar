const button=document.querySelector("#momentumButton");
const section=document.querySelector("#momentum");
const status=document.querySelector("#momentumStatus");
const cards=document.querySelector("#momentumCards");
let busy=false;
async function refresh(){
 if(section.hidden)return;
 try{
  const r=await fetch("/api/minute-momentum",{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  status.textContent="Borsalar: "+Object.entries(d.universe||{}).map(([name,count])=>name+" "+count).join(" | ")+"\n"+(d.running?"Tarama sürüyor | ":"")+
   "Son tarama: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yok")+
   " | Denenen: "+d.checked+"/"+Object.values(d.universe||{}).reduce((a,b)=>a+Number(b||0),0)+" | Analiz edilen: "+d.successful+" | Eksik mum: "+(d.missing||0)+" | Hatalı: "+d.failed+
   " | Takipte: "+d.rows.length+" | En yüksek değişim: "+(d.maxChangePct===null?"Veri yok":"%"+d.maxChangePct)+(d.errors.length?" | İlk hata: "+d.errors[0]:"");
  cards.replaceChildren();
  const micro=d.early||{};
  const heading=document.createElement("h3");
  heading.textContent="İlk saniyeler • USDT spot erken momentum ("+(micro.intervalSeconds||10)+" sn)";
  cards.append(heading);
  const microStatus=document.createElement("p");microStatus.className="description";
  microStatus.textContent="Canlı kontrol: "+(micro.updatedAt?new Date(micro.updatedAt).toLocaleTimeString("tr-TR"):"İlk ölçüm bekleniyor")+
   " | Borsa: "+(micro.checked??0)+"/5 | Parite: "+(micro.eligible??0)+
   " | Alım teyidi: "+(micro.confirmed??0)+" | Erken uyarı: "+(micro.early??0)+
   " | Geç kalındı: "+(micro.late??0)+(micro.running?" | Kontrol sürüyor":"");
  cards.append(microStatus);
  const methodology=document.createElement("p");methodology.className="description";
  methodology.textContent="Potansiyel yüzdeleri 14 mumluk ATR oynaklığı, 20 dakikalık direnç, güncel alış kotasyonu ve hacim ile hesaplanan 5–15 dakikalık teknik senaryolardır. Kesin fiyat tahmini veya alım tavsiyesi değildir.";
  cards.append(methodology);
  const sourceErrors=Object.entries(micro.sources||{}).filter(([,v])=>v.error);
  if(sourceErrors.length){
   const ep=document.createElement("p");ep.className="description";
   ep.textContent="Veri erişimi: "+sourceErrors.map(([name,v])=>name+": "+v.error).join(" | ");
   cards.append(ep);
  }
  if(!micro.rows?.length){
   const p=document.createElement("p");
   p.textContent=micro.updatedAt?"Henüz doğrulanmış erken hareket yok. Eşikler dolana kadar alım yapılmamalı.":"İlk 10–20 saniyelik fiyat örnekleri toplanıyor.";
   cards.append(p);
  }
  for(const x of (micro.rows||[])){
   const card=document.createElement("article");card.className="coin-card";
   const estimate=x.potential;
   const percent=n=>Number(n).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2});
   const price=n=>Number(n).toLocaleString("tr-TR",{maximumSignificantDigits:9});
   const h=document.createElement("h3");
   h.textContent=x.symbol+" • "+x.exchange+
    (x.status==="GEÇ KALINDI"?" | Potansiyel: Yeni alım için uygun değil":
     estimate&&Number.isFinite(estimate.upperPct)?
      " | Potansiyel: %"+percent(estimate.lowerPct)+"–%"+percent(estimate.upperPct):
      " | Potansiyel: Hesaplanamadı");
   card.append(h);
   const dec=document.createElement("p");
   dec.className="first-reaction-decision "+(x.status==="GEÇ KALINDI"?"decision-wait":"decision-watch-buy");
   dec.textContent=x.status;card.append(dec);
   const upside=document.createElement("p");
   if(x.status==="GEÇ KALINDI"){
    upside.textContent="Tahmini kalan yükseliş: Gösterilmiyor. Ani yükselişin ardından alım kovalanmamalı.";
   }else if(estimate&&Number.isFinite(estimate.upperPct)){
    upside.textContent="Tahmini 5–15 dk yükseliş senaryosu: %"+percent(estimate.lowerPct)+
     " – %"+percent(estimate.upperPct)+
     (Number.isFinite(estimate.lowerTarget)&&Number.isFinite(estimate.upperTarget)?
      " | Olası hedef aralığı: "+price(estimate.lowerTarget)+" – "+price(estimate.upperTarget)+" USDT":"")+
     " | "+estimate.reason;
   }else{
    upside.textContent="Tahmini yükseliş senaryosu: Yeterli güncel mum ve direnç verisi bekleniyor.";
   }
   card.append(upside);
   const p=document.createElement("p");
   p.textContent="Anlık fiyat: "+x.price+" USDT | Alış kotasyonu: "+x.ask+
    " USDT | Kısa ivme: %"+x.speedPct+
    " | Gözlenen değişim: %"+x.windowRisePct+
    " | Zirveden geri çekilme: %"+x.retracePct;
   card.append(p);
   const t=document.createElement("p");t.className="description";
   t.textContent="Makas: %"+x.spreadPct+
    " | Hacim teyidi: "+(x.volumeRatio===null?"Henüz yok":x.volumeRatio+" kat")+
    " | "+x.reason+
    " | İlk uyarı: "+new Date(x.firstSeenAt).toLocaleTimeString("tr-TR")+
    " | Son kontrol: "+new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR");
   card.append(t);cards.append(card);
  }
  const legacy=document.createElement("h3");legacy.textContent="Kapanmış mumlara göre 5/120 momentum takibi";cards.append(legacy);
  for(const x of d.rows){
   const card=document.createElement("article");card.className="coin-card";
   const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange;card.append(title);
   const decision=document.createElement("p");decision.className="first-reaction-decision decision-watch-buy";
   decision.textContent="TAKİPTE";card.append(decision);
   const p=document.createElement("p");
   p.textContent="Son 5 / önceki 120 ortalama değişimi: %"+x.changePct+
    " | Fiyat: "+x.price+" | Önceki ortalama: "+x.previousAverage.toPrecision(8)+
    " | Son ortalama: "+x.currentAverage.toPrecision(8);
   card.append(p);
   const t=document.createElement("p");t.className="description";
   t.textContent="İlk tespit: "+new Date(x.firstSeenAt).toLocaleString("tr-TR")+
    " | Son kapanmış mum: "+new Date(x.candleTime+60000).toLocaleString("tr-TR")+
    " | Son kontrol: "+new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR");
   card.append(t);cards.append(card);
  }
  if(!d.rows.length){
   const p=document.createElement("p");p.textContent="Kapanmış mumlara göre henüz %2 eşiğini karşılayan takip sinyali yok. "+d.notice;cards.append(p);
   if(d.closest?.length){
    const heading=document.createElement("h3");heading.textContent="Eşiğe en yakın coinler (takip sinyali değil)";cards.append(heading);
    for(const x of d.closest.slice(0,8)){
     const line=document.createElement("p");line.textContent=x.symbol+" • "+x.exchange+" | 5/120 ortalama değişim: %"+x.changePct;cards.append(line);
    }
   }
  }
 }catch(e){status.textContent="Tarama hatası: "+e.message;}
}
button?.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(el=>el.hidden=el!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
 refresh();
});
document.querySelectorAll("nav.tabs .tab:not(#momentumButton)").forEach(el=>el.addEventListener("click",()=>{section.hidden=true;button.classList.remove("active");}));
document.querySelector("#momentumScan")?.addEventListener("click",async()=>{
 if(busy)return;busy=true;
 try{const r=await fetch("/api/minute-momentum/scan",{method:"POST"});if(!r.ok)throw Error("HTTP "+r.status);}
 catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{busy=false;refresh();}
});
setInterval(refresh,3000);
