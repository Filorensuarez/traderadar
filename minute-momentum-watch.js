// 30 genuine closed 1-second candles vs the 30 prior closed 1-minute candles.
// USDT spot only. Never downgrade a missing 1s source to 1m or synthetic 1s bars.
import {calculateMomentum30s,momentum30sThresholds} from "./momentum-30s-model.js";
const SCAN_EVERY_MS=30000,UNIVERSE_TTL=75000,MIN_DAILY_USDT=1000000;
const WINDOW_SIZE=28,MAX_ACTIVE_AGE=75000,WORKERS=3;
const PROVIDERS=[
 {name:"BINANCE",kind:"binance",api:"https://data-api.binance.vision",seconds:true},
 {name:"OKX",kind:"okx",api:"https://www.okx.com",seconds:true},
 {name:"KUCOIN",seconds:false},
 {name:"GATE.IO",seconds:false},
 {name:"BITGET",seconds:false}
];
const state={
 running:false,updatedAt:0,startedAt:0,checked:0,successful:0,failed:0,missing:0,
 errors:[],rows:[],closest:[],maxChangePct:null,universe:{},sources:{},
 intervalSeconds:SCAN_EVERY_MS/1000,thresholds:momentum30sThresholds,
 notice:"Son 30 tamamlanmış 1 saniyelik mumun fiyat ortalaması, onlardan önceki 30 adet tamamlanmış 1 dakikalık mum ortalamasının en az %2 üzerindeyse ve 30 saniyelik gerçek hacim geçmişin en az 2,5 katı olup üç ayrı 10 saniyede hızlanıyorsa teyit. Sadece gerçek 1s mum desteği doğrulanan spot USDT borsaları taranır."
};
const active=new Map(),minuteCache=new Map(),limitUntil=new Map(),marketCache=new Map(),rotation=new Map(),nextFetchAt=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function supports(symbol){return /^[A-Z0-9]+(?:-|)USDT$/.test(symbol)&&
 !/(UP|DOWN|BULL|BEAR|[235][SL])(?:-|)?USDT$/i.test(symbol)&&
 !/^(USDC|USDE|FDUSD|TUSD|DAI|USDD|PYUSD|USD1|EURC)(?:-|)?USDT$/.test(symbol);}
async function get(url,exchange){
 if(Date.now()<(limitUntil.get(exchange)||0))throw Error("Borsa hız sınırı nedeniyle beklemede");
 // Shared per-exchange spacing prevents parallel workers from exhausting OKX IP quotas.
 const next=Math.max(Date.now(),nextFetchAt.get(exchange)||0);
 nextFetchAt.set(exchange,next+(exchange==="OKX"?1050:130));
 if(next>Date.now())await pause(next-Date.now());
 if(Date.now()<(limitUntil.get(exchange)||0))throw Error("Borsa hız sınırı nedeniyle beklemede");
 const response=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(9500)});
 if(response.status===429||response.status===418){
  limitUntil.set(exchange,Date.now()+90000);throw Error("API hız sınırı HTTP "+response.status);
 }
 if(!response.ok)throw Error("API HTTP "+response.status);
 return response.json();
}
function standardize(raw,exchange){
 if(exchange==="BINANCE"){
  if(!Array.isArray(raw))throw Error("Binance sembol listesi alınamadı");
  return raw.map(x=>({symbol:x.symbol,price:+x.lastPrice,bid:+x.bidPrice,ask:+x.askPrice,
   volume:+x.quoteVolume,dayChange:+x.priceChangePercent}));
 }
 if(raw.code!=="0"||!Array.isArray(raw.data))throw Error(raw.msg||"OKX sembol listesi alınamadı");
 return raw.data.map(x=>({symbol:x.instId,price:+x.last,bid:+x.bidPx,ask:+x.askPx,
  volume:+x.volCcy24h,dayChange:Number.NaN}));
}
async function universe(p){
 const cached=marketCache.get(p.name);
 if(cached&&Date.now()-cached.time<UNIVERSE_TTL)return cached.rows;
 const path=p.kind==="binance"?"/api/v3/ticker/24hr":"/api/v5/market/tickers?instType=SPOT";
 const raw=await get(p.api+path,p.name);
 const rows=standardize(raw,p.name).filter(x=>supports(x.symbol)&&Number.isFinite(x.volume)&&
  x.volume>=MIN_DAILY_USDT&&x.price>0&&x.bid>0&&x.ask>=x.bid&&
  (x.ask-x.bid)/x.ask*100<=0.45).sort((a,b)=>b.volume-a.volume);
 marketCache.set(p.name,{time:Date.now(),rows});
 return rows;
}
function selectMarkets(p,all){
 const selectedLimit=p.name==="OKX"?12:WINDOW_SIZE;
 const chosen=[],seen=new Set();
 const add=x=>{if(x&&!seen.has(x.symbol)&&chosen.length<selectedLimit){seen.add(x.symbol);chosen.push(x);}};
 for(const x of all.slice(0,p.name==="OKX"?4:11))add(x);
 for(const x of all.filter(x=>Number.isFinite(x.dayChange)).sort((a,b)=>b.dayChange-a.dayChange).slice(0,p.name==="OKX"?2:5))add(x);
 const remaining=all.filter(x=>!seen.has(x.symbol));
 const offset=rotation.get(p.name)||0;
 for(let i=0;i<remaining.length&&chosen.length<WINDOW_SIZE;i++)add(remaining[(offset+i)%remaining.length]);
 rotation.set(p.name,remaining.length?(offset+20)%remaining.length:0);
 return chosen;
}
async function getSeconds(p,s){
 const url=p.kind==="binance"?
  p.api+"/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval=1s&limit=38":
  p.api+"/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1s&limit=38";
 const d=await get(url,p.name);
 const rows=p.kind==="binance"?d:d.code==="0"?d.data:null;
 if(!Array.isArray(rows))throw Error(p.name+" 1s mum API'si veri döndürmedi");
 return rows.map(x=>({time:+x[0],close:+x[4],quoteVolume:+x[7]}));
}
async function getMinutes(p,s){
 const key=p.name+":"+s,cached=minuteCache.get(key);
 if(cached&&Date.now()-cached.at<43000)return cached.rows;
 const url=p.kind==="binance"?
  p.api+"/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval=1m&limit=42":
  p.api+"/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1m&limit=42";
 const d=await get(url,p.name);
 const rows=p.kind==="binance"?d:d.code==="0"?d.data:null;
 if(!Array.isArray(rows))throw Error(p.name+" 1m referans mumları alınamadı");
 const parsed=rows.map(x=>({time:+x[0],close:+x[4],quoteVolume:+x[7]}));
 minuteCache.set(key,{rows:parsed,at:Date.now()});
 return parsed;
}
function publish(closest){
 const time=Date.now();
 for(const [key,x] of active)if(time-x.lastCheckedAt>MAX_ACTIVE_AGE)active.delete(key);
 state.rows=[...active.values()].sort((a,b)=>b.firstSeenAt-a.firstSeenAt||b.priceChangePct-a.priceChangePct).slice(0,80);
 state.closest=[...closest].sort((a,b)=>b.priceChangePct-a.priceChangePct).slice(0,12);
 state.maxChangePct=state.closest[0]?.priceChangePct??null;
 state.updatedAt=time;
}
export function minuteMomentumStatus(){return {...state,rows:[...state.rows],closest:[...state.closest],
 sources:{...state.sources},errors:[...state.errors]};}
