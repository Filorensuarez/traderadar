import test from "node:test";
import assert from "node:assert/strict";
import {confirmedMomentumRows} from "./momentum-visibility.js";
import {readFileSync} from "node:fs";
const watch=readFileSync(new URL("./minute-momentum-watch.js",import.meta.url),"utf8");
const ui=readFileSync(new URL("./minute-momentum-ui.js",import.meta.url),"utf8");
test("yalnızca confirmed true olan sinyaller yayımlanır",()=>{
 const data=[
  {symbol:"AVA/USDT",confirmed:false,priceChangePct:1.077},
  {symbol:"ALT/USDT",confirmed:false,priceChangePct:.939},
  {symbol:"BTC/USDT",confirmed:true,priceChangePct:2.5},
  {symbol:"ADA/USDT",confirmed:1},
  {symbol:"ETH/USDT",confirmed:"true"},
  {symbol:"SOL/USDT"},
  null
 ];
 assert.deepEqual(confirmedMomentumRows(data).map(x=>x.symbol),["BTC/USDT"]);
 assert.deepEqual(confirmedMomentumRows(null),[]);
 assert.deepEqual(confirmedMomentumRows({rows:data}),[]);
});
test("sunucu aday listesini dışarı açmaz ve onaysız sinyalleri eler",()=>{
 assert.match(watch,/state\.rows=confirmedMomentumRows/);
 assert.match(watch,/rows:confirmedMomentumRows\(state\.rows\)/);
 assert.doesNotMatch(watch,/\bclosest\b|\bnearest\b|\bmaxChangePct\b/);
 assert.match(watch,/if\(result\.confirmed\)/);
});
test("arayüzde yalnızca teyitli coinler gösterilir",()=>{
 assert.match(ui,/const confirmed=confirmedMomentumRows\(d\.rows\)/);
 assert.match(ui,/for\(const x of confirmed\)/);
 assert.doesNotMatch(ui,/Eşiğe yaklaşanlar|d\.closest|TEYİT DEĞİL/);
});
