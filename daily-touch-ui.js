const status=document.getElementById("dailyTouchStatus"),cards=document.getElementById("dailyTouchCards"),scanButton=document.getElementById("dailyTouchScan"),stopButton=document.getElementById("dailyTouchStop");
const seen=new Set();let initialLoad=true;
const fmt=(n,d=4)=>Number.isFinite(n)?n.toLocaleString("tr-TR",{maximumFractionDigits:d}):"—";
function notify(x){const key=x.market+":"+x.day;if(seen.has(key))return;seen.add(key);if(Notification.permission==="granted")new Notification("TradeRadar: %2 momentum",{body:x.symbol+" | 10/30 ortalama farkı: %"+fmt(x.gainPct,2)});}
async function refresh(){
 try{
 const r=await fetch("/api/daily-touch",{cache:"no-store",signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error("HTTP "+r.status);
 const d=await r.json();status.textContent="Durum: "+d.status+" | Taranan: "+d.checked+" / "+d.eligible+" | Kalan: "+d.remaining+" | Sinyal: "+d.rows.length+" | Hata: "+d.failed;
 scanButton.disabled=!!d.running;stopButton.disabled=!d.running;cards.replaceChildren();
 if(!d.rows.length){const p=document.createElement("p");p.textContent="Henüz %2 koşulunu sağlayan coin bulunmadı.";cards.append(p);}
 for(const x of d.rows){
 if(initialLoad)seen.add(x.market+":"+x.day);else if(typeof Notification!=="undefined")notify(x);
 const card=document.createElement("article");card.className="coin-card";
 const h=document.createElement("h3");h.textContent=x.symbol+" • %2 MOMENTUM";card.append(h);
 for(const line of ["Son 10 mum ortalaması: "+fmt(x.recent,8),"Önceki 30 mum ortalaması: "+fmt(x.baseline,8),"Fark: %"+fmt(x.gainPct,2)+" | Son fiyat: "+fmt(x.close,8),"Son kapalı mum: "+new Date(x.day).toLocaleString("tr-TR")]){const p=document.createElement("p");p.textContent=line;card.append(p);}
 const link=document.createElement("a");link.textContent="Binance grafiğini aç ↗";link.href="https://www.binance.com/tr/trade/"+encodeURIComponent(x.market.replace(/(USDT|TRY)$/,"_$1"));link.target="_blank";link.rel="noopener noreferrer";card.append(link);cards.append(card);
 }
 initialLoad=false;
 if(d.error){const p=document.createElement("p");p.textContent="Son hata: "+d.error;cards.append(p);}
 }catch(e){status.textContent="Tarama verisi alınamadı: "+e.message;}
}
scanButton?.addEventListener("click",async()=>{scanButton.disabled=true;try{await fetch("/api/daily-touch/scan",{method:"POST"});await refresh();}catch(e){status.textContent=e.message;}});
stopButton?.addEventListener("click",async()=>{await fetch("/api/daily-touch/stop",{method:"POST"});await refresh();});
document.getElementById("dailyTouchNotify")?.addEventListener("click",async()=>{if(typeof Notification==="undefined")return;const p=await Notification.requestPermission();document.getElementById("dailyTouchNotify").textContent=p==="granted"?"Bildirimler açık":"Bildirim izni verilmedi";});
refresh();setInterval(refresh,2000);
