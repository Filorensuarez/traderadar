import {chartContext} from "./daily-touch-chart.js";
import fs from "node:fs";
import path from "node:path";
import {liveTouchSnapshot,setLiveTouchSymbols} from "./daily-touch-live.js";
import {dailyContact} from "./daily-touch-model.js";
import {eligibleDailyTouchMarkets} from "./daily-touch-markets.js";
const BASE="https://data-api.binance.vision",REPEAT_MS=60*1000;
// The provider is Binance Spot; other exchanges require separate market adapters.
const CONFIRM={minScore:85,minVolumeRatio:1.7,minClosePosition:0.65,maxUpperWickRatio:0.4,minTakerBuyRatio:0.58,maxSpreadPct:0.35,minQuoteVolume24h:1000000,minFollowThroughPct:0.15,minConfirmationMs:30000,maxConfirmationMs:180000,maxChasePct:8};
const pending=new Map(),confirmed=new Map(),history=[];
const earlyHistory=[];
const earlyCandidates=new Map();
const preparationCandidates=new Map();
const STORE=process.env.TOUCH_DATA_FILE||path.join(process.cwd(),"data","daily-touch-history.json");
let saveTimer=null;
function saveHistory(){
 if(saveTimer)return;
 saveTimer=setTimeout(()=>{saveTimer=null;writeHistory();},1000);
}
function writeHistory(){try{fs.mkdirSync(path.dirname(STORE),{recursive:true});const tmp=STORE+".tmp";fs.writeFileSync(tmp,JSON.stringify({history,earlyHistory}));fs.renameSync(tmp,STORE);}catch(e){console.warn("Temas kayıt:",e.message);}}
try{const data=JSON.parse(fs.readFileSync(STORE,"utf8"));history.push(...(data.history||[]).slice(-500));earlyHistory.push(...(data.earlyHistory||[]).slice(-500));}catch(e){if(e.code!=="ENOENT")console.warn("Temas geçmişi:",e.message);}
function weekly(rows){const start=Date.now()-7*86400000;const sample=rows.filter(x=>x.time>=start);const complete=sample.filter(x=>x.complete&&Number.isFinite(x.after60mPct));const wins=complete.filter(x=>x.after60mPct>0).length;return {sampleSize:sample.length,completed:complete.length,wins,winRatePct:complete.length?Number((100*wins/complete.length).toFixed(1)):null,avg60mPct:complete.length?Number((complete.reduce((a,x)=>a+x.after60mPct,0)/complete.length).toFixed(2)):null};}
const PREP_TTL=10*60000;
const ema=(values,period)=>{if(values.length<period)return NaN;const k=2/(period+1);let v=average(values.slice(0,period));for(const p of values.slice(period))v+=(p-v)*k;return v};
const average=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
function recordOutcomes(symbol,price,time,high=price,low=price){
 let changed=false;
 for(const item of earlyHistory)if(item.market===symbol&&!item.complete){
  const elapsed=time-item.candleTime;
  if(elapsed<=0)continue;
  changed=true;
  item.maxGainPct=Math.max(item.maxGainPct??-Infinity,(high/item.entry-1)*100);
  item.maxDrawdownPct=Math.min(item.maxDrawdownPct??Infinity,(low/item.entry-1)*100);
  for(const [minutes,key] of [[5,"after5mPct"],[15,"after15mPct"],[30,"after30mPct"],[60,"after60mPct"]]){
   if(elapsed>=minutes*60000&&item[key]===null)item[key]=Number(((price/item.entry-1)*100).toFixed(2));
  }
  if(item.after60mPct!==null)item.complete=true;
 }
 for(const item of history)if(item.market===symbol&&!item.complete){
  const elapsed=time-item.candleTime;
  if(elapsed<=0)continue;
  changed=true;
  item.maxGainPct=Math.max(item.maxGainPct??-Infinity,(high/item.entry-1)*100);
  item.maxDrawdownPct=Math.min(item.maxDrawdownPct??Infinity,(low/item.entry-1)*100);
  if(elapsed>=300000&&!item.after5m)item.after5mPct=Number(((price/item.entry-1)*100).toFixed(2)),item.after5m=true;
  if(elapsed>=900000&&!item.after15m)item.after15mPct=Number(((price/item.entry-1)*100).toFixed(2)),item.after15m=true;
  if(elapsed>=1800000&&!item.after30m)item.after30mPct=Number(((price/item.entry-1)*100).toFixed(2)),item.after30m=true;
  if(elapsed>=3600000&&!item.after60m)item.after60mPct=Number(((price/item.entry-1)*100).toFixed(2)),item.after60m=true,item.complete=true;
 }
 if(changed)saveHistory();
}
export function dailyTouchPerformance(){return {storage:{path:STORE,configured:!!process.env.TOUCH_DATA_FILE},weekly:{early:weekly(earlyHistory),confirmed:weekly(history)},sampleSize:history.length,completed:history.filter(x=>x.complete).length,rows:history.slice(-100),earlySampleSize:earlyHistory.length,earlyCompleted:earlyHistory.filter(x=>x.complete).length,earlyRows:earlyHistory.slice(-100)}}

