const status=document.querySelector("#flowStatus"),cards=document.querySelector("#flowCards");
let loading=false;
async function loadFlow(){
 if(loading)return;loading=true;
 try{
  const response=await fetch("/api/flow-radar",{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  status.textContent=(data.connected?"İşlem akışı bağlı":"İşlem akışı bağlantısı bekleniyor")+
   " | İzlenen: "+data.trackedSymbols+
   (data.lastMessage?" | Son işlem: "+new Date(data.lastMessage).toLocaleTimeString("tr-TR"):"")+
   (data.lastError?" | Hata: "+data.lastError:"")+
   " | "+Object.entries(data.exchanges||{}).map(([name,x])=>name.toUpperCase()+": "+(x.connected?"bağlı":"bağlantı yok")+" ("+x.tracked+")").join(" • ");
  cards.replaceChildren();
  if(data.marketCap?.stale||data.marketCap?.lastError){status.textContent+=" | Piyasa değeri verisi alınamadı: sinyaller gizlendi.";}
  for(const x of data.rows||[]){
   const card=document.createElement("article");card.className="coin-card";
   const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.exchange+" • "+(x.fastBuyAlert?"OLAĞAN DIŞI HIZLI ALIŞ":x.mode);
   const p=document.createElement("p");p.textContent="30 sn alış: "+x.buyUsdt+" USDT | Satış: "+x.sellUsdt+" USDT";
   const q=document.createElement("p");q.textContent="Alış ivmesi: "+(x.buyAcceleration??"-")+"x | Satış ivmesi: "+(x.sellAcceleration??"-")+"x";
   const cap=document.createElement("p");cap.textContent="Piyasa değeri: $"+Number(x.marketCapUsd).toLocaleString("en-US",{maximumFractionDigits:0});
   const s=document.createElement("p");s.textContent="Net işlem baskısı: %"+x.imbalancePercent+" | İşlem sayısı: "+x.trades30s;
   const fast=document.createElement("p");
   fast.textContent="10 sn alış hızı: "+(x.buySpeed10s??"-")+"x | Agresif alış payı: "+(x.buySharePercent??"-")+
    "% | 30 sn fiyat değişimi: "+(x.priceChange30s??"-")+"% | Fiyat ivmesi: "+(x.priceAccelerating?"Pozitif":"Teyit yok");
   card.append(h,cap,fast,p,q,s);cards.append(card);
  }
  if(!data.rows?.length){const p=document.createElement("p");p.textContent="100 milyon dolar ve altı piyasa değerinde, doğrulanmış olağan dışı alış veya satış hareketi şu anda yok.";cards.append(p);}
 }catch(e){status.textContent="Veri alınamadı: "+e.message;}
 finally{loading=false;}
}
document.querySelector("#flowRefresh").addEventListener("click",loadFlow);
document.querySelector("#flowButton").addEventListener("click",loadFlow);
setInterval(()=>{if(!document.querySelector("#flow").hidden)loadFlow();},10000);
