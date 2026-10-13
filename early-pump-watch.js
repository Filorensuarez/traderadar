// Early Rise Radar: ONLY 1h EMA7/EMA25 and MACD DIF/DEA bullish dual cross.
// Scan the five public spot USDT markets; never place orders.
import {analyzeHourlyDualCross,HOUR} from "./ema-macd-crossover.js";
const INTERVAL=120000,MAX_PER_SOURCE=95,WORKERS=5,MIN_VOLUME=1000000;
const providers=[
 {name:"BINANCE",kind:"binance",base:"https://data-api.binance.vision"},
 {name:"OKX",kind:"okx",base:"https://www.okx.com"},
 {name:"KUCOIN",kind:"kucoin",base:"https://api.kucoin.com"},
 {name:"GATE.IO",kind:"gate",base:"https://api.gateio.ws"},
 {name:"BITGET",kind:"bitget",base:"https://api.bitget.com"}
];
const state={
 running:false,updatedAt:0,startedAt:0,eligible:0,checked:0,failed:0,rows:[],sources:{},errors:[],
 intervalSeconds:INTERVAL/1000,
 strategy:"EMA7_EMA25_MACD_BULLISH_1H",
 notice:"Yalnızca 1 saatlik kapanmış mumda EMA7'nin EMA25'i yukarı kesmesi ve MACD DIF'nin DEA'yı yukarı kesmesi. Kesişimler en fazla 6 saat aralıklı, sonuncusu en fazla 2 kapanmış mum önce. EMA99 bilgi amaçlıdır. Sinyal kesin yükseliş garantisi değildir."
};
const cursor=new Map(),blockedUntil=new Map();
const validSymbol=s=>/^[A-Z0-9]+[-_]?USDT$/.test(s)&&
 !/(UP|DOWN|BULL|BEAR|[235][SL])[-_]?USDT$/i.test(s)&&
 !/^(USDC|USDE|TUSD|FDUSD|DAI|USDD|PYUSD|USD1|EURC)[-_]?USDT$/.test(s);
