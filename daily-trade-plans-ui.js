const section=document.querySelector("#dailyPlans"),button=document.querySelector("#dailyPlansButton");
const status=document.querySelector("#dailyPlansStatus"),cards=document.querySelector("#dailyPlansCards");
async function refreshPlans(){
 if(section.hidden)return;
 try{
  const r=await fetch("/api/daily-plans",{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();status.textContent="Son kontrol: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yok")+" | Kaynaklar: "+Object.entries(d.sources||{}).map(([k,v])=>k+" "+v.checked+"/"+v.eligible+(v.error?" (hata: "+v.error+")":"")).join(" | ")+" | Açık plan: "+d.plans.length+" | Kapanan: "+d.history.length;
  cards.replaceChildren();
  if(!d.plans.length){const p=document.createElement("p");p.textContent="Şu anda uygun fiyat ve hacim sinyali bulunamadı. İşlem açmak zorunlu değildir.";cards.append(p);}
  for(const x of d.plans){
   const card=document.createElement("article");card.className="coin-card";
   const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange;card.append(title);
   const signal=document.createElement("p");signal.style.fontWeight="700";signal.textContent="DURUM: "+x.status;card.append(signal);
   const line=document.createElement("p");line.textContent="İZLEME PLANI | Alış referansı: "+x.entry+" TL | Hedef satış (+%3): "+x.target+" TL | Zarar durdurma (-%1,5): "+x.stop+" TL";card.append(line);
   const meta=document.createElement("p");meta.className="description";meta.textContent="Güncel alış kotasyonu: "+(x.currentAsk??"Bilinmiyor")+" TL | Son işlem fiyatı: "+x.lastPrice+" TL | Gerekçe: "+(x.reason||"Yeniden kontrol ediliyor")+" | Son kontrol: "+new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR")+" | Tespit: "+new Date(x.createdAt).toLocaleString("tr-TR");card.append(meta);
   cards.append(card);
  }
  if(d.history.length){const h=document.createElement("h3");h.textContent="Listeden çıkarılan planlar (son 100)";cards.append(h);
   for(const x of d.history.slice(0,15)){const p=document.createElement("p");p.textContent=x.symbol+" | "+x.status+" | Alış: "+x.entry+" | Hedef: "+x.target+" TL | Stop: "+x.stop+" TL";cards.append(p);}
  }
 }catch(e){status.textContent="Portföy planları alınamadı: "+e.message;}
}
button?.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(el=>el.hidden=el!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
 refreshPlans();
});
document.querySelectorAll("nav.tabs .tab:not(#dailyPlansButton)").forEach(el=>el.addEventListener("click",()=>{section.hidden=true;button.classList.remove("active");}));
setInterval(refreshPlans,5000);

const scanButton=document.querySelector("#dailyPlansScan");
scanButton?.addEventListener("click",async()=>{
 scanButton.disabled=true;
 scanButton.textContent="Tarama başlatılıyor...";
 status.textContent="TL coin taraması başlatılıyor. Sonuçlar geldikçe güncellenecek.";
 try{
  const r=await fetch("/api/daily-plans/scan",{method:"POST",cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  await refreshPlans();
 }catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{scanButton.disabled=false;scanButton.textContent="Şimdi Tara";}
});
