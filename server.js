import express from "express";
import WebSocket from "ws";
import path from "path";
import {fileURLToPath} from "url";
const app=express(), __dirname=path.dirname(fileURLToPath(import.meta.url)), PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,". ")));
const SURL="https://www.binance.tr/open/v1/common/symbols", WSS="wss://stream-cloud.binance.tr/ws";
const st=new Map(), clients=new Set();
const cfg={alert:72,strong:84,late:5,max:120,keepMs:15*60*1000};
const med=a=>{if(!a.length)return 0;a=[...a].sort((x,y)=>x-y);let m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2};
const pct=(a,b)=>a?(b-a)/a*100:0;
const sig=(x,c,w)=>Math.max(0,Math.min(100,100/(1+Math.exp(-(x-c)/w))));
function S(sym){if(!st.has(sym))st.set(sym,{symbol:sym,tr:[],k:[],price:0,score:0,status:"İZLENİYOR",m:{}});return st.get(sym)}
function win(s,sec){let z=s.tr.filter(x=>x.t>=Date.now()-sec*1000);if(!z.length)return{ret:0,vol:0,n:0,buyRatio:50};let v=z.reduce((a,x)=>a+x.q,0),b=z.reduce((a,x)=>a+(x.buy?x.q:0),0);return{ret:pct(z[0].p,z.at(-1).p),vol:v,n:z.length,buyRatio:v?b/v*100:50}}
function calc(s){let a=win(s,5),b=win(s,10),c=win(s,30),d=win(s,60),e=win(s,120),now=Date.now(),bs=[];
 for(let k=2;k<=7;k++){let lo=now-k*120000,hi=now-(k-1)*120000,x=s.tr.filter(t=>t.t>=lo&&t.t<hi),v=x.reduce((q,t)=>q+t.q,0),buy=x.reduce((q,t)=>q+(t.buy?t.q:0),0);bs.push({v,n:x.length,br:v?buy/v*100:50})}
 let vx=e.vol/Math.max(1,med(bs.map(x=>x.v))),tx=e.n/Math.max(1,med(bs.map(x=>x.n))),shift=c.buyRatio-med(bs.map(x=>x.br)),mom=Math.max(0,b.ret*2+c.ret+d.ret*.5);
 let ks=s.k.slice(-8),comp=50,dist=99;if(ks.length>=4){let hi=ks.map(x=>x.h),lo=ks.map(x=>x.l),cl=ks.map(x=>x.c),range=(Math.max(...hi)-Math.min(...lo))/(med(cl)||1)*100;comp=Math.max(0,Math.min(100,100-range*15));let r=Math.max(...hi.slice(0,-1));dist=r?(r-s.price)/r*100:99}
 let cp={volume:sig(vx,1.8,.55),trades:sig(tx,1.6,.5),buy:sig(c.buyRatio+Math.max(0,shift)*.7,60,6),momentum:sig(mom,.55,.3),compression:comp,resistance:Math.max(0,Math.min(100,100-Math.abs(dist)*45))};
 let score=cp.volume*.25+cp.trades*.17+cp.buy*.20+cp.momentum*.18+cp.compression*.10+cp.resistance*.10,late=e.ret>=cfg.late;if(late)score=Math.min(score,58);
 s.score=Math.round(score);s.status=late?"GEÇ KALINDI":score>=cfg.strong?"GÜÇLÜ ERKEN UYARI":score>=cfg.alert?"ERKEN UYARI":score>=58?"ADAY":"İZLENİYOR";s.m={w5:a,w10:b,w30:c,w60:d,w120:e,volX:vx,tradeX:tx,buyShift:shift,compression:comp,resistanceDistance:dist,components:cp}}
async function symbols(){let j=await(await fetch(SURL)).json();return(j?.data?.list||[]).filter(x=>x.quoteAsset==="TRY"&&(!x.status||x.status==="TRADING")).map(x=>(x.symbol||"").replaceAll("_","")).filter(Boolean).slice(0,cfg.max)}
function connect(list){let w=new WebSocket(WSS);w.on("open",()=>{let p=[];for(let s of list)p.push(s.toLowerCase()+"@aggTrade",s.toLowerCase()+"@kline_15m");for(let i=0;i<p.length;i+=60)w.send(JSON.stringify({method:"SUBSCRIBE",params:p.slice(i,i+60),id:i+1}))});
 w.on("message",r=>{let d;try{d=JSON.parse(r.toString());}catch{return}d=d.data||d;if(d.e==="aggTrade"){let s=S(d.s),p=+d.p,q=+d.q;s.tr.push({t:+(d.T||d.E||Date.now()),p,q:p*q,buy:!d.m});s.price=p;let cut=Date.now()-cfg.keepMs;while(s.tr.length&&s.tr[0].t<cut)s.tr.shift();calc(s)}else if(d.e==="kline"&&d.k){let s=S(d.s),k=d.k,x={t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+(k.q||k.v),n:+k.n},i=s.k.findIndex(y=>y.t===x.t);if(i>=0)s.k[i]=x;else s.k.push(x);s.k=s.k.slice(-12)}});
 w.on("close",()=>setTimeout(()=>connect(list),1500));w.on("error",()=>w.close())}
const server=app.listen(PORT,async()=>{console.log("TradeRadar http://localhost:"+PORT);let a=await symbols();console.log(a.length+" TRY paritesi");for(let i=0;i<a.length;i+=30)connect(a.slice(i,i+30))});
const ui=new WebSocket.Server({server,path:"/live"});ui.on("connection",w=>{clients.add(w);w.on("close",()=>clients.delete(w))});
setInterval(()=>{let rows=[...st.values()].filter(x=>x.price).sort((a,b)=>b.score-a.score).slice(0,30).map(x=>({symbol:x.symbol,price:x.price,score:x.score,status:x.status,metrics:x.m})),msg=JSON.stringify({type:"radar",at:Date.now(),rows});for(let w of clients)if(w.readyState===1)w.send(msg)},1000);
