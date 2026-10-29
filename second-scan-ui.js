const API=location.hostname==="filorensuarez.github.io"?"https://traderadar-yro7.onrender.com":location.origin;
const button=document.getElementById("secondScanStart"),status=document.getElementById("secondScanStatus"),cards=document.getElementById("secondScanCards");
let busy=false;
async function refresh(){
 try{
  const r=await fetch(API+"/api/second-scan",{cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();button.disabled=d.running||busy||(d.blockedUntil>Date.now());
  status.textContent=(d.running?"Taranıyor":d.blockedUntil>Date.now()?"Binance istek sınırı nedeniyle duraklatıldı":d.completed?"Tarama tamamlandı":"Kısmi tarama")+" • Kontrol: "+d.checked+"/"+d.total+" • Eşleşme: "+d.rows.length+" • Veri hatası: "+d.errors+(d.blockedUntil>Date.now()?" • Yeniden deneme: "+Math.ceil((d.blockedUntil-Date.now())/60000)+" dk sonra":"")+(d.error?" • "+d.error:"");
  cards.replaceChildren();
  if(!d.rows.length){const p=document.createElement("p");p.textContent=d.running?"Koşulları sağlayan coinler aranıyor.":"Şu anda iki koşulu birlikte sağlayan coin yok.";cards.append(p);}
  for(const x of d.rows){const card=document.createElement("div");card.className="info-box";const h=document.createElement("h3");h.textContent=x.symbol.replace("USDT","/USDT");const p=document.createElement("p");p.textContent="Fiyat farkı: +%"+x.pricePct+"";card.append(h,p);cards.append(card);}
 }catch(e){status.textContent="Sunucu verisi alınamadı: "+e.message;button.disabled=false;}
}
button.addEventListener("click",async()=>{
 if(busy)return;busy=true;button.disabled=true;status.textContent="Tarama başlatılıyor...";
 try{const r=await fetch(API+"/api/second-scan/start",{method:"POST",signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error("HTTP "+r.status);}catch(e){status.textContent="Başlatılamadı: "+e.message;}
 finally{busy=false;refresh();}
});
refresh();setInterval(()=>{if(!document.getElementById("secondScan").hidden)refresh();},5000);
