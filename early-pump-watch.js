// Early price/volume acceleration radar; Binance public spot market data only.
const state={running:false,updatedAt:0,checked:0,eligible:0,failed:0,errors:[],rows:[]};
const firstSeen=new Map();
let lastUniverseAt=0,universe=[];
const API="https://data-api.binance.vision";
async function json(path){
 const r=await fetch(API+path,{signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error("HTTP "+r.status);
 return r.json();
}
async function symbols(){
 const [info,tickers]=await Promise.all([json("/api/v3/exchangeInfo"),json("/api/v3/ticker/24hr")]);
 const valid=new Set((info.symbols||[]).filter(x=>x.status==="TRADING"&&x.quoteAsset==="USDT"&&x.isSpotTradingAllowed!==false).map(x=>x.symbol));
 return (tickers||[]).filter(x=>valid.has(x.symbol)&&Number(x.quoteVolume)>=1000000&&
  !/(UP|DOWN|BULL|BEAR|[235][SL])USDT$/i.test(x.symbol))
  .sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume))
  .map(x=>({symbol:x.symbol,volume24h:Number(x.quoteVolume)}));
}
function analyze(candles,now=Date.now()){
 const a=candles.filter(x=>x[0]+60000<=now).slice(-31);
 if(a.length<31)return null;
 for(let i=1;i<a.length;i++)if(a[i][0]-a[i-1][0]!==60000)return null;
 if(now-(a.at(-1)[0]+60000)>120000)return null;
 const last=a.at(-1),close=Number(last[4]),base=Number(a.at(-4)[4]),p1=Number(a.at(-2)[4]),p5=Number(a.at(-6)[4]);
 if(![close,base,p1,p5].every(x=>x>0))return null;
 const change1=(close/p1-1)*100,change3=(close/base-1)*100,change5=(close/p5-1)*100;
 const volumes=a.map(x=>Number(x[7]));
 const baseline=volumes.slice(-21,-1).reduce((s,x)=>s+x,0)/20;
 const lastVol=volumes.at(-1),ratio=baseline>0?lastVol/baseline:0;
 const priorHigh=Math.max(...a.slice(-21,-1).map(x=>Number(x[2])));
 const breakout=close>priorHigh;
 const early=(change1>=0.6||change3>=1.2||change5>=2)&&ratio>=2.5&&lastVol>=10000&&change5<12;
 if(!early)return null;
 return {price:close,change1:+change1.toFixed(2),change3:+change3.toFixed(2),
  change5:+change5.toFixed(2),volumeRatio:+ratio.toFixed(2),minuteVolume:+lastVol.toFixed(0),
  breakout,candleTime:last[0],score:Math.round(Math.min(ratio,10)*8+Math.min(Math.max(change3,0),6)*10+(breakout?20:0))};
}
export function earlyPumpStatus(){return {...state,rows:[...state.rows]};}
export async function scanEarlyPump(){
 if(state.running)return earlyPumpStatus();
 state.running=true;state.checked=0;state.failed=0;state.errors=[];
 try{
  if(!universe.length||Date.now()-lastUniverseAt>15*60000){
   universe=await symbols();lastUniverseAt=Date.now();
  }
  state.eligible=universe.length;
  const found=[];let next=0;
  async function worker(){
   while(next<universe.length){
    const item=universe[next++];
    try{
     const raw=await json("/api/v3/klines?symbol="+encodeURIComponent(item.symbol)+"&interval=1m&limit=34");
     const x=analyze(raw);
     if(x){
      const key=item.symbol;
      if(!firstSeen.has(key))firstSeen.set(key,Date.now());
      found.push({symbol:key.replace(/USDT$/,"/USDT"),exchange:"BINANCE",volume24h:item.volume24h,
       firstSeenAt:firstSeen.get(key),...x});
     }
    }catch(e){state.failed++;if(state.errors.length<5)state.errors.push(item.symbol+": "+e.message);}
    state.checked++;
   }
  }
  await Promise.all(Array.from({length:5},()=>worker()));
  const active=new Set(found.map(x=>x.symbol.replace("/","")));
  for(const key of firstSeen.keys())if(!active.has(key))firstSeen.delete(key);
  state.rows=found.sort((a,b)=>b.firstSeenAt-a.firstSeenAt||b.score-a.score).slice(0,100);
  state.updatedAt=Date.now();
 }catch(e){state.errors.push(e.message);}
 finally{state.running=false;}
 return earlyPumpStatus();
}
export function startEarlyPump(){scanEarlyPump().catch(console.error);setInterval(()=>scanEarlyPump().catch(console.error),60000);}
