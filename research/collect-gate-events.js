/**
 * Gate.io historical research collector.
 * Uses PUBLIC spot candles; no orders, credentials, or fabricated events.
 * Usage: node research/collect-gate-events.js
 * MAX_SYMBOLS=250 EVENT_TARGET=100 node research/collect-gate-events.js
 */
import fs from "node:fs";
import {detectMinutePatterns} from "../minute-patterns.js";

const BASE="https://api.gateio.ws/api/v4";
const START=Date.UTC(2026,8,9), END=Date.UTC(2026,9,10);
const maxSymbols=Math.min(1000,Math.max(1,Number(process.env.MAX_SYMBOLS||250)));
const target=Math.min(100,Math.max(1,Number(process.env.EVENT_TARGET||100)));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const fetchJson=async (path)=>{
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(BASE+path,{signal:AbortSignal.timeout(18000)});
      if(response.status===429||response.status>=500){await delay(900*(attempt+1));continue;}
      if(!response.ok)throw Error("HTTP "+response.status);
      return await response.json();
    }catch(error){if(attempt===2)throw error;await delay(800*(attempt+1));}
  }
  throw Error("Retries exhausted");
};
const qs=params=>new URLSearchParams(params).toString();
function candle(x){
  // Gate spot candles: [unixSeconds,quoteVolume,close,high,low,open,...]
  if(!Array.isArray(x)||x.length<6)return null;
  const c={time:Number(x[0])*1000,volume:Number(x[1]),close:Number(x[2]),
    high:Number(x[3]),low:Number(x[4]),open:Number(x[5])};
  return Object.values(c).every(Number.isFinite)&&c.open>0&&c.low>0?c:null;
}
async function candles(pair,interval,from,to){
  const raw=await fetchJson("/spot/candlesticks?"+qs({
    currency_pair:pair,interval,from:Math.floor(from/1000),to:Math.floor(to/1000)
  }));
  if(!Array.isArray(raw))throw Error("Unexpected candles response");
  return raw.map(candle).filter(Boolean).sort((a,b)=>a.time-b.time);
}
const all=await fetchJson("/spot/tickers");
const pairs=all.filter(x=>String(x.currency_pair).endsWith("_USDT")&&
  !/(\d+[LS]|BULL|BEAR)_USDT$/.test(x.currency_pair)&&Number(x.quote_volume)>0)
  .sort((a,b)=>Number(b.quote_volume)-Number(a.quote_volume))
  .slice(0,maxSymbols).map(x=>x.currency_pair);
const events=[],controls=[],errors=[];
const seen=new Set();
let scannedPairs=0;
for(let index=0;index<pairs.length;index++){
  const pair=pairs[index];
  scannedPairs++;
  try{
    const hours=await candles(pair,"1h",START,END-3600000);
    // Non-event controls: sample an hour with no strong rise, using the
    // same five-minute lead and only information available before that hour.
    if(index%5===0){
      const quiet=hours.find(h=>h.time>=START+3600000&&h.time<END-3600000&&
        (h.high/h.open-1)*100<3&&(h.low/h.open-1)*100>-5);
      if(quiet){
        try{
          const minuteControl=await candles(pair,"1m",quiet.time-45*60000,quiet.time+65*60000);
          const pastControl=minuteControl.filter(x=>x.time<quiet.time-5*60000).slice(-40);
          const futureControl=minuteControl.filter(x=>x.time>=quiet.time&&x.time<quiet.time+60*60000);
          if(pastControl.length>=35&&futureControl.length>=50){
            const signal=detectMinutePatterns(pastControl,pastControl.at(-1).time+60000);
            const gain=(Math.max(...futureControl.map(x=>x.high))/futureControl[0].open-1)*100;
            controls.push({symbol:pair,mode:signal.mode,gainPercent:gain});
          }
        }catch(e){errors.push({pair,error:"Control: "+e.message});}
      }
    }
    for(const h of hours){
      if(h.time<START||h.time>=END)continue;
      // Coarse filter: the 1-hour high must exceed its opening by >=30%.
      if((h.high/h.open-1)*100<30)continue;
      const eventId=pair; // require distinct coins, not repeated events from one coin
      if(seen.has(eventId))continue;
      seen.add(eventId);
      const minute=await candles(pair,"1m",h.time-45*60000,h.time+65*60000);
      // Use last closed candle BEFORE event hour starts minus 5 minutes.
      const cutoff=h.time-5*60000;
      const past=minute.filter(x=>x.time<cutoff).slice(-40);
      const hour=minute.filter(x=>x.time>=h.time&&x.time<h.time+60*60000);
      if(past.length<35||hour.length<50)continue;
      const open=hour[0].open,peak=Math.max(...hour.map(x=>x.high));
      const gain=(peak/open-1)*100;
      if(gain<30)continue;
      const pattern=detectMinutePatterns(past,past.at(-1).time+60000);
      events.push({exchange:"GATE.IO",symbol:pair.replace("_","/"),start:h.time,
        gainPercent:Number(gain.toFixed(3)),leadMinutes:5,
        mode:pattern.mode,patternScore:pattern.patternScore,
        patterns:pattern.patterns,warning:pattern.warnings});
      if(events.length>=target)break;
    }
  }catch(e){errors.push({pair,error:e.message});}
  if((index+1)%25===0)console.log("Checked",index+1,"pairs; events",events.length);
  if(events.length>=target)break;
  await delay(160);
}
// Controls are needed for false-positive estimates; never equate event-only recall to precision.
const report={generatedAt:new Date().toISOString(),exchange:"GATE.IO",
  from:new Date(START).toISOString(),to:new Date(END).toISOString(),
  scannedPairs,distinctCoins:events.length,
  eventCount:events.length,target,complete:events.length>=target,
  fiveMinuteEarlyAlCount:events.filter(e=>e.mode==="AL").length,
  controlCount:controls.length,
  controlAlCount:controls.filter(x=>x.mode==="AL").length,
  controlFalseAlarmRate:controls.length?controls.filter(x=>x.mode==="AL").length/controls.length:null,
  warning:"Control sample is sparse and not randomly representative; results are exploratory, not verified precision or future probability.",
  errors:errors.slice(0,50),events};
fs.mkdirSync("research/results",{recursive:true});
fs.writeFileSync("research/results/gate-events.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({eventCount:report.eventCount,target,errors:errors.length,complete:report.complete}));
