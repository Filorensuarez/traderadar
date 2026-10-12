const section=document.querySelector("#earlypump"),button=document.querySelector("#earlyPumpButton");
const status=document.querySelector("#earlyPumpStatus"),cards=document.querySelector("#earlyPumpCards");
async function refreshEarly(){
 if(section.hidden)return;
 try{
  const r=await fetch("/api/early-pump",{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  status.textContent=(d.running?"Tarama sürüyor | ":"")+"Son tamamlanan: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yok")+
   " | Uygun: "+d.eligible+" | Kontrol: "+d.checked+" | Hata: "+d.failed+" | Erken sinyal: "+d.rows.length+
   (d.errors.length?" | İlk hata: "+d.errors[0]:"");
  cards.replaceChildren();
  if(!d.rows.length){const p=document.createElement("p");p.textContent="Henüz fiyat ivmesi ve hacim patlaması birlikte doğrulanan coin yok.";cards.append(p);}
  for(const x of d.rows){
   const card=document.createElement("article");card.className="coin-card";
   const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.exchange;card.append(h);
   const p=document.createElement("p");p.textContent="ERKEN HAREKET | 1 dk: %"+x.change1+" | 3 dk: %"+x.change3+" | 5 dk: %"+x.change5+
    " | Hacim ivmesi: "+x.volumeRatio+" kat | Son dakika hacmi: "+Number(x.minuteVolume).toLocaleString("tr-TR")+" USDT";card.append(p);
   const detail=document.createElement("p");detail.className="description";detail.textContent="Fiyat: "+x.price+
    " | 24 saat hacim: "+Math.round(x.volume24h).toLocaleString("tr-TR")+" USDT | "+
    (x.breakout?"20 dakikalık zirve kırıldı":"Hacim/fiyat ivmesi")+" | İlk tespit: "+new Date(x.firstSeenAt).toLocaleTimeString("tr-TR")+
    " | Son mum: "+new Date(x.candleTime+60000).toLocaleTimeString("tr-TR");card.append(detail);cards.append(card);
  }
 }catch(e){status.textContent="Veri alınamadı: "+e.message;}
}
button?.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(el=>el.hidden=el!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
 refreshEarly();
});
document.querySelectorAll("nav.tabs .tab:not(#earlyPumpButton)").forEach(el=>el.addEventListener("click",()=>{section.hidden=true;button.classList.remove("active");}));
document.querySelector("#earlyPumpScan")?.addEventListener("click",async()=>{
 try{const r=await fetch("/api/early-pump/scan",{method:"POST"});if(!r.ok)throw Error("HTTP "+r.status);refreshEarly();}
 catch(e){status.textContent="Başlatılamadı: "+e.message;}
});
setInterval(refreshEarly,4000);
