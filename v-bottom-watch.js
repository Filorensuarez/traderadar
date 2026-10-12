// Separate V-bottom reversal radar. Public USDT spot data only; no trading operations.
// Strict confirmation requires completed 1m + 5m + 15m candles and all model gates.
import {detectVBottomGeometry,evaluateVBottom} from "./v-bottom-model.js";
const INTERVAL_MS=150000,COUNT=55,WORKERS=4,MIN_VOL=1000000;
const exchanges=[
 {name:"BINANCE",kind:"binance",api:"https://data-api.binance.vision"},
 {name:"OKX",kind:"okx",api:"https://www.okx.com"},
 {name:"KUCOIN",kind:"kucoin",api:"https://api.kucoin.com"},
 {name:"GATE.IO",kind:"gate",api:"https://api.gateio.ws"},
 {name:"BITGET",kind:"bitget",api:"https://api.bitget.com"}
];
const state={running:false,updatedAt:0,startedAt:0,checked:0,eligible:0,failed:0,
 confirmed:0,candidates:0,late:0,rows:[],sources:{},intervalSeconds:INTERVAL_MS/1000,
 notice:"Beş borsanın spot USDT piyasaları rotasyonla taranır. TAM TEKNİK TEYİT yalnızca 1/5/15 dakikalık kapanmış mumlar, hacim, momentum ve en az 1:1,6 risk/getiri birlikte doğrulanınca görünür. Kesin gelecek getirisi değildir."};
const positions=new Map(),firstSeen=new Map(),limits=new Map();
const tkr=(symbol,price,bid,ask,volume24h,change24h)=>({symbol,price:+price,bid:+bid,ask:+ask,volume24h:+volume24h,change24h:+change24h});
async function json(url,name){
 const response=await fetch(url,{signal:AbortSignal.timeout(11000),headers:{Accept:"application/json"}});
 if([418,429].includes(response.status)){limits.set(name,Date.now()+180000);throw Error("Hız sınırı ("+response.status+")");}
 if(!response.ok)throw Error("HTTP "+response.status);
 return response.json();
}
const isPair=s=>/^[A-Z0-9]+[-_]?USDT$/.test(s)&&
 !/(UP|DOWN|BULL|BEAR|[235][SL])[-_]?USDT$/i.test(s)&&
 !/^(USDC|USDE|TUSD|FDUSD|DAI|USDD|PYUSD|USD1|EURC)[-_]?USDT$/.test(s);
