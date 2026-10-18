// Independent Temas Araması UI: the entire available spot universe is scanned.
const status=document.getElementById("dailyTouchStatus");
const cards=document.getElementById("dailyTouchCards");
const scanButton=document.getElementById("dailyTouchScan");
const stopButton=document.getElementById("dailyTouchStop");
const fmt=(value,d=4)=>Number.isFinite(value)?value.toLocaleString("tr-TR",{maximumFractionDigits:d}):"—";
async function refresh(){
 try{
  const r=await fetch("/api/daily-touch",{cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  const data=await r.json();
  const total=Number(data.eligible)||0,checked=Number(data.checked)||0,remaining=Math.max(0,total-checked);
  status.textContent="Durum: "+(data.status==="rate-limited"?"API sınırı nedeniyle beklemede":
    data.status==="completed"?"Tarama tamamlandı":data.status==="running"?"Taranıyor":
    data.status==="stopping"?"Durduruluyor":data.status==="stopped"?"Durduruldu":
    data.status==="error"?"Veri hatası":"Başlatılıyor")+
    " | Taranan: "+checked+" / "+total+
    " | Kalan: "+remaining+" | Temas: "+data.rows.length+
    " | Veri hatası: "+data.failed+
    (data.waitUntil?" | Bekleme: "+Math.max(0,Math.ceil((data.waitUntil-Date.now())/1000))+" sn":"")+
    (data.updatedAt?" | Son tamamlanan: "+new Date(data.updatedAt).toLocaleTimeString("tr-TR"):"");
  scanButton.disabled=Boolean(data.running);
  stopButton.disabled=!data.running;
  cards.replaceChildren();
  if(!data.rows.length){
    const p=document.createElement("p");
    p.textContent=data.running?"Tüm uygun spot coinler inceleniyor; henüz teyitli temas bulunmadı.":
      "Şu anda günlük temas koşullarını karşılayan, yükselişi başlamamış coin bulunamadı.";
    cards.appendChild(p);
  }
  for(const x of data.rows){
    const card=document.createElement("article");card.className="coin-card";
    const h=document.createElement("h3");h.textContent=x.symbol+" • TEMAS / KIRILIM YOK";card.appendChild(h);
    for(const line of [
      "Son kapalı mum: "+new Date(x.day).toLocaleDateString("tr-TR"),
      "Kapanış "+fmt(x.close,7)+" | EMA7 "+fmt(x.ema7,7)+" | EMA25 "+fmt(x.ema25,7)+" | EMA99 "+fmt(x.ema99,7),
      "EMA7/25 farkı: %"+fmt(x.gapPct,2)+" | Son 3 günlük değişim: %"+fmt(x.gain3,2)
    ]){const p=document.createElement("p");p.textContent=line;card.appendChild(p);}
    const a=document.createElement("a");
    a.textContent="Binance grafiğini aç ↗";
    a.href="https://www.binance.com/tr/trade/"+encodeURIComponent(x.market.replace(/(USDT|TRY)$/,"_$1"));
    a.target="_blank";a.rel="noopener noreferrer";card.appendChild(a);cards.appendChild(card);
  }
  if(data.error){const p=document.createElement("p");p.textContent="Son hata: "+data.error;cards.appendChild(p);}
 }catch(e){status.textContent="Temas Araması yüklenemedi: "+e.message;}
}
scanButton?.addEventListener("click",async()=>{
 scanButton.disabled=true;
 try{await fetch("/api/daily-touch/scan",{method:"POST"});await refresh();}
 catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{scanButton.disabled=false;}
});
stopButton?.addEventListener("click",async()=>{
 stopButton.disabled=true;
 try{await fetch("/api/daily-touch/stop",{method:"POST"});await refresh();}
 catch(e){status.textContent="Durdurma isteği başarısız: "+e.message;}
});
refresh();setInterval(refresh,15000);
