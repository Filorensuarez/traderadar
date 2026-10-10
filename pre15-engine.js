// 15-minute PRE-breakout detector. Only completed historical 1m OHLCV bars.
// No look-ahead: at each timestamp, prior resistance excludes the latest 15 bars.
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function ema(a,n){const k=2/(n+1);let v=a[0];for(let i=1;i<a.length;i++)v=v+(a[i]-v)*k;return v;}
export function analyzePre15(input,{now=Date.now()}={}){
 const bars=(Array.isArray(input)?input:[]).map(x=>({
  time:Number(x.time),open:Number(x.open),high:Number(x.high),low:Number(x.low),
  close:Number(x.close),volume:Number(x.volume)
 })).filter(x=>Object.values(x).every(Number.isFinite)&&x.low>0&&x.high>=x.low&&x.close>0&&x.volume>=0)
 .sort((a,b)=>a.time-b.time).filter((x,i,a)=>i===0||x.time!==a[i-1].time)
 .filter(x=>x.time+60000<=now).slice(-90);
 const unavailable=(reason)=>({status:"VERİ YETERSİZ",score:0,reasons:[],reason});
 if(bars.length<65)return unavailable("En az 65 tamamlanmış 1 dakikalık mum gerekli.");
 if(now-bars.at(-1).time>180000)return unavailable("Veriler güncel değil.");
 let gaps=0;for(let i=1;i<bars.length;i++)if(bars[i].time-bars[i-1].time!==60000)gaps++;
 if(gaps>3)return unavailable("Dakikalık mumlarda boşluklar var.");
 const pre=bars.slice(-60,-15),recent=bars.slice(-15),last=bars.at(-1);
 const close=bars.map(x=>x.close);
 const baselineVolume=mean(pre.map(x=>x.volume));
 if(baselineVolume<=0)return unavailable("Referans işlem hacmi bulunamadı.");
 const recentVolume=mean(recent.map(x=>x.volume));
 const volRatio=recentVolume/baselineVolume;
 const last3=mean(recent.slice(-3).map(x=>x.volume))/baselineVolume;
 const resistance=Math.max(...pre.map(x=>x.high));
 const support=Math.min(...pre.map(x=>x.low));
 const baseRange=(resistance/support-1)*100;
 const recentRange=(Math.max(...recent.map(x=>x.high))/Math.min(...recent.map(x=>x.low))-1)*100;
 const change15=(last.close/recent[0].open-1)*100;
 const distance=(resistance-last.close)/resistance*100;
 const ema7=ema(close,7),ema21=ema(close,21),ema7Old=ema(close.slice(0,-5),7);
 const green=recent.slice(-5).filter(x=>x.close>x.open).length;
 const risingLows=Math.min(...recent.slice(-5).map(x=>x.low))>
  Math.min(...recent.slice(0,5).map(x=>x.low));
 const compression=baseRange<=5&&recentRange<=Math.max(2,baseRange*1.15);
 const approaching=distance>=-0.4&&distance<=2.5;
 const momentum=ema7>ema7Old&&ema7>=ema21*.997&&green>=3;
 const early=change15>=-1&&change15<3;
 const volumeAwakening=volRatio>=1.25||last3>=1.7;
 const score=(compression?25:0)+(approaching?20:0)+(momentum?20:0)+
  (volumeAwakening?20:0)+(risingLows?10:0)+(early?5:0);
 const reasons=[
  compression?"Dar fiyat aralığı":null,approaching?"Önceki dirence yakın":null,
  momentum?"EMA7 yukarı dönüyor ve pozitif mumlar artıyor":null,
  volumeAwakening?"Hacim hareketleniyor":null,risingLows?"Dipler yükseliyor":null,
  early?"Fiyat henüz aşırı uzaklaşmamış":null
 ].filter(Boolean);
 let status="BEKLE";
 if(change15>=5||distance< -3)status="GEÇ KALINDI";
 else if(score>=70&&compression&&momentum&&volumeAwakening&&approaching&&early)
  status="YÜKSELİŞ HAZIRLIĞI";
 else if(score>=50&&early)status="İZLE";
 return {status,score,reasons,price:last.close,resistance,support,
  change15Pct:Number(change15.toFixed(2)),distancePct:Number(distance.toFixed(2)),
  volumeRatio:Number(volRatio.toFixed(2)),last3VolumeRatio:Number(last3.toFixed(2)),
  baseRangePct:Number(baseRange.toFixed(2)),ema7,ema21,asOf:last.time,
  predictionMinutes:null};
}
// Historical evaluation: event is a user-selected timestamp, never used in the signal.
export function inspectPreEvent(input,eventTime){
 const bars=input.filter(x=>Number(x.time)+60000<=eventTime).sort((a,b)=>a.time-b.time);
 const last=bars.at(-1);
 if(!last)return {status:"VERİ YETERSİZ"};
 return analyzePre15(bars,{now:last.time+60000});
}
