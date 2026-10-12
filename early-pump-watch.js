// Public USDT spot price/volume scanner. No auto-trading, leverage, or private keys.
// Open intraday VCP-inspired heuristics and quantitative tests, not proprietary systems.
import {evaluateEarlyRise} from "./early-rise-model.js";
import {microMomentumStatus} from "./micro-momentum-watch.js";
import {loadEarlyRiseJournal,observeEarlyRiseTickers,rememberEarlyRiseSignals,earlyRiseStats,saveEarlyRiseJournal} from "./early-rise-journal.js";

const INTERVAL=90000,MAX_PER_SOURCE=100,WORKERS=5,MIN_VOLUME=1000000;
const providers=[
 {name:"BINANCE",kind:"binance",base:"https://data-api.binance.vision"},
 {name:"OKX",kind:"okx",base:"https://www.okx.com"},
 {name:"KUCOIN",kind:"kucoin",base:"https://api.kucoin.com"},
 {name:"GATE.IO",kind:"gate",base:"https://api.gateio.ws"},
 {name:"BITGET",kind:"bitget",base:"https://api.bitget.com"}
];
const state={running:false,updatedAt:0,startedAt:0,checked:0,eligible:0,failed:0,errors:[],rows:[],sources:{},
 intervalSeconds:INTERVAL/1000,stats:earlyRiseStats(),notice:"Spot USDT piyasaları rotasyonla taranır. Sıkışma modeli dakika ölçeği için uyarlanmıştır. İstatistiksel skor olasılık değildir. Otomatik işlem yapılmaz."};
const cursor=new Map(),seen=new Map(),firstSeen=new Map(),blockedUntil=new Map();
const valid=s=>/^[A-Z0-9]+[-_]?USDT$/.test(s)&&
 !/(UP|DOWN|BULL|BEAR|[235][SL])[-_]?USDT$/i.test(s)&&
 !/^(USDC|USDE|TUSD|FDUSD|DAI|USDD|PYUSD|USD1|EURC)[-_]?USDT$/.test(s);
