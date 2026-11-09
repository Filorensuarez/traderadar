const ROOT=location.hostname==="filorensuarez.github.io"?"https://traderadar-yro7.onrender.com":location.origin;
const state=document.getElementById("focusStatus"),container=document.getElementById("focusList");
async function refresh(){
 try{
  const response=await fetch(ROOT+"/api/watchlist-motion",{cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  state.textContent=data.updatedAt?"Son kontrol: "+new Date(data.updatedAt).toLocaleTimeString("tr-TR")+(data.running?" • Güncelleniyor":""):"İlk tarama bekleniyor";
  container.replaceChildren();
  const items=[...data.items].sort((a,b)=>(b.status==="HAREKETLİLİK VAR")-(a.status==="HAREKETLİLİK VAR"));
  for(const item of items){
   const box=document.createElement("div");box.className="info-box";box.style.marginBottom="10px";
   const header=document.createElement("div");header.style.cssText="display:flex;justify-content:space-between;gap:12px;align-items:center";
   const title=document.createElement("strong");title.textContent=item.symbol;
   const flag=document.createElement("span");flag.textContent=item.status;flag.style.color=item.status==="HAREKETLİLİK VAR"?"#38d39f":"inherit";
   header.append(title,flag);box.append(header);
   const detail=document.createElement("p");
   detail.textContent=item.error?"Veri alınamadı: "+item.error:item.price===undefined?"Henüz veri yok":"Fiyat: "+item.price+" • 5 dk: %"+item.priceChange+" • Hacim: "+item.volumeX+"x • Alıcı oranı: "+(item.buyRatio===null?"Yok":"%"+item.buyRatio);
   box.append(detail);
   if(item.reasons?.length){const ul=document.createElement("ul");for(const reason of item.reasons){const li=document.createElement("li");li.textContent=reason;ul.append(li);}box.append(ul);}
   container.append(box);
  }
 }catch(e){state.textContent="Bağlantı hatası: "+e.message;}
}
document.getElementById("focusRefresh")?.addEventListener("click",refresh);
refresh();setInterval(refresh,15000);