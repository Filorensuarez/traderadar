import WebSocket from "ws";
let socket=null,connected=false,error=null,lastMessage=0,started=false;
let symbols=[];const trades=new Map();let pingTimer=null;let retryDelay=15000;
async function connect(){
 try{
  const response=await fetch("https://api.kucoin.com/api/v1/bullet-public",{method:"POST",signal:AbortSignal.timeout(15000)});
  if(response.status===429)throw Error("KuCoin rate limit (429)");
  if(!response.ok)throw Error("KuCoin token HTTP "+response.status);
  const body=await response.json(),server=body.data?.instanceServers?.[0];
  if(!server)throw Error("KuCoin token unavailable");
  const tickerResponse=await fetch("https://api.kucoin.com/api/v1/market/allTickers",
   {signal:AbortSignal.timeout(15000)});
  if(tickerResponse.status===429)throw Error("KuCoin rate limit (429)");
  if(!tickerResponse.ok)throw Error("KuCoin ticker HTTP "+tickerResponse.status);
  const tickers=await tickerResponse.json();
  symbols=(tickers.data?.ticker||[]).filter(t=>/^[A-Z0-9]+-USDT$/.test(t.symbol)&&
   Number(t.volValue)>=50000)
   .sort((a,b)=>Number(b.volValue)-Number(a.volValue)).slice(0,100).map(t=>t.symbol);
  if(!symbols.length)throw Error("KuCoin uygun USDT piyasası bulunamadı");
  socket=new WebSocket(server.endpoint+"?token="+encodeURIComponent(body.data.token));
  socket.on("open",()=>{connected=true;error=null;retryDelay=15000;
   socket.send(JSON.stringify({id:String(Date.now()),type:"subscribe",
    topic:"/market/match:"+symbols.join(","),response:true,privateChannel:false}));
  });
  socket.on("message",raw=>{
   let m;try{m=JSON.parse(String(raw));}catch{return;}
   if(m.subject!=="trade.l3match")return;
   const d=m.data||{},p=Number(d.price),size=Number(d.size),time=Number(d.time)/1e6;
   if(!symbols.includes(d.symbol)||!["buy","sell"].includes(d.side)||!(p>0&&size>0))return;
   if(Math.abs(Date.now()-time)>120000)return;
   const list=trades.get(d.symbol)||[];
   list.push({time,side:d.side,value:p*size});
   while(list.length&&list[0].time<Date.now()-120000)list.shift();
   trades.set(d.symbol,list);lastMessage=Date.now();
  });
  socket.on("error",e=>{error=e.message;});
  socket.on("close",()=>{connected=false;clearInterval(pingTimer);if(started)setTimeout(connect,retryDelay);});
  clearInterval(pingTimer);pingTimer=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)
   socket.send(JSON.stringify({id:String(Date.now()),type:"ping"}));},18000);
 }catch(e){error=e.message;connected=false;
  retryDelay=Math.min(300000,Math.max(15000,retryDelay*2));
  if(started)setTimeout(connect,retryDelay);
 }
}
export function startKucoinFlow(){if(started)return;started=true;connect();}
export function kucoinFlowSnapshot(){
 const now=Date.now();
 const rows=symbols.map(symbol=>{
  const list=trades.get(symbol)||[];
  let buy=0,sell=0,oldBuy=0,oldSell=0,count=0;
  for(const t of list){
   if(t.time>=now-30000){if(t.side==="buy")buy+=t.value;else sell+=t.value;count++;}
   else if(t.time>=now-90000){if(t.side==="buy")oldBuy+=t.value;else oldSell+=t.value;}
  }
  const buyAcceleration=oldBuy?buy/(oldBuy/2):null;
  const sellAcceleration=oldSell?sell/(oldSell/2):null;
  const imbalance=buy+sell?(buy-sell)/(buy+sell)*100:0;
  const enough=count>=5&&buy+sell>=2000;
  const mode=!enough?"VERİ YETERSİZ":buyAcceleration>=1.8&&imbalance>=25?
   "ALIŞ BASKISI ARTIYOR":sellAcceleration>=1.8&&imbalance<=-25?
   "SATIŞ BASKISI ARTIYOR":"DENGELİ / İZLE";
  return {symbol:symbol.replace("-","/"),exchange:"KUCOIN",mode,buyUsdt:Math.round(buy),
   sellUsdt:Math.round(sell),buyAcceleration,sellAcceleration,
   imbalancePercent:Number(imbalance.toFixed(1)),trades30s:count};
 });
 return {connected,lastMessage,lastError:error,trackedSymbols:symbols.length,rows};
}