const ticker=(symbol,price,bid,ask,volume24h)=>({symbol,price:+price,bid:+bid,ask:+ask,volume24h:+volume24h});
async function json(url,name){
 const r=await fetch(url,{signal:AbortSignal.timeout(11000),headers:{Accept:"application/json"}});
 if(r.status===429||r.status===418){blockedUntil.set(name,Date.now()+90000);throw Error("Borsa hız sınırı "+r.status);}
 if(!r.ok)throw Error("HTTP "+r.status);
 return r.json();
}
async function getTickers(p){
 let a,rows=[];
 if(p.kind==="binance"){
  a=await json(p.base+"/api/v3/ticker/24hr",p.name);
  if(!Array.isArray(a))throw Error("Binance ticker verisi yok");
  rows=a.map(x=>ticker(x.symbol,x.lastPrice,x.bidPrice,x.askPrice,x.quoteVolume));
 }else if(p.kind==="okx"){
  a=await json(p.base+"/api/v5/market/tickers?instType=SPOT",p.name);
  if(a.code!=="0"||!Array.isArray(a.data))throw Error("OKX ticker verisi yok");
  rows=a.data.map(x=>ticker(x.instId,x.last,x.bidPx,x.askPx,x.volCcy24h));
 }else if(p.kind==="kucoin"){
  a=await json(p.base+"/api/v1/market/allTickers",p.name);
  if(a.code!=="200000"||!Array.isArray(a.data?.ticker))throw Error("KuCoin ticker verisi yok");
  rows=a.data.ticker.map(x=>ticker(x.symbol,x.last,x.buy,x.sell,x.volValue));
 }else if(p.kind==="gate"){
  a=await json(p.base+"/api/v4/spot/tickers",p.name);
  if(!Array.isArray(a))throw Error("Gate ticker verisi yok");
  rows=a.map(x=>ticker(x.currency_pair,x.last,x.highest_bid,x.lowest_ask,x.quote_volume));
 }else{
  a=await json(p.base+"/api/v3/market/tickers?category=SPOT",p.name);
  if(a.code!=="00000"||!Array.isArray(a.data))throw Error("Bitget ticker verisi yok");
  rows=a.data.filter(x=>!x.category||x.category==="SPOT")
   .map(x=>ticker(x.symbol,x.lastPrice,x.bid1Price,x.ask1Price,x.turnover24h));
 }
 return rows.filter(x=>valid(x.symbol)&&x.price>0&&x.ask>0&&x.bid>0&&
  x.ask>=x.bid&&x.volume24h>=MIN_VOLUME&&(x.ask-x.bid)/x.ask<=0.005);
}
async function getCandles(p,s,now=Date.now()){
 let a,rows;const sym=encodeURIComponent(s);
 if(p.kind==="binance"){
  a=await json(p.base+"/api/v3/klines?symbol="+sym+"&interval=1m&limit=132",p.name);
  if(!Array.isArray(a))throw Error("Binance mumları yok");
  rows=a.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[7]}));
 }else if(p.kind==="okx"){
  a=await json(p.base+"/api/v5/market/candles?instId="+sym+"&bar=1m&limit=132",p.name);
  if(a.code!=="0"||!Array.isArray(a.data))throw Error("OKX mumları yok");
  rows=a.data.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[7]}));
 }else if(p.kind==="kucoin"){
  const end=Math.floor(now/1000);
  a=await json(p.base+"/api/v1/market/candles?type=1min&symbol="+sym+"&startAt="+(end-135*60)+"&endAt="+end,p.name);
  if(a.code!=="200000"||!Array.isArray(a.data))throw Error("KuCoin mumları yok");
  rows=a.data.map(x=>({time:+x[0]*1000,open:+x[1],high:+x[3],low:+x[4],close:+x[2],quoteVolume:+x[6]}));
 }else if(p.kind==="gate"){
  a=await json(p.base+"/api/v4/spot/candlesticks?currency_pair="+sym+"&interval=1m&limit=132",p.name);
  if(!Array.isArray(a))throw Error("Gate mumları yok");
  rows=a.map(x=>({time:+x[0]*1000,open:+x[5],high:+x[3],low:+x[4],close:+x[2],quoteVolume:+x[1]}));
 }else{
  a=await json(p.base+"/api/v3/market/candles?category=SPOT&symbol="+sym+"&interval=1m&limit=132",p.name);
  if(a.code!=="00000"||!Array.isArray(a.data))throw Error("Bitget mumları yok");
  rows=a.data.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[6]}));
 }
 const uniq=new Map();
 for(const x of rows){
  if(Number.isFinite(x.time)&&x.time>0&&x.close>0&&x.low>0&&x.high>=x.low&&
    Number.isFinite(x.quoteVolume)&&x.quoteVolume>=0)uniq.set(x.time,x);
 }
 return [...uniq.values()].sort((a,b)=>a.time-b.time);
}
const rawFor=(p,s)=>p.kind==="gate"?s.replace("/USDT","_USDT"):
 ["okx","kucoin"].includes(p.kind)?s.replace("/USDT","-USDT"):s.replace("/","");
