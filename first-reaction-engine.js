// Shared first-reaction logic for public aggressive trade streams.
export function detectFirstReaction(trades,now=Date.now()){
 const recent=trades.filter(t=>t.time>=now-10000&&t.time<=now);
 const base=trades.filter(t=>t.time>=now-70000&&t.time<now-10000);
 const short=trades.filter(t=>t.time>=now-5000&&t.time<=now);
 const thirty=trades.filter(t=>t.time>=now-30000&&t.time<=now);
 if(recent.length<3||base.length<8||thirty.length<2)return null;
 const latest=recent.at(-1);
 if(now-latest.time>10000)return null;
 const sum=a=>a.reduce((n,t)=>n+t.value,0);
 const current=sum(recent),reference=sum(base)/6;
 if(current<500||reference<=0)return null;
 const acceleration=current/reference;
 const buyShare=sum(recent.filter(t=>t.side==="buy"))/current;
 const change10=(latest.price/recent[0].price-1)*100;
 const change30=(latest.price/thirty[0].price-1)*100;
 const change5=short.length>1?(latest.price/short[0].price-1)*100:0;
 let status=null;
 if(acceleration>=2.5&&buyShare>=.65&&change10>=.25&&change10<=2.5&&change5>0)status="İLK HAREKET";
 if(acceleration>=4&&buyShare>=.72&&change30>=.6&&change30<=4)status="YÜKSELİŞ TEYİDİ";
 if(!status)return null;
 return {status,price:latest.price,change5Pct:+change5.toFixed(2),change10Pct:+change10.toFixed(2),
 change30Pct:+change30.toFixed(2),volumeAcceleration:+acceleration.toFixed(2),
 buySharePct:+(buyShare*100).toFixed(1),trades10s:recent.length,observedAt:latest.time};
}
