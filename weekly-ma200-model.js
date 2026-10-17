/**
 * Adaptive weekly SMA200/50/20 reversal model; public market OHLCV only.
 * All decisions are based exclusively on completed weekly candles.
 * Historical markers use strictly past/present candles (no future lookahead).
 * Not a trading instruction or prediction of profits.
 */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const MA_PERIOD = 200;
export const FALLBACK_MA_PERIOD = 50;
export const SHORT_MA_PERIOD = 20;
export const MIN_WEEKS = 26;
export function referencePeriodForWeeks(weeks) {
  if(weeks>=MA_PERIOD+6)return MA_PERIOD;
  if(weeks>=FALLBACK_MA_PERIOD+6)return FALLBACK_MA_PERIOD;
  if(weeks>=SHORT_MA_PERIOD+6)return SHORT_MA_PERIOD;
  return null;
}

export function closedWeeklyCandles(input, now = Date.now()) {
  if (!Array.isArray(input)) return [];
  const unique = new Map();
  for (const raw of input) {
    const c = {
      time: Number(raw.time), open: Number(raw.open), high: Number(raw.high),
      low: Number(raw.low), close: Number(raw.close), quoteVolume: Number(raw.quoteVolume)
    };
    if (![c.time,c.open,c.high,c.low,c.close,c.quoteVolume].every(Number.isFinite) ||
        c.time <= 0 || c.time + WEEK_MS > now || c.open <= 0 || c.low <= 0 ||
        c.close <= 0 || c.high < Math.max(c.open,c.close,c.low) ||
        c.low > Math.min(c.open,c.close) || c.quoteVolume < 0) continue;
    unique.set(c.time,c);
  }
  return [...unique.values()].sort((a,b)=>a.time-b.time);
}
export function weeklyMovingAverage(candles, period=MA_PERIOD) {
  const output = Array(candles.length).fill(null);
  let sum = 0;
  for (let i=0;i<candles.length;i++) {
    sum += candles[i].close;
    if (i>=period) sum -= candles[i-period].close;
    if (i>=period-1) output[i] = sum/period;
  }
  return output;
}
export function weeklyMA200(candles){return weeklyMovingAverage(candles, MA_PERIOD);}
function ema(values,period) {
  const out=Array(values.length).fill(null);let seed=0,count=0,last=null;
  for(let i=0;i<values.length;i++){
    if(!Number.isFinite(values[i]))continue;
    if(last===null){seed+=values[i];count++;if(count===period){last=seed/period;out[i]=last;}}
    else {last+=(2/(period+1))*(values[i]-last);out[i]=last;}
  }
  return out;
}
function rsi(closes,period=14){
  const out=Array(closes.length).fill(null);if(closes.length<=period)return out;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}
  gain/=period;loss/=period;
  const value=()=>loss===0?(gain===0?50:100):100-100/(1+gain/loss);
  out[period]=value();
  for(let i=period+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];gain=(gain*(period-1)+Math.max(0,d))/period;loss=(loss*(period-1)+Math.max(0,-d))/period;
    out[i]=value();
  }
  return out;
}
function weeklyFeatures(candles,period){
  const closes=candles.map(c=>c.close),sma=weeklyMovingAverage(candles,period);
  const fast=ema(closes,12),slow=ema(closes,26);
  const dif=fast.map((x,i)=>x!==null&&slow[i]!==null?x-slow[i]:null);
  const dea=ema(dif,9),hist=dif.map((x,i)=>x!==null&&dea[i]!==null?x-dea[i]:null);
  return {sma,rsi:rsi(closes),hist};
}
const isConsecutive=(candles,i,n)=> {
  if(i-n+1<0)return false;
  for(let k=i-n+2;k<=i;k++){
    if(Math.abs(candles[k].time-candles[k-1].time-WEEK_MS)>12*60*60*1000)return false;
  }
  return true;
};
function typeAt(c,f,i,period){
  if(i<period+5||!isConsecutive(c,i,period+6))return null;
  const ma=f.sma[i],prior=f.sma[i-1],r=f.rsi[i],rPrev=f.rsi[i-1],
    hist=f.hist[i],histPrev=f.hist[i-1],histBefore=f.hist[i-2];
  if(![ma,prior,r,rPrev,hist,histPrev,histBefore].every(Number.isFinite)||ma<=0||prior<=0)return null;
  const close=c[i].close, distance=close/ma-1;
  const prior8=c.slice(i-8,i),volAvg=prior8.reduce((total,v)=>total+v.quoteVolume,0)/prior8.length;
  const longTerm=period===MA_PERIOD;
  const nearTouch=Array.from({length:longTerm?6:12},(_,k)=>i-k)
    .some(j=>f.sma[j]>0&&c[j].low<=f.sma[j]*1.075&&c[j].high>=f.sma[j]*.87);
  const recentlyBelow=Array.from({length:longTerm?7:13},(_,k)=>i-2-k)
    .some(j=>j>=period-1&&f.sma[j]>0&&c[j].close<=f.sma[j]*1.006);
  const recentlyAbove=Array.from({length:longTerm?7:13},(_,k)=>i-2-k)
    .some(j=>j>=period-1&&f.sma[j]>0&&c[j].close>=f.sma[j]*.994);
  const trendOk=f.sma[i-4]>0&&ma>=f.sma[i-4]*(longTerm?.988:.87);
  const volumeOk=volAvg>0&&c[i].quoteVolume>=volAvg*(longTerm?.80:.60);
  // BUY requires two FINISHED weekly closes reclaiming the moving average plus momentum/volume.
  // The fallback MA50/20 is explicitly less conservative; chart labels show its period.
  const confirmedBuy=distance>=(longTerm?.009:.005)&&distance<=(longTerm?.20:.35)&&
    c[i-1].close>prior*(longTerm?1.004:1.002)&&
    recentlyBelow&&nearTouch&&trendOk&&
    r>=(longTerm?49:47)&&r>=rPrev&&
    hist>histBefore&&(longTerm?hist>=0:hist>=(close*-.008))&&
    volumeOk&&close>=c[i-1].close*(longTerm?.99:.955);
  if(confirmedBuy)return {kind:"BUY",period,reason:"MA"+period+" üzerinde iki kapalı hafta, RSI/MACD ve hacim teyidi"};
  // SELL means technical deterioration, not an automatic sell order.
  const confirmedSell=distance<=-(longTerm?.009:.005)&&
    c[i-1].close<prior*(longTerm?.996:.998)&&recentlyAbove&&
    (r<=(longTerm?49:52)||hist<0)&&hist<=histPrev&&volumeOk;
  if(confirmedSell)return {kind:"SELL",period,reason:"MA"+period+" altında iki kapalı hafta, zayıflayan momentum"};
  return null;
}
const round=(v,dec=6)=>Number.isFinite(v)?Number(v.toPrecision(dec)):null;
export function analyzeWeeklyMA200(input, opts={}) {
  const now=opts.now??Date.now();
  const c=closedWeeklyCandles(input,now);
  const period=referencePeriodForWeeks(c.length);
  const f=weeklyFeatures(c,period||MA_PERIOD);
  const ma200=weeklyMA200(c);
  const markers=[];
  if(period){
    for(let i=period+5;i<c.length;i++){
      const event=typeAt(c,f,i,period);
      if(!event)continue;
      const prev=markers.at(-1);
      if(prev&&prev.kind===event.kind&&i-prev.index<9)continue;
      markers.push({...event,index:i,time:c[i].time,confirmedAt:c[i].time+WEEK_MS,price:round(c[i].close,12)});
    }
  }
  const index=c.length-1,ma=period?f.sma[index]:null,last=index>=0?c[index]:null;
  const maNow=Number.isFinite(ma)?ma:null;
  let status=null,reason="",lastSignal=null;
  const recent=[...markers].reverse().find(m=>index-m.index<=3);
  if(recent&&last&&maNow&&((recent.kind==="BUY"&&last.close>maNow)||(recent.kind==="SELL"&&last.close<maNow))){
    status=recent.kind;reason=recent.reason;lastSignal=recent;
  }else if(last&&maNow&&Math.abs(last.close/maNow-1)<=.12&&f.rsi[index]>=39) {
    status="IZLE";reason="MA"+period+" yakınında; BUY/SELL için haftalık teyit henüz tamamlanmadı";
  }
  const gap=last&&maNow?(last.close/maNow-1)*100:null;
  return {
    status,reason,markers,
    candles:c,ma200:ma200.map(v=>round(v,12)),
    ma:period?f.sma.map(v=>round(v,12)):Array(c.length).fill(null),
    referencePeriod:period,
    lastClosedAt:last?.time??null,
    lastClosedPrice:last?.close??null,
    sma200:round(ma200[index],12),
    referenceMA:round(maNow,12),
    rsi14:round(f.rsi[index],4),
    macdHist:round(f.hist[index],12),
    distancePct:round(gap,5),
    signalAt:lastSignal?.confirmedAt??null,
    riskNote:period?"MA"+period+" haftalık teknik modelidir; işaretler geçmişteki teyitlerdir, kâr garantisi yoktur.":"Yeterli haftalık veri yoktur, BUY/SELL verilmez.",
    insufficient:!period,
    weeks:c.length
  };
}
