import fs from "node:fs";
const FILE="/data/traderadar-signal-stats-v2.json";
// v1 kayıtları farklı sinyal türlerini karıştırdığı için korunur ancak v2 istatistiğine katılmaz.
const WINDOW=36*60*60*1000;
const HORIZONS={daily:60*60*1000,radar:15*60*1000,scenario:60*60*1000};
const GRACE=20*60*1000;
const COOLDOWN=60*60*1000;
let records=[];
let running=false;
let lastPriceCheck=0;
let lastError=null;
try {
  const raw=JSON.parse(fs.readFileSync(FILE,"utf8"));
  if(Array.isArray(raw)) records=raw.filter(x=>x&&typeof x==="object");
} catch(e) { if(e.code!=="ENOENT") console.error("İstatistik dosyası:",e.message); }
function persist(){
  try {
    fs.mkdirSync("/data",{recursive:true});
    fs.writeFileSync(FILE,JSON.stringify(records));
  } catch(e){console.error("İstatistik kaydı:",e.message);}
}
function normSource(v){
  const x=String(v||"").toUpperCase();
  if(x.includes("GATE"))return "GATE";
  if(x.includes("KUCOIN"))return "KUCOIN";
  if(x.includes("OKX"))return "OKX";
  return null;
}
function normBase(v){
  const s=String(v||"").toUpperCase().replace(/[-_/](USDT|USD|TRY)$/,"").replace(/[^A-Z0-9]/g,"");
  return /^[A-Z0-9]{1,20}$/.test(s)?s:null;
}
export function recordSignals(group,rows,when=Date.now()){
  if(!["daily","radar","scenario"].includes(group)||!Array.isArray(rows))return;
  let changed=false;
  for(const row of rows.slice(0,80)){
    const source=normSource(row.source||row.exchange);
    const base=normBase(row.symbol||row.pair);
    const price=Number(row.price);
    if(!source||!base||!Number.isFinite(price)||price<=0)continue;
    const key=group+":"+source+":"+base;
    if(records.some(x=>x.key===key&&when-x.time<COOLDOWN))continue;
    records.push({key,group,source,base,time:when,entry:price,
      score:Number.isFinite(Number(row.score))?Number(row.score):null,
      result:null,exit:null,exitTime:null,status:"pending"});
    changed=true;
  }
  if(changed){prune(when);persist();}
}
function prune(now){
  records=records.filter(x=>Number.isFinite(x.time)&&x.time>=now-WINDOW-2*60*60*1000).slice(-4000);
}
async function json(url){
  const r=await fetch(url,{signal:AbortSignal.timeout(16000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  return r.json();
}
async function tickers(){
  const sources=await Promise.allSettled([
    json("https://www.okx.com/api/v5/market/tickers?instType=SPOT"),
    json("https://api.kucoin.com/api/v1/market/allTickers"),
    json("https://api.gateio.ws/api/v4/spot/tickers")
  ]);
  const prices=new Map();
  if(sources[0].status==="fulfilled"){
    for(const t of sources[0].value.data||[]){
      if(String(t.instId).endsWith("-USDT"))prices.set("OKX:"+normBase(t.instId),Number(t.last));
    }
  }
  if(sources[1].status==="fulfilled"){
    for(const t of sources[1].value.data?.ticker||[]){
      if(String(t.symbol).endsWith("-USDT"))prices.set("KUCOIN:"+normBase(t.symbol),Number(t.last));
    }
  }
  if(sources[2].status==="fulfilled"){
    for(const t of sources[2].value||[]){
      if(String(t.currency_pair).endsWith("_USDT"))prices.set("GATE:"+normBase(t.currency_pair),Number(t.last));
    }
  }
  if(sources.every(x=>x.status==="rejected"))throw Error("Üç borsadan da fiyat alınamadı");
  return prices;
}
export async function updateOutcomes(){
  if(running)return;
  running=true;
  const now=Date.now();
  try {
    const due=records.filter(x=>x.status==="pending"&&now-x.time>=HORIZONS[x.group]);
    if(!due.length)return;
    const prices=await tickers();
    let changed=false;
    for(const item of due){
      const p=prices.get(item.source+":"+item.base);
      if(Number.isFinite(p)&&p>0&&now-item.time<=HORIZONS[item.group]+GRACE){
        item.exit=p;item.exitTime=now;item.result=(p/item.entry-1)*100;
        item.status=item.result>=0.5?"success":"failure";
        changed=true;
      } else if(now-item.time>HORIZONS[item.group]+GRACE){
        item.status="unverified";changed=true;
      }
    }
    if(changed)persist();
    lastError=null;
  } catch(e){lastError=e.message;console.error("Sinyal sonuç takibi:",e.message);}
  finally {lastPriceCheck=Date.now();running=false;}
}
export function getSignalStatistics(){
  const now=Date.now(),since=now-WINDOW;
  const groups=["daily","radar","scenario"];
  const result={windowHours:36,horizonMinutesByGroup:{daily:60,radar:15,scenario:60},successThresholdPercent:0.5,
    generatedAt:now,lastPriceCheck,lastError,startedAt:records.length?Math.min(...records.map(x=>x.time)):null,groups:{}};
  for(const group of groups){
    const all=records.filter(x=>x.group===group&&x.time>=since);
    const done=all.filter(x=>x.status==="success"||x.status==="failure");
    const wins=done.filter(x=>x.status==="success").length;
    result.groups[group]={total:all.length,evaluated:done.length,successful:wins,
      failed:done.length-wins,pending:all.filter(x=>x.status==="pending").length,
      unverified:all.filter(x=>x.status==="unverified").length,
      horizonMinutes:HORIZONS[group]/60000,
      accuracyPercent:done.length?Number((wins/done.length*100).toFixed(1)):null,
      averageReturnPercent:done.length?Number((done.reduce((a,x)=>a+x.result,0)/done.length).toFixed(2)):null,
      latest:all.slice(-8).reverse().map(x=>({symbol:x.base+"/USDT",source:x.source,
        signalAt:x.time,entry:x.entry,exit:x.exit,returnPercent:x.result,status:x.status}))};
  }
  return result;
}
setInterval(()=>{prune(Date.now());updateOutcomes().catch(e=>console.error(e));},5*60*1000);
setTimeout(()=>updateOutcomes().catch(e=>console.error(e)),60*1000);
