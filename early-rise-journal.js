// Observed post-signal 15-minute mark-to-market statistics; not fills or profits.
// Persistent on the Railway volume. No account or trade-order access.
import {readFile,writeFile,rename,mkdir} from "node:fs/promises";
import {dirname} from "node:path";
const location=process.env.EARLY_RISE_JOURNAL||"/data/early-rise-signals-v1.json";
const horizon=15*60000,windowMs=72*3600000;
let entries=[],initialized=false,lastError=null,changed=false;
export async function loadEarlyRiseJournal(){
 if(initialized)return;
 initialized=true;
 try{
  const json=JSON.parse(await readFile(location,"utf8"));
  if(Array.isArray(json.entries))entries=json.entries.filter(x=>x&&typeof x.key==="string"&&x.at>0).slice(-5000);
 }catch(e){if(e.code!=="ENOENT")lastError="Eski ölçümler okunamadı: "+e.message;}
}
export function observeEarlyRiseTickers(exchange,tickers,timestamp){
 const map=new Map(tickers.map(x=>[x.symbol,x.price]));
 for(const x of entries){
  if(x.exchange!==exchange||x.resultPct!==null||timestamp-x.at<horizon)continue;
  const elapsed=timestamp-x.at;
  if(elapsed>horizon+8*60000)continue; // unavailable data is NOT a failed trade
  const current=map.get(x.rawSymbol);
  if(!(current>0))continue;
  x.resultPct=+((current/x.entry-1)*100).toFixed(3);
  x.evaluatedAt=timestamp;changed=true;
 }
}
export function rememberEarlyRiseSignals(rows,timestamp){
 for(const x of rows){
  if(!["KIRILIM TEYİDİ","KIRILIM YAKIN"].includes(x.stage))continue;
  if(!(x.ask>0)||!x.rawSymbol)continue;
  const key=x.exchange+":"+x.rawSymbol+":"+x.stage;
  if(entries.some(e=>e.key===key&&timestamp-e.at<45*60000))continue;
  entries.push({key,exchange:x.exchange,rawSymbol:x.rawSymbol,at:timestamp,
   stage:x.stage,entry:x.ask,resultPct:null,evaluatedAt:null});
  changed=true;
 }
 // Keep 72-hour results and one hour of margin for scheduled evaluation.
 const cutoff=timestamp-windowMs-3600000;
 const reduced=entries.filter(x=>x.at>=cutoff).slice(-5000);
 if(reduced.length!==entries.length){entries=reduced;changed=true;}
}
export function earlyRiseStats(timestamp=Date.now()){
 const recent=entries.filter(x=>x.at>=timestamp-windowMs&&x.at<=timestamp);
 const finished=recent.filter(x=>Number.isFinite(x.resultPct));
 const wins=finished.filter(x=>x.resultPct>=0.5);
 const avgReturnPct=finished.length?+(finished.reduce((a,x)=>a+x.resultPct,0)/finished.length).toFixed(3):null;
 const byStage={};
 for(const stage of ["KIRILIM TEYİDİ","KIRILIM YAKIN"]){
  const rows=finished.filter(x=>x.stage===stage);
  byStage[stage]={evaluated:rows.length,wins:rows.filter(x=>x.resultPct>=0.5).length,
   successPct:rows.length?+(rows.filter(x=>x.resultPct>=0.5).length/rows.length*100).toFixed(1):null};
 }
 return {windowHours:72,horizonMinutes:15,thresholdPct:0.5,recorded:recent.length,
  pending:recent.length-finished.length,evaluated:finished.length,wins:wins.length,
  successPct:finished.length?+(wins.length/finished.length*100).toFixed(1):null,
  avgReturnPct,sampleAdequate:finished.length>=30,byStage,
  note:"15 dakika sonraki gözlenen fiyatın giriş anındaki alış kotasyonuna göre en az %0,5 yüksek olması ölçülür. İşlem getirisi, gerçekleşmiş alım veya gelecek başarı olasılığı değildir.",
  storageWarning:lastError};
}
export async function saveEarlyRiseJournal(){
 if(!changed)return;
 try{
  await mkdir(dirname(location),{recursive:true});
  const temp=location+".tmp";
  await writeFile(temp,JSON.stringify({version:1,entries}),"utf8");
  await rename(temp,location);
  changed=false;lastError=null;
 }catch(e){lastError="Sinyal geçmişi kaydedilemedi: "+e.message;}
}
