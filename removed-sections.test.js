import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const index=readFileSync(new URL("./index.html",import.meta.url),"utf8");
const server=readFileSync(new URL("./server.js",import.meta.url),"utf8");
const nav=readFileSync(new URL("./tab-navigation-fix.js",import.meta.url),"utf8");

test("Erken yükseliş, V dip ve USDT işlem planları artık görünmüyor",()=>{
  for(const view of ["earlypump","vbottom","dailyPlans"]){
    assert.doesNotMatch(index,new RegExp('<section id="'+view+'"'));
  }
  for(const button of ["earlyPumpButton","vBottomButton","dailyPlansButton"]){
    assert.doesNotMatch(index,new RegExp('id="'+button+'"'));
  }
  for(const js of ["early-pump-ui.js","early-pump-chart.js","v-bottom-ui.js","daily-trade-plans-ui.js"]){
    assert(!index.includes('src="./'+js));
  }
});
test("Kaldırılan taramalar çalışmıyor ve API uçları kapalı",()=>{
  for(const name of ["startEarlyPump","startVBottom","startTryPlans"]){
    assert(!server.includes(name));
  }
  for(const endpoint of ["/api/daily-plans","/api/early-pump","/api/v-bottom"]){
    assert(!server.includes(endpoint));
  }
});
test("Korunan modüller ve günlük açılış sekmesi çalışabilir",()=>{
  for(const id of ["daily","momentum","xmanager"]){
    assert(index.includes('id="'+id+'"'));
  }
  for(const id of ["dailyButton","momentumButton","xManagerButton"]){
    assert(index.includes('id="'+id+'"'));
  }
  assert(nav.includes('document.querySelector("#dailyButton")'));
  assert(!nav.includes('dailyPlansButton'));
});
