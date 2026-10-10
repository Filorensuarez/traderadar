const status=document.querySelector("#firstReactionStatus");
const cards=document.querySelector("#firstReactionCards");
let busy=false;
async function refresh(){
 if(busy||document.querySelector("#pre15")?.hidden)return;
 busy=true;
 try{
  const r=await fetch("/api/first-reaction",{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  status.textContent="Bağlantı: "+(d.connected?"Aktif":"Kesik")+
   " | İzlenen: "+d.trackedSymbols+" | Son işlem: "+
   (d.lastMessage?new Date(d.lastMessage).toLocaleTimeString("tr-TR"):"Yok")+
   (d.lastError?" | Hata: "+d.lastError:"")+" | "+Object.entries(d.sources||{}).map(([name,v])=>name.toUpperCase()+": "+(v.connected?"aktif":"kesik")+" ("+v.tracked+")").join(" • ");
  cards.replaceChildren();
  for(const x of d.rows||[]){
   const card=document.createElement("article");card.className="coin-card";
   const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.exchange+" • "+x.status;card.append(h);
   const p=document.createElement("p");
   p.textContent="Fiyat: "+x.price+" | 5 sn: %"+x.change5Pct+
    " | 10 sn: %"+x.change10Pct+" | 30 sn: %"+x.change30Pct+
    " | Hacim: "+x.volumeAcceleration+"x | Alış payı: %"+x.buySharePct;
   card.append(p);cards.append(card);
  }
  if(!d.rows?.length){const p=document.createElement("p");p.textContent="Şu anda koşulları karşılayan canlı sinyal yok. "+d.notice;cards.append(p);}
 }catch(e){status.textContent="Canlı veri hatası: "+e.message;}
 finally{busy=false;}
}
document.querySelector("#pre15Button")?.addEventListener("click",refresh);
setInterval(refresh,3000);
refresh();
