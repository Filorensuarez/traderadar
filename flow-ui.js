const status=document.querySelector("#flowStatus"),cards=document.querySelector("#flowCards");
let loading=false;
async function loadFlow(){
 if(loading)return;loading=true;
 try{
  const response=await fetch("/api/flow-radar",{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  status.textContent=(data.connected?"Gate.io bağlı":"Gate.io bağlantısı bekleniyor")+
   " | İzlenen: "+data.trackedSymbols+
   (data.lastMessage?" | Son işlem: "+new Date(data.lastMessage).toLocaleTimeString("tr-TR"):"")+
   (data.lastError?" | Hata: "+data.lastError:"");
  cards.replaceChildren();
  for(const x of data.rows||[]){
   const card=document.createElement("article");card.className="coin-card";
   const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.mode;
   const p=document.createElement("p");p.textContent="30 sn alış: "+x.buyUsdt+" USDT | Satış: "+x.sellUsdt+" USDT";
   const q=document.createElement("p");q.textContent="Alış ivmesi: "+(x.buyAcceleration??"-")+"x | Satış ivmesi: "+(x.sellAcceleration??"-")+"x";
   const s=document.createElement("p");s.textContent="Net işlem baskısı: %"+x.imbalancePercent+" | İşlem sayısı: "+x.trades30s;
   card.append(h,p,q,s);cards.append(card);
  }
 }catch(e){status.textContent="Veri alınamadı: "+e.message;}
 finally{loading=false;}
}
document.querySelector("#flowRefresh").addEventListener("click",loadFlow);
document.querySelector("#flowButton").addEventListener("click",loadFlow);
setInterval(()=>{if(!document.querySelector("#flow").hidden)loadFlow();},10000);
