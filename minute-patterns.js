/**
 * Minute-pattern decision support, no future candles, no trading orders.
 * The label AL is a conditional technical observation, not a guaranteed forecast.
 */
export function detectMinutePatterns(input, now=Date.now()) {
  const rows=(Array.isArray(input)?input:[]).map(c=>({
    time:Number(c.time),open:Number(c.open),high:Number(c.high),
    low:Number(c.low),close:Number(c.close),volume:Number(c.volume)
  })).filter(c=>[c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)
    &&c.low>0&&c.high>=c.low&&c.close>0&&c.volume>=0)
    .sort((a,b)=>a.time-b.time).slice(-60);
  const empty={mode:"BEKLE",patternScore:0,patterns:[],warnings:["Yeterli güncel mum verisi yok."],
    breakout:false,compression:false,trigger:null,stop:null,projectedMinutes:null};
  if(rows.length<30)return empty;
  const last=rows.at(-1),price=last.close;
  const age=now-last.time;
  if(age < -65000 || age>125000)return {...empty,warnings:["Mum verisi güncel değil."]};
  const avg=a=>a.reduce((s,x)=>s+x,0)/(a.length||1);
  // Only older candles define resistance: no look-ahead or last-candle leakage.
  const base=rows.slice(-23,-3);
  const highs=base.map(x=>x.high),lows=base.map(x=>x.low);
  const hi=Math.max(...highs),lo=Math.min(...lows);
  const width=(hi/lo-1)*100;
  const prior=rows.slice(-38,-23);
  const priorWidth=prior.length>=10?(Math.max(...prior.map(x=>x.high))/Math.min(...prior.map(x=>x.low))-1)*100:Infinity;
  const compression=width<=2.8 && width<priorWidth*.85;
  const last5=rows.slice(-5);
  const earlier=rows.slice(-25,-5);
  const volBase=avg(earlier.map(x=>x.volume));
  const recentVolume=avg(last5.map(x=>x.volume));
  const volRatio=volBase>0?recentVolume/volBase:0;
  const vol1=volBase>0?last.volume/volBase:0;
  const firstHalf=base.slice(0,10),secondHalf=base.slice(10);
  const ascendingLows=Math.min(...secondHalf.map(x=>x.low))>Math.min(...firstHalf.map(x=>x.low))*1.001;
  const vwapVolume=rows.slice(-20).reduce((s,x)=>s+x.volume,0);
  const vwap=vwapVolume>0?rows.slice(-20).reduce((s,x)=>s+((x.high+x.low+x.close)/3)*x.volume,0)/vwapVolume:null;
  const aboveVwap=vwap!==null&&price>vwap;
  const breakout=last.close>hi*1.001&&last.open<=hi*1.015;
  const near=price>=hi*.99&&price<=hi*1.005;
  const closeLocation=(last.close-last.low)/Math.max(last.high-last.low,price*.000001);
  const strongCandle=last.close>last.open&&closeLocation>.65;
  const change5=(price/rows.at(-6).close-1)*100;
  const change15=(price/rows.at(-16).close-1)*100;
  const extended=change5>=3||change15>=7;
  const falseBreakout=last.high>hi*1.002&&last.close<hi*.997;
  const heavySell=last.close<last.open&&vol1>=2&&closeLocation<.3;
  const patterns=[];
  if(compression)patterns.push("Daralan yatay sıkışma");
  if(ascendingLows)patterns.push("Yükselen dipler");
  if(volRatio>=1.5)patterns.push("Artan 5 mum hacmi");
  if(vol1>=2)patterns.push("Son mum hacim sıçraması");
  if(aboveVwap)patterns.push("VWAP üzerinde fiyat");
  if(near)patterns.push("Geçmiş dirence yaklaşma");
  if(breakout&&strongCandle)patterns.push("Güçlü kapanışla direnç kırılımı");
  const patternScore=Math.min(100,
    (compression?20:0)+(ascendingLows?12:0)+(volRatio>=1.5?15:0)+
    (vol1>=2?12:0)+(aboveVwap?10:0)+(near?13:0)+
    (breakout&&strongCandle?18:0));
  const warnings=[];
  if(extended)warnings.push("Fiyat kısa sürede fazla yükselmiş.");
  if(falseBreakout)warnings.push("Direnç üzerinde kalınamadı; sahte kırılım riski.");
  if(heavySell)warnings.push("Yüksek hacimli satış mumu.");
  if(volBase===0)warnings.push("Hacim referansı bulunamadı.");
  let mode="BEKLE";
  if(falseBreakout||heavySell||extended&&last.close<last.open)mode="SAT";
  else if(compression&&breakout&&strongCandle&&volRatio>=1.5&&aboveVwap&&!extended&&patternScore>=70)mode="AL";
  // AL: confirmed breakout only. Five-minute advance detection is NOT claimed.
  const stop=lo>0?lo:null;
  return {mode,patternScore,patterns,warnings,breakout,compression,
    trigger:hi,stop,volumeRatio:volRatio,change5,change15,
    projectedMinutes:null, // cannot truthfully predict exact breakout time
    explanation:mode==="AL"?"Hacimli kırılım teyidi; işlem garantisi değildir.":
      mode==="SAT"?"Risk/çıkış uyarısı; açık pozisyon bilinmiyor.":
      "Kırılım için teyit bekleniyor."};
}
