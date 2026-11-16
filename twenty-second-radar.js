import WebSocket from "ws";
const seen=new Map(),hits=new Map(),checking=new Set();
let connected=false,lastMessage=0,lastError=null,ws=null;
const MAX_CHECKS=6;
async function candles(symbol,interval,limit){
 const url="https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval="+interval+"&limit="+limit;
 const r=await fetch(url,{signal:AbortSignal.timeout(7000)});
 if(!r.ok)throw Error("Binance HTTP "+r.status);
 const data=await r.json();if(!Array.isArray(data))throw Error("Geçersiz mum yanıtı");return data;
}
async function verify(symbol){
 if(checking.has(symbol)||checking.size>=MAX_CHECKS)return;
 checking.add(symbol);
 try{
  const [seconds,fives]=await Promise.all([candles(symbol,"1s",26),candles(symbol,"5m",3)]);
  const now=Date.now();
  const closedSeconds=seconds.filter(x=>Number(x[6])<now).slice(-20);
  const closedFive=fives.filter(x=>Number(x[6])<now).at(-1);
  if(closedSeconds.length!==20||!closedFive)return;
  // The comparison uses the last completed 5-minute candle close, never the live 5m candle.
  const baseline=Number(closedFive[4]);
  const peak=Math.max(...closedSeconds.map(x=>Number(x[2])));
  const latest=Number(closedSeconds.at(-1)[4]);
  const change=100*(peak/baseline-1);
  if(!(baseline>0&&peak>0&&Number.isFinite(change)))return;
  if(change>=2){
   hits.set(symbol,{symbol:symbol.replace(/USDT$/,"/USDT"),exchange:"BINANCE GLOBAL",
    referenceClose:baseline,peakPrice:peak,lastPrice:latest,changePct:+change.toFixed(3),
    detectedAt:now,windowSeconds:20,reference:"Son kapanmış 5 dakikalık mum",status:"%2 EŞİĞİ AŞILDI"});
  }
 }catch(e){lastError=String(e.message||e);}
 finally{checking.delete(symbol);}
}
function connect(){
 ws=new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");
 ws.on("open",()=>{connected=true;lastError=null;});
 ws.on("message",raw=>{
  try{
   const batch=JSON.parse(String(raw));if(!Array.isArray(batch))return;
   const now=Date.now();lastMessage=now;
   for(const t of batch){
    const symbol=String(t.s||""),price=Number(t.c);
    if(!/^[A-Z0-9]+USDT$/.test(symbol)||!(price>0))continue;
    let state=seen.get(symbol);
    if(!state){state={points:[],lastCheck:0};seen.set(symbol,state);}
    state.points.push({t:now,p:price});
    while(state.points.length>1&&state.points[0].t<now-25000)state.points.shift();
    const base=state.points.find(x=>x.t<=now-15000);
    // Preliminary acceleration only; final alert requires genuine closed 1s candles.
    if(base&&price/base.p>=1.005&&now-state.lastCheck>20000&&checking.size<MAX_CHECKS){
     state.lastCheck=now;void verify(symbol);
    }
   }
  }catch(e){lastError=String(e.message||e);}
 });
 ws.on("error",e=>{lastError=e.message;});
 ws.on("close",()=>{connected=false;setTimeout(connect,5000);});
}
export function startTwentySecondRadar(){connect();}
export function twentySecondSnapshot(){
 const now=Date.now();
 for(const [key,value] of hits)if(now-value.detectedAt>300000)hits.delete(key);
 return {connected,lastMessage,lastError,trackedSymbols:seen.size,checking:checking.size,
  rows:[...hits.values()].sort((a,b)=>b.changePct-a.changePct).slice(0,100),
  note:"Son 20 tamamlanmış 1 saniyelik mumun en yüksek fiyatı, son kapanmış 5 dakikalık mumun kapanışından en az %2 yukarıda. Ön eleme nedeniyle tüm hareketlerin yakalanması garanti edilmez."};
}
