import WebSocket from "ws";
const states=new Map(),sockets=new Set(),alarms=[];let universe=0,connections=0,lastError="",started=0;
const BASE="https://data-api.binance.vision";
const config={factor:5,ratio:.7,min:500};
function onTrade(d){
 const now=Date.now(),price=Number(d.p),qty=Number(d.q),v=price*qty;if(!d.s||!(v>0))return;
 let x=states.get(d.s);if(!x){x={first:now,buckets:new Map(),lastAlarm:0};states.set(d.s,x)}
 const bucket=Math.floor(now/5000)*5000;let b=x.buckets.get(bucket);if(!b){b={total:0,buy:0};x.buckets.set(bucket,b)}b.total+=v;if(d.m===false)b.buy+=v;
 for(const key of x.buckets.keys())if(key<now-140000)x.buckets.delete(key);
 if(now-x.first<120000||now-x.lastAlarm<120000)return;
 let recent=0,buy=0,prior=0,priorBuy=0;
 for(const [t,z] of x.buckets){if(t>=now-15000){recent+=z.total;buy+=z.buy}else if(t>=now-135000){prior+=z.total;priorBuy+=z.buy}}
 if(buy<config.min||recent<=0||buy/recent<config.ratio||prior/8>=config.min||buy<config.factor*Math.max(priorBuy/8,1))return;
 x.lastAlarm=now;
 const alert={symbol:d.s,price,time:now,buyUsdt:Math.round(buy),buyRatio:Math.round(100*buy/recent),acceleration:Number((buy/Math.max(priorBuy/8,1)).toFixed(1))};
 alarms.unshift(alert);if(alarms.length>150)alarms.pop();if(listener)Promise.resolve(listener(alert)).catch(e=>console.error("quiet push",e.message));
}
let listener=null;export function onQuietAlert(fn){listener=fn}
function connect(symbols){
 const streams=symbols.map(s=>s.toLowerCase()+"@aggTrade").join("/");
 const ws=new WebSocket("wss://data-stream.binance.vision/stream?streams="+streams);sockets.add(ws);
 ws.on("open",()=>connections++);
 ws.on("message",raw=>{try{onTrade(JSON.parse(raw).data)}catch{}});
 ws.on("error",e=>{lastError=e.message});
 ws.on("close",()=>{sockets.delete(ws);connections=Math.max(0,connections-1);for(const sym of symbols)states.delete(sym);setTimeout(()=>connect(symbols),5000).unref()});
}
export function quietSnapshot(){return {running:started>0,started,universe,connectedStreams:connections,tracked:states.size,ready:[...states.values()].filter(x=>Date.now()-x.first>=120000).length,lastError,config,alarms:alarms.slice(0,80)}}
export async function startQuietRadar(){
 if(started)return;started=Date.now();
 try{
 const r=await fetch(BASE+"/api/v3/exchangeInfo");if(!r.ok)throw Error("Binance HTTP "+r.status);
 const data=await r.json();const symbols=(data.symbols||[]).filter(s=>s.status==="TRADING"&&s.quoteAsset==="USDT"&&s.isSpotTradingAllowed!==false&&!/(UP|DOWN|BULL|BEAR)USDT$/.test(s.symbol)).map(s=>s.symbol);
 universe=symbols.length;for(let i=0;i<symbols.length;i+=40)connect(symbols.slice(i,i+40));
 }catch(e){lastError=e.message;started=0;setTimeout(startQuietRadar,30000).unref()}
}
