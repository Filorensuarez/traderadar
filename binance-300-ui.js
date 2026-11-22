const status=document.getElementById("binance300Status"),cards=document.getElementById("binance300Cards");
let busy=false;
async function update(){
 if(busy||!status||!cards)return;busy=true;
 try{
  const response=await fetch("/api/binance-300",{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json(),s=data.state;
  status.textContent=(s.ready?"Radar aktif":s.connected?"Fiyat akışı bağlı; saatlik referans bekleniyor":"Fiyat bağlantısı yok")+" | USDT pariteleri: "+s.total+" | Saatlik referansı hazır: "+s.referencesReady+" | Fiyat hafızası: "+s.tracked+" | Son 300 sn alarm: "+data.rows.length+(s.error?" | REST sorunu: "+s.error:"");
  cards.replaceChildren();
  for(const item of data.rows){
   const article=document.createElement("article");article.className="coin-card";
   const title=document.createElement("h3");title.textContent=item.symbol+" · +%"+item.changePct;
   const detail=document.createElement("p");detail.textContent="Fiyat: "+item.price+" USDT | Son kapanmış 1 saatlik mum: "+item.referenceClose+" USDT";
   const time=document.createElement("p");time.textContent="Tespit: "+new Date(item.at).toLocaleTimeString("tr-TR")+" | 300 saniyelik izleme";
   article.append(title,detail,time);cards.append(article);
  }
  if(!data.rows.length){const p=document.createElement("p");p.textContent="Henüz yeni %2 eşik geçişi yok. Saatlik referanslar yüklenirken canlı fiyatlar hafızaya alınır.";cards.append(p);}
 }catch(e){status.textContent="Radar verisi alınamadı: "+e.message;}
 finally{busy=false;}
}
document.getElementById("binance300Refresh")?.addEventListener("click",update);
update();setInterval(()=>{if(!document.hidden)update();},1000);
