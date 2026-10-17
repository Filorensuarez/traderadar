// 30-second spot price momentum using REAL, consecutive, completed 1-second candles.
// Compare with 30 consecutive completed 1-minute candles before the 30-second window.
// Price confirmation only. Trading volume never gates or contributes to the signal.
const RULES=Object.freeze({priceRisePct:2,maxLagMs:5000});
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
export function calculateMomentum30s(rawSeconds,rawMinutes,timestamp=Date.now()){
 const clean=a=>Array.isArray(a)?a.filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.close)&&x.close>0)
  .sort((a,b)=>a.time-b.time):[];
 const sec=clean(rawSeconds).filter(x=>x.time+1000<=timestamp).slice(-30);
 if(sec.length!==30)return {ok:false,confirmed:false,reason:"30 tamamlanmış 1 saniyelik mum eksik"};
 for(let i=1;i<30;i++)if(sec[i].time-sec[i-1].time!==1000)
  return {ok:false,confirmed:false,reason:"1 saniyelik mumlar ardışık değil"};
 if(timestamp-(sec.at(-1).time+1000)>RULES.maxLagMs)
  return {ok:false,confirmed:false,reason:"1 saniyelik mumlar güncel değil"};
 const min=clean(rawMinutes).filter(x=>x.time+60000<=sec[0].time).slice(-30);
 if(min.length!==30)return {ok:false,confirmed:false,reason:"30 tamamlanmış 1 dakikalık mum eksik"};
 for(let i=1;i<30;i++)if(min[i].time-min[i-1].time!==60000)
  return {ok:false,confirmed:false,reason:"30 dakikalık referans verisi kesintili"};
 if(sec[0].time-(min.at(-1).time+60000)>=60000)
  return {ok:false,confirmed:false,reason:"30 dakikalık referans eski"};
 const previousAverage=mean(min.map(x=>x.close)),currentAverage=mean(sec.map(x=>x.close));
 const priceChangePct=(currentAverage/previousAverage-1)*100;
 const confirmed=priceChangePct>=RULES.priceRisePct;
 const fix=(value,d=3)=>Number(value.toFixed(d));
 return {
  ok:true,confirmed,priceChangePct:fix(priceChangePct),
  currentAverage:fix(currentAverage,10),previousAverage:fix(previousAverage,10),
  price:sec.at(-1).close,candleTime:sec.at(-1).time,
  reason:confirmed?"Fiyat ortalaması en az %2 yükseldi; kapanmış gerçek mumlarla teyitli":
   "30 dakikalık fiyat ortalamasına fark %2 altında"
 };
}
export const momentum30sThresholds=RULES;
