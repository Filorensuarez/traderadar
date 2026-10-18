import test from "node:test";
import assert from "node:assert/strict";
import {DAY_MS,TOUCH_RULES,analyzeDailyTouch,closedDailyCandles} from "./daily-touch-model.js";
const now=Date.UTC(2026,9,18),baseline=[...Array.from({length:65},(_,i)=>125-i*.68),...Array(57).fill(81.5)];
const bars=prices=>prices.map((p,i)=>({time:now-(prices.length-i)*DAY_MS,open:p,high:p*1.015,low:p*.985,close:p,volume:0}));
test("Düşüş sonrası EMA teması, ralli henüz başlamadı",()=>{
 const result=analyzeDailyTouch(bars(baseline),{now});assert.equal(result.matched,true);
 assert.equal(result.status,"TEMAS VAR · YÜKSELİŞ BEKLENİYOR");assert(result.rules.noBreakout);
});
test("Hacim şartı yoktur",()=>{
 const result=analyzeDailyTouch(bars(baseline),{now});assert.equal(result.matched,true);
 assert.equal(Object.hasOwn(result.rules,"volume"),false);
});
test("Kapanmamış günlük yüksek mum etkilemez",()=>{
 const r=bars(baseline),fake={time:now,open:82,low:80,high:150,close:150,volume:100000000};
 assert.deepEqual(analyzeDailyTouch(r,{now}).metrics,analyzeDailyTouch([...r,fake],{now}).metrics);
});
test("Yükseliş başladığında temas listesine alınmaz",()=>{
 const arr=[...baseline.slice(0,-3),81.5,95,99];assert.equal(analyzeDailyTouch(bars(arr),{now}).matched,false);
});
test("Boşluklar ve 109'dan az mum engellenir",()=>{
 assert.equal(analyzeDailyTouch(bars(baseline.slice(-80)),{now}).matched,false);
 const g=bars(baseline);g.splice(85,1);assert.match(analyzeDailyTouch(g,{now}).reason,/boşluk/);
});
test("Gerçek EMA7/25/99 ve gecikmesiz hesaplama",()=>{
 const a=analyzeDailyTouch(bars(baseline),{now});
 assert.equal(a.ema.ema7.length,baseline.length);assert.equal(a.ema.ema99.length,baseline.length);
 assert.equal(TOUCH_RULES.minCandles,109);
});
test("Sırasız/tekrarlı/bozuk barlar temizlenir",()=>{
 const b=bars(baseline),clean=closedDailyCandles([...b].reverse().concat(b[2],{time:now+DAY_MS,open:1,low:1,high:1,close:1}));
 assert.equal(clean.length,b.length);assert.equal(clean[0].time,b[0].time);
});
