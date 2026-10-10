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
   const tracking=document.createElement("p");tracking.className="description";tracking.textContent="Takip başlangıcı: "+new Date(x.firstSeenAt||x.candleTime).toLocaleString("tr-TR")+(x.stale?" | Güncel mum verisiyle teyit edilemedi":" | Aktif takip");card.append(tracking);
   const decision=document.createElement("p");decision.className="first-reaction-decision "+(x.decision==="BEKLE"?"decision-wait":"decision-watch-buy");
   decision.textContent=x.decision;card.append(decision);
   const p=document.createElement("p");p.textContent="Fiyat: "+x.price+" | EMA7: "+x.ema7.toFixed(6)+" | EMA25: "+x.ema25.toFixed(6)+" | EMA99: "+(Number.isFinite(x.ema99)?x.ema99.toFixed(6):"5 dk taramasında yok")+" | Hacim: "+x.volumeRatio+"x | EMA7/25 farkı: %"+x.gapPct;card.append(p);
   const volume=document.createElement("p");
   volume.className="first-reaction-decision "+(x.volumeLevel==="PATLAMA HACMİ"?"decision-watch-buy":"decision-wait");
   volume.textContent="Hacim: "+(x.volumeLevel||"ÖLÇÜLMEDİ")+" | Son mum: "+(x.lastVolumeRatio??"-")+"x | Ardışık artış: "+(x.risingVolume?"Evet":"Hayır");
   card.append(volume);
   const age=document.createElement("p");
   age.textContent="Zaman aralığı: "+(x.timeframe||"1h")+" | Kesişim yaşı: "+(x.crossAgeHours==null?"Son 150 mumda yukarı kesişim bulunamadı":x.crossAgeHours+" tamamlanmış saatlik mum önce")+
    (x.crossTime?" | Kesişim zamanı: "+new Date(x.crossTime).toLocaleString("tr-TR"):"");
   card.append(age);
   const checkLabels=[
    ["recentCross","Yeni EMA7/25 kesişimi"],
    ["risingAverages","Ortalamalar yükseliyor"],
    ["aboveEma99","EMA99 teyidi"],
    ["volumeAtLeast2x","En az 2 kat hacim"],
    ["positiveCandle","Pozitif mum kapanışı"],
    ["risingVolume","Ardışık hacim artışı (bilgi amaçlı)"]
   ];
   if(x.checks){
    const checks=document.createElement("p");checks.className="description";
    checks.textContent=checkLabels.map(([key,label])=>label+": "+(x.checks[key]?"VAR":"YOK")).join(" | ");
    card.append(checks);
   }
   const why=document.createElement("p");
   why.textContent=x.stale?"Bekleme nedeni: Bu taramada güncel teknik teyit alınamadı.":x.decision==="BEKLE"?
    "Bekleme nedeni: "+(x.missingReasons?.join("; ")||x.reason):
    "Teyit: "+x.reason;
   card.append(why);
   const when=document.createElement("p");when.textContent="Son tamamlanan mum: "+new Date(x.candleTime+(x.timeframe==="5m"?300000:3600000)).toLocaleString("tr-TR");card.append(when);
   const button=document.createElement("button");button.type="button";button.className="refresh-button";button.textContent="Sermaye Yönetimine Aktar";
   button.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("traderadar:select-signal",{detail:{symbol:x.symbol,exchange:x.exchange,status:x.status,price:x.price}})));
   card.append(button);cards.append(card);
  }
  if(!d.rows?.length){const p=document.createElement("p");p.textContent=d.updatedAt?"Son taramada koşulları karşılayan kesişim bulunmadı.":"Kesişim taraması başlatılmadı.";cards.append(p);}
  const note=document.createElement("p");note.className="description";note.textContent=d.notice;cards.append(note);
 }catch(e){status.textContent="Tarama sonucu alınamadı: "+e.message;}
}
async function scan(){
 if(busy)return;busy=true;status.textContent="Üç borsada 1 saatlik mumlar inceleniyor. Bu işlem biraz sürebilir.";
 try{const r=await fetch("/api/crossings/scan",{method:"POST"});if(!r.ok)throw Error("HTTP "+r.status);}
 catch(e){status.textContent="Tarama hatası: "+e.message;}
 finally{busy=false;await render();}
}
document.querySelector("#firstReactionScan")?.addEventListener("click",scan);
document.querySelector("#pre15Button")?.addEventListener("click",render);
setInterval(()=>{if(!document.querySelector("#pre15")?.hidden)render();},15000);
render();
