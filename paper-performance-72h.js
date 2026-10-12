import fs from "node:fs";
import path from "node:path";

// A rolling 72-hour, paper-only observation ledger. Never interprets a quote as a fill.
const file=process.env.TRADE_STATS_FILE||path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH||"/tmp","traderadar-paper-results.json");
const WINDOW=72*3600000;
let records=[];
try{const parsed=JSON.parse(fs.readFileSync(file,"utf8"));if(Array.isArray(parsed))records=parsed;}catch{}
function persist(){try{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+".tmp";fs.writeFileSync(tmp,JSON.stringify(records));fs.renameSync(tmp,file);}catch(e){console.error("paper statistics not persisted:",e.message);}}
function prune(){const t=Date.now();records=records.filter(r=>r.detectedAt>=t-WINDOW&&String(r.symbol).endsWith("/USDT"));if(records.length>5000)records=records.slice(-5000);}
export function observePaperPlan(plan,price){
 if(!plan?.key||!Number.isFinite(price)||price<=0)return;
 prune();
 let r=records.find(x=>x.id===plan.key+":"+plan.createdAt);
 if(!r){r={id:plan.key+":"+plan.createdAt,symbol:plan.symbol,exchange:plan.exchange,detectedAt:plan.createdAt,entry:plan.entry,target:plan.target,stop:plan.stop,status:"BEKLE",enteredAt:null,closedAt:null};records.push(r);}
 if(r.closedAt)return;
 // Conservative proxy: first observed last-trade price within 0.3% of quoted entry.
 if(!r.enteredAt){
  if(Date.now()-r.detectedAt>24*3600000){r.status="GİRİŞ OLMADI";r.closedAt=Date.now();}
  else if(price>=r.entry*0.997&&price<=r.entry*1.003){r.enteredAt=Date.now();r.status="SANAL GİRİŞ";}
 }else if(price<=r.stop){r.status="STOP";r.closedAt=Date.now();}
 else if(price>=r.target){r.status="HEDEF";r.closedAt=Date.now();}
 else if(Date.now()-r.enteredAt>24*3600000){r.status="SÜRE DOLDU";r.closedAt=Date.now();}
 persist();
}
export function paperStats(){
 prune();
 const completed=records.filter(r=>r.status==="HEDEF"||r.status==="STOP");
 const wins=completed.filter(r=>r.status==="HEDEF").length;
 const losses=completed.filter(r=>r.status==="STOP").length;
 return {windowHours:72,startedAt:records.length?Math.min(...records.map(r=>r.detectedAt)):null,totalSignals:records.length,virtualEntries:records.filter(r=>r.enteredAt).length,completed:completed.length,wins,losses,winRatePct:completed.length?Number((wins/completed.length*100).toFixed(2)):null,pending:records.filter(r=>!r.closedAt).length,noEntry:records.filter(r=>r.status==="GİRİŞ OLMADI").length,unresolved:records.filter(r=>r.status==="SÜRE DOLDU").length,records:records.slice(-100).reverse(),method:"Yalnızca sinyal sonrasında gözlemlenen son işlem fiyatlarıyla sanal giriş ve hedef/stop ölçümü; emir gerçekleşmesi veya gerçek getiri değildir. Gözlemler arasındaki hareketler kaçabilir.",persistence:process.env.RAILWAY_VOLUME_MOUNT_PATH?"volume":"ephemeral"};
}
