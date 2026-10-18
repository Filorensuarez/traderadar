import test from "node:test";
import assert from "node:assert/strict";
import {eligibleDailyTouchMarkets} from "./daily-touch-markets.js";
import {readFileSync} from "node:fs";
const synthetic=Array.from({length:1400},(_,i)=>({symbol:"COIN"+i+"USDT",lastPrice:"1",quoteVolume:String(i%9?i:0)}));
const info={symbols:synthetic.map(x=>({symbol:x.symbol,status:"TRADING",quoteAsset:"USDT",isSpotTradingAllowed:true}))};
test("1400 uygun spot paritenin tamamı, hacimsizler dahil tarama listesinde",()=>{
 const list=eligibleDailyTouchMarkets(synthetic,info);
 assert.equal(list.length,1400);
 assert.equal(new Set(list.map(x=>x.symbol)).size,1400);
 assert(list.some(x=>x.volume24h===0));
});
test("TRY piyasaları da dahil ve katalogda işlem yapılmayanlar hariç",()=>{
 const rows=[...synthetic,{symbol:"NXPCUSDT",lastPrice:"8",quoteVolume:"5"},
   {symbol:"NXPCTRY",lastPrice:"8",quoteVolume:"0"},
   {symbol:"DEADUSDT",lastPrice:"1",quoteVolume:"1"}];
 const catalog={symbols:[...info.symbols,
   {symbol:"NXPCUSDT",status:"TRADING",quoteAsset:"USDT"},
   {symbol:"NXPCTRY",status:"TRADING",quoteAsset:"TRY"},
   {symbol:"DEADUSDT",status:"BREAK",quoteAsset:"USDT"}]};
 const list=eligibleDailyTouchMarkets(rows,catalog);
 assert.equal(list.length,1402);
 assert(!list.some(x=>x.symbol==="DEADUSDT"));
 assert(list.some(x=>x.symbol==="NXPCTRY"));
});
test("Tekrarlı veya geçersiz ticker satırları elenir; fallback tüm geçerlileri korur",()=>{
 const a=eligibleDailyTouchMarkets([...synthetic,synthetic[0],{symbol:"XYZUSDT",lastPrice:"0"}]);
 assert.equal(a.length,1400);
});
test("Server tüm coinleri tarar; slice, üst limit ve rotasyon kullanılmaz",()=>{
 const code=readFileSync(new URL("./daily-touch-watch.js",import.meta.url),"utf8");
 assert.match(code,/for\(const market of all\)/);
 assert.doesNotMatch(code,/\\.slice\\(0,\\d+\\)|MAX=|LIMIT=|rotation|offset/);
 assert.match(code,/state\\.checked\\+\\+/);
 assert.match(code,/response\\.status===429/);
});
