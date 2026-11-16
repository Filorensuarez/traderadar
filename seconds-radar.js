import WebSocket from "ws";
const history=new Map(),alerts=new Map();
let socket,connected=false,lastMessage=0,lastError=null,started=false;
const WINDOW=65000;
function record(x){
 const symbol=String(x.s||"");const price=Number(x.c),quote=Number(x.q),now=Date.now();
 if(!/^[A-Z0-9]+USDT$/.test(symbol)||!(price>0)||!(quote>=0))return;
 let h=history.get(symbol);if(!h){h=[];history.set(symbol,h);}
 if(h.length&&now<=h.at(-1).t)return;
 h.push({t:now,p:price,q:quote});
 while(h.length&&h[0].t<now-WINDOW)h.shift();
 if(h.length<3)return;
 const base=(ms)=>{let v=null;for(const p of h){if(p.t<=now-ms)v=p;else break;}return v;};
 const b5=base(5000),b10=base(10000),b30=base(30000),b60=base(60000);
 if(!b5||!b10)return;
 const pct=b=>b?100*(price/b.p-1):null;
 const p5=pct(b5),p10=pct(b10),p30=pct(b30),p60=pct(b60);
 const vol10=quote-b10.q;
 // Rolling 24h quote volume is not an exact 10-second trade volume.
 // Use it only as a rough activity indicator; never label it buy volume.
 const rising=p5>=0.12&&p10>=0.25&&vol10>0;
 if(!rising)return;
 const score=p5*3+p10*2+Math.max(0,p30||0)+Math.min(2,Math.log10(1+vol10)/3);
 const old=alerts.get(symbol);
 alerts.set(symbol,{symbol:symbol.replace(/USDT$/,"/USDT"),exchange:"BINANCE GLOBAL",price,
  change5Pct:+p5.toFixed(3),change10Pct:+p10.toFixed(3),change30Pct:p30===null?null:+p30.toFixed(3),
  change60Pct:p60===null?null:+p60.toFixed(3),activityIndicator:+vol10.toFixed(2),
  score:+score.toFixed(2),detectedAt:old?.detectedAt||now,observedAt:now,
  status:p10>=0.6?"GÜÇLÜ YÜKSELİŞ":"İLK YÜKSELİŞ",buyConfirmed:false});
 if(alerts.size>2000)for(const [k,v] of alerts)if(now-v.observedAt>20000)alerts.delete(k);
}
function connect(){
 if(!started)return;
 socket=new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");
 socket.on("open",()=>{connected=true;lastError=null;});
 socket.on("message",raw=>{try{const msg=JSON.parse(String(raw));if(Array.isArray(msg)){lastMessage=Date.now();for(const x of msg)record(x);}}catch(e){lastError=String(e.message||e);}});
 socket.on("error",e=>{lastError=e.message;});
 socket.on("close",()=>{connected=false;if(started)setTimeout(connect,5000);});
}
export function startSecondsRadar(){if(started)return;started=true;connect();}
export function secondsRadarSnapshot(){
 const now=Date.now();
 const rows=[...alerts.values()].filter(x=>now-x.observedAt<=12000).sort((a,b)=>b.score-a.score).slice(0,100);
 return {connected,lastMessage,lastError,updatedAt:now,trackedSymbols:history.size,rows,
  note:"Binance Global spot USDT canlı fiyat akışı. 5/10 saniye fiyat ivmesi ve yaklaşık işlem etkinliği. Alım tarafı doğrulanmaz; bu bir fiyat ön alarmıdır. Geçmiş veriler yalnızca sunucu çalışırken bellekte tutulur."};
}
