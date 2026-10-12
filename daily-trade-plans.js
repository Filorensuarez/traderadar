// Informational daily 3% target trade plans, not orders or guaranteed returns.
import {earlyPumpStatus} from "./early-pump-watch.js";
const plans=new Map();
const state={updatedAt:0,plans:[],history:[]};
const DAY=24*60*60*1000;
function round(v){return Number(v.toPrecision(8));}
export function dailyPlanStatus(){return {...state,plans:[...state.plans],history:[...state.history]};}
export async function updateDailyPlans(){
 const now=Date.now(),signals=earlyPumpStatus();
 const live=new Map((signals.rows||[]).map(x=>[x.symbol,x]));
 let tickers=new Map();
 try{const r=await fetch("https://data-api.binance.vision/api/v3/ticker/price",{signal:AbortSignal.timeout(12000)});if(r.ok)tickers=new Map((await r.json()).map(x=>[x.symbol,Number(x.price)]));}catch(e){/* Preserve plans when prices are unavailable. */}
 for(const [symbol,p] of plans){
  const x=live.get(symbol);
  // A disappearing momentum signal does not mean a fill or a sale.
  if(now-p.createdAt>DAY){p.status="SÜRESİ DOLDU";p.closedAt=now;}
  else {
   const price=tickers.get(symbol.replace("/",""));
   if(!Number.isFinite(price)||price<=0)continue;
   p.lastPrice=price;
   if(price>=p.target){p.status="HEDEF SEVİYE GÖRÜLDÜ";p.closedAt=now;}
   else if(price<=p.stop){p.status="ZARAR DURDURMA SEVİYESİ GÖRÜLDÜ";p.closedAt=now;}
   else if(p.status==="ALIŞ İÇİN BEKLİYOR"&&price>p.entry*1.012){p.status="ALIŞ FİYATI KAÇTI";p.closedAt=now;}
  }
  if(p.closedAt){plans.delete(symbol);state.history.unshift(p);}
 }
 state.history=state.history.slice(0,100);
 for(const x of signals.rows||[]){
  if(plans.has(x.symbol)||state.history.some(p=>p.symbol===x.symbol&&now-p.createdAt<DAY))continue;
  if(x.change5>8||x.volumeRatio<2.5||!Number.isFinite(x.price)||x.price<=0)continue;
  const entry=round(x.price),target=round(entry*1.03),stop=round(entry*0.985);
  plans.set(x.symbol,{symbol:x.symbol,exchange:x.exchange,entry,target,stop,createdAt:now,lastCandleTime:x.candleTime,lastPrice:x.price,
   status:"ALIŞ İÇİN BEKLİYOR",riskPct:1.5,targetPct:3,score:x.score,volumeRatio:x.volumeRatio});
 }
 state.plans=[...plans.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,30);
 state.updatedAt=now;
 return dailyPlanStatus();
}
export function startDailyPlans(){setInterval(()=>updateDailyPlans().catch(console.error),60000);updateDailyPlans().catch(console.error);}
