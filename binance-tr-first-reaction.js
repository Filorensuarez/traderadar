import WebSocket from "ws";
const state={connected:false,updatedAt:0,lastMessage:0,lastError:null,trackedSymbols:0,rows:[]};
const buffers=new Map(),seen=new Map();
let started=false,sockets=[],retry=null;
const pinned=["ERA_TRY","CFX_TRY","ARPA_TRY"];
export function binanceTrSnapshot(){
 const now=Date.now();
 return {...state,updatedAt:now,rows:state.rows.filter(x=>now-x.observedAt<45000)};
}
function measure(symbol){
 const now=Date.now(),a=(buffers.get(symbol)||[]).filter(x=>now-x.t<=90000);
 if(!a.length)return;
 buffers.set(symbol,a);
 const recent=a.filter(x=>now-x.t<=10000),base=a.filter(x=>now-x.t>10000&&now-x.t<=70000);
 const last=recent.at(-1),start=recent[0],p30=a.find(x=>now-x.t<=30000);
 if(!last||!start||!p30||base.length<8||recent.length<3)return;
 const total=x=>x.reduce((n,t)=>n+t.v,0);
 const cur=total(recent),old=total(base)/6,buys=total(recent.filter(x=>x.buy));
 if(old<=0||cur<1000)return;
 const ratio=cur/old,share=buys/cur*100,chg=(last.p/start.p-1)*100,chg30=(last.p/p30.p-1)*100;
 let status=null;
 if(ratio>=2.5&&share>=65&&chg>=0.25&&chg<=2.5)status="İLK HAREKET";
 if(ratio>=4&&share>=72&&chg30>=0.6&&chg30<=4)status="YÜKSELİŞ TEYİDİ";
 if(!status)return;
 const key=symbol+":"+status;
 if(now-(seen.get(key)||0)<20000)return;
 seen.set(key,now);
 const row={symbol:symbol.replace("_","/"),exchange:"BINANCE TR",status,price:last.p,
 change10Pct:+chg.toFixed(2),change30Pct:+chg30.toFixed(2),volumeAcceleration:+ratio.toFixed(2),
 buySharePct:+share.toFixed(1),trades10s:recent.length,observedAt:now};
 state.rows=[row,...state.rows.filter(x=>x.symbol!==row.symbol||x.status!==status)].slice(0,100);
}
async function discover(){
 const r=await fetch("https://www.binance.tr/open/v1/common/symbols",{signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error("Binance TR symbols HTTP "+r.status);
 const data=await r.json(),list=data?.data?.list;
 if(!Array.isArray(list))throw Error("TRY parite listesi alınamadı");
 const result=list.filter(x=>String(x.quoteAsset||"").toUpperCase()==="TRY"&&
  (x.symbolType===1||x.symbolType==="1"||x.symbolType==null))
  .map(x=>String(x.symbol||x.name||"").toUpperCase().replace(/_/g,""))
  .filter(x=>/^[A-Z0-9]+TRY$/.test(x));
 return [...new Set([...result,...pinned.map(x=>x.replace("_",""))])];
}
async function connect(){
 try{
  const symbols=await discover();
  if(!symbols.length)throw Error("TRY piyasası bulunamadı");
  state.trackedSymbols=symbols.length;
  for(const ws of sockets)ws.terminate();
  sockets=[];
  for(let i=0;i<symbols.length;i+=80){
   const batch=symbols.slice(i,i+80);
   const url="wss://stream-cloud.binance.tr/stream?streams="+batch.map(x=>x.toLowerCase()+"@trade").join("/");
   const ws=new WebSocket(url);sockets.push(ws);
   ws.on("open",()=>{state.connected=true;state.lastError=null;});
   ws.on("message",raw=>{
    let event;try{event=JSON.parse(String(raw)).data;}catch{return;}
    if(!event||event.e!=="trade")return;
    const symbol=String(event.s||"").toUpperCase();
    const p=Number(event.p),q=Number(event.q),t=Number(event.T)||Date.now();
    if(!(p>0&&q>0)||t>Date.now()+10000||t<Date.now()-90000)return;
    const a=buffers.get(symbol)||[];a.push({t,p,v:p*q,buy:event.m===false});
    if(a.length>15000)a.splice(0,a.length-15000);
    buffers.set(symbol,a);state.lastMessage=Date.now();measure(symbol);
   });
   ws.on("error",e=>{state.lastError=e.message;});
   ws.on("close",()=>{state.connected=false;if(!retry)retry=setTimeout(()=>{retry=null;connect();},5000);});
  }
 }catch(e){state.connected=false;state.lastError=e.message;if(!retry)retry=setTimeout(()=>{retry=null;connect();},15000);}
}
export function startBinanceTrFirstReaction(){if(started)return;started=true;connect();}
