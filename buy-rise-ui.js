const endpoint = (window.TRADERADAR_API_BASE || window.API_BASE || "").replace(/\/$/,"");
const status = document.getElementById("buyRiseStatus");
const cards = document.getElementById("buyRiseCards");
const refresh = document.getElementById("buyRiseRefresh");
let lastAlert = new Set();
function safe(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function update(){
 if(!status||!cards)return;
 try{
  const response=await fetch(endpoint+"/api/buy-rise",{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  status.textContent=(data.connected?"Canlı":"Bağlantı bekleniyor")+" · "+data.trackedSymbols+" parite · "+data.rows.length+" sinyal · "+new Date(data.updatedAt).toLocaleTimeString("tr-TR")+(data.lastError?" · "+data.lastError:"");
  cards.innerHTML=data.rows.length?data.rows.map(r=>'<article class="info-box" style="margin:8px 0"><h3>'+safe(r.symbol)+' · '+safe(r.status)+'</h3><p>'+safe(r.exchange)+' · Fiyat: '+safe(r.price)+' USDT · 10 sn: %'+safe(r.change10Pct)+' · 30 sn: %'+safe(r.change30Pct)+'</p><p>Alım oranı: %'+safe(r.buySharePct)+' · Hacim ivmesi: '+safe(r.volumeAcceleration)+'x · İşlem: '+safe(r.trades10s)+'</p></article>').join(""):'<p>Henüz fiyat artışı ve alım baskısı birlikte doğrulanan coin yok. En az 60 saniyelik canlı veri birikmesi gerekir.</p>';
  lastAlert=new Set(data.rows.map(r=>r.symbol));
 }catch(e){status.textContent="Radar verisi alınamadı: "+e.message;}
}
refresh?.addEventListener("click",update);
update();setInterval(()=>{if(!document.hidden)update();},5000);
