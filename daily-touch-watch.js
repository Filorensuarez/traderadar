import {dailyContact} from "./daily-touch-model.js";
import {eligibleDailyTouchMarkets} from "./daily-touch-markets.js";
const BASE="https://data-api.binance.vision",REPEAT_MS=30*60*1000;
const MIN_REQUEST_GAP=420;
const state={
  running:false,status:"idle",startedAt:0,updatedAt:0,checked:0,eligible:0,
  failed:0,remaining:0,rows:[],error:null,waitUntil:0,
  notice:"Binance üzerinde işlem gören bütün uygun USDT ve TRY spot pariteleri taranır. Coin sayısı ve işlem hacmi sınırı yoktur. API 429/418 sınırında tarama aynı coinden devam etmek üzere bekler. Yalnızca kapanmış günlük EMA7/25 teması ve yükseliş başlamamış koşulları aranır."
};
let stopRequested=false;
const snooze=async(ms)=>{let remaining=ms;while(remaining>0&&!stopRequested){
 const step=Math.min(1000,remaining);await new Promise(done=>setTimeout(done,step));remaining-=step;
}};
export const dailyTouchStatus=()=>({...state,rows:[...state.rows]});
export function stopDailyTouch(){
 stopRequested=true;
 if(state.running)state.status="stopping";
 return dailyTouchStatus();
}
async function json(url,{retries=2}={}){
 let attempts=0;
 for(;;){
  if(stopRequested)throw Object.assign(Error("Tarama kullanıcı tarafından durduruldu"),{cancelled:true});
  let response;
  try{response=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{Accept:"application/json"}});}
  catch(e){
   if(attempts++>=retries)throw e;
   await snooze(Math.min(16000,2000*2**attempts));continue;
  }
  if(response.status===429||response.status===418){
   attempts++;
   const specified=Number(response.headers.get("retry-after"));
   const wait=(Number.isFinite(specified)&&specified>0?Math.min(specified*1000,15*60*1000):
     Math.min(15*60*1000,180000*Math.max(1,Math.ceil(attempts/3))));
   state.waitUntil=Date.now()+wait;state.status="rate-limited";
   if(attempts===1)console.warn("Temas Araması: Binance API sınırı; "+Math.round(wait/1000)+" sn bekleniyor");
   await snooze(wait);
   state.waitUntil=0;state.status="running";
   continue; // retry SAME symbol: do not skip or claim it was checked
  }
  if(!response.ok){
   if(response.status>=500&&attempts++<retries){await snooze(2000*attempts);continue;}
   throw Error("Binance HTTP "+response.status);
  }
  return response.json();
 }
}
function publish(matches){
 state.rows=[...matches].sort((a,b)=>a.gapPct-b.gapPct||a.market.localeCompare(b.market));
}
export async function scanDailyTouch(){
 if(state.running)return dailyTouchStatus();
 stopRequested=false;
 Object.assign(state,{running:true,status:"running",startedAt:Date.now(),checked:0,
   failed:0,eligible:0,remaining:0,error:null,waitUntil:0,rows:[]});
 const matches=[];
 try{
  const ticker=await json(BASE+"/api/v3/ticker/24hr");
  let info=null;
  try{info=await json(BASE+"/api/v3/exchangeInfo");}
  catch(e){if(e.cancelled)throw e;console.warn("Temas Araması: spot market kataloğu alınamadı; ticker listesi kullanılıyor:",e.message);}
  const all=eligibleDailyTouchMarkets(ticker,info);
  state.eligible=all.length;state.remaining=all.length;
  // No slice, max-count, daily-volume threshold, or rotation: every active spot pair.
  for(const market of all){
   if(stopRequested)break;
   try{
    const raw=await json(BASE+"/api/v3/klines?symbol="+encodeURIComponent(market.symbol)+"&interval=1d&limit=140");
    if(!Array.isArray(raw))throw Error("Günlük OHLC verisi geçersiz");
    const candles=raw.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4]}));
    const result=dailyContact(candles);
    if(result.match){
      const gapPct=Math.abs(result.ema7/result.ema25-1)*100;
      matches.push({...result,exchange:"BINANCE",market:market.symbol,
        symbol:market.symbol.replace(/(USDT|TRY)$/,"/$1"),gapPct});
      publish(matches); // show results immediately, no need to wait until last symbol
    }
   }catch(e){
    if(e.cancelled)break;
    state.failed++;
    state.error=String(e.message).slice(0,140);
   }
   state.checked++;
   state.remaining=all.length-state.checked;
   await snooze(MIN_REQUEST_GAP);
  }
  publish(matches);
  state.updatedAt=Date.now();
  state.status=stopRequested?"stopped":"completed";
  console.log("Temas Araması: "+state.checked+"/"+state.eligible+" incelendi; "+
    matches.length+" temas, "+state.failed+" veri hatası"+(stopRequested?" (durduruldu)":""));
 }catch(e){
  state.error=String(e.message).slice(0,140);
  state.status=e.cancelled||stopRequested?"stopped":"error";
  console.error("Temas Araması hatası:",state.error);
 }finally{
  state.running=false;state.waitUntil=0;
 }
 return dailyTouchStatus();
}
export function startDailyTouch(){
 scanDailyTouch().catch(e=>console.error("Temas ilk tarama:",e));
 setInterval(()=>{if(!state.running)scanDailyTouch().catch(e=>console.error("Temas tarama:",e));},REPEAT_MS);
}
