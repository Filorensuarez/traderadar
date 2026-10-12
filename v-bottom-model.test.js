import test from "node:test";
import assert from "node:assert/strict";
import {detectVBottomGeometry,evaluateVBottom} from "./v-bottom-model.js";

const now=Date.UTC(2026,9,12,18,46,15);
const frame=Math.floor(now/60000)*60000;
const ticker=(overrides={})=>({...{price:98.2,ask:98.22,bid:98.18,volume24h:8000000},...overrides});
function fixture(){
 const one=[];
 for(let i=0;i<95;i++){
  let p=101+0.15*Math.sin(i*0.6);
  if(i>=55&&i<85)p=101-(i-55)/29*6;
  if(i>=85)p=95+(i-85)/9*3.1;
  one.push({time:frame-(95-i)*60000,open:p-0.05,
   high:i===69?106:p+0.17,low:p-(i===85?0.38:0.17),close:p,
   quoteVolume:i>=86?12000:2000});
 }
 function frameBars(interval,n,priceAt,width){
  return Array.from({length:n},(_,i)=>{
   const p=priceAt(i);return {time:Math.floor(now/interval)*interval-(n-i)*interval,
    open:p-0.18,high:p+width,low:p-width,close:p,quoteVolume:i>n-4?50000:9000};
  });
 }
 const five=frameBars(300000,65,i=>i<59?101+0.45*Math.sin(i*0.5):
  [100.5,99,97,95,96.8,99.7][i-59],1.2);
 const fifteen=frameBars(900000,55,i=>i<50?101+0.8*Math.sin(i*0.22):
  [102,100.5,97.2,96.5,98][i-50],0.32);
 return {one,five,fifteen};
}
test("V dönüşü, hacim, RSI, EMA, VWAP, 5/15dk momentum ve risk hep birlikte geçerse tam teyit",()=>{
 const {one,five,fifteen}=fixture();
 const x=evaluateVBottom(one,five,fifteen,ticker(),now);
 assert.equal(x?.stage,"TAM TEKNİK TEYİT");
 assert.equal(x?.confirmed,true);
 assert.equal(x.checks.length,12);
 assert(x.checks.every(c=>c.ok));
 assert(x.riskReward>=1.6&&x.target>x.ask&&x.stop<x.ask);
});
test("Hacim artışı yoksa teyit gösterilmez",()=>{
 const f=fixture();
 for(const c of f.one.slice(-9))c.quoteVolume=600;
 const x=evaluateVBottom(f.one,f.five,f.fifteen,ticker(),now);
 assert.notEqual(x?.confirmed,true);
});
test("5 dakikalık veri gelmezse tam teyit yok",()=>{
 const f=fixture();const x=evaluateVBottom(f.one,[],f.fifteen,ticker(),now);
 assert.equal(x?.stage,"VERİ BEKLENİYOR");
 assert.equal(x?.confirmed,false);
});
test("15 dakikalık veri gelmezse tam teyit yok",()=>{
 const f=fixture();const x=evaluateVBottom(f.one,f.five,[],ticker(),now);
 assert.equal(x?.stage,"VERİ BEKLENİYOR");
});
test("Bir dakikalık kapanışta eksik mum geçersiz",()=>{
 const f=fixture();f.one.splice(-42,1);
 assert.equal(detectVBottomGeometry(f.one,ticker(),now),null);
});
test("Yüksek makas ve düşük 24 saat hacimde aday bile yok",()=>{
 const f=fixture();
 assert.equal(detectVBottomGeometry(f.one,ticker({bid:96}),now),null);
 assert.equal(detectVBottomGeometry(f.one,ticker({volume24h:990000}),now),null);
});
test("Anlık fiyatın son kapanıştan fazla ayrılması güvenli giriş sayılmaz",()=>{
 const f=fixture();assert.equal(detectVBottomGeometry(f.one,ticker({price:106,ask:106.1,bid:106}),now),null);
});
test("Son açık 1m mum gelecek bilgisi olarak kullanılmaz",()=>{
 const f=fixture();
 const good=evaluateVBottom(f.one,f.five,f.fifteen,ticker(),now);
 f.one.push({time:frame,open:1,high:999,low:0.1,close:1,quoteVolume:1e12});
 const after=evaluateVBottom(f.one,f.five,f.fifteen,ticker(),now);
 assert.equal(after.stage,good.stage);
 assert.deepEqual(after.checks,good.checks);
});
