(()=>{
"use strict";
const el=id=>document.getElementById(id),state=new Map(),sockets=[];
let active=false,session=0,alarms=0,universe=0,started=0;
const status=s=>{el("quietStatus").textContent=s};
const settings=()=>({factor:Number(el("quietFactor").value),ratio:Number(el("quietRatio").value)/100,min:Number(el("quietMinUsdt").value)});
function stats(){let ready=0;for(const x of state.values())if(Date.now()-x.first>=120000)ready++;el("quietStats").textContent="İzlenen: "+state.size+"/"+universe+" • 2 dk verisi hazır: "+ready+" • Alarm: "+alarms;}
function trade(d){if(!active||!d?.s||!d?.p||!d?.q)return;const now=Date.now(),price=Number(d.p),quantity=Number(d.q),value=price*quantity;if(!(value>0))return;
let x=state.get(d.s);if(!x){x={first:now,trades:[],lastAlarm:0};state.set(d.s,x)}
x.trades.push({t:Number(d.T)||now,v:value,buy:d.m===false,p:price});
while(x.trades.length&&x.trades[0].t<now-145000)x.trades.shift();
if(now-x.first<120000||now-x.lastAlarm<120000)return;
const cfg=settings();if(!(cfg.factor>=2&&cfg.factor<=100&&cfg.ratio>=.5&&cfg.ratio<=1&&cfg.min>=10))return;
const recent=x.trades.filter(z=>z.t>=now-15000),prior=x.trades.filter(z=>z.t<now-15000&&z.t>=now-135000);
const recentTotal=recent.reduce((a,z)=>a+z.v,0),recentBuy=recent.reduce((a,z)=>a+(z.buy?z.v:0),0);
const priorTotal=prior.reduce((a,z)=>a+z.v,0),priorBuy=prior.reduce((a,z)=>a+(z.buy?z.v:0),0);
const priorAverage=priorTotal/8,priorBuyAverage=priorBuy/8;
if(recentBuy<cfg.min||recentTotal<=0||recentBuy/recentTotal<cfg.ratio||priorAverage>=cfg.min||recentBuy<cfg.factor*Math.max(priorBuyAverage,1))return;
x.lastAlarm=now;alarms++;
const card=document.createElement("article");card.className="coin-card";card.style.cssText="padding:14px;margin:8px 0;border:1px solid #41516a;border-radius:12px";
const h=document.createElement("h3");h.textContent=d.s+" • ALIŞ HACMİ UYANIŞI";
const p=document.createElement("p");p.textContent="Son 15 sn alış: "+recentBuy.toFixed(0)+" USDT • Alış oranı: %"+(100*recentBuy/recentTotal).toFixed(1)+" • Önceki 2 dk ort. 15 sn alış: "+priorBuyAverage.toFixed(0)+" USDT • Hızlanma: "+(recentBuy/Math.max(priorBuyAverage,1)).toFixed(1)+"x • "+new Date(now).toLocaleTimeString("tr-TR");
const a=document.createElement("a");a.href="https://www.binance.com/en/trade/"+encodeURIComponent(d.s.replace("USDT","_USDT"));a.target="_blank";a.rel="noopener noreferrer";a.textContent="Grafiği aç";
card.append(h,p,a);el("quietCards").prepend(card);while(el("quietCards").children.length>80)el("quietCards").lastElementChild.remove();stats();
}
function connect(symbols,token){const streams=symbols.map(s=>s.toLowerCase()+"@aggTrade").join("/");const url="wss://data-stream.binance.vision/stream?streams="+streams;const ws=new WebSocket(url);sockets.push(ws);
ws.onopen=()=>{if(token===session)status("Canlı bağlantı açık • "+universe+" parite • İlk 2 dakika veri biriktiriliyor")};
ws.onmessage=e=>{if(!active||token!==session)return;try{trade(JSON.parse(e.data).data)}catch(_){}};
ws.onerror=()=>{if(token===session)status("Bağlantı hatası; veri akışını kontrol edin.")};
ws.onclose=()=>{if(token!==session||!active)return;for(const sym of symbols)state.delete(sym);status("Bağlantı koptu; ilgili pariteler yeniden hazırlanıyor.");setTimeout(()=>{if(active&&token===session)connect(symbols,token)},3500)};
}
async function start(){stop();const cfg=settings();if(!(cfg.factor>=2&&cfg.factor<=100&&cfg.ratio>=.5&&cfg.ratio<=1&&cfg.min>=10)){status("Filtre değerleri geçersiz.");return}
active=true;const token=++session;started=Date.now();alarms=0;universe=0;el("quietCards").textContent="Piyasa listesi alınıyor...";status("Binance USDT pariteleri hazırlanıyor...");
try{
const exchange=await fetch("https://data-api.binance.vision/api/v3/exchangeInfo").then(r=>r.json());
if(!active||token!==session)return;
const allowed=new Set((exchange.symbols||[]).filter(s=>s.status==="TRADING"&&s.quoteAsset==="USDT"&&s.isSpotTradingAllowed!==false&&!/(UP|DOWN|BULL|BEAR)USDT$/.test(s.symbol)).map(s=>s.symbol));
const symbols=[...allowed];
if(!symbols.length)throw Error("Uygun USDT paritesi bulunamadı");
universe=symbols.length;el("quietCards").textContent="Alış hacmi uyanışı bekleniyor...";for(let i=0;i<symbols.length;i+=40)connect(symbols.slice(i,i+40),token);stats();
}catch(e){if(token===session){status("Başlatılamadı: "+e.message);stop(false)}}
}
function stop(show=true){active=false;++session;for(const s of sockets.splice(0))try{s.close()}catch(_){}state.clear();if(show)status("Canlı izleme durduruldu.");stats()}
el("quietStart")?.addEventListener("click",start);el("quietStop")?.addEventListener("click",()=>stop());
setInterval(()=>{if(active)stats()},5000);
})();