(()=>{
const el=id=>document.getElementById(id);
const API=location.hostname==="filorensuarez.github.io"?"https://traderadar-v3-production.up.railway.app":"";
let timer=null,seen=new Set();
async function refresh(){
try{const response=await fetch(API+"/api/quiet-volume",{cache:"no-store"});if(!response.ok)throw Error("HTTP "+response.status);const d=await response.json();
el("quietStatus").textContent=d.running?"Sunucuda izleme aktif • Bağlı akış: "+d.connectedStreams:"Sunucu başlatılıyor: "+(d.lastError||"bekleniyor");
el("quietStats").textContent="Toplam parite: "+d.universe+" • Veri alınan: "+d.tracked+" • 2 dk hazır: "+d.ready+" • Alarm: "+d.alarms.length;
const cards=el("quietCards");cards.replaceChildren();for(const a of d.alarms){const c=document.createElement("article");c.className="coin-card";const h=document.createElement("h3");h.textContent=a.symbol+" • ALIŞ HACMİ UYANIŞI";const p=document.createElement("p");p.textContent="Alış: "+a.buyUsdt+" USDT • Alış oranı: %"+a.buyRatio+" • Hızlanma: "+a.acceleration+"x • "+new Date(a.time).toLocaleString("tr-TR");c.append(h,p);cards.append(c)}
}catch(e){el("quietStatus").textContent="Sunucuya erişilemiyor: "+e.message}
}
function decodeBase64(s){const padding="=".repeat((4-s.length%4)%4);const bin=atob((s+padding).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(bin,c=>c.charCodeAt(0))}
async function enablePush(){
try{
if(!("serviceWorker" in navigator)||!("PushManager" in window))throw Error("Bu tarayıcı push desteklemiyor");
const key=await fetch(API+"/api/push/key").then(r=>r.json());if(!key.publicKey)throw Error("Sunucuda VAPID anahtarları ayarlı değil");
const permission=await Notification.requestPermission();if(permission!=="granted")throw Error("Bildirim izni verilmedi");
const registration=await navigator.serviceWorker.register("./service-worker.js");
const sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeBase64(key.publicKey)});
const response=await fetch(API+"/api/push/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(sub)});if(!response.ok)throw Error("Abonelik kaydedilemedi");
el("quietStatus").textContent="Telefon push bildirimlerine kaydedildi.";
}catch(e){el("quietStatus").textContent="Bildirim kurulamadı: "+e.message}
}
el("quietStart")?.addEventListener("click",()=>{refresh();if(!timer)timer=setInterval(refresh,5000)});
el("quietStop")?.addEventListener("click",()=>{if(timer)clearInterval(timer);timer=null;el("quietStatus").textContent="Ekran yenilemesi durduruldu; sunucu izlemeye devam eder."});
el("quietPush")?.addEventListener("click",enablePush);refresh();timer=setInterval(refresh,5000);
})();