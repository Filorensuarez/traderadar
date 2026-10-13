import test from "node:test";
import assert from "node:assert/strict";
import {analyzeHourlyDualCross,HOUR} from "./ema-macd-crossover.js";
const now=Date.UTC(2026,9,13,18,34),start=Math.floor(now/HOUR)*HOUR;
function fixture(slope=.5,recover=8){
 const values=Array.from({length:180},(_,i)=>
   i<140?100+(140-i)*8/140:
   i<180-recover?100-(i-139)*.22:
   100-(180-recover-139)*.22+(i-(180-recover)+1)*slope);
 const candles=values.map((close,i)=>({time:start-(180-i)*HOUR,open:close,
   high:close*1.004,low:close*.996,close,quoteVolume:2300000}));
 const price=values.at(-1),quote={price,bid:price*.9998,ask:price*1.0004,volume24h:9e6};
 return {candles,quote};
}
test("Sadece EMA7/25 ve MACD DIF/DEA pozitif çift kesişimde sinyal",()=>{
 const {candles,quote}=fixture();
 const signal=analyzeHourlyDualCross(candles,quote,now);
 assert.equal(signal?.stage,"EMA + MACD YUKARI KESİŞİM");
 assert(signal.ema7>signal.ema25);
 assert(signal.macdDIF>signal.macdDEA);
 assert(signal.macdHistogram>0);
 assert(Math.abs(signal.emaCrossAt-signal.macdCrossAt)<=6*HOUR);
 assert(signal.barsSinceCross<=2);
});
test("Hiç kesişim olmadan listeleme yok",()=>{
 const {candles}=fixture();
 const flat=candles.map(x=>({...x,open:100,close:100,high:100.5,low:99.5}));
 assert.equal(analyzeHourlyDualCross(flat,{price:100,ask:100.01,bid:99.99,volume24h:9e6},now),null);
});
test("Eksik saatlik mumda sinyal uydurulmaz",()=>{
 const {candles,quote}=fixture();
 candles.splice(157,1);
 assert.equal(analyzeHourlyDualCross(candles,quote,now),null);
});
test("Az hacimli veya geniş makaslı spot piyasada sinyal olmaz",()=>{
 const {candles,quote}=fixture();
 assert.equal(analyzeHourlyDualCross(candles,{...quote,volume24h:999999},now),null);
 assert.equal(analyzeHourlyDualCross(candles,{...quote,bid:quote.ask*.98},now),null);
});
test("Son kapanan saatlik mum eksikse sinyal beklenir",()=>{
 const {candles,quote}=fixture();
 assert.equal(analyzeHourlyDualCross(candles,quote,now+HOUR),null);
});
test("Henüz kapanmayan mumdaki sahte kesişim dikkate alınmaz",()=>{
 const {candles,quote}=fixture();
 const expected=analyzeHourlyDualCross(candles,quote,now);
 const forged={time:start,open:110,high:500,low:1,close:400,quoteVolume:1e10};
 assert.deepEqual(analyzeHourlyDualCross([...candles,forged],quote,now),expected);
});
test("Kesişimden sonra fiyat EMA25 altına çökerse eski alım sinyali kalmaz",()=>{
 const {candles,quote}=fixture();
 const value=analyzeHourlyDualCross(candles,quote,now);
 const collapsed=value.ema25*.95;
 assert.equal(analyzeHourlyDualCross(candles,{
  ...quote,price:collapsed,bid:collapsed,ask:collapsed*1.0002
 },now),null);
});
