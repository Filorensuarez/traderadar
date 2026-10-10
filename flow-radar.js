import WebSocket from "ws";
const symbols=(process.env.FLOW_SYMBOLS||"BTC_USDT,ETH_USDT,SOL_USDT,XRP_USDT,DOGE_USDT,ADA_USDT,LINK_USDT,AVAX_USDT,SUI_USDT,TON_USDT,NEAR_USDT,APT_USDT,ARB_USDT,OP_USDT,UNI_USDT,LTC_USDT,PEPE_USDT")
 .split(",").map(s=>s.trim().toUpperCase()).filter(s=>/^[A-Z0-9]{2,24}_USDT$/.test(s)).slice(0,100);
const buckets=new Map();let socket=null,connected=false,lastMessage=0,lastError=null,timer=null,heartbeat=null,started=false;
function addTrade(t){const list=buckets.get(t.symbol)||[];list.push(t);const cutoff=Date.now()-120000;
 while(list.length&&list[0].time<cutoff)list.shift();
 if(list.length>10000)list.splice(0,list.length-10000);buckets.set(t.symbol,list);}
function sum(list,from,to){let buy=0,sell=0,buys=0,sells=0;for(const t of list){
 if(t.time<from||t.time>=to)continue;
 if(t.side==="buy"){buy+=t.value;buys++;}else{sell+=t.value;sells++;}}
 return {buy,sell,buys,sells,total:buy+sell,count:buys+sells};}
export function flowSnapshot(){const now=Date.now();const rows=symbols.map(symbol=>{
 const list=buckets.get(symbol)||[];
 while(list.length&&list[0].time<now-120000)list.shift();
 const cur=sum(list,now-30000,now),prev=sum(list,now-90000,now-30000);
 const buyRatio=prev.buy>0?cur.buy/(prev.buy/2):null;
 const sellRatio=prev.sell>0?cur.sell/(prev.sell/2):null;
 const imbalance=cur.total>0?(cur.buy-cur.sell)/cur.total*100:0;
 const enough=cur.count>=5&&cur.total>=2000;
 let mode="VERİ YETERSİZ";
 if(enough&&buyRatio!==null&&buyRatio>=1.8&&imbalance>=25)mode="ALIŞ BASKISI ARTIYOR";
 else if(enough&&sellRatio!==null&&sellRatio>=1.8&&imbalance<=-25)mode="SATIŞ BASKISI ARTIYOR";
 else if(enough)mode="DENGELİ / İZLE";
 return {symbol:symbol.replace("_","/"),exchange:"GATE.IO",mode,
 buyUsdt:Math.round(cur.buy),sellUsdt:Math.round(cur.sell),
 buyCount:cur.buys,sellCount:cur.sells,
 buyAcceleration:buyRatio===null?null:Number(buyRatio.toFixed(2)),
 sellAcceleration:sellRatio===null?null:Number(sellRatio.toFixed(2)),
 imbalancePercent:Number(imbalance.toFixed(1)),trades30s:cur.count};
 });rows.sort((a,b)=>Number(b.mode.includes("ARTIYOR"))-Number(a.mode.includes("ARTIYOR"))||
 Math.abs(b.imbalancePercent)-Math.abs(a.imbalancePercent));
 return {connected,lastMessage,lastError,updatedAt:now,trackedSymbols:symbols.length,rows,
 notice:"Gerçekleşen agresif işlemler ölçülür; fiyatın gelecekteki yönü garanti edilmez."};}
function reconnect(){if(timer)return;timer=setTimeout(()=>{timer=null;connect();},5000);}
function connect(){if(!started)return;try{
 socket=new WebSocket("wss://api.gateio.ws/ws/v4/");
 socket.on("open",()=>{connected=true;lastError=null;
 socket.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:"spot.trades",event:"subscribe",payload:symbols}));
 clearInterval(heartbeat);heartbeat=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)
 socket.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:"spot.ping"}));},20000);});
 socket.on("message",raw=>{let m;try{m=JSON.parse(String(raw));}catch{return;}
 if(m.channel!=="spot.trades"||m.event!=="update")return;
 for(const t of Array.isArray(m.result)?m.result:[m.result]){
 if(!t)continue;const symbol=String(t.currency_pair||"").toUpperCase();
 if(!symbols.includes(symbol)||!["buy","sell"].includes(t.side))continue;
 const price=Number(t.price),amount=Number(t.amount);
 const time=Number.parseFloat(t.create_time_ms)*1000||Number(t.create_time)*1000||Date.now();
 if(!(price>0&&amount>0)||time>Date.now()+10000||time<Date.now()-120000)continue;
 addTrade({symbol,side:t.side,time,value:price*amount});lastMessage=Date.now();
 }});
 socket.on("error",e=>{lastError=e.message;});
 socket.on("close",()=>{connected=false;clearInterval(heartbeat);reconnect();});
 }catch(e){connected=false;lastError=e.message;reconnect();}}
export function startFlowRadar(){if(started)return;started=true;connect();}
