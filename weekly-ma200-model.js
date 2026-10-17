/**
 * Weekly SMA200 reversal model; public market OHLCV only.
 * All decisions are based exclusively on completed weekly candles.
 * Historical markers use strictly past/present candles (no future lookahead).
 * Not a trading instruction or prediction of profits.
 */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const MA_PERIOD = 200;

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
export function weeklyMA200(candles) {
  const output = Array(candles.length).fill(null);
  let sum = 0;
  for (let i=0;i<candles.length;i++) {
    sum += candles[i].close;
    if (i>=MA_PERIOD) sum -= candles[i-MA_PERIOD].close;
    if (i>=MA_PERIOD-1) output[i] = sum/MA_PERIOD;
  }
  return output;
}
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
function weeklyFeatures(candles){
  const closes=candles.map(c=>c.close),sma=weeklyMA200(candles);
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
function typeAt(c,f,i){
  if(i<MA_PERIOD+5 || !isConsecutive(c,i,MA_PERIOD+6))return null;
  const ma=f.sma[i],p=f.sma[i-1],r=f.rsi[i],rPrev=f.rsi[i-1],h=f.hist[i],hPrev=f.hist[i-1],hBefore=f.hist[i-2];
  if(![ma,p,r,rPrev,h,hPrev,hBefore].every(Number.isFinite)||ma<=0||p<=0)return null;
  const close=c[i].close,dist=close/ma-1,avgVol=c.slice(i-8,i).reduce((s,v)=>s+v.quoteVolume,0)/8;
  const nearTouch=Array.from({length:6},(_,k)=>i-k).some(j=>f.sma[j]!==null&&c[j].low<=f.sma[j]*1.065&&c[j].high>=f.sma[j]*.88);
  const recentlyBelow=Array.from({length:7},(_,k)=>i-2-k).some(j=>j>=MA_PERIOD&&f.sma[j]!==null&&c[j].close<=f.sma[j]*1.005);
  const recentlyAbove=Array.from({length:7},(_,k)=>i-2-k).some(j=>j>=MA_PERIOD&&f.sma[j]!==null&&c[j].close>=f.sma[j]*.995);
  const trendNotBroken=f.sma[i-4]!==null&&ma>=f.sma[i-4]*.988;
  const volumeOk=avgVol>0&&c[i].quoteVolume>=avgVol*.80;
  // BUY: reclaim, two completed weekly closes above SMA200, momentum and liquidity confirmation.
  if(dist>=.009&&dist<=.20&&c[i-1].close>p*1.004&&
     recentlyBelow&&nearTouch&&trendNotBroken&&
     r>=49&&r>=rPrev&&h>hBefore&&h>=0&&volumeOk&&
     close>=c[i-1].close*.99) {
     return {kind:"BUY",reason:"MA200 üzerinde iki haftalık kapanış; yükselen RSI/MACD ve destek bölgesinden dönüş"};
  }
  // SELL is only a bearish regime warning, not an instruction to place a sell order.
  if(dist<=-.009&&c[i-1].close<p*.996&&recentlyAbove&&
     (r<=49||h<0)&&h<=hPrev&&volumeOk) {
     return {kind:"SELL",reason:"MA200 altında iki haftalık kapanış ve zayıflayan momentum"};
  }
  return null;
}
const round=(v,dec=6)=>Number.isFinite(v)?Number(v.toPrecision(dec)):null;
export function analyzeWeeklyMA200(input, opts={}) {
  const now=opts.now??Date.now();
  const c=closedWeeklyCandles(input,now);
  const f=weeklyFeatures(c);
  const markers=[];
  for(let i=MA_PERIOD+5;i<c.length;i++){
    const event=typeAt(c,f,i);
    if(!event)continue;
    const prev=markers.at(-1);
    if(prev&&prev.kind===event.kind&&i-prev.index<9)continue;
    markers.push({...event,index:i,time:c[i].time,confirmedAt:c[i].time+WEEK_MS,price:round(c[i].close,12)});
  }
  const index=c.length-1,ma=f.sma[index],last=index>=0?c[index]:null;
  const maNow=Number.isFinite(ma)?ma:null;
  let status=null,reason="",lastSignal=null;
  const recent=[...markers].reverse().find(m=>index-m.index<=3);
  if(recent&&last&&maNow&&((recent.kind==="BUY"&&last.close>maNow)||(recent.kind==="SELL"&&last.close<maNow))){
    status=recent.kind;reason=recent.reason;lastSignal=recent;
  }else if(last&&maNow&&Math.abs(last.close/maNow-1)<=.10&&f.rsi[index]>=39) {
    status="IZLE";reason="MA200 yakınında; BUY/SELL için haftalık teyit henüz tamamlanmadı";
  }
  const gap=last&&maNow?(last.close/maNow-1)*100:null;
  return {
    status,reason,markers,
    candles:c,ma200:f.sma.map(v=>round(v,12)),
    lastClosedAt:last?.time??null,
    lastClosedPrice:last?.close??null,
    sma200:round(maNow,12),
    rsi14:round(f.rsi[index],4),
    macdHist:round(f.hist[index],12),
    distancePct:round(gap,5),
    signalAt:lastSignal?.confirmedAt??null,
    riskNote:"Haftalık MA200 modelidir; işaretler geriye dönük teknik koşullardır, işlem veya getiri garantisi değildir.",
    insufficient:c.length<MA_PERIOD+6,
    weeks:c.length
  };
}
