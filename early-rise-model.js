// Open, inspectable approximation of VCP/SEPA principles plus quantitative anomaly checks.
// It is NOT Minervini's implementation nor Renaissance Technologies' proprietary code.
// All times UTC milliseconds. Quote turnover is in USDT. No automatic orders.
const finite=n=>Number.isFinite(n);
const fix=(n,d=2)=>finite(n)?+n.toFixed(d):null;
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const high=a=>Math.max(...a.map(x=>x.high));
const low=a=>Math.min(...a.map(x=>x.low));
const rangePct=a=>{const lo=low(a);return lo>0?(high(a)/lo-1)*100:Infinity;};
function ema(a,n){
 if(a.length<n)return null;
 const k=2/(n+1);
 let e=avg(a.slice(0,n));
 for(let i=n;i<a.length;i++)e=a[i]*k+e*(1-k);
 return e;
}
function atr(a,n=14){
 if(a.length<=n)return null;
 const r=[];
 for(let i=1;i<a.length;i++){
  const x=a[i],p=a[i-1].close;
  r.push(Math.max(x.high-x.low,Math.abs(x.high-p),Math.abs(x.low-p)));
 }
 return avg(r.slice(-n));
}
function volatilityZ(closed,price){
 const r=[];
 for(let i=1;i<closed.length-5;i++){
  const a=closed[i-1].close,b=closed[i].close;
  if(a<=0||b<=0)return null;
  r.push(Math.log(b/a));
 }
 const recent=r.slice(-60),mu=avg(recent);
 const sd=Math.sqrt(avg(recent.map(x=>(x-mu)**2)));
 if(!(sd>0))return null;
 const reference=closed.at(-6).close;
 const net=Math.log(price/reference);
 return fix((net-5*mu)/(Math.max(sd,0.00005)*Math.sqrt(5)));
}
/**
 * @param {Array<{time:number,open:number,high:number,low:number,close:number,quoteVolume:number}>} candles
 * @param {{price:number,ask:number,bid:number,volume24h:number}} ticker
 * @param {{return20Pct:number}|null} benchmark BTC price return over same 20-minute interval
 */
