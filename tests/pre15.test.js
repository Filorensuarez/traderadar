import assert from "node:assert/strict";
import {analyzePre15,inspectPreEvent} from "../pre15-engine.js";
import {parseGateCandles} from "../pre15-scanner.js";
const now=Date.now(),end=Math.floor(now/60000)*60000;
const bars=Array.from({length:90},(_,i)=>{
 const p=1+i*0.000001;
 return {time:end-(90-i)*60000,open:p,high:p+0.0004,low:p-0.0004,
  close:p+0.0001,volume:1000};
});
const a=analyzePre15(bars,{now});
assert.notEqual(a.status,"VERİ YETERSİZ");
assert.ok(a.score>=0&&a.score<=100);
assert.equal(a.predictionMinutes,null);
const future=bars.map(x=>({...x}));
future.push({time:end,open:1,high:3,low:1,close:3,volume:100000});
assert.deepEqual(analyzePre15(future,{now}),a,"Unfinished/future bar must not change signal");
assert.equal(analyzePre15(bars.slice(0,10),{now}).status,"VERİ YETERSİZ");
assert.equal(analyzePre15(bars,{now:now+600000}).status,"VERİ YETERSİZ");
const gate=parseGateCandles([[String(Math.floor(end/1000)-60),"250","1.1","1.2","1","1.05","230"]]);
assert.equal(gate.length,1);
assert.equal(gate[0].volume,250);
const hist=inspectPreEvent(bars,end);
assert.ok(hist.score>=0);
console.log("Pre15 smoke tests passed");
