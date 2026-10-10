import {detectFastBuy} from "./fast-buy-detector.js";
import {eligibleMarketCap} from "./market-cap-filter.js";
import WebSocket from "ws";
let symbols=(process.env.FLOW_SYMBOLS||"BTC_USDT,ETH_USDT,SOL_USDT,XRP_USDT,DOGE_USDT,ADA_USDT,LINK_USDT,AVAX_USDT,SUI_USDT,TON_USDT,NEAR_USDT,APT_USDT,ARB_USDT,OP_USDT,UNI_USDT,LTC_USDT,PEPE_USDT")
 .split(",").map(s=>s.trim().toUpperCase()).filter(s=>/^[A-Z0-9]{2,24}_USDT$/.test(s)).slice(0,500);
// Discover active USDT markets. The bounded list is refreshed on reconnect.
async function discoverMarkets(){
 if(process.env.FLOW_SYMBOLS)return;
 try{
  const response=await fetch("https://api.gateio.ws/api/v4/spot/tickers",
    {signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("Market discovery HTTP "+response.status);
  const tickers=await response.json();
  const limit=Math.min(500,Math.max(20,Number(process.env.FLOW_MAX_SYMBOLS)||300));
  const next=tickers.filter(t=>/^[A-Z0-9]{2,24}_USDT$/.test(t.currency_pair||"")&&
    Number(t.quote_volume)>=1000&&eligibleMarketCap(t.currency_pair)!==null)
    .sort((a,b)=>Number(b.quote_volume)-Number(a.quote_volume))
    .slice(0,limit).map(t=>t.currency_pair);
  if(next.length)symbols=next;
 }catch(e){lastError="Piyasa keşfi: "+e.message;}
}
const buckets=new Map();let socket=null,connected=false,lastMessage=0,lastError=null,timer=null,heartbeat=null,started=false;
let subscribed=0,subscriptionError=null;
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
 const fast=detectFastBuy(list,now);
 return {symbol:symbol.replace("_","/"),exchange:"GATE.IO",mode,...fast,lastPrice:list.at(-1)?.price??null,
 buyUsdt:Math.round(cur.buy),sellUsdt:Math.round(cur.sell),
 buyCount:cur.buys,sellCount:cur.sells,
 buyAcceleration:buyRatio===null?null:Number(buyRatio.toFixed(2)),
 sellAcceleration:sellRatio===null?null:Number(sellRatio.toFixed(2)),
 imbalancePercent:Number(imbalance.toFixed(1)),trades30s:cur.count};
 });rows.sort((a,b)=>Number(b.mode.includes("ARTIYOR"))-Number(a.mode.includes("ARTIYOR"))||
 Math.abs(b.imbalancePercent)-Math.abs(a.imbalancePercent));
 return {connected,lastMessage,lastError,subscriptionError,subscribed,updatedAt:now,trackedSymbols:symbols.length,rows,
 notice:"Gerçekleşen agresif işlemler ölçülür; fiyatın gelecekteki yönü garanti edilmez."};}
function reconnect(){if(timer)return;timer=setTimeout(()=>{timer=null;connect();},5000);}
async function connect(){if(!started)return;try{
 await discoverMarkets();
 socket=new WebSocket("wss://api.gateio.ws/ws/v4/");
 socket.on("open",()=>{connected=true;lastError=null;
 for(let i=0;i<symbols.length;i+=25){socket.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:"spot.trades",event:"subscribe",payload:symbols.slice(i,i+25)}));}
 subscribed=symbols.length;
 clearInterval(heartbeat);heartbeat=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)
 socket.send(JSON.stringify({time:Math.floor(Date.now()/1000),channel:"spot.ping"}));},20000);});
 socket.on("message",raw=>{let m;try{m=JSON.parse(String(raw));}catch{return;}
 if(m.channel==="spot.trades"&&m.event==="subscribe"&&m.error){subscriptionError=JSON.stringify(m.error).slice(0,250);return;}
 if(m.channel!=="spot.trades"||m.event!=="update")return;
 for(const t of Array.isArray(m.result)?m.result:[m.result]){
 if(!t)continue;const symbol=String(t.currency_pair||"").toUpperCase();
 if(!symbols.includes(symbol)||!["buy","sell"].includes(t.side))continue;
 const price=Number(t.price),amount=Number(t.amount);
 const time=Number.parseFloat(t.create_time_ms)||Number(t.create_time)*1000||Date.now();
 if(!(price>0&&amount>0)||time>Date.now()+10000||time<Date.now()-120000)continue;
 addTrade({symbol,side:t.side,time,value:price*amount,price});lastMessage=Date.now();
 }});
 socket.on("error",e=>{lastError=e.message;});
 socket.on("close",()=>{connected=false;clearInterval(heartbeat);reconnect();});
 }catch(e){connected=false;lastError=e.message;reconnect();}}
export function startFlowRadar(){if(started)return;started=true;connect();}


// First-reaction detector: completed trade events, rolling windows in milliseconds.
export function firstReactionSnapshot(){
 const now=Date.now(), rows=[];
 for(const symbol of symbols){
  const trades=(buckets.get(symbol)||[]).filter(t=>t.time>=now-120000&&t.time<=now);
  const latest=trades.at(-1);
  if(!latest||now-latest.time>10000)continue;
  const recent=trades.filter(t=>t.time>=now-10000);
  const previous=trades.filter(t=>t.time>=now-70000&&t.time<now-10000);
  const short=trades.filter(t=>t.time>=now-5000);
  const first10=recent[0], first30=trades.find(t=>t.time>=now-30000);
  if(!first10||!first30||previous.length<8||recent.length<3)continue;
  const volume=a=>a.reduce((sum,t)=>sum+t.value,0);
  const buy=a=>volume(a.filter(t=>t.side==="buy"));
  const currentVolume=volume(recent), baseline=volume(previous)/6;
  const acceleration=baseline>0?currentVolume/baseline:0;
  const buyValue=buy(recent), buyShare=currentVolume?buyValue/currentVolume:0;
  const change10=(latest.price/first10.price-1)*100;
  const change30=(latest.price/first30.price-1)*100;
  const shortChange=short.length>=2?(latest.price/short[0].price-1)*100:0;
  const enough=currentVolume>=500&&recent.length>=3&&acceleration>=2.5&&buyShare>=0.65;
  let status=null;
  if(enough&&change10>=0.25&&change10<=2.5&&shortChange>0)status="İLK HAREKET";
  if(enough&&change30>=0.6&&change30<=4&&acceleration>=4&&buyShare>=0.72)status="YÜKSELİŞ TEYİDİ";
  if(status)rows.push({symbol:symbol.replace("_","/"),exchange:"GATE.IO",status,
   price:latest.price,change5Pct:Number(shortChange.toFixed(2)),
   change10Pct:Number(change10.toFixed(2)),change30Pct:Number(change30.toFixed(2)),
   volumeAcceleration:Number(acceleration.toFixed(2)),buySharePct:Number((buyShare*100).toFixed(1)),
   trades10s:recent.length,observedAt:latest.time});
 }
 rows.sort((a,b)=>b.volumeAcceleration-a.volumeAcceleration);
 return {connected,updatedAt:now,lastMessage,trackedSymbols:symbols.length,rows:rows.slice(0,100),
  lastError,notice:"Gate.io işlem akışı. En az 60 saniye referans veri gerekir; tüm borsalar ve tüm coinler kapsanmaz."};
}
