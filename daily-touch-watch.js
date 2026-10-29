import {dailyContact} from "./daily-touch-model.js";
import {eligibleDailyTouchMarkets} from "./daily-touch-markets.js";
const BASE="https://data-api.binance.vision",REPEAT_MS=60*1000;
const CONFIRM={minVolumeRatio:1.7,minClosePosition:0.65,maxUpperWickRatio:0.4,minTakerBuyRatio:0.58,maxSpreadPct:0.35,minQuoteVolume24h:1000000,minFollowThroughPct:0.15,minConfirmationMs:30000,maxConfirmationMs:180000,maxChasePct:8};
const pending=new Map(),confirmed=new Map(),history=[];
const ema=(values,period)=>{const k=2/(period+1);return values.reduce((v,p,i)=>i?v+(p-v)*k:p,0)};
const average=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
function recordOutcomes(symbol,price,time){
 for(const item of history)if(item.market===symbol&&!item.complete){
  const elapsed=Date.now()-item.time;
  if(elapsed>=300000&&!item.after5m)item.after5mPct=Number(((price/item.entry-1)*100).toFixed(2)),item.after5m=true;
  if(elapsed>=900000&&!item.after15m)item.after15mPct=Number(((price/item.entry-1)*100).toFixed(2)),item.after15m=true;
  if(elapsed>=1800000&&!item.after30m)item.after30mPct=Number(((price/item.entry-1)*100).toFixed(2)),item.after30m=true;
  if(elapsed>=3600000&&!item.after60m)item.after60mPct=Number(((price/item.entry-1)*100).toFixed(2)),item.after60m=true,item.complete=true;
 }
}
export function dailyTouchPerformance(){return {sampleSize:history.length,completed:history.filter(x=>x.complete).length,rows:history.slice(-100)}}

