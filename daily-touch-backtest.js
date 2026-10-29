// Offline, reproducible walk-forward evaluation of the 10/30 contact rule.
// Usage: node daily-touch-backtest.js candles.json
// JSON input: [{time,open,high,low,close,quoteVolume,takerBuyQuote}, ...]
import fs from "node:fs";
import {dailyContact} from "./daily-touch-model.js";
const file=process.argv[2];
if(!file){console.error("Usage: node daily-touch-backtest.js candles.json");process.exitCode=1;}
else{
 const candles=JSON.parse(fs.readFileSync(file,"utf8")).sort((a,b)=>a.time-b.time);
 if(!Array.isArray(candles)||candles.length<101)throw Error("At least 101 chronological 1m candles required");
 const signals=[];
 for(let i=100;i<candles.length-60;i++){
  const history=candles.slice(0,i+1),last=history.at(-1);
  const result=dailyContact(history,last.time+60000);
  if(!Number.isFinite(result.gainPct)||result.gainPct<2)continue;
  if(signals.length&&last.time-signals.at(-1).time<15*60000)continue;
  const future=candles.slice(i+1,i+61),entry=last.close;
  signals.push({time:last.time,entry,gainPct:Number(result.gainPct.toFixed(2)),
   after5mPct:Number(((future[4].close/entry-1)*100).toFixed(2)),
   after15mPct:Number(((future[14].close/entry-1)*100).toFixed(2)),
   after60mPct:Number(((future[59].close/entry-1)*100).toFixed(2)),
   maxGainPct:Number(((Math.max(...future.map(x=>x.high))/entry-1)*100).toFixed(2)),
   maxDrawdownPct:Number(((Math.min(...future.map(x=>x.low))/entry-1)*100).toFixed(2))});
 }
 console.log(JSON.stringify({sampleSize:signals.length,signals},null,2));
}
