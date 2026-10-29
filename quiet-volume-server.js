import WebSocket from "ws";
const states=new Map(),sockets=new Set(),alarms=[];
let universe=0,connections=0,lastError="",started=0,listener=null;
const BASE="https://data-api.binance.vision";
const RULES={warmupSeconds:120,windowSeconds:15,baselineSeconds:105,minBuyUsdt:5000,minBuyRatio:0.78,minAcceleration:5,minPrice15sPct:0.35,minPrice60sPct:1.2,maxPrice60sPct:3.5,maxSpreadProxyPct:2.5,cooldownSeconds:1800,confirmationSeconds:30,minFollowThroughPct:0.7,globalCooldownSeconds:90};
let lastGlobalAlarm=0;
const num=(v,n=2)=>Number(v.toFixed(n));
function onTrade(d){
 const now=Date.now(),price=Number(d.p),qty=Number(d.q),value=price*qty;
 if(!d.s||!(value>0)||!(price>0))return;
 let s=states.get(d.s);
 if(!s){s={first:now,buckets:new Map(),lastAlarm:0};states.set(d.s,s)}
 const t=Math.floor(now/5000)*5000;
 let b=s.buckets.get(t);if(!b){b={total:0,buy:0,firstPrice:price,lastPrice:price,high:price,low:price};s.buckets.set(t,b)}
 b.total+=value;if(d.m===false)b.buy+=value;
 b.lastPrice=price;b.high=Math.max(b.high,price);b.low=Math.min(b.low,price);
 for(const key of s.buckets.keys())if(key<now-140000)s.buckets.delete(key);
 if(now-s.first<RULES.warmupSeconds*1000||now-s.lastAlarm<RULES.cooldownSeconds*1000)return;
 const entries=[...s.buckets.entries()].sort((a,b)=>a[0]-b[0]);
 const recent=entries.filter(([t])=>t>=now-15000);
 const baseline=entries.filter(([t])=>t>=now-120000&&t<now-15000);
 const oneMinute=entries.filter(([t])=>t>=now-60000);
 if(recent.length<2||baseline.length<12||oneMinute.length<7)return;
 const sum=(a,key)=>a.reduce((v,[,b])=>v+b[key],0);
 const buy=sum(recent,"buy"),total=sum(recent,"total"),baselineBuy=sum(baseline,"buy");
 const acceleration=buy/Math.max(baselineBuy/7,1),buyRatio=buy/Math.max(total,1);
 const p15=recent[0][1].firstPrice,p60=oneMinute[0][1].firstPrice;
 const price15sPct=(price/p15-1)*100,price60sPct=(price/p60-1)*100;
 const low=Math.min(...recent.map(([,b])=>b.low)),high=Math.max(...recent.map(([,b])=>b.high));
 const spreadProxyPct=(high-low)/price*100; // intrawindow range, NOT order-book bid/ask spread
 if(buy<RULES.minBuyUsdt||buyRatio<RULES.minBuyRatio||acceleration<RULES.minAcceleration||
 price15sPct<RULES.minPrice15sPct||price60sPct<RULES.minPrice60sPct||
 price60sPct>RULES.maxPrice60sPct||spreadProxyPct>RULES.maxSpreadProxyPct)return;
 // Phase 1: remember a candidate; never publish the first impulse.
 if(!s.candidate){s.candidate={at:now,price,firstRatio:buyRatio,firstAcceleration:acceleration};return;}
 const candidate=s.candidate;
 if(now-candidate.at>90000){s.candidate={at:now,price};return;}
 if(now-candidate.at<RULES.confirmationSeconds*1000)return;
 const followThroughPct=(price/candidate.price-1)*100;
 // Phase 2: the price must advance again, not merely retain a brief spike.
 if(followThroughPct<RULES.minFollowThroughPct){s.candidate=null;return;}
 if(now-lastGlobalAlarm<RULES.globalCooldownSeconds*1000)return;
 s.candidate=null;s.lastAlarm=now;lastGlobalAlarm=now;
 const score=Math.min(100,Math.round(25+Math.min(acceleration,8)*4+buyRatio*20+
 Math.min(price15sPct,1.5)*12+Math.min(price60sPct,2)*5));
 const alert={symbol:d.s,price,time:now,buyUsdt:Math.round(buy),buyRatio:Math.round(buyRatio*100),
 acceleration:num(acceleration,1),price15sPct:num(price15sPct),price60sPct:num(price60sPct),
 score,followThroughPct:num(followThroughPct),signal:"İKİ AŞAMALI YÜKSELİŞ TEYİDİ"};
 alarms.unshift(alert);if(alarms.length>150)alarms.pop();
 if(listener)Promise.resolve(listener(alert)).catch(e=>console.error("quiet push",e.message));
}
export function onQuietAlert(fn){listener=fn}
function connect(symbols){
 const streams=symbols.map(s=>s.toLowerCase()+"@aggTrade").join("/");
 const ws=new WebSocket("wss://data-stream.binance.vision/stream?streams="+streams);sockets.add(ws);
 let opened=false;
 ws.on("open",()=>{opened=true;connections++});
 ws.on("message",raw=>{try{onTrade(JSON.parse(raw).data)}catch{}});
 ws.on("error",e=>{lastError=e.message});
 ws.on("close",()=>{sockets.delete(ws);if(opened)connections=Math.max(0,connections-1);
 for(const sym of symbols)states.delete(sym);
 setTimeout(()=>connect(symbols),5000).unref()});
}
export function quietSnapshot(){return {running:started>0,started,universe,connectedStreams:connections,tracked:states.size,
 ready:[...states.values()].filter(x=>Date.now()-x.first>=120000).length,lastError,config:RULES,alarms:alarms.slice(0,80)}}
export async function startQuietRadar(){
 if(started)return;started=Date.now();
 try{
 const r=await fetch(BASE+"/api/v3/exchangeInfo");if(!r.ok)throw Error("Binance HTTP "+r.status);
 const data=await r.json();const symbols=(data.symbols||[]).filter(s=>s.status==="TRADING"&&s.quoteAsset==="USDT"&&s.isSpotTradingAllowed!==false&&!/(UP|DOWN|BULL|BEAR)USDT$/.test(s.symbol)).map(s=>s.symbol);
 universe=symbols.length;for(let i=0;i<symbols.length;i+=40)connect(symbols.slice(i,i+40));
 }catch(e){lastError=e.message;started=0;setTimeout(startQuietRadar,30000).unref()}
}
