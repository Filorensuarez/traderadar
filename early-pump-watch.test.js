import test from "node:test";
import assert from "node:assert/strict";
import {fetchEarlyPumpChart} from "./early-pump-watch.js";
import {WEEK_MS} from "./weekly-ma200-model.js";
const end=(()=> {
 const d=new Date(),day=(d.getUTCDay()+6)%7;
 return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day);
})();
const weeks=Array.from({length:260},(_,i)=>({time:end-(260-i)*WEEK_MS,open:100,high:101,low:99,close:100,quoteVolume:1e6}));
async function runWithMock(exchange,market,totalWeeks=260){
 const requested=[];
 const fixture=weeks.slice(-totalWeeks);
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  requested.push(String(url));
  let data;
  if(exchange==="BINANCE"){
   data=fixture.map(x=>[x.time,"100","101","99","100","10000",x.time+WEEK_MS-1,"1000000",0,0,0,0]);
  }else if(exchange==="OKX"){
   data={code:"0",data:fixture.map(x=>[x.time,"100","101","99","100","1000","1000","1000000","1"]).reverse()};
  }else if(exchange==="KUCOIN"){
   data={code:"200000",data:fixture.map(x=>[String(x.time/1000),"100","100","101","99","1000","1000000"]).reverse()};
  }else{
   data=fixture.map(x=>[String(x.time/1000),"1000000","100","101","99","100","1000"]).reverse();
  }
  return new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try{
  const chart=await fetchEarlyPumpChart(exchange,market);
  assert.equal(chart.weeks,totalWeeks);
  assert.equal(chart.insufficient,false);
  assert.equal(chart.referencePeriod,totalWeeks>=206?200:totalWeeks>=56?50:20);
  assert.equal(chart.referenceMA,100);
  assert.equal(chart.sma200,totalWeeks>=200?100:null);
  assert.equal(chart.candles.length,chart.ma.length);
  assert(chart.markers.every(m=>m.confirmedAt<=Date.now()));
  assert(chart.candles.every(c=>c.time+WEEK_MS<=Date.now()));
  return {chart,url:requested.at(-1)};
 }finally{globalThis.fetch=original;}
}
test("Binance spot BTCUSDT haftalık grafiği",async()=>{
 const x=await runWithMock("BINANCE","BTCUSDT");
 assert(x.url.includes("symbol=BTCUSDT"));
 assert(x.url.includes("interval=1w"));
 assert.equal(x.chart.timeframe,"1W");
});
test("OKX paritesi BTC-USDT ve 1Wutc",async()=>{
 const x=await runWithMock("OKX","BTCUSDT");
 assert(x.url.includes("instId=BTC-USDT"));
 assert(x.url.includes("bar=1Wutc"));
});
test("KuCoin paritesi BTC-USDT ve 1week",async()=>{
 const x=await runWithMock("KUCOIN","BTCUSDT");
 assert(x.url.includes("symbol=BTC-USDT"));
 assert(x.url.includes("type=1week"));
});
test("Gate.io paritesi BTC_USDT ve 7 günlük periyot",async()=>{
 const x=await runWithMock("GATE.IO","BTCUSDT");
 assert(x.url.includes("currency_pair=BTC_USDT"));
 assert(x.url.includes("interval=7d"));
 assert.equal(x.chart.timeframe,"7D");
});
test("Geçersiz borsa ve sembole ağ isteği çıkmaz",async()=>{
 await assert.rejects(fetchEarlyPumpChart("OTHER","BTC"),{httpCode:400});
 await assert.rejects(fetchEarlyPumpChart("OKX","https://private.example"),{httpCode:400});
});

test("EIGEN gibi yeni 100 haftalık coin MA50 grafiğine sahiptir",async()=>{
 const x=await runWithMock("BINANCE","EIGENUSDT",100);
 assert.equal(x.chart.referencePeriod,50);
 assert.equal(x.chart.ma.at(-1),100);
 assert.equal(x.chart.ma[49],100);
 assert.equal(x.chart.ma[48],null);
 assert.equal(x.chart.sma200,null);
 assert.equal(x.chart.ma200.every(v=>v===null),true);
 assert.equal(x.chart.symbol,"EIGEN/USDT");
});
test("OKX EIGEN grafiğinde sembol doğru gösterilir",async()=>{
 const x=await runWithMock("OKX","EIGENUSDT",90);
 assert.equal(x.chart.symbol,"EIGEN/USDT");
 assert.equal(x.chart.referencePeriod,50);
});
