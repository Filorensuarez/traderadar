import {analyzePre15,inspectPreEvent} from "./pre15-engine.js";
import {eligibleMarketCap,marketCapStatus} from "./market-cap-filter.js";
const BASE="https://api.gateio.ws/api/v4";
const MAX_SYMBOLS=Number(process.env.PRE15_MAX_SYMBOLS||150);
const state={updatedAt:0,checked:0,eligible:0,errors:0,rows:[],lastError:null,
 source:"Gate.io 1m tamamlanmış mumlar",running:false,universeUpdated:0};
let universe=[],timer=null;
async function request(url){
 const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(13000)});
 if(!response.ok)throw Error("Gate HTTP "+response.status);
 return response.json();
}
export function parseGateCandles(data){
 if(!Array.isArray(data))return [];
 return data.filter(x=>Array.isArray(x)&&x.length>=6).map(x=>({
  time:Number(x[0])*1000,volume:Number(x[1]),close:Number(x[2]),
  high:Number(x[3]),low:Number(x[4]),open:Number(x[5])
 })).filter(x=>Object.values(x).every(Number.isFinite)&&x.low>0&&x.high>=x.low)
 .sort((a,b)=>a.time-b.time);
}
async function getBars(pair,opts={}){
 const q=new URLSearchParams({currency_pair:pair,interval:"1m"});
 if(opts.from!==undefined&&opts.to!==undefined){
  q.set("from",String(Math.floor(opts.from/1000)));
  q.set("to",String(Math.floor(opts.to/1000)));
 }else q.set("limit","100");
 return parseGateCandles(await request(BASE+"/spot/candlesticks?"+q.toString()));
}
async function discover(){
 const cap=marketCapStatus();
 if(cap.stale)throw Error("100 milyon USD piyasa değeri verisi güncel değil.");
 const items=await request(BASE+"/spot/tickers");
 if(!Array.isArray(items))throw Error("Borsa listesi geçersiz");
 const max=Math.max(20,Math.min(300,MAX_SYMBOLS||150));
 universe=items.filter(x=>/^[A-Z0-9]{2,24}_USDT$/.test(x.currency_pair||"")&&
  Number(x.quote_volume)>=1000&&eligibleMarketCap(x.currency_pair)!==null)
 .sort((a,b)=>Number(b.quote_volume)-Number(a.quote_volume))
 .slice(0,max).map(x=>x.currency_pair);
 state.universeUpdated=Date.now();
}
let cursor=0;
export async function scanPre15(){
 if(state.running)return {...state};
 state.running=true;
 try{
  if(!universe.length||Date.now()-state.universeUpdated>20*60000)await discover();
  if(!universe.length)throw Error("Piyasa değeri doğrulanmış uygun USDT çifti yok.");
  // Batch 25 per minute: capped to protect free public API rate limits.
  const batchSize=25,selected=[];
  for(let i=0;i<Math.min(batchSize,universe.length);i++)
   selected.push(universe[(cursor+i)%universe.length]);
  cursor=(cursor+selected.length)%universe.length;
  let errors=0,checked=0;
  const newRows=[];
  for(let i=0;i<selected.length;i+=5){
   const results=await Promise.allSettled(selected.slice(i,i+5).map(async pair=>{
    const candles=await getBars(pair);
    const signal=analyzePre15(candles);
    return {symbol:pair.replace("_","/"),exchange:"GATE.IO",
      marketCapUsd:eligibleMarketCap(pair),...signal};
   }));
   for(const result of results){
    checked++;
    if(result.status==="fulfilled"){
     const x=result.value;
     if(x.marketCapUsd!==null&&["YÜKSELİŞ HAZIRLIĞI","İZLE"].includes(x.status))newRows.push(x);
    }else errors++;
   }
  }
  // Preserve only fresh candidates; remove stale records after 3 minutes.
  const fresh=state.rows.filter(x=>Date.now()-x.scannedAt<180000);
  const map=new Map(fresh.map(x=>[x.exchange+":"+x.symbol,x]));
  for(const x of newRows)map.set(x.exchange+":"+x.symbol,{...x,scannedAt:Date.now()});
  state.rows=[...map.values()].sort((a,b)=>b.score-a.score).slice(0,100);
  state.updatedAt=Date.now();state.checked=checked;state.eligible=universe.length;
  state.errors=errors;state.lastError=null;
 }catch(e){state.lastError=e.message;state.rows=[];}
 finally{state.running=false;}
 return {...state};
}
export function pre15Status(){return {...state,cap:marketCapStatus(),
 message:"İzlenen borsada, doğrulanmış küçük piyasa değerli USDT çiftleri. Tam piyasa kapsaması veya 15 dakika önceden kesin tahmin yok."};}
export async function inspectHistorical15(symbol,event){
 const s=String(symbol||"").toUpperCase().replace(/[-_/]USDT$/,"");
 if(!/^[A-Z0-9]{2,24}$/.test(s))throw Error("Geçersiz coin adı");
 const t=Date.parse(event);
 if(!Number.isFinite(t)||t>Date.now()||t<Date.now()-30*86400000)
  throw Error("Son 30 günde geçmiş bir ISO zaman belirtin");
 const from=t-100*60000,to=t+65*60000;
 const bars=await getBars(s+"_USDT",{from,to});
 const before=inspectPreEvent(bars,t);
 const at=bars.findLast(x=>x.time+60000<=t);
 const future15=bars.find(x=>x.time>=t+15*60000);
 const future60=bars.find(x=>x.time>=t+60*60000);
 const ret=(x)=>at&&x?Number(((x.close/at.close-1)*100).toFixed(2)):null;
 return {symbol:s+"/USDT",exchange:"GATE.IO",eventTime:t,
  inspectedBars:bars.length,before,
  future15Pct:ret(future15),future60Pct:ret(future60),
  warning:"Olay zamanı sonradan seçilmiştir; bu geçmiş inceleme canlı başarı oranı değildir."};
}
export function startPre15Scanner(){
 if(timer)return;
 scanPre15().catch(()=>{});
 timer=setInterval(()=>scanPre15().catch(()=>{}),60000);
}