async function getTickers(ex){
 let a,rows=[];
 if(ex.kind==="binance"){
  a=await json(ex.api+"/api/v3/ticker/24hr",ex.name);
  if(!Array.isArray(a))throw Error("Binance ticker boş");
  rows=a.map(x=>tkr(x.symbol,x.lastPrice,x.bidPrice,x.askPrice,x.quoteVolume,x.priceChangePercent));
 }else if(ex.kind==="okx"){
  a=await json(ex.api+"/api/v5/market/tickers?instType=SPOT",ex.name);
  if(a.code!=="0"||!Array.isArray(a.data))throw Error("OKX ticker boş");
  rows=a.data.map(x=>tkr(x.instId,x.last,x.bidPx,x.askPx,x.volCcy24h,NaN));
 }else if(ex.kind==="kucoin"){
  a=await json(ex.api+"/api/v1/market/allTickers",ex.name);
  if(a.code!=="200000"||!Array.isArray(a.data?.ticker))throw Error("KuCoin ticker boş");
  rows=a.data.ticker.map(x=>tkr(x.symbol,x.last,x.buy,x.sell,x.volValue,+x.changeRate*100));
 }else if(ex.kind==="gate"){
  a=await json(ex.api+"/api/v4/spot/tickers",ex.name);
  if(!Array.isArray(a))throw Error("Gate ticker boş");
  rows=a.map(x=>tkr(x.currency_pair,x.last,x.highest_bid,x.lowest_ask,x.quote_volume,x.change_percentage));
 }else{
  a=await json(ex.api+"/api/v3/market/tickers?category=SPOT",ex.name);
  if(a.code!=="00000"||!Array.isArray(a.data))throw Error("Bitget ticker boş");
  rows=a.data.filter(x=>!x.category||x.category==="SPOT")
   .map(x=>tkr(x.symbol,x.lastPrice,x.bid1Price,x.ask1Price,x.turnover24h,x.change24h?+x.change24h*100:NaN));
 }
 return rows.filter(x=>isPair(x.symbol)&&x.price>0&&x.bid>0&&x.ask>=x.bid&&
  Number.isFinite(x.volume24h)&&x.volume24h>=MIN_VOL&&
  (x.ask-x.bid)/x.ask<=0.003);
}
const intervalFor=(ex,tf)=>ex.kind==="kucoin"?({ "1m":"1min","5m":"5min","15m":"15min"})[tf]:tf;
async function getCandles(ex,symbol,tf){
 const sym=encodeURIComponent(symbol),it=intervalFor(ex,tf);
 let a,rows;
 if(ex.kind==="binance"){
  a=await json(ex.api+"/api/v3/klines?symbol="+sym+"&interval="+it+"&limit=100",ex.name);
  if(!Array.isArray(a))throw Error("Binance mum boş");
  rows=a.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[7]}));
 }else if(ex.kind==="okx"){
  a=await json(ex.api+"/api/v5/market/candles?instId="+sym+"&bar="+it+"&limit=100",ex.name);
  if(a.code!=="0"||!Array.isArray(a.data))throw Error("OKX mum boş");
  rows=a.data.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[7]}));
 }else if(ex.kind==="kucoin"){
  const now=Math.floor(Date.now()/1000);
  a=await json(ex.api+"/api/v1/market/candles?type="+it+"&symbol="+sym+
   "&startAt="+(now-110*({ "1m":60,"5m":300,"15m":900})[tf])+"&endAt="+now,ex.name);
  if(a.code!=="200000"||!Array.isArray(a.data))throw Error("KuCoin mum boş");
  rows=a.data.map(x=>({time:+x[0]*1000,open:+x[1],high:+x[3],low:+x[4],close:+x[2],quoteVolume:+x[6]}));
 }else if(ex.kind==="gate"){
  a=await json(ex.api+"/api/v4/spot/candlesticks?currency_pair="+sym+"&interval="+it+"&limit=100",ex.name);
  if(!Array.isArray(a))throw Error("Gate mum boş");
  rows=a.map(x=>({time:+x[0]*1000,open:+x[5],high:+x[3],low:+x[4],close:+x[2],quoteVolume:+x[1]}));
 }else{
  a=await json(ex.api+"/api/v3/market/candles?category=SPOT&symbol="+sym+
   "&interval="+it+"&limit=100",ex.name);
  if(a.code!=="00000"||!Array.isArray(a.data))throw Error("Bitget mum boş");
  rows=a.data.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],quoteVolume:+x[6]}));
 }
 const unique=new Map();
 for(const x of rows)if(Number.isFinite(x.time)&&x.time>0&&x.open>0&&x.close>0&&
  x.low>0&&x.high>=x.low&&Number.isFinite(x.quoteVolume)&&x.quoteVolume>=0)unique.set(x.time,x);
 return [...unique.values()].sort((a,b)=>a.time-b.time);
}
function selectPairs(ex,tickers){
 const chosen=[],seen=new Set(),add=x=>{if(x&&!seen.has(x.symbol)&&chosen.length<COUNT){chosen.push(x);seen.add(x.symbol);}};
 // Recently falling markets and high liquidity first; then rotate through the rest.
 const losers=tickers.filter(x=>Number.isFinite(x.change24h)&&x.change24h<0).sort((a,b)=>a.change24h-b.change24h);
 for(const t of losers.slice(0,16))add(t);
 for(const t of [...tickers].sort((a,b)=>b.volume24h-a.volume24h).slice(0,14))add(t);
 const sorted=[...tickers].sort((a,b)=>a.symbol.localeCompare(b.symbol));
 const start=positions.get(ex.name)||0;
 for(let i=0;i<sorted.length&&chosen.length<COUNT;i++)add(sorted[(start+i)%sorted.length]);
 positions.set(ex.name,sorted.length?(start+Math.max(1,COUNT-30))%sorted.length:0);
 return chosen;
}
async function scanExchange(ex){
 const metrics={eligible:0,checked:0,failed:0,geometry:0,confirmed:0,error:null};
 state.sources[ex.name]=metrics;
 if((limits.get(ex.name)||0)>Date.now()){metrics.error="İstek sınırı, geçici bekleme";return [];}
 try{
  const tickers=await getTickers(ex),quoteTime=Date.now();
  metrics.eligible=tickers.length;
  const list=selectPairs(ex,tickers);
  const rows=[];let index=0;
  async function worker(){
   while(index<list.length){
    if((limits.get(ex.name)||0)>Date.now()){metrics.error="Hız sınırı nedeniyle kalan tarama durduruldu";break;}
    const t=list[index++];
    try{
     const one=await getCandles(ex,t.symbol,"1m");
     const geometry=detectVBottomGeometry(one,t,Date.now());
     if(geometry){
      metrics.geometry++;
      const [five,fifteen]=await Promise.all([
       getCandles(ex,t.symbol,"5m"),getCandles(ex,t.symbol,"15m")
      ]);
      const result=evaluateVBottom(one,five,fifteen,t,Date.now());
      if(result){
       // A quote may have become stale while remote candles were downloaded.
       if(Date.now()-quoteTime>45000&&result.confirmed){
        result.stage="FİYAT YENİLEME BEKLENİYOR";result.confirmed=false;
        result.stop=null;result.target=null;result.riskReward=null;result.potentialPct=null;
        result.reason="Alış kotasyonu 45 saniyeden eski, tam teyit verilemez";
       }
       if(result.confirmed)metrics.confirmed++;
       const key=ex.name+":"+t.symbol;
       if(!firstSeen.has(key))firstSeen.set(key,Date.now());
       rows.push({...result,symbol:t.symbol.replace(/[-_]?USDT$/,"/USDT"),exchange:ex.name,
        rawSymbol:t.symbol,volume24h:t.volume24h,firstSeenAt:firstSeen.get(key),
        lastCheckedAt:Date.now()});
      }
     }
    }catch(err){
     metrics.failed++;
     if(state.errors.length<8)state.errors.push(ex.name+" "+t.symbol+": "+String(err.message).slice(0,75));
    }
    metrics.checked++;
    await new Promise(resolve=>setTimeout(resolve,125));
   }
  }
  await Promise.all(Array.from({length:WORKERS},()=>worker()));
  return rows;
 }catch(err){metrics.error=String(err.message);if(state.errors.length<8)state.errors.push(ex.name+": "+err.message);return [];}
}
export function vBottomStatus(){return {...state,rows:[...state.rows],sources:{...state.sources}};}
export async function scanVBottom(){
 if(state.running)return vBottomStatus();
 state.running=true;state.startedAt=Date.now();state.errors=[];
 try{
  const responses=await Promise.all(exchanges.map(ex=>scanExchange(ex)));
  const rows=responses.flat();
  const rank={"TAM TEKNİK TEYİT":0,"DÖNÜŞ ADAYI":1,"VERİ BEKLENİYOR":2,
   "FİYAT YENİLEME BEKLENİYOR":3,"GEÇ KALINDI":4};
  state.rows=rows.sort((a,b)=>rank[a.stage]-rank[b.stage]||b.score-a.score||
   b.firstSeenAt-a.firstSeenAt).slice(0,100);
  state.eligible=Object.values(state.sources).reduce((s,x)=>s+x.eligible,0);
  state.checked=Object.values(state.sources).reduce((s,x)=>s+x.checked,0);
  state.failed=Object.values(state.sources).reduce((s,x)=>s+x.failed,0);
  state.confirmed=rows.filter(x=>x.confirmed).length;
  state.candidates=rows.filter(x=>x.stage==="DÖNÜŞ ADAYI").length;
  state.late=rows.filter(x=>x.stage==="GEÇ KALINDI").length;
  state.updatedAt=Date.now();
  const active=new Set(rows.map(x=>x.exchange+":"+x.rawSymbol));
  for(const [key,at] of firstSeen)if(!active.has(key)||Date.now()-at>6*3600000)firstSeen.delete(key);
 }catch(err){state.errors.push("Genel V dip tarama hatası: "+err.message);console.error(err);}
 finally{state.running=false;}
 return vBottomStatus();
}
export function startVBottom(){
 setTimeout(()=>scanVBottom().catch(e=>console.error("V Dip:",e)),25000);
 setInterval(()=>scanVBottom().catch(e=>console.error("V Dip:",e)),INTERVAL_MS);
}
