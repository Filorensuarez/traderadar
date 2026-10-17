import test from "node:test";
import assert from "node:assert/strict";
import {fetchEarlyPumpChart} from "./early-pump-watch.js";
import {WEEK_MS} from "./weekly-ma200-model.js";
const end=(()=> {
 const d=new Date(),day=(d.getUTCDay()+6)%7;
 return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day);
})();
const weeks=Array.from({length:260},(_,i)=>({time:end-(260-i)*WEEK_MS,open:100,high:101,low:99,close:100,quoteVolume:1e6}));
async function runWithMock(exchange,market){
 const requested=[];
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  requested.push(String(url));
  let data;
  if(exchange==="BINANCE"){
   data=weeks.map(x=>[x.time,"100","101","99","100","10000",x.time+WEEK_MS-1,"1000000",0,0,0,0]);
  }else if(exchange==="OKX"){
   data={code:"0",data:weeks.map(x=>[x.time,"100","101","99","100","1000","1000","1000000","1"]).reverse()};
  }else if(exchange==="KUCOIN"){
   data={code:"200000",data:weeks.map(x=>[String(x.time/1000),"100","100","101","99","1000","1000000"]).reverse()};
  }else{
   data=weeks.map(x=>[String(x.time/1000),"1000000","100","101","99","100","1000"]).reverse();
  }
  return new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try{
  const chart=await fetchEarlyPumpChart(exchange,market);
  assert.equal(chart.weeks,260);
  assert.equal(chart.insufficient,false);
  assert.equal(chart.ma200.at(-1),100);
  assert.equal(chart.candles.length,chart.ma200.length);
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