let targetPct=2;
export function setDailyTouchThreshold(value){const n=Number(value);if(!Number.isFinite(n)||n<0.1||n>50)throw Error("Yükseliş oranı %0,1 ile %50 arasında olmalı");targetPct=n;state.thresholdPct=n;return n;}
const MIN_REQUEST_GAP=160,SCAN_WORKERS=3;
let nextRequestAt=0;
async function throttle(){const now=Date.now();const wait=Math.max(0,nextRequestAt-now);nextRequestAt=Math.max(now,nextRequestAt)+MIN_REQUEST_GAP;if(wait)await snooze(wait);}
const state={
  running:false,status:"idle",thresholdPct:2,startedAt:0,updatedAt:0,checked:0,eligible:0,
  failed:0,remaining:0,rows:[],earlyRows:[],preparationRows:[],error:null,waitUntil:0,
  notice:"Momentum, EMA20/50, direnç, hacim, taker alış oranı, spread ve ikinci zamanlı teyit gerekir. Sonuçlar TOUCH_DATA_FILE dosyasına yazılır; kalıcı disk yoksa yeniden dağıtımda silinebilir. Kesin yükseliş garantisi yoktur."
};
let stopRequested=false;
const snooze=async(ms)=>{let remaining=ms;while(remaining>0&&!stopRequested){
 const step=Math.min(1000,remaining);await new Promise(done=>setTimeout(done,step));remaining-=step;
}};
export const dailyTouchStatus=()=>({...state,rows:[...state.rows],live:liveTouchSnapshot()});
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
   failed:0,eligible:0,remaining:0,error:null,waitUntil:0,rows:[],earlyRows:[],preparationRows:[]});
 for(const [key,p] of pending)if(Date.now()-p.time>CONFIRM.maxConfirmationMs)pending.delete(key);
 for(const [key,p] of confirmed)if(Date.now()-p.time>15*60000)confirmed.delete(key);
 const matches=[];
 const earlyRows=[];
 const preparationRows=[];
 try{
  const ticker=await json(BASE+"/api/v3/ticker/24hr");
  let info=null;
  try{info=await json(BASE+"/api/v3/exchangeInfo");}
  catch(e){if(e.cancelled)throw e;console.warn("Temas Araması: spot market kataloğu alınamadı; ticker listesi kullanılıyor:",e.message);}
  const all=eligibleDailyTouchMarkets(ticker,info);
  const tickerBySymbol=new Map(ticker.map(t=>[t.symbol,t]));
  const books=await json(BASE+"/api/v3/ticker/bookTicker");
  const bookBySymbol=new Map(books.map(t=>[t.symbol,t]));
  state.eligible=all.length;state.remaining=all.length;
  // No slice, max-count, daily-volume threshold, or rotation: every active spot pair.
  // Prioritize recently prepared symbols; bound concurrency to limit API pressure.
  const ordered=[...all].sort((a,b)=>Number(preparationCandidates.has(b.symbol))-Number(preparationCandidates.has(a.symbol))||b.volume24h-a.volume24h);
  let cursor=0;
  async function worker(){
  while(cursor<ordered.length&&!stopRequested){
   const market=ordered[cursor++];
   try{
    await throttle();
    const raw=await json(BASE+"/api/v3/klines?symbol="+encodeURIComponent(market.symbol)+"&interval=1m&limit=200");
    if(!Array.isArray(raw))throw Error("1 dakikalık OHLC verisi geçersiz");
    const candles=raw.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5],quoteVolume:+x[7],takerBuyQuote:+x[10]}));
    const result=dailyContact(candles);
    const closed=candles.filter(x=>x.time+60000<=Date.now()).sort((a,b)=>a.time-b.time);
    const last=closed.at(-1),prev=closed.at(-2);
    const chart=chartContext(closed);
    if(last)recordOutcomes(market.symbol,last.close,last.time,last.high,last.low);
    if(!last||!prev||!Number.isFinite(result.gainPct))continue;
    const base=closed.slice(-35,-5),recent=closed.slice(-5);
    const volumeRatio=average(recent.map(x=>x.quoteVolume))/Math.max(average(base.map(x=>x.quoteVolume)),1);
    const range=last.high-last.low,closePosition=range>0?(last.close-last.low)/range:0;
    const upperWickRatio=range>0?(last.high-Math.max(last.open,last.close))/range:1;
    const closes=closed.map(x=>x.close),ema20=ema(closes.slice(-65),20),ema50=ema(closes.slice(-90),50);
    const ema7=ema(closes,7),ema25=ema(closes,25),ema99=ema(closes,99);
    const fiveRisePct=(last.close/closed.at(-6).close-1)*100;
    const recentLow=Math.min(...closed.slice(-30).map(x=>x.low));
    const recovered=last.close>recentLow*1.015&&last.close>prev.close;
    const emaTurning=ema7>ema25&&last.close>ema7&&ema7>ema(closes.slice(0,-3),7);
    const earlyTrend=emaTurning&&(ema25>ema99||last.close>ema99);
    // PREPARATION: identify compression before the existing +2% contact threshold.
    const prior20=closed.slice(-40,-20),recent20=closed.slice(-20);
    const priorWidth=(Math.max(...prior20.map(x=>x.high))-Math.min(...prior20.map(x=>x.low)))/Math.max(average(prior20.map(x=>x.close)),1e-12);
    const recentWidth=(Math.max(...recent20.map(x=>x.high))-Math.min(...recent20.map(x=>x.low)))/Math.max(average(recent20.map(x=>x.close)),1e-12);
    const priorVolume=average(prior20.map(x=>x.quoteVolume));
    const recentVolume=average(recent20.map(x=>x.quoteVolume));
    const compressed=priorWidth>0&&recentWidth<priorWidth*0.8&&recentVolume<priorVolume*0.85;
    const emaSlope=ema7/Math.max(ema(closes.slice(0,-3),7),1e-12)-1;
    const resistance=Math.max(...closed.slice(-22,-2).map(x=>x.high));
    const takerRatio=recent.reduce((s,x)=>s+x.takerBuyQuote,0)/Math.max(recent.reduce((s,x)=>s+x.quoteVolume,0),1);
    const t=tickerBySymbol.get(market.symbol)||{};
    const book=bookBySymbol.get(market.symbol)||{};
    const bid=Number(book.bidPrice),ask=Number(book.askPrice);
    const spreadPct=bid>0&&ask>=bid?(ask-bid)/ask*100:Infinity;
    const dayVolume=Number(t.quoteVolume);
    const chasePct=(last.close/Math.min(...closed.slice(-15).map(x=>x.low))-1)*100;
    const dailyRangePct=(Number(t.highPrice)/Math.max(Number(t.lowPrice),1e-12)-1)*100;
    const falseBreakout=last.close<resistance||upperWickRatio>0.45||takerRatio<0.53;
    const pass=!falseBreakout&&result.gainPct>=targetPct&&closed.length>=90&&last.close>prev.close&&last.close>last.open&&
      volumeRatio>=CONFIRM.minVolumeRatio&&closePosition>=CONFIRM.minClosePosition&&
      upperWickRatio<=CONFIRM.maxUpperWickRatio&&last.close>ema20&&ema20>ema50&&
      last.close>resistance&&takerRatio>=CONFIRM.minTakerBuyRatio&&
      spreadPct<=CONFIRM.maxSpreadPct&&dayVolume>=CONFIRM.minQuoteVolume24h&&
      chasePct<=CONFIRM.maxChasePct&&dailyRangePct>=5;
    // PARTI-style early recovery: independent watchlist, not a confirmed trade signal.
    // Require a valid 10/30 baseline and cap the 15-minute rise to avoid late chasing.
    const prepPass=closed.length>=110&&compressed&&emaSlope>0&&last.close>ema7&&
      result.gainPct<targetPct&&fiveRisePct<2.5&&fiveRisePct> -1&&
      spreadPct<=CONFIRM.maxSpreadPct&&dayVolume>=CONFIRM.minQuoteVolume24h;
    if(prepPass){
      const hit={exchange:"BINANCE",market:market.symbol,symbol:market.symbol.replace(/(USDT|TRY)$/,"/$1"),
        stage:"preparation",chart,close:last.close,day:last.time,score:Math.min(60,Math.round(25+Math.min(20,100*(1-recentWidth/priorWidth))+Math.min(15,100*(1-recentVolume/Math.max(priorVolume,1))))),
        gainPct:Number(result.gainPct.toFixed(2)),widthRatio:Number((recentWidth/priorWidth).toFixed(2)),
        volumeRatio:Number((recentVolume/Math.max(priorVolume,1)).toFixed(2))};
      preparationCandidates.set(market.symbol,{time:Date.now(),hit});
      state.preparationRows=[...preparationCandidates.values()].map(x=>x.hit).sort((a,b)=>b.score-a.score);
      setLiveTouchSymbols([...preparationCandidates.keys(),...earlyCandidates.keys()]);
    }
    const earlyPass=closed.length>=110&&result.gainPct>=targetPct&&
      earlyTrend&&recovered&&fiveRisePct>=0.5&&fiveRisePct<=7&&
      volumeRatio>=2&&takerRatio>=0.58&&
      spreadPct<=CONFIRM.maxSpreadPct&&dayVolume>=CONFIRM.minQuoteVolume24h&&
      chasePct<=8&&last.close>last.open;
    if(earlyPass){
      preparationCandidates.delete(market.symbol);
      state.preparationRows=state.preparationRows.filter(x=>x.market!==market.symbol);
      const early={...result,exchange:"BINANCE",market:market.symbol,
        symbol:market.symbol.replace(/(USDT|TRY)$/,"/$1"),stage:"early",chart,
        score:Math.min(84,Math.round(40+Math.min(volumeRatio,4)*7+Math.min(fiveRisePct,5)*3+Math.min(takerRatio,0.8)*20)),
        volumeRatio:Number(volumeRatio.toFixed(2)),takerBuyRatio:Number((takerRatio*100).toFixed(1)),
        spreadPct:Number(spreadPct.toFixed(3)),fiveRisePct:Number(fiveRisePct.toFixed(2)),
        ema7,ema25,ema99,dailyRangePct:Number(dailyRangePct.toFixed(2))};
      earlyRows.push(early);
      const existing=earlyCandidates.get(market.symbol);
      if(!existing||Date.now()-existing.time>15*60000){
       earlyCandidates.set(market.symbol,{time:Date.now(),hit:early});
       earlyHistory.push({market:market.symbol,entry:last.close,time:Date.now(),candleTime:last.time,complete:false,maxGainPct:0,maxDrawdownPct:0,after5mPct:null,after15mPct:null,after30mPct:null,after60mPct:null});
       if(earlyHistory.length>500)earlyHistory.shift();
       saveHistory();
      }
      state.earlyRows=[...earlyCandidates.values()].map(x=>x.hit).filter(x=>!confirmed.has(x.market)).sort((a,b)=>b.score-a.score);
    }
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
    if(score<CONFIRM.minScore)continue;
    const hit={...result,chart,exchange:"BINANCE",market:market.symbol,
      symbol:market.symbol.replace(/(USDT|TRY)$/,"/$1"),gapPct:result.gainPct,
      volumeRatio:Number(volumeRatio.toFixed(2)),takerBuyRatio:Number((takerRatio*100).toFixed(1)),
      spreadPct:Number(spreadPct.toFixed(3)),followThroughPct:Number(followThroughPct.toFixed(2)),
      ema20,ema50,resistance,score,confirmedAt:now,thresholdPct:targetPct,
      target5:Number((last.close*1.05).toPrecision(9)),target10:Number((last.close*1.10).toPrecision(9)),
      stopExample:Number((last.close*0.98).toPrecision(9)),dailyRangePct:Number(dailyRangePct.toFixed(2))};
    confirmed.set(market.symbol,{time:now,hit});
    preparationCandidates.delete(market.symbol);
    history.push({market:market.symbol,entry:last.close,time:now,candleTime:last.time,complete:false,maxGainPct:0,maxDrawdownPct:0});
    if(history.length>500)history.shift();
    saveHistory();
    matches.push(hit);publish(matches);
    state.earlyRows=state.earlyRows.filter(x=>x.market!==market.symbol);

   }catch(e){
    if(e.cancelled)break;
    state.failed++;
    state.error=String(e.message).slice(0,140);
   }finally{
    state.checked++;
    state.remaining=all.length-state.checked;
   }
  }
  }
  await Promise.all(Array.from({length:SCAN_WORKERS},()=>worker()));
  for(const [key,value] of preparationCandidates)if(Date.now()-value.time>PREP_TTL)preparationCandidates.delete(key);
  state.preparationRows=[...preparationCandidates.values()].map(x=>x.hit).filter(x=>!earlyCandidates.has(x.market)&&!confirmed.has(x.market)).sort((a,b)=>b.score-a.score);
  publish([...confirmed.values()].map(x=>({...x.hit,stage:"confirmed"})));
  for(const [key,value] of earlyCandidates)if(Date.now()-value.time>15*60000)earlyCandidates.delete(key);
  state.earlyRows=[...earlyCandidates.values()].map(x=>x.hit).filter(x=>!confirmed.has(x.market)).sort((a,b)=>b.score-a.score);
  setLiveTouchSymbols([...preparationCandidates.keys(),...earlyCandidates.keys()]);
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
