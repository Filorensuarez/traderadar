const MINUTE=60000;
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
export function dailyContact(raw,now=Date.now()){
 const c=raw.filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.close)&&x.close>0&&x.time+MINUTE<=now).sort((a,b)=>a.time-b.time);
 if(c.length<40)return {match:false,reason:"40 tamamlanmış 1 dakikalık mum gerekli"};
 const last=c.slice(-40);
 if(last.some((x,i)=>i>0&&x.time-last[i-1].time!==MINUTE))return {match:false,reason:"Eksik mum verisi"};
 if(now-last.at(-1).time>2*MINUTE)return {match:false,reason:"Güncel veri yok"};
 const baseline=avg(last.slice(0,30).map(x=>x.close));
 const recent=avg(last.slice(30).map(x=>x.close));
 const gainPct=(recent/baseline-1)*100;
 return {match:gainPct>=2,close:last.at(-1).close,baseline,recent,gainPct,day:last.at(-1).time,reason:gainPct>=2?"10/30 ortalama farkı en az %2":"Eşik sağlanmadı"};
}
