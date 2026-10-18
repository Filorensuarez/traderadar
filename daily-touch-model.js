/** Completed daily EMA7/25 contact after decline and before breakout. No volume gate. */
export const DAY_MS=86400000;
export const TOUCH_RULES=Object.freeze({minCandles:109,lookback:100,drawdownPct:10,ema99OverheadPct:1.5,maxEmaGapPct:3,maxPriceGapPct:3,max5DayRangePct:10,min3DayReturnPct:-5.5,max3DayReturnPct:4,maxDailyRisePct:3.5,minResistanceGapPct:1.4,touchTolerancePct:1.2});
export function closedDailyCandles(raw,now=Date.now()){
 const map=new Map();
 if(!Array.isArray(raw))return [];
 for(const item of raw){
  const c={time:+item.time,open:+item.open,high:+item.high,low:+item.low,close:+item.close,volume:+(item.volume??0)};
  if(!Object.values(c).every(Number.isFinite)||c.time<=0||c.time+DAY_MS>now||Math.min(c.open,c.high,c.low,c.close)<=0||c.volume<0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close))continue;
  map.set(c.time,c);
 }
 return [...map.values()].sort((a,b)=>a.time-b.time);
}
export function computeEMA(bars,period){
 const r=Array(bars.length).fill(null);let seed=0,ema=null;
 for(let i=0;i<bars.length;i++){
  if(i<period){seed+=bars[i].close;if(i===period-1){ema=seed/period;r[i]=ema;}}
  else{ema+=(2/(period+1))*(bars[i].close-ema);r[i]=ema;}
 }
 return r;
}
const round=(v)=>Number.isFinite(v)?Number(v.toPrecision(8)):null;
const percent=(a,b)=>b>0?(a/b-1)*100:null;
export function analyzeDailyTouch(raw,{now=Date.now()}={}){
 const candles=closedDailyCandles(raw,now),n=candles.length,i=n-1;
 const ema={ema7:computeEMA(candles,7),ema25:computeEMA(candles,25),ema99:computeEMA(candles,99)};
 const invalid=reason=>({matched:false,status:"YETERSİZ VERİ",reason,candles,ema,metrics:null,at:candles.at(-1)?.time??null});
 if(n<TOUCH_RULES.minCandles)return invalid("109 kapanmış günlük mum gerekli");
 for(let j=i-107;j<=i;j++)if(candles[j].time-candles[j-1].time!==DAY_MS)return invalid("Günlük mum geçmişinde boşluk var");
 const last=candles[i],a=ema.ema7[i],b=ema.ema25[i],long=ema.ema99[i];
 const high100=Math.max(...candles.slice(i-TOUCH_RULES.lookback,i).map(x=>x.high));
 const localHigh=Math.max(...candles.slice(i-10,i).map(x=>x.high));
 const five=candles.slice(i-4,i+1),hi=Math.max(...five.map(x=>x.high)),lo=Math.min(...five.map(x=>x.low));
 let touchAt=null,touchIndex=-1;
 for(let j=i;j>=i-2;j--){
  const mid=ema.ema25[j],fast=ema.ema7[j],bar=candles[j],tol=TOUCH_RULES.touchTolerancePct/100;
  if(bar.low<=Math.max(mid,fast)*(1+tol)&&bar.high>=Math.min(mid,fast)*(1-tol)){touchAt=bar.time;touchIndex=j;break;}
 }
 const metrics={
  price:round(last.close),ema7:round(a),ema25:round(b),ema99:round(long),
  drawdownPct:round((1-last.close/high100)*100),
  ema99OverheadPct:round(percent(long,last.close)),emaGapPct:round(Math.abs(percent(a,b))),
  priceToEma25Pct:round(percent(last.close,b)),
  fiveDayRangePct:round((hi/lo-1)*100),threeDayReturnPct:round(percent(last.close,candles[i-3].close)),
  dailyReturnPct:round(percent(last.close,last.open)),
  resistanceGapPct:round((localHigh/last.close-1)*100),
  touchAt,daysSinceTouch:touchIndex<0?null:i-touchIndex,high100:round(high100),resistance:round(localHigh)
 };
 const t=TOUCH_RULES;
 const rules={
  downtrend:metrics.drawdownPct>=t.drawdownPct&&metrics.ema99OverheadPct>=t.ema99OverheadPct,
  tightEMA:metrics.emaGapPct<=t.maxEmaGapPct,
  recentTouch:touchAt!==null,
  nearEMA25:Math.abs(metrics.priceToEma25Pct)<=t.maxPriceGapPct,
  consolidation:metrics.fiveDayRangePct<=t.max5DayRangePct&&
   metrics.threeDayReturnPct<=t.max3DayReturnPct&&metrics.threeDayReturnPct>=t.min3DayReturnPct,
  noBreakout:metrics.resistanceGapPct>=t.minResistanceGapPct&&metrics.dailyReturnPct<=t.maxDailyRisePct&&last.close<=b*1.03
 };
 const matched=Object.values(rules).every(Boolean);
 return {matched,status:matched?"TEMAS VAR · YÜKSELİŞ BEKLENİYOR":"UYGUN DEĞİL",
  reason:matched?"EMA7/25 temas etti; düşüş sonrası yataylaşma var, kırılım henüz yok":
   Object.entries(rules).filter(([,value])=>!value).map(([name])=>name).join(", "),
  metrics,rules,at:last.time,candles,ema};
}
