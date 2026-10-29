import WebSocket from "ws";

// Lightweight, bounded live monitor for symbols already shortlisted by candle analysis.
const live=new Map();
let socket=null,selected=[],lastConnect=0,retryTimer=null,failures=0,disabledUntil=0;
const MAX_SYMBOLS=12,WINDOW_MS=10000;
const trim=(a,t)=>{while(a.length&&a[0].t<t-WINDOW_MS)a.shift();};
export function liveTouchSnapshot(){
 const now=Date.now();
 return {connected:socket?.readyState===WebSocket.OPEN,tracked:[...selected],rows:[...live.entries()].map(([market,v])=>{
  trim(v.trades,now);
  const total=v.trades.reduce((s,x)=>s+x.q,0);
  const buys=v.trades.reduce((s,x)=>s+(x.buy?x.q:0),0);
  const buyRatio=total>0?buys/total:0;
  const bid=v.bid||0,ask=v.ask||0;
  const imbalance=bid+ask>0?bid/(bid+ask):0;
  const first=v.trades[0]?.p,last=v.trades.at(-1)?.p;
  const movePct=first&&last?(last/first-1)*100:0;
  const active=now-v.updated<15000;
  return {market,active,buyRatio:Number(buyRatio.toFixed(3)),imbalance:Number(imbalance.toFixed(3)),
   quoteVolume10s:Number(total.toFixed(2)),movePct:Number(movePct.toFixed(3)),
   warning:active&&v.trades.length>=5&&total>=5000&&buyRatio>=0.65&&imbalance>=0.58&&movePct>=0.15,
   updatedAt:v.updated};
 }).sort((a,b)=>Number(b.warning)-Number(a.warning)||b.quoteVolume10s-a.quoteVolume10s)};
}
export function setLiveTouchSymbols(markets=[]){
 const next=[...new Set(markets.filter(x=>/^[A-Z0-9]{2,20}(USDT|TRY)$/.test(x)))].slice(0,MAX_SYMBOLS);
 if(next.join(",")===selected.join(",")&&socket)return;
 if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
 selected=next;
 const previous=socket;socket=null;
 if(previous){
  // Never remove the error listener before terminating a CONNECTING socket.
  // ws emits an asynchronous error in this state; without a listener it crashes Node.
  previous.removeAllListeners("message");
  previous.removeAllListeners("close");
  previous.on("error",e=>console.warn("Eski temas bağlantısı:",e.message));
  try{previous.terminate();}catch(e){console.warn("Temas bağlantısı kapatma:",e.message);}
 }
 for(const key of live.keys())if(!selected.includes(key))live.delete(key);
 if(!selected.length)return;
 if(Date.now()<disabledUntil)return;
 const streams=selected.flatMap(x=>[x.toLowerCase()+"@aggTrade",x.toLowerCase()+"@depth5@100ms"]).join("/");
 const ws=new WebSocket("wss://stream.binance.com:9443/stream?streams="+streams);
 socket=ws;lastConnect=Date.now();
 ws.on("open",()=>{failures=0;disabledUntil=0;});
 ws.on("message",raw=>{
  try{
   const msg=JSON.parse(String(raw)),data=msg.data||{},market=String(data.s||String(msg.stream||"").split("@")[0]).toUpperCase();
   if(!selected.includes(market))return;
   const v=live.get(market)||{trades:[],bid:0,ask:0,updated:0};
   if(data.e==="aggTrade"){
    const p=Number(data.p),q=Number(data.q);
    if(p>0&&q>0){v.trades.push({t:Number(data.T)||Date.now(),p,q:p*q,buy:!data.m});trim(v.trades,Date.now());}
   }else if(Array.isArray(data.bids)&&Array.isArray(data.asks)){
    v.bid=data.bids.slice(0,5).reduce((s,x)=>s+Number(x[0])*Number(x[1]),0);
    v.ask=data.asks.slice(0,5).reduce((s,x)=>s+Number(x[0])*Number(x[1]),0);
   }
   v.updated=Date.now();live.set(market,v);
  }catch{}
 });
 ws.on("error",e=>{
  console.warn("Temas canlı akış:",e.message);
  failures=Math.min(12,failures+1);
  if(/451|403|429/.test(e.message))disabledUntil=Date.now()+30*60000;
 });
 ws.on("close",()=>{
  if(socket!==ws)return;
  socket=null;
  if(!selected.length)return;
  const wait=Math.max(5000,Math.min(120000,5000*2**Math.min(failures,5)),disabledUntil-Date.now());
  retryTimer=setTimeout(()=>{retryTimer=null;if(!socket&&selected.length)setLiveTouchSymbols([...selected]);},wait);
 });
}
