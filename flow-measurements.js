import fs from "node:fs";
const PATH=process.env.FLOW_MEASURE_PATH||"/data/flow-measurements.json";
let records=[];
try{records=JSON.parse(fs.readFileSync(PATH,"utf8"));if(!Array.isArray(records))records=[];}catch{}
let lastSave=0;
const horizons=[5,15,60];
function persist(){
 try{fs.mkdirSync("/data",{recursive:true});fs.writeFileSync(PATH,JSON.stringify(records.slice(-15000)));}catch(e){console.error("Flow measurement save:",e.message);}
}
export function recordFlowObservations(rows,now=Date.now()){
 const quotes=new Map(rows.filter(r=>Number(r.lastPrice)>0).map(r=>[r.exchange+"|"+r.symbol,Number(r.lastPrice)]));
 for(const r of rows){
  if(!r.fastBuyAlert||!(Number(r.lastPrice)>0))continue;
  const key=r.exchange+"|"+r.symbol;
  if(records.some(x=>x.key===key&&now-x.time<60*60*1000))continue;
  records.push({key,symbol:r.symbol,exchange:r.exchange,time:now,entry:Number(r.lastPrice),
   buySpeed10s:r.buySpeed10s,buySharePercent:r.buySharePercent,results:{}});
 }
 for(const rec of records){
  const current=quotes.get(rec.key);
  if(!current)continue;
  for(const m of horizons){
   if(rec.results[m]!==undefined||now-rec.time<m*60000)continue;
   // A missing quote at target time is not a valid return. Strict 60-second tolerance.
   if(now-rec.time>m*60000+60000){rec.results[m]=null;continue;}
   rec.results[m]=Number(((current/rec.entry-1)*100).toFixed(3));
  }
 }
 records=records.filter(x=>now-x.time<=36*60*60*1000);
 if(now-lastSave>60000){persist();lastSave=now;}
}
export function flowMeasurementStats(now=Date.now()){
 const recent=records.filter(x=>now-x.time<=36*60*60*1000);
 const summary={};
 for(const m of horizons){
  const evaluated=recent.filter(x=>typeof x.results[m]==="number");
  const wins=evaluated.filter(x=>x.results[m]>=.5);
  summary[m]={evaluated:evaluated.length,successful:wins.length,
   successPercent:evaluated.length?Number((wins.length/evaluated.length*100).toFixed(1)):null,
   averageReturnPercent:evaluated.length?Number((evaluated.reduce((a,x)=>a+x.results[m],0)/evaluated.length).toFixed(3)):null,
   pending:recent.filter(x=>x.results[m]===undefined).length,
   unavailable:recent.filter(x=>x.results[m]===null).length};
 }
 return {periodHours:36,signals:recent.length,horizons:summary,
  methodology:"At least +0.5% at the 5/15/60 minute observation. Not a trading profit or prospective prediction guarantee."};
}