function shortlist(p,tickers,micro){
 const map=new Map(tickers.map(x=>[x.symbol,x]));
 const chosen=[],included=new Set();
 const add=s=>{const t=map.get(s);if(t&&!included.has(s)&&chosen.length<MAX_PER_SOURCE){included.add(s);chosen.push(t);}};
 for(const t of [...tickers].sort((a,b)=>b.volume24h-a.volume24h).slice(0,20))add(t.symbol);
 for(const x of micro)if(x.exchange===p.name&&x.status!=="GEÇ KALINDI")add(rawFor(p,x.symbol));
 for(const [key,time] of seen)if(key.startsWith(p.name+":")&&Date.now()-time<30*60000)
  add(key.slice(p.name.length+1));
 const pool=[...tickers].sort((a,b)=>a.symbol.localeCompare(b.symbol));
 const offset=cursor.get(p.name)||0;
 for(let j=0;j<pool.length&&chosen.length<MAX_PER_SOURCE;j++)add(pool[(offset+j)%pool.length].symbol);
 cursor.set(p.name,pool.length?(offset+Math.max(1,MAX_PER_SOURCE-20))%pool.length:0);
 return chosen;
}
async function scanProvider(p,micro){
 const stat={eligible:0,checked:0,failed:0,signals:0,error:null};
 state.sources[p.name]=stat;
 if((blockedUntil.get(p.name)||0)>Date.now()){stat.error="Geçici hız sınırı";return [];}
 try{
  const tickers=await getTickers(p);
  stat.eligible=tickers.length;
  observeEarlyRiseTickers(p.name,tickers,Date.now());
  const selected=shortlist(p,tickers,micro);
  let benchmark=null;
  try{
   const btc=await getCandles(p,rawFor(p,"BTC/USDT"));
   const current=Math.floor(Date.now()/60000)*60000;
   const closed=btc.filter(x=>x.time<current);
   if(closed.length>=21&&closed.at(-21).close>0)
    benchmark={return20Pct:(closed.at(-1).close/closed.at(-21).close-1)*100};
  }catch(err){stat.benchmarkError=String(err.message).slice(0,65);}
  const found=[];let next=0;
  async function worker(){
   while(next<selected.length){
    const t=selected[next++];
    try{
     const bars=await getCandles(p,t.symbol);
     const x=evaluateEarlyRise(bars,t,benchmark,Date.now());
     if(x){
      const key=p.name+":"+t.symbol;
      if(!firstSeen.has(key))firstSeen.set(key,Date.now());
      seen.set(key,Date.now());
      found.push({...x,exchange:p.name,symbol:t.symbol.replace(/[-_]?USDT$/,"/USDT"),
       rawSymbol:t.symbol,firstSeenAt:firstSeen.get(key),lastCheckedAt:Date.now()});
     }
    }catch(err){stat.failed++;if(state.errors.length<8)state.errors.push(p.name+" "+t.symbol+": "+String(err.message).slice(0,75));}
    stat.checked++;
   }
  }
  await Promise.all(Array.from({length:WORKERS},()=>worker()));
  stat.signals=found.length;
  return found;
 }catch(err){stat.error=String(err.message);if(state.errors.length<8)state.errors.push(p.name+": "+err.message);return [];}
}
export function earlyPumpStatus(){return {...state,rows:[...state.rows],sources:{...state.sources},stats:earlyRiseStats()};}
export async function scanEarlyPump(){
 if(state.running)return earlyPumpStatus();
 state.running=true;state.startedAt=Date.now();state.failed=0;state.errors=[];
 try{
  await loadEarlyRiseJournal();
  const micro=microMomentumStatus().rows||[];
  const blocks=await Promise.all(providers.map(p=>scanProvider(p,micro)));
  const all=blocks.flat();
  const priorities={"KIRILIM TEYİDİ":0,"KIRILIM ADAYI":1,"KIRILIM YAKIN":2,
   "SIKIŞMA İZLENİYOR":3,"GEÇ KALINDI":4};
  all.sort((a,b)=>priorities[a.stage]-priorities[b.stage]||b.score-a.score||b.firstSeenAt-a.firstSeenAt);
  const stamp=Date.now();
  rememberEarlyRiseSignals(all,stamp);
  await saveEarlyRiseJournal();
  state.rows=all.slice(0,100);
  state.checked=Object.values(state.sources).reduce((a,x)=>a+x.checked,0);
  state.eligible=Object.values(state.sources).reduce((a,x)=>a+x.eligible,0);
  state.failed=Object.values(state.sources).reduce((a,x)=>a+x.failed,0);
  state.stats=earlyRiseStats(stamp);state.updatedAt=stamp;
  for(const [key,time] of seen)if(stamp-time>2*3600000)seen.delete(key);
  for(const [key,time] of firstSeen)if(stamp-time>2*3600000&&!seen.has(key))firstSeen.delete(key);
 }catch(err){state.errors.push("Genel hata: "+err.message);console.error("Erken yükseliş:",err);}
 finally{state.running=false;}
 return earlyPumpStatus();
}
export function startEarlyPump(){
 scanEarlyPump().catch(e=>console.error("Erken yükseliş:",e));
 setInterval(()=>scanEarlyPump().catch(e=>console.error("Erken yükseliş:",e)),INTERVAL);
}
