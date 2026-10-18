/**
 * EMA7/25/99 squeeze -> breakout on COMPLETED one-minute OHLC candles.
 * No look-ahead, volume requirement, buy orders, or guarantee of profitability.
 */
export const EMA_BREAKOUT_RULES=Object.freeze({
 minimumCloses:130,lookbackBaseBars:18,
 maxSqueezePct:1.5,maxBaseRangePct:3.6,maxNegativeEma99SlopePct:0.65,
 minBreakoutPct:0.10,maxBreakoutPct:4.5,maxAgeMinutes:4
});
const round=(x,n=4)=>Number.isFinite(x)?Number(x.toFixed(n)):null;
export function completedMinuteBars(raw,now=Date.now()){
 if(!Array.isArray(raw))return [];
 const map=new Map();
 for(const item of raw){
  const time=Number(item.time),open=Number(item.open??item.close),high=Number(item.high??item.close),
   low=Number(item.low??item.close),close=Number(item.close);
  if(![time,open,high,low,close].every(Number.isFinite)||time<=0||time+60000>now||
     open<=0||low<=0||close<=0||high<Math.max(open,low,close)||low>Math.min(open,close))continue;
  map.set(time,{time,open,high,low,close});
 }
 return [...map.values()].sort((a,b)=>a.time-b.time);
}
export function calculateEma(closes,period){
 const output=Array(closes.length).fill(null);if(closes.length<period)return output;
 let sum=0;
 for(let i=0;i<period;i++)sum+=closes[i];
 let previous=sum/period;output[period-1]=previous;
 const factor=2/(period+1);
 for(let i=period;i<closes.length;i++){previous+=(closes[i]-previous)*factor;output[i]=previous;}
 return output;
}
export function analyzeEmaSqueezeBreakout(raw,now=Date.now()){
 const bars=completedMinuteBars(raw,now);
 const len=bars.length;
 const base={ok:false,confirmed:false,signalType:"EMA_SQUEEZE_BREAKOUT",bars:len};
 if(len<EMA_BREAKOUT_RULES.minimumCloses){
  return {...base,reason:"EMA99 ve sıkışma analizi için en az 130 kapanmış 1 dk mum gerekiyor"};
 }
 const latest=bars[len-1],ageMs=now-(latest.time+60000);
 if(ageMs>3*60000||ageMs<0)return {...base,reason:"1 dakikalık kapanış verisi güncel değil"};
 // Last 130 bars must be consecutive, not synthetic intervals interpolated over gaps.
 const current=bars.slice(-EMA_BREAKOUT_RULES.minimumCloses);
 for(let i=1;i<current.length;i++)if(current[i].time-current[i-1].time!==60000)
  return {...base,reason:"EMA veri serisinde eksik 1 dakikalık mum var"};
 const close=bars.map(b=>b.close),e7=calculateEma(close,7),e25=calculateEma(close,25),
  e99=calculateEma(close,99);
 let recent=null;
 // Evaluate up to 4 recent completed bars. Scans run every 120 sec and rotate markets.
 const earliest=Math.max(EMA_BREAKOUT_RULES.minimumCloses-1,len-EMA_BREAKOUT_RULES.maxAgeMinutes);
 for(let j=len-1;j>=earliest;j--){
  const before=j-2,baseStart=before-EMA_BREAKOUT_RULES.lookbackBaseBars;
  if(baseStart<99||!e99[j-8]||!e99[before]||!e25[before]||!e7[before])continue;
  const band=bars.slice(baseStart,before); // exclusively pre-breakout consolidation
  if(band.length!==EMA_BREAKOUT_RULES.lookbackBaseBars)continue;
  const highest=Math.max(...band.map(b=>b.high)),lowest=Math.min(...band.map(b=>b.low));
  const resistance=Math.max(...band.map(b=>b.close));
  const rangePct=(highest/lowest-1)*100;
  const squeezePct=(Math.max(e7[before],e25[before],e99[before])/
   Math.min(e7[before],e25[before],e99[before])-1)*100;
  const slopePct=(e99[j]/e99[j-8]-1)*100;
  const closePrev=bars[j-1].close,closeNow=bars[j].close;
  const breakoutPct=(closeNow/resistance-1)*100;
  const crossRecently=Array.from({length:7},(_,k)=>j-1-k)
   .some(k=>k>98&&e7[k]!==null&&e25[k]!==null&&e7[k]<=e25[k]*1.00025);
  const conditions=[
   rangePct<=EMA_BREAKOUT_RULES.maxBaseRangePct,
   squeezePct<=EMA_BREAKOUT_RULES.maxSqueezePct,
   slopePct>=-EMA_BREAKOUT_RULES.maxNegativeEma99SlopePct,
   closePrev>=resistance*1.001,closeNow>=resistance*1.0015,
   breakoutPct>=EMA_BREAKOUT_RULES.minBreakoutPct,
   breakoutPct<=EMA_BREAKOUT_RULES.maxBreakoutPct,
   closeNow>=closePrev*.993,
   closePrev>e99[j-1],closeNow>e99[j],
   e7[j]>e25[j]&&e7[j]>e99[j],
   crossRecently
  ];
  if(!conditions.every(Boolean))continue;
  const currentAbove=latest.close>e99[len-1]&&latest.close>e25[len-1]*.997;
  if(!currentAbove)continue;
  recent={
   confirmed:true,signalType:"EMA_SQUEEZE_BREAKOUT",
   reason:"EMA7/25/99 sıkışması sonrası iki kapanmış 1 dk mumla yukarı kırılım",
   signalAt:bars[j].time+60000,
   breakoutLevel:round(resistance,10),
   breakoutPct:round(breakoutPct,3),
   squeezePct:round(squeezePct,3),
   baseRangePct:round(rangePct,3),
   ema7:round(e7[len-1],10),ema25:round(e25[len-1],10),ema99:round(e99[len-1],10),
   price:round(latest.close,10),invalidation:round(lowest,10)
  };
  break;
 }
 if(recent)return {...base,ok:true,...recent,lastCandleAt:latest.time};
 return {...base,ok:true,reason:"EMA sıkışması, iki kapanış ve yukarı yön koşulları birlikte sağlanmadı",
  ema7:round(e7[len-1],10),ema25:round(e25[len-1],10),
  ema99:round(e99[len-1],10),price:round(latest.close,10),lastCandleAt:latest.time};
}
