import WebSocket from "ws";

// Binance Global spot USDT: 1-second observed candles vs last COMPLETED 1h candle close.
const state={connected:false,error:null,updatedAt:0,total:0,referencesReady:0,referenceHour:0,loading:false};
const symbols=new Set(),reference=new Map(),candles=new Map(),previous=new Map(),alerts=[],lastAlert=new Map();
let started=false,socket=null,refreshTimer=null;
const API="https://api.binance.com/api/v3";
const round=n=>Number(n.toFixed(4));
async function json(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error("Binance HTTP "+response.status);
 return response.json();
}
async function refreshReferences(){
 if(state.loading)return;
 state.loading=true;
 try{
  const info=await json(API+"/exchangeInfo?permissions=SPOT");
  const active=info.symbols.filter(s=>s.status==="TRADING"&&s.quoteAsset==="USDT"&&s.isSpotTradingAllowed!==false).map(s=>s.symbol);
  symbols.clear();for(const symbol of active)symbols.add(symbol);
  state.total=symbols.size;
  const hour=Math.floor(Date.now()/3600000)*3600000;
  state.referenceHour=hour;
  // Preserve existing references until replacements arrive. Each reference is timestamped.
  let cursor=0;
  async function worker(){
   while(cursor<active.length){
    const symbol=active[cursor++];
    try{
     const klines=await json(API+"/klines?symbol="+encodeURIComponent(symbol)+"&interval=1h&limit=3");
     const completed=klines.filter(k=>Number(k[6])<Date.now()-1000).at(-1);
     if(completed&&Number(completed[4])>0)reference.set(symbol,{close:Number(completed[4]),closeTime:Number(completed[6]),hour});
    }catch(e){state.error="Saatlik referans: "+String(e.message||e);}
    await new Promise(resolve=>setTimeout(resolve,650));
   }
  }
  await Promise.all(Array.from({length:4},worker));
  state.referencesReady=[...symbols].filter(x=>reference.get(x)?.hour===hour).length;
 }catch(e){state.error=String(e.message||e);}
 finally{state.loading=false;}
}
function observe(symbol,raw,at=Date.now()){
 if(!symbols.has(symbol))return;
 const price=Number(raw),ref=reference.get(symbol);
 if(!(price>0))return;
 state.updatedAt=at;
 const second=Math.floor(at/1000);
 let bars=candles.get(symbol);
 if(!bars){bars=[];candles.set(symbol,bars);}
 const last=bars.at(-1);
 if(last?.second===second){last.high=Math.max(last.high,price);last.low=Math.min(last.low,price);last.close=price;}
 else bars.push({second,open:price,high:price,low:price,close:price});
 while(bars.length&&bars[0].second<second-299)bars.shift();
 if(!ref||ref.hour!==state.referenceHour)return;
 const change=100*(price/ref.close-1);
 const wasAbove=previous.get(symbol);
 previous.set(symbol,change>=2);
 // Only new crossings count, not coins already above threshold at startup.
 if(wasAbove!==false||change<2)return;
 if(at-(lastAlert.get(symbol)||0)<30000)return;
 lastAlert.set(symbol,at);
 alerts.unshift({symbol:symbol.replace(/USDT$/,"/USDT"),price,referenceClose:ref.close,changePct:round(change),at,second,referenceCloseTime:ref.closeTime,observedSeconds:bars.length,status:"%2 EŞİĞİ AŞILDI"});
 if(alerts.length>300)alerts.length=300;
}
function connect(){
 const ws=new WebSocket("wss://stream.binance.com:9443/ws/!miniTicker@arr");
 socket=ws;
 ws.on("open",()=>{state.connected=true;state.error=null;});
 ws.on("message",raw=>{
  try{
   const data=JSON.parse(raw.toString());
   if(Array.isArray(data))for(const item of data)observe(item.s,item.c);
  }catch(e){state.error=String(e.message||e);}
 });
 ws.on("error",e=>{state.error=e.message;});
 ws.on("close",()=>{state.connected=false;if(socket===ws)setTimeout(connect,5000);});
 const ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.ping();},25000);
 ws.on("close",()=>clearInterval(ping));
}
export function startBinance300Radar(){
 if(started)return;started=true;
 connect();
 refreshReferences().catch(e=>state.error=e.message);
 refreshTimer=setInterval(()=>refreshReferences().catch(e=>state.error=e.message),60000);
 refreshTimer.unref?.();
}
export function binance300Snapshot(){
 const now=Date.now();
 const ready=[...symbols].filter(x=>reference.get(x)?.hour===state.referenceHour).length;
 return {ok:true,updatedAt:now,state:{...state,referencesReady:ready,tracked:candles.size},
 thresholdPct:2,windowSeconds:300,reference:"Son tamamlanmış 1 saatlik mum kapanışı",
 rows:alerts.filter(x=>now-x.at<=300000).slice(0,100),
 note:"Gerçekleşen fiyat güncellemelerinden saniyelik OHLC üretilir. İşlem olmayan saniyelerde mum oluşturulmaz; Binance miniTicker her saniye her parite için güncelleme garantisi vermez."};
}
