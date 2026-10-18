const DAY=86400000;
function ema(a,n){let v=0;return a.map((x,i)=>{if(i<n-1){v+=x;return null;}if(i===n-1){v=(v+x)/n;return v;}v=x*(2/(n+1))+v*(1-2/(n+1));return v;});}
export function dailyContact(raw,now=Date.now()){
 const c=raw.filter(x=>x.time+DAY<=now&&[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)&&x.close>0).sort((a,b)=>a.time-b.time);
 if(c.length<110)return {match:false,reason:"En az 110 kapalı gün gerekir"};
 const close=c.map(x=>x.close),i=c.length-1,last=c[i],e7=ema(close,7)[i],e25=ema(close,25)[i],e99=ema(close,99)[i];
 const touch=(last.low<=e7*1.004&&last.high>=e7*.996)||(last.low<=e25*1.004&&last.high>=e25*.996);
 const gain3=(last.close/close[i-3]-1)*100,prevHigh=Math.max(...c.slice(-16,-1).map(x=>x.high));
 const match=touch&&Math.abs(e7/e25-1)<=.035&&last.close<e99*.975&&Math.abs(last.close/e25-1)<=.035&&gain3<=5&&last.close<=prevHigh*1.005&&last.close<=Math.max(e7,e25)*1.04;
 return {match,close:last.close,ema7:e7,ema25:e25,ema99:e99,gain3,touch,day:last.time,reason:match?"Günlük EMA teması var, yükseliş kırılımı yok":"Temas ve yükseliş öncesi koşulları birlikte sağlanmadı"};
}