const quote=(symbol,price,bid,ask,volume24h)=>({symbol,price:+price,bid:+bid,ask:+ask,volume24h:+volume24h});
async function json(url,name){
 const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:"application/json"}});
 if([418,429].includes(r.status)){blockedUntil.set(name,Date.now()+120000);throw Error("Borsa istek sınırı "+r.status);}
 if(!r.ok)throw Error("HTTP "+r.status);
 return r.json();
}
async function tickers(p){
 let a,list=[];
 if(p.kind==="binance"){
  a=await json(p.base+"/api/v3/ticker/24hr",p.name);
  if(!Array.isArray(a))throw Error("Binance ticker verisi eksik");
  list=a.map(x=>quote(x.symbol,x.lastPrice,x.bidPrice,x.askPrice,x.quoteVolume));
 }else if(p.kind==="okx"){
  a=await json(p.base+"/api/v5/market/tickers?instType=SPOT",p.name);
  if(a.code!=="0"||!Array.isArray(a.data))throw Error("OKX ticker verisi eksik");
  list=a.data.map(x=>quote(x.instId,x.last,x.bidPx,x.askPx,x.volCcy24h));
 }else if(p.kind==="kucoin"){
  a=await json(p.base+"/api/v1/market/allTickers",p.name);
  if(a.code!=="200000"||!Array.isArray(a.data?.ticker))throw Error("KuCoin ticker verisi eksik");
  list=a.data.ticker.map(x=>quote(x.symbol,x.last,x.buy,x.sell,x.volValue));
 }else if(p.kind==="gate"){
  a=await json(p.base+"/api/v4/spot/tickers",p.name);
  if(!Array.isArray(a))throw Error("Gate ticker verisi eksik");
  list=a.map(x=>quote(x.currency_pair,x.last,x.highest_bid,x.lowest_ask,x.quote_volume));
 }else{
  a=await json(p.base+"/api/v3/market/tickers?category=SPOT",p.name);
  if(a.code!=="00000"||!Array.isArray(a.data))throw Error("Bitget ticker verisi eksik");
  list=a.data.filter(x=>!x.category||x.category==="SPOT")
   .map(x=>quote(x.symbol,x.lastPrice,x.bid1Price,x.ask1Price,x.turnover24h));
 }
 return list.filter(x=>validSymbol(x.symbol)&&x.price>0&&x.ask>0&&x.bid>0&&
  x.ask>=x.bid&&x.volume24h>=MIN_VOLUME&&(x.ask-x.bid)/x.ask<=0.005);
}
function selectSymbols(p,all){
 const chosen=[],used=new Set();
 const add=t=>{if(t&&!used.has(t.symbol)&&chosen.length<MAX_PER_SOURCE){chosen.push(t);used.add(t.symbol);}};
 const liquid=[...all].sort((a,b)=>b.volume24h-a.volume24h);
 for(const item of liquid.slice(0,18))add(item);
 // Rotate the remaining markets so the radar does not repeatedly sample
 // only top-volume coins.
 const pool=[...all].sort((a,b)=>a.symbol.localeCompare(b.symbol));
 const offset=cursor.get(p.name)||0;
 for(let i=0;i<pool.length&&chosen.length<MAX_PER_SOURCE;i++)
  add(pool[(offset+i)%pool.length]);
 cursor.set(p.name,pool.length?(offset+MAX_PER_SOURCE-18)%pool.length:0);
 return chosen;
}
async function hourlyCandles(p,s){
 let a,rows;const symbol=encodeURIComponent(s);
 if(p.kind==="binance"){
  a=await json(p.base+"/api/v3/klines?symbol="+symbol+"&interval=1h&limit=180",p.name);
  if(!Array.isArray(a))throw Error("Binance saatlik mumlar alınamadı");
  rows=a.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[7]}));
 }else if(p.kind==="okx"){
  a=await json(p.base+"/api/v5/market/candles?instId="+symbol+"&bar=1H&limit=180",p.name);
  if(a.code!=="0"||!Array.isArray(a.data))throw Error("OKX saatlik mumlar alınamadı");
  rows=a.data.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[7]}));
 }else if(p.kind==="kucoin"){
  const end=Math.floor(Date.now()/1000);
  a=await json(p.base+"/api/v1/market/candles?type=1hour&symbol="+symbol+
   "&startAt="+(end-183*3600)+"&endAt="+end,p.name);
  if(a.code!=="200000"||!Array.isArray(a.data))throw Error("KuCoin saatlik mumlar alınamadı");
  rows=a.data.map(x=>({time:+x[0]*1000,open:+x[1],high:+x[3],low:+x[4],close:+x[2],quoteVolume:+x[6]}));
 }else if(p.kind==="gate"){
  a=await json(p.base+"/api/v4/spot/candlesticks?currency_pair="+symbol+"&interval=1h&limit=180",p.name);
  if(!Array.isArray(a))throw Error("Gate saatlik mumlar alınamadı");
  rows=a.map(x=>({time:+x[0]*1000,open:+x[5],high:+x[3],low:+x[4],close:+x[2],quoteVolume:+x[1]}));
 }else{
  a=await json(p.base+"/api/v3/market/candles?category=SPOT&symbol="+symbol+
   "&interval=1h&limit=180",p.name);
  if(a.code!=="00000"||!Array.isArray(a.data))throw Error("Bitget saatlik mumlar alınamadı");
  rows=a.data.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[6]}));
 }
 const unique=new Map();
 for(const x of rows)if(Number.isFinite(x.time)&&x.time>0&&x.open>0&&x.high>=x.low&&
  x.low>0&&x.close>0&&Number.isFinite(x.quoteVolume)&&x.quoteVolume>=0)unique.set(x.time,x);
 return [...unique.values()].sort((a,b)=>a.time-b.time);
}
async function scanProvider(p){
 const info={eligible:0,checked:0,failed:0,signals:0,error:null};
 state.sources[p.name]=info;
 if((blockedUntil.get(p.name)||0)>Date.now()){info.error="İstek sınırı nedeniyle geçici bekleme";return [];}
 try{
  const all=await tickers(p);
  info.eligible=all.length;
  const chosen=selectSymbols(p,all),found=[];
  let next=0;
  async function worker(){
   while(next<chosen.length){
    if((blockedUntil.get(p.name)||0)>Date.now()){info.error="İstek sınırına ulaşıldı";break;}
    const item=chosen[next++];
    try{
     const candles=await hourlyCandles(p,item.symbol);
     const x=analyzeHourlyDualCross(candles,item,Date.now());
     if(x){
      found.push({...x,exchange:p.name,symbol:item.symbol.replace(/[-_]?USDT$/,"/USDT"),
       lastCheckedAt:Date.now()});
     }
    }catch(err){
     info.failed++;
     if(state.errors.length<8)state.errors.push(p.name+" "+item.symbol+": "+String(err.message).slice(0,90));
    }
    info.checked++;
    await new Promise(resolve=>setTimeout(resolve,180));
   }
  }
  await Promise.all(Array.from({length:WORKERS},()=>worker()));
  info.signals=found.length;
  return found;
 }catch(err){
  info.error=String(err.message);
  if(state.errors.length<8)state.errors.push(p.name+": "+info.error);
  return [];
 }
}
export function earlyPumpStatus(){return {...state,rows:[...state.rows],sources:{...state.sources}};}
export async function scanEarlyPump(){
 if(state.running)return earlyPumpStatus();
 state.running=true;state.startedAt=Date.now();state.errors=[];
 try{
  const blocks=await Promise.all(providers.map(scanProvider));
  const all=blocks.flat();
  all.sort((a,b)=>b.signalConfirmedAt-a.signalConfirmedAt||
   b.volume24h-a.volume24h);
  state.rows=all.slice(0,100);
  state.eligible=Object.values(state.sources).reduce((s,v)=>s+v.eligible,0);
  state.checked=Object.values(state.sources).reduce((s,v)=>s+v.checked,0);
  state.failed=Object.values(state.sources).reduce((s,v)=>s+v.failed,0);
  state.updatedAt=Date.now();
 }catch(err){state.errors.push("Tarama hatası: "+err.message);console.error("EMA MACD Erken Yükseliş:",err);}
 finally{state.running=false;}
 return earlyPumpStatus();
}
export function startEarlyPump(){
 scanEarlyPump().catch(err=>console.error("EMA MACD ilk tarama:",err));
 setInterval(()=>scanEarlyPump().catch(err=>console.error("EMA MACD tarama:",err)),INTERVAL);
}
