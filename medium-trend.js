/**
 * OGN-style medium-term accumulation/breakout analysis.
 * Uses only completed historical daily candles. No future-data leakage.
 * Signal means technical setup, not guaranteed rise.
 */
export function analyzeMediumTrend(candles) {
  const x=(Array.isArray(candles)?candles:[]).map(c=>({
    time:Number(c.time),open:Number(c.open),high:Number(c.high),
    low:Number(c.low),close:Number(c.close),volume:Number(c.volume)
  })).filter(c=>[c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)
    &&c.low>0&&c.open>0&&c.close>0&&c.high>=c.low&&c.volume>=0)
    .sort((a,b)=>a.time-b.time).slice(-130);
  if(x.length<105)return null;
  const closes=x.map(c=>c.close),volumes=x.map(c=>c.volume);
  const ema=(a,n)=>{const k=2/(n+1);let v=a[0];for(let i=1;i<a.length;i++)v=a[i]*k+v*(1-k);return v;};
  const mean=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);
  const last=x.at(-1),previous=x.at(-2);
  const ema7=ema(closes,7),ema25=ema(closes,25),ema99=ema(closes,99);
  const ema7Prev=ema(closes.slice(0,-3),7),ema25Prev=ema(closes.slice(0,-3),25);
  // Resistance excludes the current daily candle.
  const base=x.slice(-31,-1),older=x.slice(-61,-31);
  const resistance=Math.max(...base.map(c=>c.high));
  const support=Math.min(...base.map(c=>c.low));
  const rangePct=(resistance/support-1)*100;
  const priorRange=(Math.max(...older.map(c=>c.high))/Math.min(...older.map(c=>c.low))-1)*100;
  const compressed=rangePct<22&&rangePct<priorRange*.82;
  const volumeBase=mean(volumes.slice(-31,-1));
  const volumeRatio=volumeBase>0?last.volume/volumeBase:0;
  const price=last.close;
  const trend=price>ema25&&ema7>ema25&&ema25>ema99;
  const emaTurning=ema7>ema7Prev&&ema25>=ema25Prev;
  const nearResistance=price>=resistance*.965&&price<=resistance*1.025;
  const breakout=last.close>resistance*1.008&&last.close>last.open;
  const change7=(price/closes.at(-8)-1)*100;
  const extended=change7>35||(price/ema25-1)*100>25;
  const body=(last.close-last.low)/Math.max(last.high-last.low,price*.00001);
  const strongClose=last.close>last.open&&body>.6;
  const reasons=[];
  if(compressed)reasons.push("Önceki 30 günlük fiyat aralığı daralmış");
  if(trend)reasons.push("EMA7 > EMA25 > EMA99 ve fiyat EMA25 üzerinde");
  if(emaTurning)reasons.push("Kısa vadeli EMA eğimi yukarı");
  if(volumeRatio>=1.5)reasons.push("Günlük hacim 30 günlük ortalamanın üzerinde");
  if(nearResistance)reasons.push("30 günlük dirence yakın");
  if(breakout&&strongClose)reasons.push("Direnç üzerinde güçlü kapanış");
  const score=(compressed?15:0)+(trend?20:0)+(emaTurning?10:0)+
    (volumeRatio>=1.5?20:0)+(nearResistance?10:0)+
    (breakout&&strongClose?25:0);
  const confirmed=score>=75&&trend&&volumeRatio>=1.5&&breakout&&strongClose&&!extended;
  const preparation=score>=55&&!extended;
  const state=confirmed?"YÜKSELİŞ BAŞLIYOR":preparation?"YÜKSELİŞ HAZIRLIĞI":"BEKLE";
  return {state,score,price,ema7,ema25,ema99,resistance,support,
    volumeRatio:Number(volumeRatio.toFixed(2)),rangePct:Number(rangePct.toFixed(2)),
    change7:Number(change7.toFixed(2)),compressed,breakout,extended,
    reasons,warning:extended?"Hareket aşırı ilerlemiş olabilir.":null,
    asOf:last.time,signalIsPrediction:false};
}
