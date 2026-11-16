const status=document.getElementById("buyRiseStatus"),cards=document.getElementById("buyRiseCards"),refresh=document.getElementById("buyRiseRefresh");
const api=(window.TRADERADAR_API_BASE||window.API_BASE||"").replace(/\/$/,"");
const esc=x=>String(x??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function load(){
 if(!status||!cards)return;
 try{
 const [a,b]=await Promise.allSettled(["/api/seconds-radar","/api/buy-rise"].map(async p=>{const r=await fetch(api+p,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json();}));
 const seconds=a.status==="fulfilled"?a.value:null,flow=b.status==="fulfilled"?b.value:null;
 if(!seconds&&!flow)throw Error("İki veri kaynağına da erişilemiyor");
 const first=(seconds?.rows||[]).slice(0,35),buys=(flow?.rows||[]).slice(0,35);
 status.textContent="Binance izlenen: "+(seconds?.trackedSymbols??"bağlantı yok")+" · Saniyelik yükseliş: "+first.length+" · Alım teyidi: "+buys.length+" · "+new Date().toLocaleTimeString("tr-TR");
 const render=(rows,buy)=>rows.length?rows.map(x=>'<article class="info-box" style="margin:8px 0"><h3>'+esc(x.symbol)+' · '+esc(x.status)+'</h3><p>'+esc(x.exchange)+' · Fiyat: '+esc(x.price)+' USDT · 5 sn: %'+esc(x.change5Pct)+' · 10 sn: %'+esc(x.change10Pct)+' · 30 sn: %'+esc(x.change30Pct)+'</p><p>'+(buy?'Alıcı oranı: %'+esc(x.buySharePct)+' · Alım/hacim ivmesi: '+esc(x.volumeAcceleration)+'x':'Fiyat ivmesi puanı: '+esc(x.score)+' · Alım yönü henüz doğrulanmadı')+'</p></article>').join(""):'<p>Şu anda eşiklere uyan sinyal yok.</p>';
 cards.innerHTML='<h3>Saniyelik Fiyat Ön Alarmı — Binance Global</h3>'+render(first,false)+'<h3>Alım Baskısı Teyidi — Gate.io</h3>'+render(buys,true);
 }catch(e){status.textContent="Radar bağlantısı: "+e.message;}
}
refresh?.addEventListener("click",load);load();setInterval(()=>{if(!document.hidden)load();},2000);
