import test from "node:test";
import assert from "node:assert/strict";
import {calculateMomentum30s,momentum30sThresholds} from "./momentum-30s-model.js";
import {readFileSync} from "node:fs";
const base=Date.UTC(2026,9,17,20,0,35);
function makeData(price=102.5,withVolume=false){
 const secStart=base-30000;
 const sec=Array.from({length:30},(_,i)=>({
   time:secStart+i*1000,close:price,...(withVolume?{quoteVolume:0}:{})
 }));
 const minStart=base-35*60000-35000; // adjusted below for minute alignment
 const minutes=Array.from({length:30},(_,i)=>({
   time:Date.UTC(2026,9,17,19,30+i,0),close:100,...(withVolume?{quoteVolume:0}:{})
 }));
 return {sec,minutes};
}
test("Hacim alanı yokken bile +%2,5 fiyat farkı teyit oluşturur",()=>{
 const {sec,minutes}=makeData();
 const result=calculateMomentum30s(sec,minutes,base);
 assert.equal(result.ok,true);
 assert.equal(result.confirmed,true);
 assert.equal(result.priceChangePct,2.5);
 assert.equal(result.reason.includes("Hacim"),false);
 assert.equal("volumeRatio" in result,false);
});
test("Sıfır hacimli mumlar fiyat teyidini engellemez",()=>{
 const {sec,minutes}=makeData(103,true);
 const result=calculateMomentum30s(sec,minutes,base);
 assert.equal(result.ok,true);
 assert.equal(result.confirmed,true);
});
test("Fiyat artışı %2 altındaysa onay verilmez",()=>{
 const {sec,minutes}=makeData(101.99);
 const result=calculateMomentum30s(sec,minutes,base);
 assert.equal(result.ok,true);
 assert.equal(result.confirmed,false);
});
test("Eksik veya gecikmiş gerçek mumlar hâlâ elenir",()=>{
 const {sec,minutes}=makeData();
 assert.equal(calculateMomentum30s(sec.slice(1),minutes,base).ok,false);
 assert.equal(calculateMomentum30s(sec,minutes.slice(1),base).ok,false);
 assert.equal(calculateMomentum30s(sec,minutes,base+10000).ok,false);
});
test("Eşik sadece fiyata ve mum tazeliğine bağlı",()=>{
 assert.equal(momentum30sThresholds.priceRisePct,2);
 assert.equal("volumeRatio" in momentum30sThresholds,false);
 assert.equal("minVolumeUSDT" in momentum30sThresholds,false);
 assert.equal("volumeAccelerating" in momentum30sThresholds,false);
});
test("Sunucu hacim ön filtresi uygulamaz ve UI eski hacim teyidini göstermez",()=>{
 const watch=readFileSync(new URL("./minute-momentum-watch.js",import.meta.url),"utf8");
 const ui=readFileSync(new URL("./minute-momentum-ui.js",import.meta.url),"utf8");
 assert.doesNotMatch(watch,/MIN_DAILY_USDT|x\.volume\s*>=/);
 assert.doesNotMatch(watch,/HACİMLİ YÜKSELİŞ TEYİDİ/);
 assert.doesNotMatch(ui,/volumeRatio|volumeAccelerating|HACİMLİ MOMENTUM/);
});
