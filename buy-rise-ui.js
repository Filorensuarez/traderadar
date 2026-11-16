const status=document.getElementById("buyRiseStatus"),cards=document.getElementById("buyRiseCards");
const api=(window.TRADERADAR_API_BASE||window.API_BASE||"").replace(/\/$/,"");
const esc=x=>String(x??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hist=new Map(),signals=new Map();let ws=null,live=false,lastTick=0,connectionError="",retry=null;
function connect(){
 if(ws&&[0,1].includes(ws.readyState))return;
 try{
 ws=new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");
 ws.onopen=()=>{live=true;connectionError="";};
 ws.onmessage=e=>{try{const batch=JSON.parse(e.data);if(!Array.isArray(batch))return;const now=Date.now();lastTick=now;
 for(const x of batch){
 const symbol=String(x.s||""),price=Number(x.c),q=Number(x.q);
 if(!/^[A-Z0-9]+USDT$/.test(symbol)||!(price>0)||!(q>=0))continue;
 let h=hist.get(symbol);if(!h){h=[];hist.set(symbol,h);}
 h.push({t:now,p:price,q});while(h.length>1&&h[0].t<now-65000)h.shift();
 const base=ms=>{let found=null;for(const v of h){if(v.t<=now-ms)found=v;else break;}return found;};
 const b5=base(5000),b10=base(10000),b30=base(30000),b60=base(60000);
 if(!b5||!b10)continue;
 const p5=100*(price/b5.p-1),p10=100*(price/b10.p-1);
 if(p5<0.12||p10<0.25||q<=b10.q)continue;
 const pct=b=>b?+(100*(price/b.p-1)).toFixed(3):null;
 const score=p5*3+p10*2+Math.max(0,b30?100*(price/b30.p-1):0);
 signals.set(symbol,{symbol:symbol.replace(/USDT$/,"/USDT"),price,change5Pct:pct(b5),change10Pct:pct(b10),change30Pct:pct(b30),change60Pct:pct(b60),score:+score.toFixed(2),observedAt:now,status:p10>=0.6?"GÜÇLÜ YÜKSELİŞ":"İLK YÜKSELİŞ"});
 }
 }catch(err){connectionError="Veri işlenemedi: "+err.message;}};
 ws.onerror=()=>{connectionError="Binance WebSocket bağlantı hatası";};
 ws.onclose=()=>{live=false;ws=null;clearTimeout(retry);retry=setTimeout(connect,5000);};
 }catch(e){connectionError=e.message;clearTimeout(retry);retry=setTimeout(connect,5000);}
}
let server=null,flow=null;
async function fetchData(){
 const results=await Promise.allSettled(["/api/seconds-radar","/api/buy-rise"].map(async p=>{const r=await fetch(api+p,{cache:"no-store",signal:AbortSignal.timeout(6500)});if(!r.ok)throw Error("HTTP "+r.status);return r.json();}));
 server=results[0].status==="fulfilled"?results[0].value:null;
 flow=results[1].status==="fulfilled"?results[1].value:null;
}
function draw(){
 if(!status||!cards)return;
 const now=Date.now();for(const [k,v] of signals)if(now-v.observedAt>15000)signals.delete(k);
 const browserRows=[...signals.values()].sort((a,b)=>b.score-a.score);
 const remote=(server?.rows||[]).filter(x=>now-x.observedAt<15000);
 const rows=live?browserRows:remote;
 const buys=(flow?.rows||[]).filter(x=>now-x.observedAt<15000);
 const tracked=live?hist.size:(server?.trackedSymbols||0);
 const connected=live&&now-lastTick<15000;
 status.textContent=(connected?"CANLI TARAMA":"BAĞLANTI BEKLENİYOR")+" · İzlenen: "+tracked+" · Yükseliş: "+rows.length+" · Alım teyidi: "+buys.length+" · "+new Date().toLocaleTimeString("tr-TR")+(connectionError?" · "+connectionError:"");
 const render=(arr,buy)=>arr.length?arr.slice(0,40).map(x=>'<article class="info-box" style="margin:8px 0"><h3>'+esc(x.symbol)+' · '+esc(x.status)+'</h3><p>'+esc(buy?x.exchange:"BINANCE GLOBAL")+' · Fiyat: '+esc(x.price)+' USDT · 5 sn: %'+esc(x.change5Pct)+' · 10 sn: %'+esc(x.change10Pct)+' · 30 sn: %'+esc(x.change30Pct)+'</p><p>'+(buy?'Alıcı oranı: %'+esc(x.buySharePct)+' · Hacim ivmesi: '+esc(x.volumeAcceleration)+'x':'Fiyat ivme puanı: '+esc(x.score)+' · Alım yönü doğrulanmadı')+'</p></article>').join(""):'<p>Şu anda koşulları karşılayan sinyal yok.</p>';
 cards.innerHTML='<h3>Saniyelik Fiyat Ön Alarmı — Binance Global</h3>'+render(rows,false)+'<h3>Alım Baskısı Teyidi — Gate.io</h3>'+render(buys,true);
}
document.getElementById("buyRiseRefresh")?.addEventListener("click",()=>{connect();fetchData().then(draw);});
connect();fetchData().then(draw);draw();
setInterval(()=>{if(!document.hidden){connect();draw();}},1000);
setInterval(()=>{if(!document.hidden)fetchData().then(draw);},5000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){connect();fetchData().then(draw);}});
