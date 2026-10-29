// Offline, reproducible walk-forward evaluation of the 10/30 contact rule.
// Usage: node daily-touch-backtest.js candles.json
// JSON input: [{time,open,high,low,close,quoteVolume,takerBuyQuote}, ...]
import fs from "node:fs";
import {dailyContact} from "./daily-touch-model.js";
import {chartContext} from "./daily-touch-chart.js";
const file=process.argv[2];
if(!file){console.error("Usage: node daily-touch-backtest.js candles.json");process.exitCode=1;}
else{
 const candles=JSON.parse(fs.readFileSync(file,"utf8")).sort((a,b)=>a.time-b.time);
 if(!Array.isArray(candles)||candles.length<101)throw Error("At least 101 chronological 1m candles required");
 const signals=[];
 for(let i=100;i<candles.length-60;i++){
  const history=candles.slice(0,i+1),last=history.at(-1);
  const result=dailyContact(history,last.time+60000);
  const chart=chartContext(history);
  if(!Number.isFinite(result.gainPct)||result.gainPct<2)continue;
  if(signals.length&&last.time-signals.at(-1).time<15*60000)continue;
  const future=candles.slice(i+1,i+61),entry=last.close;
  signals.push({time:last.time,entry,chartScore:chart.ready?chart.score:null,gainPct:Number(result.gainPct.toFixed(2)),
   after5mPct:Number(((future[4].close/entry-1)*100).toFixed(2)),
   after15mPct:Number(((future[14].close/entry-1)*100).toFixed(2)),
   after60mPct:Number(((future[59].close/entry-1)*100).toFixed(2)),
   maxGainPct:Number(((Math.max(...future.map(x=>x.high))/entry-1)*100).toFixed(2)),
   maxDrawdownPct:Number(((Math.min(...future.map(x=>x.low))/entry-1)*100).toFixed(2))});
 }
 const completed=signals.filter(x=>Number.isFinite(x.after60mPct));
 const metrics=rows=>({count:rows.length,positive60m:rows.filter(x=>x.after60mPct>0).length,positiveRatePct:rows.length?Number((rows.filter(x=>x.after60mPct>0).length*100/rows.length).toFixed(1)):null,avg60mPct:rows.length?Number((rows.reduce((s,x)=>s+x.after60mPct,0)/rows.length).toFixed(2)):null});
 console.log(JSON.stringify({sampleSize:signals.length,baseline:metrics(completed),byChartScore:[0,1,2,3,4,5,6,7].map(score=>({score,...metrics(completed.filter(x=>x.chartScore===score))})),note:"10/30 baseline only; not a reproduction of live multi-confirmation signals. No fees, slippage or execution latency included.",signals},null,2));
}
