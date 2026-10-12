// Strict 30-second spot momentum calculation using REAL 1-second exchange candles.
// Compare with 30 completed, consecutive 1-minute candles ending before the 30-second window.
const RULES=Object.freeze({priceRisePct:2,volumeRatio:2.5,minVolumeUSDT:2500,
 middleVsFirst:1.1,lastVsMiddle:1.35,lastVsFirst:1.8,maxLagMs:5000});
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
export function calculateMomentum30s(rawSeconds,rawMinutes,timestamp=Date.now()){
 const clean=a=>Array.isArray(a)?a.filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.close)&&x.close>0&&
  Number.isFinite(x.quoteVolume)&&x.quoteVolume>=0).sort((a,b)=>a.time-b.time):[];
 const sec=clean(rawSeconds).filter(x=>x.time+1000<=timestamp).slice(-30);
 if(sec.length!==30)return {ok:false,reason:"30 tamamlanmış 1 saniyelik mum eksik"};
 for(let i=1;i<30;i++)if(sec[i].time-sec[i-1].time!==1000)
  return {ok:false,reason:"1 saniyelik mumlar ardışık değil"};
 if(timestamp-(sec.at(-1).time+1000)>RULES.maxLagMs)
  return {ok:false,reason:"1 saniyelik mumlar güncel değil"};
 const min=clean(rawMinutes).filter(x=>x.time+60000<=sec[0].time).slice(-30);
 if(min.length!==30)return {ok:false,reason:"30 tamamlanmış 1 dakikalık mum eksik"};
 for(let i=1;i<30;i++)if(min[i].time-min[i-1].time!==60000)
  return {ok:false,reason:"30 dakikalık referans verisi kesintili"};
 if(sec[0].time-(min.at(-1).time+60000)>=60000)
  return {ok:false,reason:"30 dakikalık referans eski"};
 const previousAverage=mean(min.map(x=>x.close)),currentAverage=mean(sec.map(x=>x.close));
 const priceChangePct=(currentAverage/previousAverage-1)*100;
 const block=(a,b)=>sec.slice(a,b).reduce((s,x)=>s+x.quoteVolume,0);
 const first10=block(0,10),middle10=block(10,20),last10=block(20,30);
 const volume30=first10+middle10+last10,expected30=mean(min.map(x=>x.quoteVolume))/2;
 const volumeRatio=expected30>0?volume30/expected30:0;
 const middleVsFirst=first10>0?middle10/first10:0;
 const lastVsMiddle=middle10>0?last10/middle10:0;
 const lastVsFirst=first10>0?last10/first10:0;
 const volumeAccelerating=middleVsFirst>=RULES.middleVsFirst&&
  lastVsMiddle>=RULES.lastVsMiddle&&lastVsFirst>=RULES.lastVsFirst;
 const volumeConfirmed=volume30>=RULES.minVolumeUSDT&&volumeRatio>=RULES.volumeRatio&&volumeAccelerating;
 const confirmed=priceChangePct>=RULES.priceRisePct&&volumeConfirmed;
 const fix=(n,d=3)=>Number(n.toFixed(d));
 return {ok:true,confirmed,priceChangePct:fix(priceChangePct),
  currentAverage:fix(currentAverage,10),previousAverage:fix(previousAverage,10),
  price:sec.at(-1).close,candleTime:sec.at(-1).time,
  volume30USDT:fix(volume30,2),expected30USDT:fix(expected30,2),
  volumeRatio:fix(volumeRatio,2),volumeAccelerating,
  first10USDT:fix(first10,2),middle10USDT:fix(middle10,2),last10USDT:fix(last10,2),
  lastVsMiddle:fix(lastVsMiddle,2),lastVsFirst:fix(lastVsFirst,2),
  middleVsFirst:fix(middleVsFirst,2),
  reason:confirmed?"30 saniyelik fiyat +%2; hacim ve üç ayrı 10 saniyelik hızlanma teyitli":
   priceChangePct<RULES.priceRisePct?"30 dakika fiyat ortalamasına fark %2 altında":
   volume30<RULES.minVolumeUSDT?"30 saniyelik toplam işlem hacmi yetersiz":
   volumeRatio<RULES.volumeRatio?"30 saniyelik hacim ortalama alt sınırını geçmedi":
   "İlk, orta ve son 10 saniyede hacim hızı kademeli artmadı"};
}
export const momentum30sThresholds=RULES;
