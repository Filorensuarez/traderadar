// Live in-memory drop detection. Ticker WebSockets are the fast path; closed 1h candle
// references are refreshed asynchronously. A signal is confirmed against 1m candle low.
const $=id=>document.getElementById(id);
const feeds={BINANCE:{symbols:[],socket:null,connected:false,error:"",index:0},OKX:{symbols:[],socket:null,connected:false,error:"",index:0}};
const baselines=new Map(),pending=new Set(),hits=new Map(),minuteLows=new Map();
let running=false,lastTick=0,checked=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){
 const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error("HTTP "+r.status);
 const j=await r.json();if(j.code&&j.code!=="0")throw Error(j.msg||j.code);return j;
}
const key=(e,s)=>e+":"+s;
async function discover(e){
 if(e==="BINANCE"){const d=await get("https://api.binance.com/api/v3/exchangeInfo");return d.symbols.filter(x=>x.status==="TRADING"&&x.quoteAsset==="USDT"&&x.isSpotTradingAllowed!==false).map(x=>x.symbol);}
 const d=await get("https://www.okx.com/api/v5/public/instruments?instType=SPOT");return d.data.filter(x=>x.state==="live"&&x.quoteCcy==="USDT").map(x=>x.instId);
}
async function reference(e,s){
 const now=Date.now();let candle;
 if(e==="BINANCE"){
  const data=await get("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval=1h&limit=3");
  candle=data.filter(x=>Number(x[6])<now).at(-1);
  if(candle)candle={close:Number(candle[4]),end:Number(candle[6])+1};
 }else{
  const data=await get("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1H&limit=3");
  const x=data.data.filter(x=>x[8]==="1").sort((a,b)=>Number(b[0])-Number(a[0]))[0];
  if(x)candle={close:Number(x[4]),end:Number(x[0])+3600000};
 }
 if(candle?.close>0)baselines.set(key(e,s),{...candle,fetched:now});
}
async function confirm(e,s,livePrice){
 const k=key(e,s);if(pending.has(k))return;pending.add(k);
 try{
  let candle;
  if(e==="BINANCE"){
   const data=await get("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval=1m&limit=3");
   const x=data.filter(x=>Number(x[6])<Date.now()).at(-1);
   if(x)candle={low:Number(x[3]),end:Number(x[6])+1};
  }else{
   const data=await get("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1m&limit=3");
   const x=data.data.filter(x=>x[8]==="1").sort((a,b)=>Number(b[0])-Number(a[0]))[0];
   if(x)candle={low:Number(x[3]),end:Number(x[0])+60000};
  }
  if(!candle||Date.now()-candle.end>120000)return;
  const baseline=baselines.get(k);if(!baseline)return;
  const low=Math.min(candle.low,minuteLows.get(k)?.low??Infinity);
  const drop=100*(low/baseline.close-1);
  if(drop<=-7)hits.set(k,{exchange:e,symbol:s.replace("-","/").replace(/USDT$/,"/USDT").replace("//","/"),drop,low,reference:baseline.close,at:Date.now(),livePrice});
 }catch(err){feeds[e].error=String(err.message||err);}
 finally{pending.delete(k);}
}
function tick(e,s,p){
 if(!running||!(p>0))return;
 const k=key(e,s),now=Date.now();lastTick=now;
 const minute=Math.floor(now/60000),old=minuteLows.get(k);
 minuteLows.set(k,{minute,low:old?.minute===minute?Math.min(old.low,p):p});
 const ref=baselines.get(k);
 // The cached reference must belong to the current last-completed hour.
 const expected=Math.floor(now/3600000)*3600000;
 if(!ref||ref.end!==expected)return;
 if(p/ref.close<=0.93&&!pending.has(k))void confirm(e,s,p);
}
function connectBinance(){
 const f=feeds.BINANCE;if(!running)return;
 const ws=new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");f.socket=ws;
 ws.onopen=()=>{f.connected=true;f.error="";};
 ws.onmessage=ev=>{try{const arr=JSON.parse(ev.data);if(Array.isArray(arr))for(const t of arr)if(t.s?.endsWith("USDT"))tick("BINANCE",t.s,Number(t.c));}catch(err){f.error=err.message;}};
 ws.onerror=()=>{f.error="Binance WebSocket bağlantı hatası";};
 ws.onclose=()=>{f.connected=false;if(running)setTimeout(connectBinance,5000);};
}
function connectOKX(){
 const f=feeds.OKX;if(!running)return;
 const ws=new WebSocket("wss://ws.okx.com:8443/ws/v5/public");f.socket=ws;
 ws.onopen=()=>{f.connected=true;f.error="";for(let i=0;i<f.symbols.length;i+=80){const chunk=f.symbols.slice(i,i+80);setTimeout(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op:"subscribe",args:chunk.map(instId=>({channel:"tickers",instId}))}));},Math.floor(i/80)*400);}};
 ws.onmessage=ev=>{try{const data=JSON.parse(ev.data);if(data.event==="error"){f.error=data.msg||"Abonelik hatası";return;}if(data.arg?.channel==="tickers")for(const t of data.data||[])tick("OKX",t.instId,Number(t.last));}catch(err){f.error=err.message;}};
 ws.onerror=()=>{f.error="OKX WebSocket bağlantı hatası";};
 ws.onclose=()=>{f.connected=false;if(running)setTimeout(connectOKX,5000);};
}
async function refreshReferences(){
 while(running){
  for(const e of ["BINANCE","OKX"]){
   const f=feeds[e];if(!f.symbols.length)continue;
   const s=f.symbols[f.index++%f.symbols.length];
   const cached=baselines.get(key(e,s)),expected=Math.floor(Date.now()/3600000)*3600000;
   if(cached?.end===expected)continue;
   try{await reference(e,s);checked++;f.error="";}
   catch(err){f.error=String(err.message||err);if(/429|418/.test(f.error))await sleep(60000);}
   await sleep(e==="OKX"?350:150);
  }
  await sleep(20);
 }
}
function render(){
 if(!$("hourDropStatus"))return;
 const now=Date.now();for(const [k,v] of hits)if(now-v.at>300000)hits.delete(k);
 const rows=[...hits.values()].sort((a,b)=>a.drop-b.drop);
 const valid=[...baselines.values()].filter(v=>v.end===Math.floor(now/3600000)*3600000).length;
 $("hourDropStatus").textContent=(running?"Canlı izleme":"Duraklatıldı")+" | Binance "+(feeds.BINANCE.connected?"bağlı":"bağlı değil")+" · OKX "+(feeds.OKX.connected?"bağlı":"bağlı değil")+" | Saatlik referansı hazır: "+valid+"/"+(feeds.BINANCE.symbols.length+feeds.OKX.symbols.length)+" | Sinyal: "+rows.length+" | Son veri: "+(lastTick?new Date(lastTick).toLocaleTimeString("tr-TR"):"yok")+[feeds.BINANCE.error,feeds.OKX.error].filter(Boolean).map(x=>" | "+x).join("");
 const root=$("hourDropResults");root.replaceChildren();
 if(!rows.length){const p=document.createElement("p");p.textContent="Son 5 dakikada doğrulanan düşüş yok.";root.append(p);}
 for(const x of rows){const div=document.createElement("div");div.className="info-box";const h=document.createElement("h3");h.textContent=x.exchange+" · "+x.symbol;const p=document.createElement("p");p.textContent="Düşüş: %"+Math.abs(x.drop).toFixed(2)+" | 1 dk dip: "+x.low+" | 1 saat kapanışı: "+x.reference;div.append(h,p);root.append(div);}
}
async function start(){
 if(running)return;running=true;$("hourDropToggle").textContent="Taramayı Durdur";
 for(const e of ["BINANCE","OKX"]){try{feeds[e].symbols=await discover(e);feeds[e].error="";}catch(err){feeds[e].error=err.message;}}
 if(!running)return;
 connectBinance();connectOKX();void refreshReferences();
}
$("hourDropToggle")?.addEventListener("click",()=>{if(running){running=false;for(const f of Object.values(feeds))f.socket?.close();$("hourDropToggle").textContent="Taramayı Başlat";}else void start();render();});
setInterval(render,1000);render();void start();
