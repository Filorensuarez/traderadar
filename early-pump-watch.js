// Early Rise Radar — weekly SMA200 BUY / SELL / IZLE.
// Historical BUY/SELL chart markers use only completed weekly candles.
// This module never sends trades and never treats a visual touch as confirmation.
import {analyzeWeeklyMA200,closedWeeklyCandles,WEEK_MS} from "./weekly-ma200-model.js";
const INTERVAL_MS=3*60*60*1000, MAX_PER_SOURCE=60, WORKERS=3;
const MIN_24H_VOLUME=1000000, MAX_SPREAD=0.005, CACHE_TTL=3*60*60*1000;
const providers=[
 {name:"BINANCE",kind:"binance",base:"https://data-api.binance.vision"},
 {name:"OKX",kind:"okx",base:"https://www.okx.com"},
 {name:"KUCOIN",kind:"kucoin",base:"https://api.kucoin.com"},
 {name:"GATE.IO",kind:"gate",base:"https://api.gateio.ws"}
];
const state={
 running:false,startedAt:0,updatedAt:0,eligible:0,checked:0,failed:0,skippedHistory:0,
 rows:[],sources:{},errors:[],intervalSeconds:INTERVAL_MS/1000,
 strategy:"WEEKLY_ADAPTIVE_SMA200_50_20",
 notice:"Haftalık dönüş radarı: uzun geçmişte MA200, yeni coinlerde MA50/MA20 kullanılır. BUY/SELL iki kapanmış haftayla birlikte RSI/MACD ve hacim kontrollerinden geçer. Sinyaller işlem önerisi değildir."
};
const cursor=new Map(),blockedUntil=new Map(),candleCache=new Map();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const validSymbol=s=>/^[A-Z0-9]{2,18}[-_]?USDT$/.test(s)&&
 !/(UP|DOWN|BULL|BEAR|[235][SL])[-_]?USDT$/i.test(s)&&
 !/^(USDC|USDE|TUSD|FDUSD|DAI|USDD|PYUSD|USD1|EURC)[-_]?USDT$/.test(s);
