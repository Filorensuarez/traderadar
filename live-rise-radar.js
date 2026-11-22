import {assessEntryRisk} from "./entry-risk.js";
import WebSocket from "ws";

const feeds = {
  binance: {name:"BINANCE GLOBAL",connected:false,error:null,updatedAt:0,tracked:0},
  okx: {name:"OKX GLOBAL",connected:false,error:null,updatedAt:0,tracked:0}
};
const history = new Map();
const alerts = [];
const cooldown = new Map();
const sockets = new Set();
let started = false;

const strongest = new Map();
const windows=[5,10,20,60];
function observe(source,symbol,value,at=Date.now()){
 const price=Number(value);
 if(!Number.isFinite(price)||price<=0||!/USDT$/.test(symbol))return;
 const key=source+":"+symbol,points=history.get(key)||[];
 // Retain one price per second; all incoming updates are still evaluated immediately.
 if(points.length&&Math.floor(points.at(-1).t/1000)===Math.floor(at/1000))points[points.length-1]={t:at,p:price};
 else points.push({t:at,p:price});
 while(points.length>1&&points[0].t<at-65000)points.shift();
 history.set(key,points);feeds[source].updatedAt=at;
 const changes={};
 for(const seconds of windows){
  const base=points.find(x=>x.t<=at-seconds*1000);
  changes[seconds]=base?100*(price/base.p-1):null;
 }
 // Detect from the observed price baseline, irrespective of daily red/green status.
 const qualifies=(changes[5]!==null&&changes[5]>=0.18)||(changes[10]!==null&&changes[10]>=0.3)||(changes[20]!==null&&changes[20]>=0.5)||(changes[60]!==null&&changes[60]>=1);
 const score=Math.max(...windows.map(w=>changes[w]===null?0:changes[w]/Math.sqrt(w)));
 if(qualifies){
  const row={source:feeds[source].name,symbol:symbol.replace(/USDT$/,"/USDT"),price,currency:"USDT",
   change5s:changes[5]===null?null:+changes[5].toFixed(3),
   change10s:changes[10]===null?null:+changes[10].toFixed(3),
   change20s:changes[20]===null?null:+changes[20].toFixed(3),
   change60s:changes[60]===null?null:+changes[60].toFixed(3),
   score:+score.toFixed(4),detectedAt:at,status:"ANLIK YÜKSELİŞ",buyPressure:"DOĞRULANMADI"};
  strongest.set(key,row);
  if(at-(cooldown.get(key)||0)>=30000){
   cooldown.set(key,at);
   alerts.unshift({...row,entryRisk:assessEntryRisk(points,at)});
   if(alerts.length>150)alerts.length=150;
  }
 }else strongest.delete(key);
}
function attach(ws,source,onMessage,onClose){
  sockets.add(ws);
  ws.on("open",()=>{feeds[source].connected=true;feeds[source].error=null;});
  ws.on("message",data=>{try{onMessage(JSON.parse(data.toString()),ws);}catch(e){feeds[source].error="Veri ayrıştırma: "+e.message;}});
  ws.on("error",e=>{feeds[source].error=e.message;});
  ws.on("close",()=>{sockets.delete(ws);onClose();});
  const ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.ping();},25000);
  ws.on("close",()=>clearInterval(ping));
}
function binance(){
  const ws=new WebSocket("wss://stream.binance.com:9443/ws/!miniTicker@arr");
  attach(ws,"binance",msg=>{
    if(!Array.isArray(msg))return;
    for(const x of msg)observe("binance",x.s,x.c);
    feeds.binance.tracked=[...history.keys()].filter(k=>k.startsWith("binance:")).length;
  },()=>{feeds.binance.connected=false;setTimeout(binance,5000);});
}
async function okx(){
  try{
    const response=await fetch("https://eea.okx.com/api/v5/public/instruments?instType=SPOT",{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error("OKX Avrupa HTTP "+response.status);
    const json=await response.json();
    if(json.code!=="0"||!Array.isArray(json.data))throw Error("OKX Avrupa sembol listesi alınamadı");
    const symbols=json.data.filter(x=>x.quoteCcy==="USDT"&&x.state==="live").map(x=>x.instId);
    if(!symbols.length)throw Error("OKX Avrupa USDT çifti bulunamadı");
    feeds.okx.tracked=symbols.length;
    const chunks=[];for(let i=0;i<symbols.length;i+=75)chunks.push(symbols.slice(i,i+75));
    for(const chunk of chunks){
      const ws=new WebSocket("wss://wseea.okx.com:8443/ws/v5/public");
      attach(ws,"okx",msg=>{
        if(msg.event==="error"){feeds.okx.error=msg.msg||"OKX abonelik hatası";return;}
        if(msg.arg?.channel!=="tickers"||!Array.isArray(msg.data))return;
        for(const x of msg.data)observe("okx",x.instId.replace("-",""),x.last);
      },()=>{feeds.okx.connected=[...sockets].some(s=>s.url.includes("okx")&&s.readyState===WebSocket.OPEN);setTimeout(okxRestart,5000);});
      ws.on("open",()=>ws.send(JSON.stringify({op:"subscribe",args:chunk.map(instId=>({channel:"tickers",instId}))})));
    }
  }catch(e){feeds.okx.connected=false;feeds.okx.error=e.message;setTimeout(okx,30000);}
}
let okxRestartTimer;
function okxRestart(){
  if(okxRestartTimer)return;
  okxRestartTimer=setTimeout(()=>{
    okxRestartTimer=null;
    for(const ws of [...sockets])if(ws.url.includes("okx")){ws.removeAllListeners("close");ws.on("close",()=>sockets.delete(ws));ws.terminate();sockets.delete(ws);}
    okx();
  },1000);
}
export function startLiveRise(){if(started)return;started=true;binance();okx();}
export function liveRiseSnapshot(){
 const now=Date.now();
 for(const [key,row] of strongest)if(now-row.detectedAt>8000)strongest.delete(key);
 return {ok:true,updatedAt:now,feeds,trackedSymbols:history.size,
 rows:[...strongest.values()].sort((a,b)=>b.score-a.score).slice(0,100),
 recentAlerts:alerts.filter(x=>now-x.detectedAt<180000).slice(0,100),
 thresholds:{fiveSeconds:0.18,tenSeconds:0.3,twentySeconds:0.5,sixtySeconds:1},
 note:"Canlı fiyat değişimleri; alış baskısı yalnız fiyat verisiyle doğrulanamaz. Borsa güncellemeleri gecikebilir."};
}
