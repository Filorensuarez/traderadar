import test from "node:test";
import assert from "node:assert/strict";
import {
 MOMENTUM_SCAN_INTERVAL_MS,MOMENTUM_SCAN_TARGETS,
 MOMENTUM_MIN_REQUEST_SPACING_MS,MOMENTUM_RATE_LIMIT_COOLDOWN_MS,chooseMomentumMarkets
} from "./momentum-scan-config.js";
import {readFileSync} from "node:fs";
const market=(i)=>({symbol:"COIN"+i+"USDT",volume:50000-i,dayChange:i%2?i/100:NaN});
const fixture=Array.from({length:240},(_,i)=>market(i));
test("Kapsam: Binance 200 ve OKX 16 olmak üzere 216 borsa/parite eşleşmesi",()=>{
 assert.equal(MOMENTUM_SCAN_TARGETS.BINANCE,200);
 assert.equal(MOMENTUM_SCAN_TARGETS.OKX,16);
 assert.equal(MOMENTUM_SCAN_INTERVAL_MS,120000);
 const binance=chooseMomentumMarkets("BINANCE",fixture);
 const okx=chooseMomentumMarkets("OKX",fixture);
 assert.equal(binance.selected.length,200);
 assert.equal(okx.selected.length,16);
 assert.equal(new Set(binance.selected.map(x=>x.symbol)).size,200);
 assert.equal(new Set(okx.selected.map(x=>x.symbol)).size,16);
});
test("Dönüşümlü tarama aynı ilk 200 coinle sınırlı kalmaz",()=>{
 const a=chooseMomentumMarkets("BINANCE",fixture);
 const b=chooseMomentumMarkets("BINANCE",fixture,a.nextOffset);
 assert(a.selected.some(x=>x.symbol==="COIN0USDT"));
 assert(b.selected.some(x=>!a.selected.some(y=>y.symbol===x.symbol)));
 const o=chooseMomentumMarkets("OKX",fixture);
 const p=chooseMomentumMarkets("OKX",fixture,o.nextOffset);
 assert(p.selected.some(x=>!o.selected.some(y=>y.symbol===x.symbol)));
});
test("Hedef, uygun coin sayısını aşmaz, tekrarlı coinleri elemez",()=>{
 const small=[...fixture.slice(0,5),fixture[0],fixture[1]];
 for(const name of ["BINANCE","OKX"]){
  const x=chooseMomentumMarkets(name,small);
  assert.equal(x.selected.length,5);
  assert.equal(new Set(x.selected.map(z=>z.symbol)).size,5);
 }
 assert.equal(chooseMomentumMarkets("OTHER",fixture).selected.length,0);
});
test("OKX istek aralığı korundu; fiyatın %2 teyidi değişmedi",()=>{
 assert(MOMENTUM_MIN_REQUEST_SPACING_MS.OKX>=2600);
 assert(MOMENTUM_RATE_LIMIT_COOLDOWN_MS.OKX>=180000);
 assert(MOMENTUM_MIN_REQUEST_SPACING_MS.BINANCE>=180);
 const src=readFileSync(new URL("./minute-momentum-watch.js",import.meta.url),"utf8");
 assert.match(src,/chooseMomentumMarkets/);
 assert.match(src,/const minutes=await getMinutes/);
 assert.match(src,/const seconds=await getSeconds/);
 assert(src.indexOf("const minutes=await getMinutes")<src.indexOf("const seconds=await getSeconds"));
 assert.match(src,/if\(result\.confirmed\)/);
 assert.doesNotMatch(src,/MIN_DAILY_USDT/);
});