let targetPct=2;
export function setDailyTouchThreshold(value){const n=Number(value);if(!Number.isFinite(n)||n<0.1||n>50)throw Error("Yükseliş oranı %0,1 ile %50 arasında olmalı");targetPct=n;state.thresholdPct=n;return n;}
const MIN_REQUEST_GAP=160;
const state={
  running:false,status:"idle",thresholdPct:2,startedAt:0,updatedAt:0,checked:0,eligible:0,
  failed:0,remaining:0,rows:[],error:null,waitUntil:0,
  notice:"Momentum, EMA20/50, direnç, hacim, taker alış oranı, spread ve ikinci zamanlı teyit gerekir. Sonuç istatistikleri sunucu yeniden başlarsa sıfırlanır; kesin yükseliş garantisi yoktur."
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
 state.rows=[...matches].sort((a,b)=>b.score-a.score||b.gainPct-a.gainPct||a.market.localeCompare(b.market));
}
export async function scanDailyTouch(){
 if(state.running)return dailyTouchStatus();
 stopRequested=false;
 Object.assign(state,{running:true,status:"running",startedAt:Date.now(),checked:0,
   failed:0,eligible:0,remaining:0,error:null,waitUntil:0,rows:[]});
 for(const [key,p] of pending)if(Date.now()-p.time>CONFIRM.maxConfirmationMs)pending.delete(key);
 for(const [key,p] of confirmed)if(Date.now()-p.time>15*60000)confirmed.delete(key);
 const matches=[];
 try{
  const ticker=await json(BASE+"/api/v3/ticker/24hr");
  let info=null;
  try{info=await json(BASE+"/api/v3/exchangeInfo");}
  catch(e){if(e.cancelled)throw e;console.warn("Temas Araması: spot market kataloğu alınamadı; ticker listesi kullanılıyor:",e.message);}
  const all=eligibleDailyTouchMarkets(ticker,info);
  const tickerBySymbol=new Map(ticker.map(t=>[t.symbol,t]));
  state.eligible=all.length;state.remaining=all.length;
  // No slice, max-count, daily-volume threshold, or rotation: every active spot pair.
  for(const market of all){
   if(stopRequested)break;
   try{
    const raw=await json(BASE+"/api/v3/klines?symbol="+encodeURIComponent(market.symbol)+"&interval=1m&limit=110");
    if(!Array.isArray(raw))throw Error("1 dakikalık OHLC verisi geçersiz");
    const candles=raw.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5],quoteVolume:+x[7],takerBuyQuote:+x[10]}));
    const result=dailyContact(candles);
    const closed=candles.filter(x=>x.time+60000<=Date.now()).sort((a,b)=>a.time-b.time);
    const last=closed.at(-1),prev=closed.at(-2);
    if(!last||!prev||!Number.isFinite(result.gainPct))continue;
    recordOutcomes(market.symbol,last.close,last.time);
    const base=closed.slice(-35,-5),recent=closed.slice(-5);
    const volumeRatio=average(recent.map(x=>x.quoteVolume))/Math.max(average(base.map(x=>x.quoteVolume)),1);
    const range=last.high-last.low,closePosition=range>0?(last.close-last.low)/range:0;
    const upperWickRatio=range>0?(last.high-Math.max(last.open,last.close))/range:1;
    const closes=closed.map(x=>x.close),ema20=ema(closes.slice(-65),20),ema50=ema(closes.slice(-90),50);
    const resistance=Math.max(...closed.slice(-22,-2).map(x=>x.high));
    const takerRatio=recent.reduce((s,x)=>s+x.takerBuyQuote,0)/Math.max(recent.reduce((s,x)=>s+x.quoteVolume,0),1);
    const t=tickerBySymbol.get(market.symbol)||{};
    const bid=Number(t.bidPrice),ask=Number(t.askPrice);
    const spreadPct=bid>0&&ask>=bid?(ask-bid)/ask*100:Infinity;
    const dayVolume=Number(t.quoteVolume);
    const chasePct=(last.close/Math.min(...closed.slice(-15).map(x=>x.low))-1)*100;
    const pass=result.gainPct>=targetPct&&closed.length>=90&&last.close>prev.close&&last.close>last.open&&
      volumeRatio>=CONFIRM.minVolumeRatio&&closePosition>=CONFIRM.minClosePosition&&
      upperWickRatio<=CONFIRM.maxUpperWickRatio&&last.close>ema20&&ema20>ema50&&
      last.close>resistance&&takerRatio>=CONFIRM.minTakerBuyRatio&&
      spreadPct<=CONFIRM.maxSpreadPct&&dayVolume>=CONFIRM.minQuoteVolume24h&&
      chasePct<=CONFIRM.maxChasePct;
    if(!pass){pending.delete(market.symbol);continue;}
    const now=Date.now(),first=pending.get(market.symbol);
    if(!first){pending.set(market.symbol,{time:now,price:last.close});continue;}
    if(now-first.time<CONFIRM.minConfirmationMs)continue;
    if(now-first.time>CONFIRM.maxConfirmationMs){pending.set(market.symbol,{time:now,price:last.close});continue;}
    const followThroughPct=(last.close/first.price-1)*100;
    if(followThroughPct<CONFIRM.minFollowThroughPct)continue;
    pending.delete(market.symbol);
    if(confirmed.has(market.symbol))continue;
    const score=Math.min(100,Math.round(50+Math.min(volumeRatio,4)*5+Math.min(takerRatio,0.9)*20+
      Math.min(followThroughPct,1)*10+Math.min(result.gainPct,6)));
    const hit={...result,exchange:"BINANCE",market:market.symbol,
      symbol:market.symbol.replace(/(USDT|TRY)$/,"/$1"),gapPct:result.gainPct,
      volumeRatio:Number(volumeRatio.toFixed(2)),takerBuyRatio:Number((takerRatio*100).toFixed(1)),
      spreadPct:Number(spreadPct.toFixed(3)),followThroughPct:Number(followThroughPct.toFixed(2)),
      ema20,ema50,resistance,score,confirmedAt:now,thresholdPct:targetPct};
    confirmed.set(market.symbol,{time:now,hit});
    history.push({market:market.symbol,entry:last.close,time:now,complete:false});
    if(history.length>500)history.shift();
    matches.push(hit);publish(matches);

   }catch(e){
    if(e.cancelled)break;
    state.failed++;
    state.error=String(e.message).slice(0,140);
   }
   state.checked++;
   state.remaining=all.length-state.checked;
   await snooze(MIN_REQUEST_GAP);
  }
  publish([...confirmed.values()].map(x=>x.hit));
  state.updatedAt=Date.now();
  state.status=stopRequested?"stopped":"completed";
  console.log("Temas Araması: "+state.checked+"/"+state.eligible+" incelendi; "+
    matches.length+" momentum sinyali, "+state.failed+" veri hatası"+(stopRequested?" (durduruldu)":""));
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
