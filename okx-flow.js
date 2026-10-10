import WebSocket from "ws";
// OKX public trades feed; a trade side identifies the aggressive taker.
let ws=null,connected=false,lastMessage=0,error=null,started=false;
let markets=[],timer=null;const trades=new Map();
async function discover(){
 const response=await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT",
  {signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("OKX discovery HTTP "+response.status);
 const json=await response.json();
 markets=(json.data||[]).filter(t=>/^[A-Z0-9]+-USDT$/.test(t.instId)&&Number(t.volCcy24h)>=50000)
  .sort((a,b)=>Number(b.volCcy24h)-Number(a.volCcy24h)).slice(0,150).map(t=>t.instId);
}
function connect(){
 if(!started)return;
 discover().then(()=>{
  ws=new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
  ws.on("open",()=>{
   connected=true;error=null;
   for(let i=0;i<markets.length;i+=20){
    ws.send(JSON.stringify({op:"subscribe",args:markets.slice(i,i+20).map(instId=>({channel:"trades",instId}))}));
   }
  });
  ws.on("message",raw=>{
   const str=String(raw);if(str==="pong")return;
   let msg;try{msg=JSON.parse(str);}catch{return;}
   if(msg.event==="error"){error=msg.msg;return;}
   if(msg.arg?.channel!=="trades")return;
   for(const t of msg.data||[]){
    const price=Number(t.px),amount=Number(t.sz),time=Number(t.ts);
    if(!(price>0&&amount>0)||!["buy","sell"].includes(t.side)||Math.abs(Date.now()-time)>120000)continue;
    const key=String(t.instId),list=trades.get(key)||[];
    list.push({time,side:t.side,value:price*amount});
    while(list.length&&list[0].time<Date.now()-120000)list.shift();
    if(list.length>10000)list.splice(0,list.length-10000);
    trades.set(key,list);lastMessage=Date.now();
   }
  });
  ws.on("error",e=>{error=e.message;});
  ws.on("close",()=>{connected=false;if(started){clearTimeout(timer);timer=setTimeout(connect,5000);}});
  const ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send("ping");else clearInterval(ping);},20000);
 }).catch(e=>{connected=false;error=e.message;timer=setTimeout(connect,10000);});
}
export function startOkxFlow(){if(started)return;started=true;connect();}
export function okxFlowSnapshot(){
 const now=Date.now(),rows=[];
 for(const symbol of markets){
  const list=trades.get(symbol)||[];
  let buy=0,sell=0,oldBuy=0,oldSell=0,count=0;
  for(const t of list){
   if(t.time>=now-30000){if(t.side==="buy")buy+=t.value;else sell+=t.value;count++;}
   else if(t.time>=now-90000){if(t.side==="buy")oldBuy+=t.value;else oldSell+=t.value;}
  }
  const buyAcceleration=oldBuy>0?buy/(oldBuy/2):null;
  const sellAcceleration=oldSell>0?sell/(oldSell/2):null;
  const imbalance=(buy+sell)>0?(buy-sell)/(buy+sell)*100:0;
  const enough=count>=5&&buy+sell>=2000;
  const mode=!enough?"VERİ YETERSİZ":
   buyAcceleration>=1.8&&imbalance>=25?"ALIŞ BASKISI ARTIYOR":
   sellAcceleration>=1.8&&imbalance<=-25?"SATIŞ BASKISI ARTIYOR":"DENGELİ / İZLE";
  rows.push({symbol:symbol.replace("-","/"),exchange:"OKX",mode,
   buyUsdt:Math.round(buy),sellUsdt:Math.round(sell),buyAcceleration,sellAcceleration,
   imbalancePercent:Number(imbalance.toFixed(1)),trades30s:count});
 }
 return {connected,lastMessage,lastError:error,trackedSymbols:markets.length,rows};
}
