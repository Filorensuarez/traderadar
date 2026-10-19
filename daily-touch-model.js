const PERIOD=300000;
function ema(values,n){let v=0;return values.map((x,i)=>{if(i<n-1){v+=x;return null;}if(i===n-1){v=(v+x)/n;return v;}v=x*2/(n+1)+v*(1-2/(n+1));return v;});}
export function dailyContact(raw,now=Date.now()){
 const c=raw.filter(x=>x.time<=now&&[x.time,x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)&&x.close>0).sort((a,b)=>a.time-b.time);
 if(c.length<110)return {match:false,reason:"En az 110 mum gerekli"};
 const close=c.map(x=>x.close),i=c.length-1,last=c[i],previous=c[i-1];
 if(last.time+PERIOD<=now)return {match:false,reason:"Güncel oluşan mum bulunamadı"};
 const e7=ema(close,7)[i],e25=ema(close,25)[i],e99=ema(close,99)[i];
 const prev=c.slice(-8,-2),rangeHigh=Math.max(...prev.map(x=>x.high)),rangeLow=Math.min(...prev.map(x=>x.low));
 const narrow=(rangeHigh/rangeLow-1)<=.035;
 const prevHigh=previous.high;
 const volumeBase=c.slice(-11,-1).reduce((s,x)=>s+x.volume,0)/10;
 const elapsed=Math.max(1,Math.min(PERIOD,now-last.time));
 const volumeRatio=volumeBase>0?(last.volume*PERIOD/elapsed)/volumeBase:0;
 const rising=last.close>last.open&&last.close>prevHigh&&last.close>e7&&last.close>e25&&e7>e25&&e25>e99;
 const match=narrow&&rising;
 return {match,close:last.close,ema7:e7,ema25:e25,ema99:e99,volumeRatio,breakout:prevHigh,rangePct:(rangeHigh/rangeLow-1)*100,day:last.time,reason:match?"Önceki kapalı 5 dakikalık mumun zirvesi yeni mumda yukarı kırıldı":"Koşullar henüz tamamlanmadı"};
}