export function evaluateEarlyRise(candles,ticker,benchmark=null,timestamp=Date.now()){
 if(!Array.isArray(candles)||candles.length<91)return null;
 const price=+ticker.price,ask=+ticker.ask,bid=+ticker.bid;
 if(!(price>0&&ask>0&&bid>0&&ask>=bid&&ticker.volume24h>=1000000))return null;
 const minute=Math.floor(timestamp/60000)*60000;
 const closed=candles.filter(x=>x.time<minute&&x.time+60000<=timestamp).slice(-120);
 if(closed.length<90||closed.at(-1).time!==minute-60000)return null;
 for(let i=Math.max(1,closed.length-90);i<closed.length;i++){
  const a=closed[i-1],b=closed[i];
  if(b.time-a.time!==60000||![b.high,b.low,b.close,b.quoteVolume].every(finite)
   ||b.low<=0||b.high<b.low||b.quoteVolume<0)return null;
 }
 const current=candles.find(x=>x.time===minute);
 const closes=closed.map(x=>x.close);
 const ema8=ema(closes,8),ema21=ema(closes,21),ema50=ema(closes,50);
 const recent60=closed.slice(-60);
 const c1=rangePct(recent60.slice(0,20)),c2=rangePct(recent60.slice(20,40)),c3=rangePct(recent60.slice(40));
 const volEarly=avg(closed.slice(-50,-20).map(x=>x.quoteVolume));
 const volLast=avg(closed.slice(-10).map(x=>x.quoteVolume));
 const dryRatio=volEarly>0?volLast/volEarly:Infinity;
 const atr14=atr(closed),atrBefore=atr(closed.slice(-42,-14));
 if(!(atr14>0&&atrBefore>0))return null;
 const atrPct=atr14/price*100;
 const decliningRange=c1>0&&c2<=c1*0.94&&c3<=c2*0.90;
 const tight=c3<=Math.max(0.65,Math.min(5,atrPct*4));
 const fallingVol=volEarly>0&&dryRatio<=0.90;
 const decliningATR=atr14/atrBefore<=0.94;
 const pivot=high(closed.slice(-30));
 const distancePct=(pivot/price-1)*100;
 const nearPivot=distancePct>=-0.65&&distancePct<=1.65;
 const trendOk=price>=ema21*0.99&&ema8>=ema21*0.985&&ema21>=ema50*0.975;
 const spreadPct=(ask-bid)/ask*100;
 const change5=(price/closed.at(-6).close-1)*100;
 const change15=(price/closed.at(-16).close-1)*100;
 const return20=(price/closed.at(-21).close-1)*100;
 const strengthPct=benchmark&&finite(benchmark.return20Pct)?return20-benchmark.return20Pct:null;
 const relativeOk=strengthPct===null||strengthPct>=-0.6;
 const zScore=volatilityZ(closed,price);
 const elapsed=timestamp-minute;
 const rawLiveVolume=current&&current.quoteVolume>=0?current.quoteVolume:0;
 // Require enough elapsed time before extrapolating current-minute turnover.
 const liveVolumeNormalized=current&&elapsed>=12000&&elapsed<=60000
  ?rawLiveVolume*60000/elapsed:null;
 const volBase10=avg(closed.slice(-10).map(x=>x.quoteVolume));
 const rvol=liveVolumeNormalized!==null&&volBase10>0?liveVolumeNormalized/volBase10:null;
 const livePeak=current&&current.high>0?current.high:price;
 const retracePct=Math.max(0,(livePeak-price)/livePeak*100);
 const pastResistance=high(closed.slice(-90,-30));
 const breakout=price>pivot*1.0004;
 const stretchPct=(price/pivot-1)*100;
 const late=change5>=4||change15>=8||stretchPct>=Math.max(1.6,atrPct*1.8)||
  (retracePct>=0.7&&breakout)||atrPct>7||spreadPct>0.35;
 const priceStability=Math.abs(change5)<=2.5;
 const liquidity=ticker.volume24h>=5000000;
 let score=0;
 if(decliningRange)score+=21;
 if(tight)score+=11;
 if(fallingVol)score+=12;
 if(decliningATR)score+=9;
 if(nearPivot)score+=15;
 if(trendOk)score+=10;
 if(strengthPct!==null&&strengthPct>=0)score+=8;
 else if(relativeOk)score+=4;
 if(priceStability)score+=5;
 if(liquidity)score+=5;
 if(spreadPct<=0.15)score+=4;
 if(breakout&&rvol!==null&&rvol>=1.8)score+=6;
 score=Math.min(100,score);
 // Do not claim a classical VCP: these are 20-minute intraday contractions.
 const setup=decliningRange&&tight&&fallingVol&&(nearPivot||(breakout&&late))&&trendOk&&relativeOk;
 if(!setup||score<63)return null;
 const volumeConfirmed=rvol!==null&&rvol>=1.8&&rawLiveVolume>=1200;
 const anomalyConfirmed=zScore!==null&&zScore>=0.9&&zScore<=6;
 const priceNotChased=!late&&stretchPct<=Math.max(0.8,atrPct);
 const breakoutConfirmed=breakout&&volumeConfirmed&&anomalyConfirmed&&priceNotChased;
 const support=low(closed.slice(-12));
 const stop=Math.max(support-atr14*0.12,ask-atr14*1.6);
 const stopPct=(ask-stop)/ask*100;
 const upperATR=ask+atr14*2.8;
 const nextResistance=pastResistance>ask*1.003?pastResistance:null;
 const target=nextResistance?Math.min(upperATR,nextResistance):upperATR;
 const ratio=(ask>stop&&target>ask)?(target-ask)/(ask-stop):null;
 const planValid=stop>0&&stop<ask&&stopPct>=0.12&&stopPct<=3&&ratio>=1.5&&spreadPct<=0.30;
 let stage,priority;
 if(late&&breakout){stage="GEÇ KALINDI";priority=4;}
 else if(breakoutConfirmed&&planValid&&score>=73){stage="KIRILIM TEYİDİ";priority=0;}
 else if(breakout){stage="KIRILIM ADAYI";priority=1;}
 else if(distancePct<=0.7&&score>=71){stage="KIRILIM YAKIN";priority=2;}
 else {stage="SIKIŞMA İZLENİYOR";priority=3;}
 const reasons=[];
 if(decliningRange)reasons.push("Üç aşamalı daralan fiyat aralığı");
 if(fallingVol)reasons.push("Sıkışmada hacim azalışı");
 if(decliningATR)reasons.push("ATR oynaklığı azalıyor");
 if(nearPivot)reasons.push("Direnç bölgesi yakında");
 if(strengthPct!==null&&strengthPct>=0)reasons.push("BTC karşısında görece güçlü");
 if(breakout&&volumeConfirmed)reasons.push("Anlık hacim genişlemesi");
 if(breakout&&anomalyConfirmed)reasons.push("İstatistiksel fiyat ivmesi");
 if(late)reasons.push("Yükseliş uzamış veya fiyat geri çekilmiş");
 if(breakout&&!planValid)reasons.push("Risk/getiri veya işlem makası teyidi yetersiz");
 const ceilingPct=(target/ask-1)*100;
 const upperPct=Math.max(0,Math.min(6,atrPct*3,ceilingPct));
 const lowerPct=Math.max(0,Math.min(upperPct,atrPct*1.0));
 return {
  stage,priority,score,symbol:null,price:fix(price,10),ask:fix(ask,10),spreadPct:fix(spreadPct,3),
  volume24h:ticker.volume24h,candleTime:closed.at(-1).time,
  resistance:fix(pivot,10),distancePct:fix(distancePct),change5Pct:fix(change5),
  change15Pct:fix(change15),relativeStrengthPct:fix(strengthPct),
  rvol:fix(rvol),dryVolumeRatio:fix(dryRatio),atrPct:fix(atrPct,3),zScore:fix(zScore),
  contractions:[fix(c1),fix(c2),fix(c3)],atrContracting:decliningATR,contractionVerified:decliningRange,
  volumeConfirmed,anomalyConfirmed,retracePct:fix(retracePct),reasons,
  potential:late?null:{lowerPct:fix(lowerPct),upperPct:fix(upperPct),timeframe:"5–30 dakika",
   upperPrice:fix(ask*(1+upperPct/100),10),basis:nextResistance?"Yakın direnç ve ATR":"ATR teknik senaryosu"},
  plan:late||!planValid?null:{entry:fix(ask,10),stop:fix(stop,10),target:fix(target,10),
    stopPct:fix(stopPct),rewardRisk:fix(ratio),label:"Örnek; emir değildir"},
  missingBenchmark:strengthPct===null,
  note:"VCP/SEPA ilkelerinden 1 dakikalık mumlara uyarlama + nicel kontroller. Sonuç kazanma olasılığı değildir."
 };
}
