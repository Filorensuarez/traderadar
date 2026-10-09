import assert from "node:assert/strict";
import {detectPrePumpSetup} from "../pre-pump-setup.js";
const now=Date.now();
const rows=Array.from({length:40},(_,i)=>({
  time:Math.floor(now/60000)*60000-(39-i)*60000,
  open:1+i*.00001,close:1+i*.00001,high:1+i*.00001+.0003,
  low:1+i*.00001-.0003,volume:1000
}));
const current=detectPrePumpSetup(rows,now);
assert.ok(current.setupScore>=0&&current.setupScore<=100);
assert.equal(current.predictedMinutes,null);
assert.equal(detectPrePumpSetup(rows,now+600000).setup,"VERİ YETERSİZ");
assert.equal(detectPrePumpSetup([],now).setup,"VERİ YETERSİZ");
console.log("Pre-pump smoke tests passed");