async function scanExchange(p,nearest){
 const stat={supported:true,eligible:0,checked:0,successful:0,failed:0,missing:0,error:null,lastError:null};
 state.sources[p.name]=stat;
 try{
  const list=await universe(p);
  state.universe[p.name]=list.length;
  const selected=selectMarkets(p,list);
  stat.eligible=selected.length;
  let next=0;
  async function worker(){
   while(next<selected.length){
    if(Date.now()<(limitUntil.get(p.name)||0))break;
    const ticker=selected[next++],key=p.name+":"+ticker.symbol;
    try{
     const [seconds,minutes]=await Promise.all([getSeconds(p,ticker.symbol),getMinutes(p,ticker.symbol)]);
     const result=calculateMomentum30s(seconds,minutes,Date.now());
     if(!result.ok){stat.missing++;state.missing++;active.delete(key);}
     else{
      stat.successful++;state.successful++;
      const normalized={...result,exchange:p.name,symbol:ticker.symbol.replace(/[-]?USDT$/,"/USDT"),
       lastCheckedAt:Date.now(),spreadPct:+((ticker.ask-ticker.bid)/ticker.ask*100).toFixed(3)};
      if(result.priceChangePct>=0.8)nearest.push(normalized);
      if(result.confirmed){
       const existing=active.get(key);
       active.set(key,{...normalized,firstSeenAt:existing?.firstSeenAt||Date.now(),
        status:"30 SN HACİMLİ YÜKSELİŞ TEYİDİ"});
      }else active.delete(key);
     }
    }catch(e){
     stat.failed++;state.failed++;stat.lastError=String(e.message);
     if(state.errors.length<12)state.errors.push(p.name+" "+ticker.symbol+": "+stat.lastError);
     active.delete(key);
    }finally{
     stat.checked++;state.checked++;state.attempted=state.checked;
    }
   }
  }
  await Promise.all(Array.from({length:Math.min(WORKERS,selected.length)},()=>worker()));
  if(stat.failed===stat.checked&&stat.checked>0)stat.error=stat.lastError;
 }catch(e){
  stat.error=String(e.message);
  if(state.errors.length<12)state.errors.push(p.name+": "+stat.error);
 }finally{publish(nearest);}
}
export async function scanMinuteMomentum(){
 if(state.running)return minuteMomentumStatus();
 state.running=true;state.startedAt=Date.now();
 state.checked=0;state.attempted=0;state.successful=0;state.failed=0;state.missing=0;
 state.errors=[];state.sources={};state.universe={};
 const closest=[];
 for(const p of PROVIDERS)if(!p.seconds){
  state.sources[p.name]={supported:false,eligible:0,checked:0,successful:0,failed:0,missing:0,
   error:null,notice:"Doğrulanmış 1 saniyelik spot mum veri kaynağı yok; 1m verilerle taklit edilmiyor"};
  state.universe[p.name]=0;
 }
 try{
  await Promise.all(PROVIDERS.filter(p=>p.seconds).map(p=>scanExchange(p,closest)));
  publish(closest);
  console.log("30s/30m momentum: "+Object.entries(state.sources).map(([name,v])=>
   name+" "+(v.supported?v.checked+"/"+v.eligible+(v.error?" HATA "+v.error:""):"1s kullanılmıyor")).join(" | ")+
   " | Teyit "+state.rows.length+" | API sorunları "+state.errors.slice(0,2).join("; "));
 }catch(e){
  state.errors.push("Genel 30 sn momentum hatası: "+String(e.message));
  console.error("30 saniyelik momentum:",e);
 }finally{state.running=false;}
 return minuteMomentumStatus();
}
export function startMinuteMomentum(){
 scanMinuteMomentum().catch(e=>{state.running=false;console.error(e);});
 setInterval(()=>scanMinuteMomentum().catch(e=>{state.running=false;console.error(e);}),SCAN_EVERY_MS);
}
