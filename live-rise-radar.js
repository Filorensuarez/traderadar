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

function observe(source, symbol, value, at=Date.now()) {
  const price=Number(value);
  if(!Number.isFinite(price)||price<=0||!/USDT$/.test(symbol))return;
  const key=source+":"+symbol;
  const points=history.get(key)||[];
  points.push({t:at,p:price});
  while(points.length>1&&points[0].t<at-65000)points.shift();
  history.set(key,points);
  feeds[source].updatedAt=at;
  const base10=points.find(x=>x.t<=at-10000);
  const base60=points.find(x=>x.t<=at-60000);
  const p10=base10?(price/base10.p-1)*100:null;
  const p60=base60?(price/base60.p-1)*100:null;
  // Confirm movement with an observed baseline, never 24-hour ticker percentage.
  const qualifies=(p10!==null&&p10>=0.5)||(p60!==null&&p60>=1);
  if(!qualifies||at-(cooldown.get(key)||0)<120000)return;
  cooldown.set(key,at);
  alerts.unshift({source:feeds[source].name,symbol:symbol.replace(/USDT$/,"/USDT"),price,currency:"USDT",change10s:p10===null?null:+p10.toFixed(2),change60s:p60===null?null:+p60.toFixed(2),detectedAt:at,status:"ERKEN HAREKET"});
  if(alerts.length>100)alerts.length=100;
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
export function liveRiseSnapshot(){return {ok:true,updatedAt:Date.now(),feeds,rows:alerts.slice(0,60),thresholds:{tenSeconds:0.5,sixtySeconds:1},note:"Canlı fiyat ivmesi uyarısıdır; günlük teknik yükseliş teyidi değildir."};}
