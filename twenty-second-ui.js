const start=document.getElementById("twentyStart"),stop=document.getElementById("twentyStop");
const names=["binance","okx","kucoin"];
const state=Object.fromEntries(names.map(k=>[k,{socket:null,history:new Map(),alerts:new Map(),connected:false,error:"",last:0,retry:null,connections:[],tracked:0,baseline:new Map(),pending:new Set()}]));
let running=false,renderTimer=null;

const tradeFeeds=new Map();
function trackTrades(kind,symbol){
 const key=kind+":"+symbol;
 if(kind==="kucoin"||tradeFeeds.has(key)||tradeFeeds.size>=24)return;
 const feed={ws:null,events:[],error:"",last:0};
 tradeFeeds.set(key,feed);
 const url=kind==="binance"?"wss://data-stream.binance.vision/ws/"+symbol.toLowerCase()+"@trade":"wss://ws.okx.com:8443/ws/v5/public";
 try{
  const ws=new WebSocket(url);feed.ws=ws;
  ws.onopen=()=>{if(kind==="okx")ws.send(JSON.stringify({op:"subscribe",args:[{channel:"trades",instId:symbol.replace(/USDT$/,"-USDT")}]}));};
  ws.onmessage=e=>{try{
   const msg=JSON.parse(e.data);
   const trades=kind==="binance"?[msg]:msg.arg?.channel==="trades"?(msg.data||[]):[];
   for(const t of trades){
    const buy=kind==="binance"?t.m===false:t.side==="buy";
    const qty=Number(kind==="binance"?t.q:t.sz),price=Number(kind==="binance"?t.p:t.px);
    if(!(qty>0&&price>0))continue;
    feed.events.push({t:Date.now(),buy,notional:qty*price});feed.last=Date.now();
   }
   while(feed.events.length&&feed.events[0].t<Date.now()-20000)feed.events.shift();
  }catch(err){feed.error=err.message;}};
  ws.onerror=()=>{feed.error="İşlem akışına erişilemiyor";};
  ws.onclose=()=>{feed.error="İşlem akışı kesildi";};
 }catch(e){feed.error=e.message;}
}
function pressure(kind,symbol){
 const feed=tradeFeeds.get(kind+":"+symbol);
 if(!feed)return kind==="kucoin"?"Alış baskısı: KuCoin işlem akışı henüz bağlı değil":"Alış baskısı: Veri bekleniyor";
 const now=Date.now();
 while(feed.events.length&&feed.events[0].t<now-20000)feed.events.shift();
 const events=feed.events;
 if(!events.length||now-feed.last>10000)return "Alış baskısı: "+(feed.error||"İşlem verisi bekleniyor");
 let buy=0,sell=0,buyCount=0,sellCount=0;
 for(const e of events){if(e.buy){buy+=e.notional;buyCount++;}else{sell+=e.notional;sellCount++;}}
 const pct=100*buy/(buy+sell);
 const grade=pct>=80?"Çok güçlü":pct>=65?"Güçlü":pct>=55?"Orta":pct>=45?"Dengeli":"Zayıf";
 return "Alış baskısı: "+grade+" · Alış hacmi: %"+pct.toFixed(1)+" · Satış hacmi: %"+(100-pct).toFixed(1)+" · Alıcı yönlü işlem: "+buyCount+" · Satıcı yönlü işlem: "+sellCount+" · Son 20 sn (benzersiz kişi sayısı değil)";
}
function cleanupTrades(){
 for(const [key,feed] of tradeFeeds){
  const i=key.indexOf(":"),kind=key.slice(0,i),symbol=key.slice(i+1);
  if(!state[kind].alerts.has(symbol)){
   if(feed.ws){feed.ws.onclose=null;feed.ws.close();}
   tradeFeeds.delete(key);
  }
 }
}
function clearTrades(){
 for(const feed of tradeFeeds.values())if(feed.ws){feed.ws.onclose=null;feed.ws.close();}
 tradeFeeds.clear();
}


