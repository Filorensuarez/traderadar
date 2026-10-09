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


/**
 * PRE-BREAKOUT accumulation scan. Historical completed daily candles only;
 * the current live price is optional and is not used to define resistance.
 * "YÜKSELİŞ BAŞLIYOR" means a technical transition, not future certainty.
 */
export function detectMediumPreBreakout(candles,livePrice=null) {
  const x=(Array.isArray(candles)?candles:[]).map(v=>({
    time:Number(v.time),open:Number(v.open),high:Number(v.high),low:Number(v.low),
    close:Number(v.close),volume:Number(v.volume)
  })).filter(v=>[v.time,v.open,v.high,v.low,v.close,v.volume].every(Number.isFinite)
    &&v.open>0&&v.close>0&&v.low>0&&v.high>=v.low&&v.volume>=0)
    .sort((a,b)=>a.time-b.time);
  if(x.length<105)return null;
  const a=x.slice(-120),last=a.at(-1);
  const closes=a.map(v=>v.close),volumes=a.map(v=>v.volume);
  const ema=(list,n)=>{let value=list[0],k=2/(n+1);for(let i=1;i<list.length;i++)value=list[i]*k+value*(1-k);return value;};
  const mean=list=>list.reduce((s,v)=>s+v,0)/list.length;
  const high=list=>Math.max(...list.map(v=>v.high));
  const low=list=>Math.min(...list.map(v=>v.low));
  const old=a.slice(-61,-31),base=a.slice(-31);
  const oldRange=(high(old)/low(old)-1)*100;
  const range=(high(base)/low(base)-1)*100;
  const compressed=range<=22&&range<=oldRange*.8;
  const volumeOld=mean(volumes.slice(-31,-11));
  const volumeNew=mean(volumes.slice(-10));
  const dryVolume=volumeOld>0&&volumeNew/volumeOld<=.85;
  const ema7=ema(closes,7),ema25=ema(closes,25),ema99=ema(closes,99);
  const ema7Old=ema(closes.slice(0,-4),7);
  const rising=ema7>ema7Old&&last.close>=ema25*.98&&ema25>=ema99*.98;
  const resistance=high(base);
  const observed=Number.isFinite(Number(livePrice))&&Number(livePrice)>0?Number(livePrice):last.close;
  const distance=(resistance-observed)/resistance*100;
  const near=distance>=-1.5&&distance<=5;
  const lastVol=volumes.at(-1);
  const volumeIncrease=volumeOld>0&&lastVol/volumeOld>=1.3;
  const alreadyExtended=observed/ema25>1.25||observed/last.close>1.15;
  const score=(compressed?25:0)+(dryVolume?15:0)+(rising?25:0)+(near?20:0)+(volumeIncrease?15:0);
  const reasons=[
    compressed?"30 günlük fiyat aralığı daralmış":null,
    dryVolume?"Sıkışmada işlem hacmi azalmış":null,
    rising?"EMA eğimi yukarı dönüyor":null,
    near?"Fiyat geçmiş dirence yaklaşıyor":null,
    volumeIncrease?"Son tamamlanan günde hacim artışı":null
  ].filter(Boolean);
  const status=alreadyExtended?"GEÇ KALINDI":
    score>=70&&compressed&&rising&&near?"YÜKSELİŞ HAZIRLIĞI":
    score>=50?"İZLE":"BEKLE";
  return {status,score,price:observed,resistance,distToResistance:Number(distance.toFixed(2)),
    ema7,ema25,ema99,rangePct:Number(range.toFixed(2)),reasons,
    asOf:last.time,confirmed:false};
}
