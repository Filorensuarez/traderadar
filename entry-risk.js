// Diagnostic only: no automated buy recommendation.
export function assessEntryRisk(points, now=Date.now()) {
 const recent=points.filter(x=>x.t>=now-180000&&x.t<=now&&Number.isFinite(x.p)&&x.p>0);
 if(recent.length<2||now-recent[0].t<60000)return {status:"VERİ YETERSİZ",risk:"unknown",change1m:null,change3m:null,drawdownPct:null};
 const last=recent.at(-1).p;
 const past=(ms)=>recent.find(x=>x.t<=now-ms);
 const one=past(60000),three=past(180000);
 const peak=Math.max(...recent.map(x=>x.p));
 const pct=(base)=>base?+((last/base.p-1)*100).toFixed(2):null;
 const change1m=pct(one),change3m=pct(three);
 const drawdownPct=+((1-last/peak)*100).toFixed(2);
 const surge=change3m??change1m;
 const risky=(drawdownPct>=1)||(change1m!==null&&change1m<=-0.5)||(surge!==null&&surge>=3);
 return {status:risky?"GEÇ ALIM RİSKİ":"TAKİP ET",risk:risky?"high":"unconfirmed",change1m,change3m,drawdownPct};
}
