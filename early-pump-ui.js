// Display ONLY completed hourly EMA7/25 + MACD DIF/DEA bullish dual crosses.
const earlySection=document.querySelector("#earlypump");
const earlyButton=document.querySelector("#earlyPumpButton");
const earlyStatus=document.querySelector("#earlyPumpStatus");
const earlyCards=document.querySelector("#earlyPumpCards");
const earlyScan=document.querySelector("#earlyPumpScan");
const fmt=(value,places=2)=>value!==null&&value!==undefined&&Number.isFinite(Number(value))
 ?Number(value).toLocaleString("tr-TR",{minimumFractionDigits:places,maximumFractionDigits:places}):"Veri yok";
const asPrice=value=>value>0?Number(value).toLocaleString("tr-TR",{maximumSignificantDigits:10}):"Veri yok";
const asTime=value=>value?new Date(value).toLocaleString("tr-TR",
 {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"Veri yok";
function addText(target,text,cls="description"){
 const p=document.createElement("p");p.textContent=text;if(cls)p.className=cls;
 target.append(p);return p;
}
function displayCross(x){
 const box=document.createElement("article");box.className="coin-card";
 const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange;
 box.append(title);
 const status=document.createElement("div");status.className="confirmation confirmed";
 status.textContent="ÇİFT YUKARI KESİŞİM — 1 SAATLİK MUM TEYİDİ";
 box.append(status);
 addText(box,"EMA 7 ↑ EMA 25: "+asTime(x.emaCrossAt)+
  " | MACD DIF ↑ DEA: "+asTime(x.macdCrossAt)+
  " | İki koşulun tamamlandığı zaman: "+asTime(x.signalConfirmedAt));
 addText(box,"EMA 7: "+asPrice(x.ema7)+" | EMA 25: "+asPrice(x.ema25)+
  " | EMA 99 (bilgi): "+asPrice(x.ema99)+
  " | MACD DIF: "+fmt(x.macdDIF,7)+
  " | DEA: "+fmt(x.macdDEA,7)+
  " | Histogram: "+fmt(x.macdHistogram,7));
 addText(box,"Güncel fiyat: "+asPrice(x.price)+" USDT"+
  " | Alış kotasyonu: "+asPrice(x.ask)+" USDT"+
  " | Kesişim mumundan değişim: %"+fmt(x.riseFromCrossPct));
 addText(box,"ATR tabanlı örnek teknik yükseliş alanı: %"+fmt(x.potentialPct)+
  " | Teknik hedef: "+asPrice(x.technicalTarget)+" USDT"+
  " | Bu bir fiyat garantisi veya otomatik alım değildir.");
 addText(box,"Makas: %"+fmt(x.spreadPct,3)+" | Son 24s işlem hacmi: "+
  fmt(x.volume24h,0)+" USDT | Son kontrol: "+asTime(x.lastCheckedAt));
 return box;
}
async function updateCrosses(){
 if(earlySection.hidden)return;
 try{
  const response=await fetch("/api/early-pump",{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  const coverage=Object.entries(data.sources||{}).map(([name,item])=>
   name+": "+(item.checked||0)+"/"+(item.eligible||0)+(item.error?" (hata: "+item.error+")":"")).join(" | ");
  earlyStatus.textContent=(data.running?"Tarama sürüyor | ":"")+
   "Son tamamlanan: "+(data.updatedAt?asTime(data.updatedAt):"Henüz yok")+
   " | Bu tur taranan: "+(data.checked||0)+" / Uygun piyasa: "+(data.eligible||0)+
   " | Çift kesişim: "+(data.rows||[]).length+
   " | Mum veri hatası: "+(data.failed||0)+
   (coverage?"\nKaynaklar: "+coverage:"")+
   ((data.errors||[]).length?"\nİlk hata: "+data.errors[0]:"");
  earlyCards.replaceChildren();
  if(!(data.rows||[]).length){
   addText(earlyCards,data.running?
    "Saatlik mumlar kontrol ediliyor. İki pozitif kesişim birlikte tamamlanırsa listelenecek.":
    "Bu taramada son 2 kapanmış saatlik mum içinde EMA7/25 ve MACD DIF/DEA yukarı kesişimleri birlikte doğrulanmış coin bulunamadı. Tarama pariteleri dönüşümlü gezer.");
  }else{
   for(const row of data.rows)earlyCards.append(displayCross(row));
  }
 }catch(err){earlyStatus.textContent="Çift kesişim verisi alınamadı: "+err.message;}
}
earlyButton?.addEventListener("click",()=>queueMicrotask(updateCrosses));
earlyScan?.addEventListener("click",async()=>{
 if(earlyScan.disabled)return;
 earlyScan.disabled=true;earlyScan.textContent="Tarama başlatılıyor...";
 try{
  const r=await fetch("/api/early-pump/scan",{method:"POST"});
  if(!r.ok)throw Error("HTTP "+r.status);
  await updateCrosses();
 }catch(err){earlyStatus.textContent="Tarama başlatılamadı: "+err.message;}
 finally{earlyScan.disabled=false;earlyScan.textContent="Şimdi Tara";}
});
setInterval(updateCrosses,6000);
