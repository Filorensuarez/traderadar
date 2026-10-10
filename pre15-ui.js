const section=document.querySelector("#pre15");
const status=document.querySelector("#pre15Status");
const cards=document.querySelector("#pre15Cards");
const history=document.querySelector("#pre15HistoryResult");
let busy=false;
const trNumber=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toLocaleString("tr-TR",{maximumFractionDigits:d}):"-";
function row(label,value,parent){
 const p=document.createElement("p");p.textContent=label+": "+value;parent.append(p);
}
async function refresh(){
 if(busy)return;busy=true;
 try{
  const response=await fetch("/api/pre15/status",{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  cards.replaceChildren();
  status.textContent=(data.lastError?"Tarama sorunu: "+data.lastError+" | ":"")+
   "Son tarama: "+(data.updatedAt?new Date(data.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yok")+
   " | Uygun parite: "+(data.eligible||0)+
   " | Son tur: "+(data.checked||0)+" | Veri hatası: "+(data.errors||0);
  if(data.cap?.stale)status.textContent+=" | Piyasa değeri kaynağı güncel değil.";
  for(const x of data.rows||[]){
   const card=document.createElement("article");card.className="coin-card";
   const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.exchange+" • "+x.status;
   card.append(h);
   row("Hazırlık puanı",x.score+"/100",card);
   row("Piyasa değeri","$"+trNumber(x.marketCapUsd,0),card);
   row("15 dk fiyat değişimi","%"+trNumber(x.change15Pct),card);
   row("15 dk hacim ivmesi",trNumber(x.volumeRatio)+"x",card);
   row("Son 3 dk hacim ivmesi",trNumber(x.last3VolumeRatio)+"x",card);
   row("Dirence uzaklık","%"+trNumber(x.distancePct),card);
   row("İşaretler",(x.reasons||[]).join(" • "),card);
   cards.append(card);
  }
  if(!data.rows?.length)row("Sonuç","Şu anda doğrulanmış yükseliş hazırlığı bulunmuyor. Bu, piyasanın tamamının tarandığı anlamına gelmez.",cards);
 }catch(e){status.textContent="Veri alınamadı: "+e.message;}
 finally{busy=false;}
}
document.querySelector("#pre15Refresh").addEventListener("click",refresh);
document.querySelector("#pre15Button").addEventListener("click",refresh);
setInterval(()=>{if(!section.hidden)refresh();},15000);
document.querySelector("#pre15History").addEventListener("click",async()=>{
 const symbol=document.querySelector("#pre15Symbol").value.trim().toUpperCase();
 const local=document.querySelector("#pre15Event").value;
 if(!/^[A-Z0-9]{2,24}$/.test(symbol)||!local){history.textContent="Coin ve olayın başlangıç saatini girin.";return;}
 history.textContent="Geçmiş mumlar inceleniyor...";
 try{
  const iso=new Date(local).toISOString();
  const response=await fetch("/api/pre15/history?symbol="+encodeURIComponent(symbol)+"&event="+encodeURIComponent(iso),{cache:"no-store"});
  const data=await response.json();
  if(!response.ok||!data.ok)throw Error(data.error||"İnceleme yapılamadı");
  history.replaceChildren();
  const h=document.createElement("h3");h.textContent=data.symbol+" • Olay öncesi inceleme";history.append(h);
  row("Olay öncesi teknik durum",data.before.status||"Veri yetersiz",history);
  row("Olay öncesi puan",(data.before.score??0)+"/100",history);
  row("Hacim oranı",(data.before.volumeRatio??"-")+"x",history);
  row("İşaretler",(data.before.reasons||[]).join(" • ")||data.before.reason||"-",history);
  row("Sonraki 15 dk kapanış değişimi",data.future15Pct===null?"Veri yok":"%"+data.future15Pct,history);
  row("Sonraki 60 dk kapanış değişimi",data.future60Pct===null?"Veri yok":"%"+data.future60Pct,history);
  row("Not",data.warning,history);
 }catch(e){history.textContent="Geçmiş analiz hatası: "+e.message;}
});
