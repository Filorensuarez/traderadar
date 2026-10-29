// Fetch real historical Binance Spot 1-minute candles for offline testing.
// Usage: node daily-touch-fetch-history.js PARTITRY 2026-10-01 2026-10-28
import fs from "node:fs";
const [symbol,start,end]=process.argv.slice(2);
if(!/^[A-Z0-9]{4,20}$/.test(symbol||"")||!/^\d{4}-\d\d-\d\d$/.test(start||"")||!/^\d{4}-\d\d-\d\d$/.test(end||""))throw Error("Usage: node daily-touch-fetch-history.js PARTITRY YYYY-MM-DD YYYY-MM-DD");
let cursor=Date.parse(start+"T00:00:00Z"),until=Date.parse(end+"T00:00:00Z");
if(!(cursor<until)||until-cursor>90*86400000)throw Error("Date range must be 1 to 90 days");
const out=[];
while(cursor<until){
 const url=new URL("https://data-api.binance.vision/api/v3/klines");
 url.searchParams.set("symbol",symbol);url.searchParams.set("interval","1m");url.searchParams.set("startTime",cursor);url.searchParams.set("endTime",until-1);url.searchParams.set("limit","1000");
 const res=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error("Binance HTTP "+res.status+": "+(await res.text()).slice(0,180));
 const rows=await res.json();if(!Array.isArray(rows)||!rows.length)break;
 for(const x of rows)out.push({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5],quoteVolume:+x[7],takerBuyQuote:+x[10]});
 cursor=+rows.at(-1)[0]+60000;
 if(rows.length<1000)break;
 await new Promise(r=>setTimeout(r,250));
}
if(!out.length)throw Error("No historical candles returned; verify symbol and dates");
const file=symbol+"-"+start+"-"+end+".json";
fs.writeFileSync(file,JSON.stringify(out));
console.log(JSON.stringify({file,symbol,count:out.length,from:new Date(out[0].time).toISOString(),to:new Date(out.at(-1).time).toISOString()}));
