import test from "node:test";
import assert from "node:assert/strict";
import {EMA_BREAKOUT_RULES,analyzeEmaSqueezeBreakout,calculateEma,completedMinuteBars} from "./momentum-ema-breakout-model.js";
const now=Date.UTC(2026,9,18,18,42,8),end=Math.floor(now/60000)*60000-60000;
function bars(closes){
 return closes.map((close,i)=>{
  const open=i?closes[i-1]:close;
  return {time:end-(closes.length-i-1)*60000,open,high:Math.max(close,open)*1.0003,
   low:Math.min(close,open)*.9997,close,quoteVolume:0};
 });
}
const flat=()=>Array(119).fill(100);
const base=()=>Array.from({length:18},(_,i)=>99.85+.1*Math.sin(i/3));
const up=()=>[...flat(),...base(),100.4,101.05,101.2,101.25];
test("130 gerçek kapanmış mum gerekir, 99 EMA geçmişi tahmin edilmez",()=>{
 const result=analyzeEmaSqueezeBreakout(bars(Array(129).fill(100)),now);
 assert.equal(result.ok,false);assert.equal(result.confirmed,false);
});
test("Sıkışma sonrası iki kapalı mumun yukarı kırılımı BUY teyidi üretir",()=>{
 const result=analyzeEmaSqueezeBreakout(bars(up()),now);
 assert.equal(result.ok,true);assert.equal(result.confirmed,true);
 assert.equal(result.signalType,"EMA_SQUEEZE_BREAKOUT");
 assert(result.ema7>result.ema25);assert(result.price>result.ema99);
 assert(result.squeezePct<EMA_BREAKOUT_RULES.maxSqueezePct);
 assert(result.breakoutLevel<result.price);
 assert(result.signalAt<=now);
});
test("İşlem hacmi sıfır veya eksik olsa da aynı fiyat sonucu alınır",()=>{
 const raw=bars(up());
 const first=analyzeEmaSqueezeBreakout(raw,now);
 const second=analyzeEmaSqueezeBreakout(raw.map(({quoteVolume,...c})=>c),now);
 assert.equal(first.confirmed,true);assert.equal(second.confirmed,true);
 assert.equal(first.breakoutLevel,second.breakoutLevel);
});
test("Yalnızca yükselen iğne, tek mum ve henüz kapanmamış mum BUY olamaz",()=>{
 const closes=[...flat(),...base(),100.4,101.05];
 const all=bars(closes);
 const first=analyzeEmaSqueezeBreakout(bars([...flat(),...base()]),now);
 assert.equal(first.confirmed,false);
 const partial={time:Math.floor(now/60000)*60000,open:101.05,close:108,high:109,low:100.8};
 const second=analyzeEmaSqueezeBreakout([...all,partial],now);
 const baseline=analyzeEmaSqueezeBreakout(all,now);
 assert.deepEqual(second,baseline);
});
test("Düşüş ve yatay fiyat koşullarında sinyal verilmez",()=>{
 for(const values of [[...flat(),...base(),99.2,98.5],Array(140).fill(100)]){
  const result=analyzeEmaSqueezeBreakout(bars(values),now);
  assert.equal(result.ok,true);assert.equal(result.confirmed,false);
 }
});
test("Güncel olmayan, sıra dışı veya eksik 1 dakikalık zamanlar sinyal üretemez",()=>{
 const good=bars(up());
 const missing=good.filter((_,i)=>i!==72);
 const result=analyzeEmaSqueezeBreakout(missing,now);
 assert.equal(result.confirmed,false);
 const late=analyzeEmaSqueezeBreakout(good,now+5*60000);
 assert.equal(late.confirmed,false);
 const shuffled=completedMinuteBars([...good].reverse(),now);
 assert.equal(shuffled.length,good.length);
 assert.equal(shuffled[0].time,good[0].time);
});
test("EMA99 ilk 98 kapanışta mevcut değildir",()=>{
 const result=calculateEma(Array(130).fill(100),99);
 assert(result.slice(0,98).every(x=>x===null));
 assert.equal(result[98],100);assert.equal(result[129],100);
});
test("Dört dakikayı geçmiş geçmiş kırılım yeni sinyal diye sunulmaz",()=>{
 const values=[...flat(),...base(),100.4,101.05,101.2,101.25,...Array(7).fill(101.25)];
 const result=analyzeEmaSqueezeBreakout(bars(values),now);
 assert.equal(result.confirmed,false);
});
