// 30 genuine closed 1-second candles vs the 30 prior closed 1-minute candles.
// USDT spot only. Never downgrade a missing 1s source to 1m or synthetic 1s bars.
import {calculateMomentum30s,momentum30sThresholds} from "./momentum-30s-model.js";
import {confirmedMomentumRows} from "./momentum-visibility.js";
import {MOMENTUM_SCAN_INTERVAL_MS,MOMENTUM_MIN_REQUEST_SPACING_MS,chooseMomentumMarkets} from "./momentum-scan-config.js";
const SCAN_EVERY_MS=MOMENTUM_SCAN_INTERVAL_MS,UNIVERSE_TTL=75000;
const MAX_ACTIVE_AGE=150000,WORKERS=3;
const PROVIDERS=[
 {name:"BINANCE",kind:"binance",api:"https://data-api.binance.vision",seconds:true},
 {name:"OKX",kind:"okx",api:"https://www.okx.com",seconds:true},
 {name:"KUCOIN",seconds:false},
 {name:"GATE.IO",seconds:false},
 {name:"BITGET",seconds:false}
];
const state={
 running:false,updatedAt:0,startedAt:0,checked:0,successful:0,failed:0,missing:0,
 errors:[],rows:[],universe:{},sources:{},
 intervalSeconds:SCAN_EVERY_MS/1000,thresholds:momentum30sThresholds,
 notice:"Genişletilmiş tarama hedefi: Binance 200, OKX 16 olmak üzere en fazla 216 farklı borsa/parite eşleşmesi, 120 saniyelik döngüyle dönüşümlü kontrol edilir. Son 30 kapanmış gerçek 1 saniyelik mumun ortalama fiyatı önceki 30 kapanmış 1 dakikalık mumun ortalamasından en az %2 yukarıdaysa teyit verilir. Hacim şartı aranmaz. API hız sınırı ve yetersiz mum durumunda gerçekleşen tarama sayısı daha az olabilir. Kesin kazanç garantisi değildir."
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
 nextFetchAt.set(exchange,next+(MOMENTUM_MIN_REQUEST_SPACING_MS[exchange]||200));
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
 const rows=standardize(raw,p.name).filter(x=>supports(x.symbol)&&
  x.price>0&&x.bid>0&&x.ask>=x.bid&&
  (x.ask-x.bid)/x.ask*100<=0.45).sort((a,b)=>b.volume-a.volume);
 marketCache.set(p.name,{time:Date.now(),rows});
 return rows;
}
function selectMarkets(p,all){
 const result=chooseMomentumMarkets(p.name,all,rotation.get(p.name)||0);
 rotation.set(p.name,result.nextOffset);
 return result.selected;
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
function publish(){
 const time=Date.now();
 for(const [key,x] of active)if(time-x.lastCheckedAt>MAX_ACTIVE_AGE)active.delete(key);
 // Expose only fully confirmed results; no near-threshold candidates leave the backend.
 state.rows=confirmedMomentumRows([...active.values()])
  .sort((a,b)=>b.firstSeenAt-a.firstSeenAt||b.priceChangePct-a.priceChangePct).slice(0,80);
 state.updatedAt=time;
}
export function minuteMomentumStatus(){return {...state,rows:confirmedMomentumRows(state.rows),
 sources:{...state.sources},errors:[...state.errors]};}
async function scanExchange(p){
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
    if(Date.now()<(limitUntil.get(p.name)||0)){stat.error="Borsa hız sınırı; yeni veri bekleniyor";break;}
    const ticker=selected[next++],key=p.name+":"+ticker.symbol;
    try{
     // Fetch the slower 1m reference first: the 1s candles must be checked immediately
     // after retrieval or they'd age out while waiting in the shared rate-limit queue.
     const minutes=await getMinutes(p,ticker.symbol);
     const seconds=await getSeconds(p,ticker.symbol);
     const result=calculateMomentum30s(seconds,minutes,Date.now());
     if(!result.ok){stat.missing++;state.missing++;active.delete(key);}
     else{
      stat.successful++;state.successful++;
      const normalized={...result,exchange:p.name,symbol:ticker.symbol.replace(/[-]?USDT$/,"/USDT"),
       lastCheckedAt:Date.now(),spreadPct:+((ticker.ask-ticker.bid)/ticker.ask*100).toFixed(3)};
      if(result.confirmed){
       const existing=active.get(key);
       active.set(key,{...normalized,firstSeenAt:existing?.firstSeenAt||Date.now(),
        status:"30 SN FİYAT YÜKSELİŞ TEYİDİ"});
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
 }finally{publish();}
}
export async function scanMinuteMomentum(){
 if(state.running)return minuteMomentumStatus();
 state.running=true;state.startedAt=Date.now();
 state.checked=0;state.attempted=0;state.successful=0;state.failed=0;state.missing=0;
 state.errors=[];state.sources={};state.universe={};
 for(const p of PROVIDERS)if(!p.seconds){
  state.sources[p.name]={supported:false,eligible:0,checked:0,successful:0,failed:0,missing:0,
   error:null,notice:"Doğrulanmış 1 saniyelik spot mum veri kaynağı yok; 1m verilerle taklit edilmiyor"};
  state.universe[p.name]=0;
 }
 try{
  await Promise.all(PROVIDERS.filter(p=>p.seconds).map(p=>scanExchange(p)));
  publish();
  console.log("30s/30m momentum: "+Object.entries(state.sources).map(([name,v])=>
   name+" "+(v.supported?v.checked+"/"+v.eligible+" geçerli="+v.successful+" eksik="+v.missing+" hata="+v.failed+(v.lastError?" ["+v.lastError+"]":"")+(v.error?" HATA "+v.error:""):"1s kullanılmıyor")).join(" | ")+
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