let backfillGeneration=0;
async function fetchJson(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(7500),cache:"no-store"});
 if(!response.ok)throw Error("HTTP "+response.status);
 return response.json();
}
async function backfillOne(kind,symbol,generation){
 try{
  const inst=symbol.replace(/USDT$/,"-USDT");
  const url=kind==="binance"
   ?"https://data-api.binance.vision/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=1m&limit=12"
   :kind==="okx"?"https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(inst)+"&bar=1m&limit=12"
   :"https://api.kucoin.com/api/v1/market/candles?symbol="+encodeURIComponent(inst)+"&type=1min";
  const data=await fetchJson(url),now=Date.now();
  const candles=kind==="binance"?data.map(x=>({t:Number(x[0]),high:Number(x[2]),close:Number(x[4])})):
   kind==="okx"?(data.data||[]).map(x=>({t:Number(x[0]),high:Number(x[2]),close:Number(x[4])})).reverse():
   (data.data||[]).map(x=>({t:Number(x[0])*1000,high:Number(x[3]),close:Number(x[2])})).reverse();
  if(!running||generation!==backfillGeneration)return;
  const ordered=candles.filter(x=>x.t<=now&&x.high>0&&x.close>0).sort((a,b)=>a.t-b.t);
  let best=null;
  for(const candle of ordered){
   if(candle.t<now-300000||candle.t>now)continue;
   const prior=ordered.filter(x=>x.t<candle.t&&x.t>=candle.t-300000);
   if(prior.length<3)continue;
   const baseline=prior[0].close;
   const change=100*(candle.high/baseline-1);
   const at=Math.min(now,candle.t+59000);
   if(change>=2&&(!best||change>best.change))best={at,change,peak:candle.high,close:baseline,price:candle.close};
  }
  if(!best||!running||generation!==backfillGeneration)return;
  const st=state[kind],old=st.alerts.get(symbol);
  if(old&&old.at>=best.at)return;
  st.alerts.set(symbol,{rawSymbol:symbol,symbol:symbol.replace(/USDT$/,"/USDT"),price:best.price,peak:best.peak,close:best.close,change:+best.change.toFixed(2),at:best.at,first:best.at,historical:true});
  trackTrades(kind,symbol);
 }catch(e){/* A failed historical query must not interrupt live scanning. */}
}
async function backfill(kind,generation){
 const st=state[kind];st.backfillStatus="Geçmiş taranıyor";
 try{
  const url=kind==="binance"?"https://data-api.binance.vision/api/v3/ticker/24hr":kind==="okx"?"https://www.okx.com/api/v5/market/tickers?instType=SPOT":"https://api.kucoin.com/api/v1/market/allTickers";
  const data=await fetchJson(url);
  const items=kind==="binance"?data:kind==="okx"?(data.data||[]):(data.data?.ticker||[]);
  const candidates=items.map(x=>{
   const symbol=kind==="binance"?String(x.symbol||""):String(kind==="okx"?x.instId:x.symbol||"").replace("-","");
   const last=Number(kind==="binance"?x.lastPrice:kind==="okx"?x.last:x.last);
   const open=Number(kind==="binance"?x.openPrice:kind==="okx"?x.open24h:x.last/(1+Number(x.changeRate||0)));
   const volume=kind==="binance"?Number(x.quoteVolume):kind==="okx"?Number(x.volCcy24h)*last:Number(x.volValue);
   return {symbol,score:open>0?100*(last/open-1):0,volume};
  }).filter(x=>x.symbol.endsWith("USDT")&&x.volume>0).sort((a,b)=>b.score-a.score).slice(0,60);
  let checked=0;
  for(let i=0;i<candidates.length;i+=5){
   if(!running||generation!==backfillGeneration)return;
   await Promise.all(candidates.slice(i,i+5).map(x=>backfillOne(kind,x.symbol,generation)));
   checked+=Math.min(5,candidates.length-i);
   st.backfillStatus="Geçmiş: "+checked+"/"+candidates.length+" aday tarandı";
  }
  st.backfillStatus="Geçmiş tarama tamamlandı (ilk 60 aday, 1 dk mum)";
 }catch(e){st.backfillStatus="Geçmiş tarama erişilemedi: "+e.message;}
}

