import test from "node:test";
import assert from "node:assert/strict";
import {WEEK_MS,weeklyMA200,analyzeWeeklyMA200,closedWeeklyCandles} from "./weekly-ma200-model.js";
const end=Date.UTC(2026,9,12);
function candles(prices,volumes=prices.map(()=>1000000)) {
  return prices.map((p,i)=>{
    const prev=i?prices[i-1]:p;
    return {time:end-(prices.length-i)*WEEK_MS,open:prev,high:Math.max(prev,p)*1.012,low:Math.min(prev,p)*.987,close:p,quoteVolume:volumes[i]};
  });
}
test("200 hafta dolmadan MA200 veya BUY/SELL işareti oluşturmaz",()=>{
 const x=candles(Array.from({length:199},(_,i)=>50+i*.05));
 const v=analyzeWeeklyMA200(x,{now:end});
 assert.equal(v.insufficient,true);assert.equal(v.sma200,null);assert.equal(v.markers.length,0);
});
test("SMA200 son 200 kapanışı kullanır",()=>{
 const raw=candles(Array.from({length:230},(_,i)=>i+1));
 const ma=weeklyMA200(raw);
 assert.equal(ma[198],null);
 assert.equal(ma[199],100.5);
 assert.equal(ma[229],130.5);
});
test("henüz kapanmamış haftalık mum asla işlem sinyali olamaz",()=>{
 const prices=Array.from({length:240},()=>100);
 const base=candles(prices);
 const opened={time:end-WEEK_MS+1,open:100,high:250,low:5,close:250,quoteVolume:1e9};
 const a=analyzeWeeklyMA200(base,{now:end});
 const b=analyzeWeeklyMA200([...base,opened],{now:end});
 assert.deepEqual(b.markers,a.markers);assert.equal(b.weeks,a.weeks);
});
test("tarih sırası ve tekrarlanan mumlar güvenli şekilde normalize edilir",()=>{
 const x=candles(Array.from({length:220},()=>100));
 const shuffled=[...x.reverse(),x[0]];
 assert.equal(closedWeeklyCandles(shuffled,end).length,220);
});
test("geçmişteki işaretler gelecek haftaların fiyatını bilmeden hesaplanır",()=>{
 const raw=candles(Array.from({length:225},(_,i)=>i<215?100:(i<221?95:115)));
 const a=analyzeWeeklyMA200(raw,{now:end});
 const extra=candles([...raw.map(z=>z.close),300,300,300]);
 const b=analyzeWeeklyMA200(extra,{now:end+3*WEEK_MS});
 const aTags=a.markers.map(x=>x.kind+":"+x.index);
 const bTags=b.markers.filter(x=>x.index<raw.length).map(x=>x.kind+":"+x.index);
 assert.deepEqual(aTags,bTags);
});
test("grafik ve radar aynı kapalı mumlara ait tek bir değerlendirme kullanır",()=>{
 const x=candles(Array.from({length:260},(_,i)=>98+Math.sin(i/9)*3));
 const r=analyzeWeeklyMA200(x,{now:end});
 assert.equal(r.ma200.length,r.candles.length);
 assert(r.markers.every(m=>m.index<r.candles.length));
 assert(r.markers.every(m=>["BUY","SELL"].includes(m.kind)));
});
