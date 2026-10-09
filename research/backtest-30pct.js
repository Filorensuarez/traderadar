/**
 * Offline event study, NOT a claim that 100 events have been studied.
 * Input JSON: [{exchange,symbol,candles:[{time,open,high,low,close,volume},...]}]
 * Run: node research/backtest-30pct.js history.json
 * Requires real 1-minute historical OHLCV spanning Sep 9-Oct 9, 2026.
 */
import fs from "node:fs";
import {detectMinutePatterns} from "../minute-patterns.js";
const path=process.argv[2];
if(!path){console.error("Usage: node research/backtest-30pct.js history.json");process.exit(1);}
const datasets=JSON.parse(fs.readFileSync(path,"utf8"));
const events=[],controls=[];
const monthStart=Date.UTC(2026,8,9),monthEnd=Date.UTC(2026,9,10);
for(const d of datasets){
  const candles=[...(d.candles||[])].sort((a,b)=>a.time-b.time);
  if(candles.length<100)continue;
  let lastEvent=-Infinity;
  for(let i=60;i<candles.length-60;i++){
    const t=Number(candles[i].time);
    if(t<monthStart||t>=monthEnd)continue;
    if(t-lastEvent<60*60*1000)continue;
    const baseline=Number(candles[i].close);
    const future=candles.slice(i+1,i+61);
    const maxHigh=Math.max(...future.map(c=>Number(c.high)));
    const gain=(maxHigh/baseline-1)*100;
    // Features are frozen five minutes BEFORE the future 60-minute window.
    const at=i-5;
    const snapshot=candles.slice(at-39,at+1);
    if(snapshot.length<30)continue;
    const result=detectMinutePatterns(snapshot,Number(candles[at].time)+60000);
    const entry={exchange:d.exchange,symbol:d.symbol,time:t,
      gainPercent:Number(gain.toFixed(2)),mode5minBefore:result.mode,
      patternScore:result.patternScore,patterns:result.patterns};
    if(gain>=30){events.push(entry);lastEvent=t;}
    else if(i%60===0)controls.push(entry);
  }
}
const sample=events.slice(0,100);
const hits=sample.filter(e=>e.mode5minBefore==="AL").length;
const falseAl=controls.filter(e=>e.mode5minBefore==="AL").length;
console.log(JSON.stringify({qualifyingEvents:events.length,analyzedEvents:sample.length,
  sampleTarget:100,complete:sample.length>=100,
  earlyAlRate:sample.length?hits/sample.length:null,
  controlFalseAlertRate:controls.length?falseAl/controls.length:null,
  caution:"Retrospective event labeling is NOT a prospective forecast; 1-minute data cannot guarantee five-minute advance notice.",
  events:sample},null,2));
