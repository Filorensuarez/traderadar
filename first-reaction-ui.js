const status=document.querySelector("#firstReactionStatus"),cards=document.querySelector("#firstReactionCards");
let busy=false;
async function render(){
 try{
  const r=await fetch("/api/crossings/status",{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  status.textContent=(d.running?"Tarama devam ediyor. ":"")+
   "Son tarama: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yok")+
   " | İncelenen: "+d.checked+" | Borsalar: "+Object.entries(d.universes||{}).map(([k,v])=>k+" "+v).join(", ")+
   (d.errors?.length?" | Hatalar: "+d.errors.slice(0,2).join("; "):"");
  cards.replaceChildren();
  for(const x of d.rows||[]){
   const card=document.createElement("article");card.className="coin-card";
   const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.exchange+" • "+(x.stale?"TEYİT BEKLENİYOR":x.status);card.append(h);
   const tracking=document.createElement("p");tracking.className="description";tracking.textContent="İlk tespit: "+new Date(x.firstSeenAt||x.candleTime).toLocaleString("tr-TR")+" | En fazla 2 saatlik takip listesi";card.append(tracking);
   const decision=document.createElement("p");decision.className="first-reaction-decision "+(x.decision==="TAKİP ET"||x.decision==="BEKLE"||x.stale?"decision-wait":"decision-watch-buy");
   decision.textContent=x.stale?"BEKLE — TEYİT YOK":x.decision;card.append(decision);
   const p=document.createElement("p");p.textContent="Fiyat: "+x.price+" | EMA7: "+x.ema7.toFixed(6)+" | EMA25: "+x.ema25.toFixed(6)+" | Hacim: "+x.volumeRatio+"x | EMA7/25 farkı: %"+x.gapPct;card.append(p);
   const volume=document.createElement("p");
   volume.className="first-reaction-decision "+(x.volumeLevel==="PATLAMA HACMİ"?"decision-watch-buy":"decision-wait");
   volume.textContent="Hacim: "+(x.volumeLevel||"ÖLÇÜLMEDİ")+" | Son mum: "+(x.lastVolumeRatio??"-")+"x | Ardışık artış: "+(x.risingVolume?"Evet":"Hayır");
   card.append(volume);
   const when=document.createElement("p");
   when.textContent="5 dakikalık mum kapanışı: "+new Date(x.candleTime+300000).toLocaleString("tr-TR");
   card.append(when);
   const why=document.createElement("p");why.textContent=x.reason;card.append(why);
   const dip=document.createElement("p");dip.textContent="Dip fiyatı: "+(x.dipPrice??"-")+" | Dipten uzaklık: %"+(x.priceFromDipPct??"-");card.append(dip);
   const button=document.createElement("button");button.type="button";button.className="refresh-button";button.textContent="Sermaye Yönetimine Aktar";
   button.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("traderadar:select-signal",{detail:{symbol:x.symbol,exchange:x.exchange,status:x.status,price:x.price}})));
   card.append(button);cards.append(card);
  }
  if(!d.rows?.length){const p=document.createElement("p");p.textContent=d.updatedAt?"Son taramada dip sonrası kesişim veya hacimli kırılım bulunmadı.":"Kesişim taraması başlatılmadı.";cards.append(p);}
  const note=document.createElement("p");note.className="description";note.textContent=d.notice;cards.append(note);
 }catch(e){status.textContent="Tarama sonucu alınamadı: "+e.message;}
}
async function scan(){
 if(busy)return;busy=true;status.textContent="Üç borsada 5 dakikalık erken yükseliş mumları inceleniyor. Bu işlem biraz sürebilir.";
 try{const r=await fetch("/api/crossings/scan",{method:"POST"});if(!r.ok)throw Error("HTTP "+r.status);}
 catch(e){status.textContent="Tarama hatası: "+e.message;}
 finally{busy=false;await render();}
}
document.querySelector("#firstReactionScan")?.addEventListener("click",scan);
document.querySelector("#pre15Button")?.addEventListener("click",render);
setInterval(()=>{if(!document.querySelector("#pre15")?.hidden)render();},15000);
render();
