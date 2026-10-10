const status=document.querySelector("#firstReactionStatus");
const cards=document.querySelector("#firstReactionCards");
let busy=false;
async function render(){
 try{
  const response=await fetch("/api/crossings/status",{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  status.textContent=(data.running?"Tarama sürüyor | ":"")+
   "Son tarama: "+(data.updatedAt?new Date(data.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yapılmadı")+
   " | Denenen: "+data.checked+" | Başarılı: "+(data.successful??0)+" | Hatalı: "+(data.failed??0)+" | Bulunan: "+(data.rows||[]).length+
   (data.errors?.length?" | Hatalar: "+data.errors.slice(0,2).join("; "):"");
  cards.replaceChildren();
  for(const x of data.rows||[]){
   const card=document.createElement("article");card.className="coin-card";
   const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange+" • "+x.status;card.append(title);
   const decision=document.createElement("p");decision.className="first-reaction-decision "+(x.decision==="ALIM KOŞULLARI UYGUN"?"decision-watch-buy":"decision-wait");
   decision.textContent=x.decision;card.append(decision);
   const detail=document.createElement("p");
   detail.textContent="Fiyat: "+x.price+" | EMA7: "+x.ema7.toFixed(6)+" | EMA25: "+x.ema25.toFixed(6)+
    " | EMA farkı: %"+x.gapPct+" | Günlük hacim: "+x.volumeRatio+"x";
   card.append(detail);
   const dip=document.createElement("p");
   dip.textContent="Dip: "+x.dipPrice+" ("+new Date(x.dipTime).toLocaleDateString("tr-TR")+") | Dipten kesişime: "+x.dipToCrossDays+
    " gün | Kesişim yaşı: "+x.crossAgeDays+" günlük mum | Dipten uzaklık: %"+x.priceFromDipPct;
   card.append(dip);
   const projection=document.createElement("p");projection.textContent="Giriş referansı: "+x.price+" | Zarar-kes: "+x.stop+" (%"+x.stopPct+") | Hedef 1: "+x.target1+" | Hedef 2: "+x.target2+" | Risk/getiri: 1:2";card.append(projection);
   const resistance=document.createElement("p");resistance.textContent="Geçmiş direnç: "+(x.resistance??"Bulunamadı")+" | "+(x.reasons?.length?"Eksikler: "+x.reasons.join("; "):"Teknik kontroller tamam");card.append(resistance);
   const when=document.createElement("p");when.textContent="Kesişim: "+new Date(x.crossTime).toLocaleString("tr-TR")+
    " | Son tamamlanmış günlük mum: "+new Date(x.candleTime+86400000).toLocaleString("tr-TR");
   card.append(when);
   const note=document.createElement("p");note.textContent=x.reason+" Bu otomatik emir veya kesin kazanç tahmini değildir.";card.append(note);
   const button=document.createElement("button");button.className="refresh-button";button.type="button";button.textContent="Sermaye Yönetimine Aktar";
   button.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("traderadar:select-signal",
    {detail:{symbol:x.symbol,exchange:x.exchange,status:x.status,price:x.price}})));
   card.append(button);cards.append(card);
  }
  if(!data.rows?.length){const p=document.createElement("p");
   p.textContent=data.updatedAt?"Son taramada yeni günlük dip sonrası EMA kesişimi bulunmadı.":"Günlük taramayı başlatın.";cards.append(p);}
  const notice=document.createElement("p");notice.className="description";notice.textContent=data.notice;cards.append(notice);
 }catch(e){status.textContent="Tarama hatası: "+e.message;}
}
async function scan(){
 if(busy)return;busy=true;status.textContent="Günlük mumlar taranıyor; tamamlanmasını bekleyin.";
 try{const response=await fetch("/api/crossings/scan",{method:"POST"});
  if(!response.ok)throw Error("HTTP "+response.status);
 }catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{busy=false;await render();}
}
document.querySelector("#firstReactionScan")?.addEventListener("click",scan);
document.querySelector("#pre15Button")?.addEventListener("click",render);
setInterval(()=>{if(!document.querySelector("#pre15")?.hidden)render();},15000);
render();
