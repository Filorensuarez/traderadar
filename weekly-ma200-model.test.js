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
test("199 haftalık coin MA50 kullanır ve MA200 uydurmaz",()=>{
 const x=candles(Array.from({length:199},(_,i)=>50+i*.05));
 const v=analyzeWeeklyMA200(x,{now:end});
 assert.equal(v.insufficient,false);assert.equal(v.referencePeriod,50);assert.equal(v.sma200,null);assert(v.referenceMA>0);assert.equal(v.markers.length,0);
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

test("teyitli SMA200 geri kazanımında BUY işareti yalnızca kapalı haftada oluşur",()=>{
 const prices=[...Array(237).fill(100),...Array(8).fill(94),94,94,99,103,108];
 const signal=analyzeWeeklyMA200(candles(prices),{now:end});
 assert.equal(signal.status,"BUY");
 assert.equal(signal.markers.at(-1).kind,"BUY");
 assert(signal.markers.at(-1).confirmedAt<=end);
 assert(signal.lastClosedPrice>signal.sma200);
});
test("SMA200 altı haftalık teyit bozulmasında SELL risk işareti oluşur",()=>{
 const prices=[...Array(235).fill(100),...Array(10).fill(110),111,111,104,96,92];
 const signal=analyzeWeeklyMA200(candles(prices),{now:end});
 assert.equal(signal.status,"SELL");
 assert.equal(signal.markers.at(-1).kind,"SELL");
 assert(signal.markers.at(-1).confirmedAt<=end);
 assert(signal.lastClosedPrice<signal.sma200);
});
test("güncel kapanmamış haftanın sert düşüşü mevcut BUY işaretini SELL yapamaz",()=>{
 const prices=[...Array(237).fill(100),...Array(8).fill(94),94,94,99,103,108];
 const original=candles(prices);
 const fake={time:end,open:108,high:109,low:1,close:1,quoteVolume:99999999};
 const without=analyzeWeeklyMA200(original,{now:end});
 const withOpen=analyzeWeeklyMA200([...original,fake],{now:end});
 assert.equal(without.status,"BUY");
 assert.equal(withOpen.status,"BUY");
 assert.deepEqual(withOpen.markers,without.markers);
});
test("500 haftalık OHLCV uzun seride SMA200 hesaplaması stabil",()=>{
 const prices=Array.from({length:500},(_,i)=>100+30*Math.sin(i/16)+i*.55);
 const report=analyzeWeeklyMA200(candles(prices),{now:end});
 assert.equal(report.weeks,500);
 assert.equal(report.ma200.length,500);
 assert(Number.isFinite(report.sma200));
});

test("80 haftalık yeni coin MA50 dönüşünü BUY olarak gösterebilir",()=>{
 const prices=[...Array(67).fill(100),...Array(8).fill(80),80,80,88,102,105];
 const v=analyzeWeeklyMA200(candles(prices),{now:end});
 assert.equal(v.referencePeriod,50);
 assert.equal(v.sma200,null);
 assert.equal(v.status,"BUY");
 assert.equal(v.markers.at(-1).kind,"BUY");
 assert.equal(v.markers.at(-1).period,50);
 assert.equal(v.ma.length,prices.length);
});
test("80 haftalık MA50 altına kırılma SELL olarak gösterilebilir",()=>{
 const prices=[...Array(67).fill(100),...Array(8).fill(115),115,115,112,96,92];
 const v=analyzeWeeklyMA200(candles(prices),{now:end});
 assert.equal(v.referencePeriod,50);
 assert.equal(v.status,"SELL");
 assert.equal(v.markers.at(-1).kind,"SELL");
 assert.equal(v.markers.at(-1).period,50);
});
test("24 haftadan az geçmişte sinyal yok, 49 haftada MA20 devrede",()=>{
 const v=analyzeWeeklyMA200(candles(Array(24).fill(100)),{now:end});
 assert.equal(v.referencePeriod,null);assert.equal(v.insufficient,true);assert.equal(v.markers.length,0);
 const x=analyzeWeeklyMA200(candles(Array(49).fill(100)),{now:end});
 assert.equal(x.referencePeriod,20);assert.equal(x.referenceMA,100);assert.equal(x.sma200,null);
});
test("henüz kapanmamış düşüş mumları MA50 BUY'ı tersine çeviremez",()=>{
 const prices=[...Array(67).fill(100),...Array(8).fill(80),80,80,88,102,105];
 const base=candles(prices),fake={time:end,open:105,high:106,low:1,close:1,quoteVolume:9999999};
 const a=analyzeWeeklyMA200(base,{now:end}),b=analyzeWeeklyMA200([...base,fake],{now:end});
 assert.equal(a.status,"BUY");assert.deepEqual(a.markers,b.markers);
});
