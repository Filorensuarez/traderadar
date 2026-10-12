import test from "node:test";
import assert from "node:assert/strict";
import {evaluateEarlyRise} from "./early-rise-model.js";

const minute=Date.UTC(2026,9,12,12,34,0),now=minute+28000;
const btc={return20Pct:-0.4};
const quote=(price=100.62)=>({price,ask:price+0.02,bid:price,volume24h:10000000});
function candles(liveVolume=9000){
 const a=[];
 for(let i=0;i<125;i++){
  const width=i<65?1.35:i<85?1:i<105?0.65:0.30;
  const price=100+(i%3-1)*0.07;
  a.push({time:minute-(125-i)*60000,open:price-0.02,
   high:price+width/2,low:price-width/2,close:price,
   quoteVolume:i<75?2600:i<105?1800:650});
 }
 a.push({time:minute,open:100,high:100.65,low:99.98,close:100.62,quoteVolume:liveVolume});
 return a;
}
test("Daralma ve hacim azalması erken izlemeye çıkar, teyit değildir",()=>{
 const r=evaluateEarlyRise(candles(),quote(100.14),btc,now);
 assert.equal(r?.stage,"KIRILIM YAKIN");
 assert.equal(r?.plan,null);
 assert.equal(r.contractions.length,3);
});
test("Canlı fiyat ve hacim sıçraması, istatistik ve risk ile teyitlenir",()=>{
 const r=evaluateEarlyRise(candles(),quote(),btc,now);
 assert.equal(r?.stage,"KIRILIM TEYİDİ");
 assert.equal(r.volumeConfirmed,true);
 assert.equal(r.anomalyConfirmed,true);
 assert(r.plan.rewardRisk>=1.5);
});
test("Hacim yoksa kesin teyit yok",()=>{
 const r=evaluateEarlyRise(candles(0),quote(),btc,now);
 assert.equal(r?.stage,"KIRILIM ADAYI");
});
test("Uzamış yükseliş geç kalındı ve plansız gösterilir",()=>{
 const a=candles();a.at(-1).high=104;a.at(-1).close=104;
 const r=evaluateEarlyRise(a,quote(104),btc,now);
 assert.equal(r?.stage,"GEÇ KALINDI");
 assert.equal(r?.plan,null);
 assert.equal(r?.potential,null);
});
test("Eksik kapanmış mum verisi reddedilir",()=>{
 const a=candles();a.splice(95,1);
 assert.equal(evaluateEarlyRise(a,quote(),btc,now),null);
});
test("Yaygın makas ve yetersiz likidite reddedilir",()=>{
 const a=candles();
 assert.equal(evaluateEarlyRise(a,{...quote(),bid:98},btc,now),null);
 assert.equal(evaluateEarlyRise(a,{...quote(),volume24h:999999},btc,now),null);
});
test("Yetersiz tarihsel mumda değer uydurulmaz",()=>{
 assert.equal(evaluateEarlyRise(candles().slice(-50),quote(),btc,now),null);
});
