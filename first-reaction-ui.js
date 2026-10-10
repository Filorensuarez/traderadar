const status=document.querySelector("#firstReactionStatus");
const cards=document.querySelector("#firstReactionCards");
let busy=false;
let lastScan=0;
async function refresh(){
 if(busy||document.querySelector("#pre15")?.hidden)return;
 lastScan=Date.now();
 busy=true;
 try{
  const r=await fetch("/api/first-reaction",{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  status.textContent="Bağlantı: "+(d.connected?"Aktif":"Kesik")+
   " | İzlenen: "+d.trackedSymbols+" | Son işlem: "+
   (d.lastMessage?new Date(d.lastMessage).toLocaleTimeString("tr-TR"):"Yok")+
   (d.lastError?" | Hata: "+d.lastError:"")+" | "+Object.entries(d.sources||{}).map(([name,v])=>name.toUpperCase()+": "+(v.connected?"bağlı":"kesik")+" ("+v.tracked+" parite"+(v.error?"; "+v.error:"")+")").join(" • ")+(d.lastMessage&&Date.now()-d.lastMessage>30000?" | UYARI: 30 saniyedir işlem verisi yok.":"");
  cards.replaceChildren();
  const stamp=document.createElement("p");stamp.textContent="Tarama: "+new Date(lastScan).toLocaleTimeString("tr-TR")+" | Aktif sinyal: "+(d.rows||[]).length;cards.append(stamp);
  for(const x of d.rows||[]){
   const card=document.createElement("article");card.className="coin-card";
   const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.exchange+" • "+x.status;card.append(h);
   const p=document.createElement("p");
   p.textContent="Fiyat: "+x.price+" | 5 sn: %"+x.change5Pct+
    " | 10 sn: %"+x.change10Pct+" | 30 sn: %"+x.change30Pct+
    " | Hacim: "+x.volumeAcceleration+"x | Alış payı: %"+x.buySharePct;
   card.append(p);
   if(Number.isFinite(x.lastDetectedAt)){const age=document.createElement("p");age.textContent="Son tespit: "+Math.max(0,Math.floor((Date.now()-x.lastDetectedAt)/1000))+" saniye önce | Sinyal en fazla 60 saniye gösterilir.";card.append(age);}
   if(Number(x.price)>0){const button=document.createElement("button");button.type="button";button.className="refresh-button";button.textContent="Sermaye Yönetimine Aktar";button.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("traderadar:select-signal",{detail:{symbol:x.symbol,exchange:x.exchange,status:x.status,price:Number(x.price)}})));card.append(button);}
   cards.append(card);
  }
  if(!d.rows?.length){const p=document.createElement("p");p.textContent=!d.lastMessage?"Henüz canlı işlem verisi gelmedi. Bağlantı ve abonelikler kontrol edilmeli.":Date.now()-d.lastMessage>30000?"İşlem verisi güncel değil; radar sonucu güvenilir değil.":"Şu anda koşulları karşılayan canlı sinyal yok. "+d.notice;cards.append(p);}
 }catch(e){status.textContent="Canlı veri hatası: "+e.message;}
 finally{busy=false;}
}
document.querySelector("#pre15Button")?.addEventListener("click",refresh);
document.querySelector("#firstReactionScan")?.addEventListener("click",refresh);
setInterval(refresh,1000);
refresh();