const esc=x=>String(x??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function baseline(kind,symbol){
 const st=state[kind],cached=st.baseline.get(symbol),now=Date.now();
 if(cached&&now-cached.fetched<30000)return cached.close;
 if(st.pending.has(symbol))return null;
 st.pending.add(symbol);
 try{
  const url=kind==="binance"
   ?"https://data-api.binance.vision/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=5m&limit=3"
   :kind==="okx"?"https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(symbol.replace(/USDT$/,"-USDT"))+"&bar=5m&limit=3"
   :"https://api.kucoin.com/api/v1/market/candles?symbol="+encodeURIComponent(symbol.replace(/USDT$/,"-USDT"))+"&type=5min";
  const response=await fetch(url,{signal:AbortSignal.timeout(7000),cache:"no-store"});
  if(!response.ok)throw Error("5dk mum HTTP "+response.status);
  const json=await response.json();
  let closed;
  if(kind==="binance"){closed=json.filter(x=>Number(x[6])<Date.now()).at(-1);closed=closed?Number(closed[4]):null;}
  else if(kind==="okx"){closed=(json.data||[]).find(x=>x[8]==="1");closed=closed?Number(closed[4]):null;}
  else {closed=(json.data||[]).find(x=>Number(x[0])*1000+300000<=Date.now());closed=closed?Number(closed[2]):null;}
  if(!(closed>0))throw Error("Kapanmış 5dk mum bulunamadı");
  st.baseline.set(symbol,{close:closed,fetched:Date.now()});return closed;
 }catch(e){st.error="5dk mum: "+e.message;return null;}
 finally{st.pending.delete(symbol);}
}
async function confirm(kind,symbol,price,peak){
 const st=state[kind],close=await baseline(kind,symbol);
 if(!running||!close)return;
 const change=100*(peak/close-1);
 if(change>=2){const old=st.alerts.get(symbol),now=Date.now();st.alerts.set(symbol,{rawSymbol:symbol,symbol:symbol.replace(/USDT$/,"/USDT"),price,peak,close,change:+change.toFixed(2),at:now,first:old?.first||now});trackTrades(kind,symbol);}
}
function observe(kind,symbol,price){
 if(!running||!(price>0)||!/USDT$/.test(symbol))return;
 const st=state[kind],now=Date.now();st.last=now;
 let h=st.history.get(symbol);if(!h){h=[];st.history.set(symbol,h);}
 if(h.length&&now-h.at(-1).t<300)return;
 h.push({t:now,p:price});while(h.length>1&&h[0].t<now-22000)h.shift();
 const prior=h.find(x=>x.t<=now-18000);if(!prior)return;
 const change=100*(price/prior.p-1);
 if(change>=0.5){const peak=Math.max(...h.map(x=>x.p));void confirm(kind,symbol,price,peak);}
}
function reconnect(kind,fn){const st=state[kind];st.connected=false;if(running&&!st.retry)st.retry=setTimeout(()=>{st.retry=null;fn();},5000);}
let binancePolling=null;
async function pollBinance(){
 if(!running)return;
 const st=state.binance;
 const hosts=["https://data-api.binance.vision","https://api.binance.com","https://api1.binance.com"];
 for(const host of hosts){
  try{
   const response=await fetch(host+"/api/v3/ticker/price",{signal:AbortSignal.timeout(6000),cache:"no-store"});
   if(!response.ok)throw Error("HTTP "+response.status);
   const batch=await response.json();
   if(!Array.isArray(batch))throw Error("Geçersiz fiyat yanıtı");
   let count=0;
   for(const x of batch){if(String(x.symbol||"").endsWith("USDT")){observe("binance",x.symbol,Number(x.price));count++;}}
   if(count){st.connected=true;st.error="";st.tracked=count;return;}
  }catch(e){st.error="Binance REST erişim hatası: "+e.message;}
 }
 st.connected=false;
}
function binance(){
 if(!running)return;const st=state.binance;
 try{
 const ws=new WebSocket("wss://data-stream.binance.vision/ws/!ticker@arr");st.socket=ws;st.connections.push(ws);
 ws.onopen=()=>{st.connected=true;st.error="";};
 ws.onmessage=e=>{try{const data=JSON.parse(e.data);if(Array.isArray(data))for(const t of data)observe("binance",String(t.s||""),Number(t.c));}catch(err){st.error=err.message;}};
 ws.onerror=()=>{st.error="Binance WebSocket erişimi başarısız; REST yedeği deneniyor.";};
 ws.onclose=()=>{st.connected=false;reconnect("binance",binance);};
 }catch(e){st.error=e.message;reconnect("binance",binance);}
 void pollBinance();
 clearInterval(binancePolling);binancePolling=setInterval(()=>{if(running&&Date.now()-st.last>6000)void pollBinance();},5000);
}
let kucoinPolling=null,kucoinBusy=false;
async function pollKucoin(){
 if(!running||kucoinBusy)return;kucoinBusy=true;
 const st=state.kucoin;
 try{
  const response=await fetch("https://api.kucoin.com/api/v1/market/allTickers",{signal:AbortSignal.timeout(8500),cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const json=await response.json();
  if(String(json.code)!=="200000"||!Array.isArray(json.data?.ticker))throw Error("KuCoin fiyat listesi alınamadı");
  let count=0;
  for(const x of json.data.ticker){
   const symbol=String(x.symbol||"");
   if(!symbol.endsWith("-USDT"))continue;
   observe("kucoin",symbol.replace("-",""),Number(x.last));count++;
  }
  st.tracked=count;st.connected=count>0;st.error="";
 }catch(e){st.connected=false;st.error="KuCoin veri hatası: "+e.message;}
 finally{kucoinBusy=false;}
}
function kucoin(){
 void pollKucoin();clearInterval(kucoinPolling);
 kucoinPolling=setInterval(()=>{if(running)void pollKucoin();},3000);
}
async function okx(){
 if(!running)return;const st=state.okx;
 try{
 const response=await fetch("https://www.okx.com/api/v5/public/instruments?instType=SPOT",{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error("OKX parite listesi HTTP "+response.status);
 const data=await response.json();if(String(data.code)!=="0")throw Error("OKX parite listesi alınamadı");
 const symbols=(data.data||[]).filter(x=>x.quoteCcy==="USDT"&&x.state==="live").map(x=>x.instId);
 st.tracked=symbols.length;
 if(!symbols.length)throw Error("Aktif USDT paritesi bulunamadı");
 const chunks=[];for(let i=0;i<symbols.length;i+=80)chunks.push(symbols.slice(i,i+80));
 let index=0;
 for(const chunk of chunks){
  if(!running)return;
  const ws=new WebSocket("wss://ws.okx.com:8443/ws/v5/public");st.connections.push(ws);
  ws.onopen=()=>{st.connected=true;st.error="";ws.send(JSON.stringify({op:"subscribe",args:chunk.map(instId=>({channel:"tickers",instId}))}));};
  ws.onmessage=e=>{try{const msg=JSON.parse(e.data);if(msg.event==="error"){st.error=msg.msg||"Abonelik hatası";return;}if(msg.arg?.channel==="tickers")for(const t of msg.data||[])observe("okx",String(t.instId||"").replace("-",""),Number(t.last));}catch(err){st.error=err.message;}};
  ws.onerror=()=>{st.error="OKX WebSocket bağlantı hatası";};
  ws.onclose=()=>{st.connected=st.connections.some(x=>x.readyState===1);if(running)reconnect("okx",restartOkx);};
  index++;if(index%3===0)await new Promise(resolve=>setTimeout(resolve,350));
 }
 }catch(e){st.error=e.message;reconnect("okx",restartOkx);}
}
function restartOkx(){for(const ws of state.okx.connections){ws.onclose=null;ws.close();}state.okx.connections=[];okx();}
function render(){
 for(const kind of names){
 const st=state[kind],status=document.getElementById(kind+"TwentyStatus"),cards=document.getElementById(kind+"TwentyCards");
 if(!status||!cards)return;
 const now=Date.now();for(const [key,v] of st.alerts)if(now-v.at>300000)st.alerts.delete(key);
 cleanupTrades();const rows=[...st.alerts.values()].sort((a,b)=>b.change-a.change).slice(0,50);
 const connected=st.connected&&now-st.last<15000;
 status.textContent=(connected?"CANLI":"BAĞLANTI BEKLENİYOR")+" · İzlenen: "+(kind==="okx"||kind==="kucoin"?st.tracked:st.history.size)+" · Sinyal: "+rows.length+(st.backfillStatus?" · "+st.backfillStatus:"")+(st.error?" · Hata: "+st.error:"");
 cards.innerHTML=rows.length?rows.map(x=>'<article class="info-box"><h3>'+esc(x.symbol)+' · %'+esc(x.change)+(x.historical?' · GEÇMİŞ (1 dk mum)':' · CANLI')+'</h3><p>Son fiyat: '+esc(x.price)+' USDT · 5dk kapanış: '+esc(x.close)+' · 20sn tepe: '+esc(x.peak)+' · Tespit: '+new Date(x.first).toLocaleTimeString("tr-TR")+'</p><p>'+esc(pressure(kind,x.rawSymbol))+'</p><p>'+(x.historical?'Geçmiş tarama yaklaşık sonuçtur: 1 dakikalık mumun en yüksek fiyatı önceki dakikaların kapanışıyla karşılaştırılmıştır; 20 saniyelik artış ve gerçek 5 dk mum kapanışı doğrulanmamıştır.':'20 saniyelik fiyat penceresinin tepe değeri, kapanmış 5 dakikalık mumla karşılaştırıldı. 1 saniyelik OHLC mum doğrulaması değildir.')+'</p></article>').join(""):'<p>'+(!connected?"Canlı veri bekleniyor. Bu durum sıfır sinyal anlamına gelmez.":"Henüz %2 eşiğine ulaşan coin yok.")+'</p>';
 }
}
function begin(){
 if(running)return;clearTrades();backfillGeneration++;running=true;start.disabled=true;stop.disabled=false;
 for(const k of names){const st=state[k];st.history.clear();st.alerts.clear();st.baseline.clear();st.error="";st.backfillStatus="";st.last=0;st.connected=false;}
 binance();okx();kucoin();void backfill("binance",backfillGeneration);void backfill("okx",backfillGeneration);void backfill("kucoin",backfillGeneration);render();renderTimer=setInterval(render,1000);
}
function end(){
 running=false;backfillGeneration++;clearTrades();start.disabled=false;stop.disabled=true;clearInterval(renderTimer);clearInterval(binancePolling);binancePolling=null;clearInterval(kucoinPolling);kucoinPolling=null;
 for(const k of names){const st=state[k];clearTimeout(st.retry);st.retry=null;for(const ws of st.connections){ws.onclose=null;ws.close();}st.connections=[];st.socket=null;st.connected=false;document.getElementById(k+"TwentyStatus").textContent="Durduruldu";}
}
start?.addEventListener("click",begin);stop?.addEventListener("click",end);