function canonical(symbol){
 const s=String(symbol||"").trim().toUpperCase().replace(/[-_]/g,"");
 const code=s.endsWith("USDT")?s:s+"USDT";
 if(!validSymbol(code))throw Object.assign(Error("Yalnızca geçerli spot USDT sembolleri görüntülenebilir."),{httpCode:400});
 return code;
}
const quote=(symbol,price,bid,ask,volume24h)=>({symbol,price:+price,bid:+bid,ask:+ask,volume24h:+volume24h});
async function json(url,exchange){
 const res=await fetch(url,{signal:AbortSignal.timeout(13000),headers:{Accept:"application/json"}});
 if([418,429].includes(res.status)){
  blockedUntil.set(exchange,Date.now()+180000);
  throw Error("Borsa API hız sınırı ("+res.status+")");
 }
 if(!res.ok)throw Error("Borsa API HTTP "+res.status);
 return res.json();
}
async function tickers(p){
 let data,rows=[];
 if(p.kind==="binance"){
  data=await json(p.base+"/api/v3/ticker/24hr",p.name);
  if(!Array.isArray(data))throw Error("Binance ticker verisi alınamadı");
  rows=data.map(x=>quote(x.symbol,x.lastPrice,x.bidPrice,x.askPrice,x.quoteVolume));
 }else if(p.kind==="okx"){
  data=await json(p.base+"/api/v5/market/tickers?instType=SPOT",p.name);
  if(data.code!=="0"||!Array.isArray(data.data))throw Error("OKX spot ticker verisi alınamadı");
  rows=data.data.map(x=>quote(x.instId,x.last,x.bidPx,x.askPx,x.volCcy24h));
 }else if(p.kind==="kucoin"){
  data=await json(p.base+"/api/v1/market/allTickers",p.name);
  if(data.code!=="200000"||!Array.isArray(data.data?.ticker))throw Error("KuCoin ticker verisi alınamadı");
  rows=data.data.ticker.map(x=>quote(x.symbol,x.last,x.buy,x.sell,x.volValue));
 }else{
  data=await json(p.base+"/api/v4/spot/tickers",p.name);
  if(!Array.isArray(data))throw Error("Gate.io ticker verisi alınamadı");
  rows=data.map(x=>quote(x.currency_pair,x.last,x.highest_bid,x.lowest_ask,x.quote_volume));
 }
 return rows.filter(x=>validSymbol(x.symbol)&&x.price>0&&x.ask>0&&x.bid>0&&
  x.ask>=x.bid&&Number.isFinite(x.volume24h)&&x.volume24h>=MIN_24H_VOLUME&&
  (x.ask-x.bid)/x.ask<=MAX_SPREAD);
}
function selectMarkets(p,eligible){
 const top=[...eligible].sort((a,b)=>b.volume24h-a.volume24h);
 const selection=[],seen=new Set();
 const add=t=>{if(t&&!seen.has(t.symbol)&&selection.length<MAX_PER_SOURCE){selection.push(t);seen.add(t.symbol);}};
 for(const t of top.slice(0,22))add(t);
 const pool=[...eligible].sort((a,b)=>a.symbol.localeCompare(b.symbol));
 const offset=cursor.get(p.name)||0;
 for(let i=0;i<pool.length&&selection.length<MAX_PER_SOURCE;i++)add(pool[(offset+i)%pool.length]);
 cursor.set(p.name,pool.length?(offset+MAX_PER_SOURCE-22)%pool.length:0);
 return selection;
}
async function weeklyCandles(p,symbol){
 const cacheKey=p.name+":"+symbol,existing=candleCache.get(cacheKey);
 if(existing&&existing.expiresAt>Date.now())return existing.candles;
 if((blockedUntil.get(p.name)||0)>Date.now())throw Error("İstek sınırı nedeniyle geçici bekleme");
 const encoded=encodeURIComponent(symbol);
 let data,rows;
 if(p.kind==="binance"){
  data=await json(p.base+"/api/v3/klines?symbol="+encoded+"&interval=1w&limit=530",p.name);
  if(!Array.isArray(data))throw Error("Binance haftalık mumlar yok");
  rows=data.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[7]}));
 }else if(p.kind==="okx"){
  // UTC-normalized weekly K-lines; OKX permits up to 300 records.
  data=await json(p.base+"/api/v5/market/candles?instId="+encoded+"&bar=1Wutc&limit=300",p.name);
  if(data.code!=="0"||!Array.isArray(data.data))throw Error("OKX haftalık mumlar yok");
  rows=data.data.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[7]}));
 }else if(p.kind==="kucoin"){
  const end=Math.floor(Date.now()/1000);
  data=await json(p.base+"/api/v1/market/candles?type=1week&symbol="+encoded+
   "&startAt="+(end-520*7*86400)+"&endAt="+end,p.name);
  if(data.code!=="200000"||!Array.isArray(data.data))throw Error("KuCoin haftalık mumlar yok");
  rows=data.data.map(x=>({time:+x[0]*1000,open:+x[1],high:+x[3],low:+x[4],close:+x[2],quoteVolume:+x[6]}));
 }else{
  // Gate spot offers 7d buckets (exchange-defined 7-day alignment), not calendar 1w.
  data=await json(p.base+"/api/v4/spot/candlesticks?currency_pair="+encoded+"&interval=7d&limit=520",p.name);
  if(!Array.isArray(data))throw Error("Gate.io 7 günlük mumlar yok");
  rows=data.map(x=>({time:+x[0]*1000,open:+x[5],high:+x[3],low:+x[4],close:+x[2],quoteVolume:+x[1]}));
 }
 const unique=new Map();
 for(const c of rows){
  if(![c.time,c.open,c.high,c.low,c.close,c.quoteVolume].every(Number.isFinite))continue;
  if(c.time<=0||c.open<=0||c.low<=0||c.close<=0||c.high<Math.max(c.open,c.low,c.close)||
     c.low>Math.min(c.open,c.close)||c.quoteVolume<0)continue;
  unique.set(c.time,c);
 }
 const result=[...unique.values()].sort((a,b)=>a.time-b.time).slice(-530);
 if(!result.length)throw Error("Geçerli haftalık mum verisi gelmedi");
 if(candleCache.size>700){
  for(const [k,v] of candleCache){if(v.expiresAt<Date.now())candleCache.delete(k);}
  while(candleCache.size>600)candleCache.delete(candleCache.keys().next().value);
 }
 candleCache.set(cacheKey,{candles:result,expiresAt:Date.now()+CACHE_TTL});
 return result;
}
async function scanProvider(p){
 const info={eligible:0,checked:0,failed:0,skippedHistory:0,signals:0,error:null};
 state.sources[p.name]=info;
 if((blockedUntil.get(p.name)||0)>Date.now()){info.error="API hız sınırı, geçici beklemede";return [];}
 try{
  const eligible=await tickers(p);
  info.eligible=eligible.length;
  const markets=selectMarkets(p,eligible),found=[];
  let next=0;
  async function worker(){
   while(next<markets.length){
    if((blockedUntil.get(p.name)||0)>Date.now()){info.error="İstek sınırına ulaşıldı";break;}
    const ticker=markets[next++];
    try{
     const candles=await weeklyCandles(p,ticker.symbol);
     const result=analyzeWeeklyMA200(candles);
     if(result.insufficient){info.skippedHistory++;}
     else if(result.status){
      found.push({
       exchange:p.name,
       symbol:ticker.symbol.replace(/[-_]?USDT$/,"/USDT"),
       market:ticker.symbol,
       status:result.status,
       reason:result.reason,
       price:ticker.price,
       weekClose:result.lastClosedPrice,
       sma200:result.sma200,referenceMA:result.referenceMA,referencePeriod:result.referencePeriod,
       distancePct:result.distancePct,
       rsi14:result.rsi14,
       macdHist:result.macdHist,
       volume24h:ticker.volume24h,
       weeks:result.weeks,
       signalAt:result.signalAt,
       lastClosedAt:result.lastClosedAt,
       lastCheckedAt:Date.now()
      });
     }
    }catch(error){
     info.failed++;
     if(state.errors.length<8)state.errors.push(p.name+" "+ticker.symbol+": "+String(error.message).slice(0,105));
    }
    info.checked++;
    await sleep(180);
   }
  }
  await Promise.all(Array.from({length:WORKERS},()=>worker()));
  info.signals=found.length;
  return found;
 }catch(error){
  info.error=String(error.message).slice(0,140);
  if(state.errors.length<8)state.errors.push(p.name+": "+info.error);
  return [];
 }
}
export function earlyPumpStatus(){
 return {...state,rows:[...state.rows],sources:{...state.sources}};
}
export async function scanEarlyPump(){
 if(state.running)return earlyPumpStatus();
 state.running=true;state.startedAt=Date.now();state.errors=[];state.sources={};
 try{
  const segments=await Promise.all(providers.map(scanProvider));
  const priority={BUY:0,SELL:1,IZLE:2};
  state.rows=segments.flat().sort((a,b)=>(priority[a.status]-priority[b.status])||
   (Math.abs(a.distancePct)-Math.abs(b.distancePct))||
   b.volume24h-a.volume24h).slice(0,120);
  const values=Object.values(state.sources);
  state.eligible=values.reduce((s,v)=>s+v.eligible,0);
  state.checked=values.reduce((s,v)=>s+v.checked,0);
  state.failed=values.reduce((s,v)=>s+v.failed,0);
  state.skippedHistory=values.reduce((s,v)=>s+v.skippedHistory,0);
  state.updatedAt=Date.now();
 }catch(error){
  state.errors.push("Haftalık MA200 tarama hatası: "+String(error.message));
  console.error("Haftalık MA200 tarama:",error);
 }finally{state.running=false;}
 return earlyPumpStatus();
}
export function startEarlyPump(){
 scanEarlyPump().catch(err=>console.error("MA200 ilk tarama:",err));
 setInterval(()=>scanEarlyPump().catch(err=>console.error("MA200 tarama:",err)),INTERVAL_MS);
}
export async function fetchEarlyPumpChart(exchange,symbol){
 const p=providers.find(x=>x.name===String(exchange||"").trim().toUpperCase());
 if(!p)throw Object.assign(Error("Borsa seçimi geçersiz. BINANCE, OKX, KUCOIN veya GATE.IO seçin."),{httpCode:400});
 const code=canonical(symbol);
 const market=p.kind==="okx"||p.kind==="kucoin"?code.replace(/USDT$/,"-USDT"):
  p.kind==="gate"?code.replace(/USDT$/,"_USDT"):code;
 const raw=await weeklyCandles(p,market);
 const analysis=analyzeWeeklyMA200(raw);
 if(!analysis.candles.length)throw Object.assign(Error("Bu coin için yeterli mum verisi bulunamadı."),{httpCode:404});
 return {
  exchange:p.name,symbol:market.replace(/[-_]?USDT$/,"/USDT"),market,
  timeframe:p.kind==="gate"?"7D":"1W",MA_PERIOD:analysis.referencePeriod,
  referencePeriod:analysis.referencePeriod,referenceMA:analysis.referenceMA,
  generatedAt:Date.now(),lastClosedAt:analysis.lastClosedAt,insufficient:analysis.insufficient,
  weeks:analysis.weeks,status:analysis.status,reason:analysis.reason,
  sma200:analysis.sma200,distancePct:analysis.distancePct,rsi14:analysis.rsi14,
  candles:analysis.candles,ma200:analysis.ma200,ma:analysis.ma,
  markers:analysis.markers.map(({kind,time,index,price,confirmedAt,period,reason})=>({kind,time,index,price,confirmedAt,period,reason})),
  notice:(p.kind==="gate"?"Gate.io yedi günlük periyotları takvim haftasından farklı hizalanabilir. ":"")+
   (analysis.referencePeriod?"Bu coin için gerçek MA"+analysis.referencePeriod+" kullanılıyor. ":"Yeterli mum geçmişi yok. ")+
   "Yalnızca kapanmış haftalık mumlar kullanılır. Sinyal, kâr garantisi değildir."
 };
}
