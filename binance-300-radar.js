import WebSocket from "ws";

// Binance Global spot USDT: 1-second observed candles vs last COMPLETED 1h candle close.
const state={connected:false,error:null,updatedAt:0,total:0,referencesReady:0,referenceHour:0,loading:false};
const symbols=new Set(),reference=new Map(),candles=new Map(),previous=new Map(),alerts=[],lastAlert=new Map(),hourLast=new Map(),lastPrices=new Map(),rollingAbove=new Map();
let started=false,socket=null,refreshTimer=null;
const API_HOSTS=["https://api.binance.com/api/v3","https://api1.binance.com/api/v3","https://data-api.binance.vision/api/v3"];
const WS_HOSTS=["wss://stream.binance.com:9443/ws/!miniTicker@arr","wss://stream.binance.com:443/ws/!miniTicker@arr","wss://data-stream.binance.vision/ws/!miniTicker@arr"];
let wsHostIndex=0;
const round=n=>Number(n.toFixed(4));
async function json(path){
 let error;
 for(const host of API_HOSTS){
  try{const response=await fetch(host+path,{signal:AbortSignal.timeout(9000)});if(!response.ok)throw Error(host+" HTTP "+response.status);return await response.json();}
  catch(e){error=e;}
 }
 throw error||Error("Binance REST bağlantısı kurulamadı");
}
async function refreshReferences(){
 if(state.loading)return;
 state.loading=true;
 try{
  const info=await json("/exchangeInfo");
  const active=info.symbols.filter(s=>s.status==="TRADING"&&s.quoteAsset==="USDT"&&s.isSpotTradingAllowed!==false).map(s=>s.symbol);
  for(const symbol of active)symbols.add(symbol);
  state.total=symbols.size;
  const hour=Math.floor(Date.now()/3600000)*3600000;
  state.referenceHour=hour;
  const pending=active.filter(symbol=>reference.get(symbol)?.hour!==hour);
  // Preserve existing references until replacements arrive. Each reference is timestamped.
  let cursor=0;
  async function worker(){
   while(cursor<pending.length){
    const symbol=pending[cursor++];
    try{
     const klines=await json("/klines?symbol="+encodeURIComponent(symbol)+"&interval=1h&limit=3");
     const completed=klines.filter(k=>Number(k[6])<Date.now()-1000).at(-1);
     if(completed&&Number(completed[4])>0)reference.set(symbol,{close:Number(completed[4]),closeTime:Number(completed[6]),hour});
    }catch(e){state.error="Saatlik referans: "+String(e.message||e);}
    await new Promise(resolve=>setTimeout(resolve,350));
   }
  }
  await Promise.all(Array.from({length:4},worker));
  state.referencesReady=[...symbols].filter(x=>reference.get(x)?.hour===hour).length;
 }catch(e){state.error=String(e.message||e);}
 finally{state.loading=false;}
}
function observe(symbol,raw,at=Date.now()){
 if(!/^[A-Z0-9]+USDT$/.test(symbol))return;
 symbols.add(symbol);
 state.total=symbols.size;
 const price=Number(raw);
 if(!(price>0))return;
 lastPrices.set(symbol,{price,at});
 state.updatedAt=at;
 const hour=Math.floor(at/3600000)*3600000;
 if(state.referenceHour!==hour){state.referenceHour=hour;previous.clear();}
 const prior=hourLast.get(symbol);
 if(prior&&prior.hour<hour&&prior.hour===hour-3600000){
  if(reference.get(symbol)?.hour!==hour)reference.set(symbol,{close:prior.price,closeTime:hour-1,hour,source:"observed-hour-close"});
 }
 hourLast.set(symbol,{hour,price});
 const ref=reference.get(symbol);
 const second=Math.floor(at/1000);
 let bars=candles.get(symbol);
 if(!bars){bars=[];candles.set(symbol,bars);}
 const last=bars.at(-1);
 if(last?.second===second){last.high=Math.max(last.high,price);last.low=Math.min(last.low,price);last.close=price;last.observed=true;}
 else bars.push({second,open:price,high:price,low:price,close:price,observed:true});
 while(bars.length&&bars[0].second<second-299)bars.shift();
 // Catch rises observed within the last five minutes, without waiting for REST hourly candles.
 const baseline=bars.length>1?Math.min(...bars.slice(0,-1).map(x=>x.low)):null;
 if(baseline!==null&&baseline>0){
  const rollingChange=100*(price/baseline-1);
  const isAbove=rollingChange>=2;
  const previouslyAbove=rollingAbove.get(symbol);
  rollingAbove.set(symbol,isAbove);
  if(isAbove&&previouslyAbove!==true&&at-(lastAlert.get(symbol)||0)>=30000){
   lastAlert.set(symbol,at);
   alerts.unshift({symbol:symbol.replace(/USDT$/,"/USDT"),price,referenceClose:baseline,changePct:round(rollingChange),at,second,referenceCloseTime:null,observedSeconds:bars.length,status:"SON 300 SN +%2",referenceType:"rolling-300-low"});
  }
 }
 if(!ref||ref.hour!==state.referenceHour)return;
 const change=100*(price/ref.close-1);
 const wasAbove=previous.get(symbol);
 previous.set(symbol,change>=2);
 // Only new crossings count, not coins already above threshold at startup.
 if(wasAbove!==false||change<2)return;
 if(at-(lastAlert.get(symbol)||0)<30000)return;
 lastAlert.set(symbol,at);
 alerts.unshift({symbol:symbol.replace(/USDT$/,"/USDT"),price,referenceClose:ref.close,changePct:round(change),at,second,referenceCloseTime:ref.closeTime,observedSeconds:bars.length,status:"%2 EŞİĞİ AŞILDI"});
 // Keep all alerts in the current rolling 300-second window.
 while(alerts.length&&at-alerts.at(-1).at>300000)alerts.pop();
}
// Advance each known symbol's 300-slot memory every second even without a trade.
function advanceMemory(){
 const now=Date.now(),second=Math.floor(now/1000);
 for(const [symbol,tick] of lastPrices){
  let bars=candles.get(symbol);
  if(!bars){bars=[];candles.set(symbol,bars);}
  const last=bars.at(-1);
  if(last?.second!==second){
   // Carry forward the last known price, explicitly marked as not newly observed.
   bars.push({second,open:tick.price,high:tick.price,low:tick.price,close:tick.price,observed:false});
  }
  while(bars.length&&bars[0].second<second-299)bars.shift();
 }
 while(alerts.length&&now-alerts.at(-1).at>300000)alerts.pop();
}
function connect(){
 const ws=new WebSocket(WS_HOSTS[wsHostIndex]);
 socket=ws;
 ws.on("open",()=>{state.connected=true;state.error=null;});
 ws.on("message",raw=>{
  try{
   const data=JSON.parse(raw.toString());
   if(Array.isArray(data))for(const item of data)observe(item.s,item.c);
  }catch(e){state.error=String(e.message||e);}
 });
 ws.on("error",e=>{state.error=e.message;});
 ws.on("close",(code)=>{state.connected=false;if(socket===ws){state.error=state.error||("WebSocket kapandı: "+code);wsHostIndex=(wsHostIndex+1)%WS_HOSTS.length;setTimeout(connect,4000);}});
 const ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.ping();},25000);
 ws.on("close",()=>clearInterval(ping));
}
export function startBinance300Radar(){
 if(started)return;started=true;
 connect();
 const clock=setInterval(advanceMemory,1000);clock.unref?.();
 refreshReferences().catch(e=>state.error=e.message);
 refreshTimer=setInterval(()=>refreshReferences().catch(e=>state.error=e.message),60000);
 refreshTimer.unref?.();
}
export function binance300Snapshot(){
 const now=Date.now();
 const ready=[...symbols].filter(x=>reference.get(x)?.hour===state.referenceHour).length;
 return {ok:true,updatedAt:now,state:{...state,connected:state.connected&&now-state.updatedAt<15000,referencesReady:ready,tracked:candles.size,lastPriceUpdates:lastPrices.size,memoryUpdatedAt:now,ready:state.connected&&now-state.updatedAt<15000&&candles.size>0},
 thresholdPct:2,windowSeconds:300,reference:"Son tamamlanmış 1 saatlik mum kapanışı",
 rows:alerts.filter(x=>now-x.at<=300000),
 note:"Her saniye 300 saniyelik fiyat hafızası ilerletilir. Yeni borsa fiyatı gelmediyse son bilinen fiyat taşınır ve gözlenmedi olarak işaretlenir; yeni fiyat uydurulmaz. REST 418 durumunda saatlik referans için saat sınırı beklenebilir."};
}
