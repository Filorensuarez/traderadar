// Sub-minute price radar. Watchlist only: never places orders.
// Tracks independent USDT spot markets, with exchange-specific prices.
const INTERVAL_MS=10000;
const MIN_DAY_QUOTE=1000000;
const MAX_CONFIRM_PER_EXCHANGE=5;
const providers=[
 {name:"BINANCE",kind:"binance",base:"https://data-api.binance.vision"},
 {name:"OKX",kind:"okx",base:"https://www.okx.com"},
 {name:"KUCOIN",kind:"kucoin",base:"https://api.kucoin.com"},
 {name:"GATE.IO",kind:"gate",base:"https://api.gateio.ws"},
 {name:"BITGET",kind:"bitget",base:"https://api.bitget.com"}
];
const state={running:false,updatedAt:0,intervalSeconds:INTERVAL_MS/1000,checked:0,eligible:0,
 confirmed:0,early:0,late:0,rows:[],sources:{},notice:"Anlık fiyat örnekleri kapanmış 1 dakikalık mumların tamamlanmasını beklemez. ALIM TEYİDİ yalnızca hız, makas ve gerçek dakika hacmi birlikte doğrulanırsa gösterilir. Bunlar sanal izleme uyarılarıdır, emir değildir."};
const samples=new Map();
const firstSeen=new Map();
const blockedUntil=new Map();
const now=()=>Date.now();
const number=x=>Number(x);
const fix=(n,d=2)=>Number(n.toFixed(d));
const isSpot=s=>/^[A-Z0-9]+(?:-|_)USDT$/.test(s)||/^[A-Z0-9]+USDT$/.test(s);
const leveraged=s=>/(UP|DOWN|BULL|BEAR|[235][SL])(?:-|_)?USDT$/i.test(s);
async function json(url,name){
 const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
 if(r.status===429||r.status===418){blockedUntil.set(name,now()+60000);throw Error("Hız sınırı "+r.status);}
 if(!r.ok)throw Error("HTTP "+r.status);
 return r.json();
}
const row=(symbol,price,bid,ask,vol)=>({symbol,price:number(price),bid:number(bid),ask:number(ask),volume24h:number(vol)});
async function getTickers(p){
 let rows=[];
 if(p.kind==="binance"){
  const a=await json(p.base+"/api/v3/ticker/24hr",p.name);
  if(!Array.isArray(a))throw Error("Binance ticker verisi yok");
  rows=a.map(x=>row(x.symbol,x.lastPrice,x.bidPrice,x.askPrice,x.quoteVolume));
 }else if(p.kind==="okx"){
  const a=await json(p.base+"/api/v5/market/tickers?instType=SPOT",p.name);
  if(a.code!=="0"||!Array.isArray(a.data))throw Error(a.msg||"OKX ticker verisi yok");
  rows=a.data.map(x=>row(x.instId,x.last,x.bidPx,x.askPx,x.volCcy24h));
 }else if(p.kind==="kucoin"){
  const a=await json(p.base+"/api/v1/market/allTickers",p.name);
  if(a.code!=="200000"||!Array.isArray(a.data?.ticker))throw Error(a.msg||"KuCoin ticker verisi yok");
  rows=a.data.ticker.map(x=>row(x.symbol,x.last,x.buy,x.sell,x.volValue));
 }else if(p.kind==="gate"){
  const a=await json(p.base+"/api/v4/spot/tickers",p.name);
  if(!Array.isArray(a))throw Error("Gate ticker verisi yok");
  rows=a.map(x=>row(x.currency_pair,x.last,x.highest_bid,x.lowest_ask,x.quote_volume));
 }else if(p.kind==="bitget"){
  const a=await json(p.base+"/api/v3/market/tickers?category=SPOT",p.name);
  if(a.code!=="00000"||!Array.isArray(a.data))throw Error(a.msg||"Bitget ticker verisi yok");
  rows=a.data.filter(x=>!x.category||x.category==="SPOT")
   .map(x=>row(x.symbol,x.lastPrice,x.bid1Price,x.ask1Price,x.turnover24h));
 }
 return rows.filter(t=>isSpot(t.symbol)&&!leveraged(t.symbol)&&t.price>0&&
  t.volume24h>=MIN_DAY_QUOTE&&t.bid>0&&t.ask>=t.bid&&
  (t.ask-t.bid)/t.ask*100<=0.5);
}
async function getCandles(p,s){
 let a,rows;
 if(p.kind==="binance"){
  a=await json(p.base+"/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval=1m&limit=16",p.name);
  if(!Array.isArray(a))return [];
  rows=a.map(x=>({time:+x[0],close:+x[4],high:+x[2],quoteVolume:+x[7]}));
 }else if(p.kind==="okx"){
  a=await json(p.base+"/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1m&limit=16",p.name);
  if(a.code!=="0"||!Array.isArray(a.data))return [];
  rows=a.data.map(x=>({time:+x[0],close:+x[4],high:+x[2],quoteVolume:+x[7]}));
 }else if(p.kind==="kucoin"){
  a=await json(p.base+"/api/v1/market/candles?type=1min&symbol="+encodeURIComponent(s),p.name);
  if(a.code!=="200000"||!Array.isArray(a.data))return [];
  rows=a.data.map(x=>({time:+x[0]*1000,close:+x[2],high:+x[3],quoteVolume:+x[6]}));
 }else if(p.kind==="gate"){
  a=await json(p.base+"/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(s)+"&interval=1m&limit=16",p.name);
  if(!Array.isArray(a))return [];
  rows=a.map(x=>({time:+x[0]*1000,close:+x[2],high:+x[3],quoteVolume:+x[1]}));
 }else{
  a=await json(p.base+"/api/v3/market/candles?category=SPOT&symbol="+encodeURIComponent(s)+"&interval=1m&limit=16",p.name);
  if(a.code!=="00000"||!Array.isArray(a.data))return [];
  rows=a.data.map(x=>({time:+x[0],close:+x[4],high:+x[2],quoteVolume:+x[6]}));
 }
 return rows.filter(x=>Number.isFinite(x.time)&&x.close>0&&Number.isFinite(x.quoteVolume))
  .sort((x,y)=>x.time-y.time);
}
function evaluateCandles(c,t,timestamp){
 const currentMinute=Math.floor(timestamp/60000)*60000;
 const live=c.find(x=>x.time===currentMinute);
 const closed=c.filter(x=>x.time<currentMinute&&x.time+60000<=timestamp).slice(-12);
 if(!live||closed.length<10||!closed.at(-1)||closed.at(-1).time!==currentMinute-60000)return {confirmed:false,reason:"Güncel dakika hacmi henüz alınamadı"};
 for(let i=1;i<closed.length;i++)if(closed[i].time-closed[i-1].time!==60000)
  return {confirmed:false,reason:"Dakika mumları eksik"};
 const elapsed=timestamp-currentMinute;
 const base=closed.slice(-10).reduce((sum,x)=>sum+x.quoteVolume,0)/10;
 const normalized=live.quoteVolume*60000/Math.max(10000,elapsed);
 const rise1=(t.price/closed.at(-1).close-1)*100;
 const rise3=(t.price/closed.at(-3).close-1)*100;
 const retrace=live.high>0?(live.high-t.price)/live.high*100:0;
 if(rise1>1.7||rise3>3.5||retrace>0.5)
  return {confirmed:false,late:true,reason:"Yükseliş uzadı veya zirveden geri çekildi",rise1:fix(rise1),rise3:fix(rise3)};
 const ratio=base>0?normalized/base:0;
 const confirmed=elapsed>=10000&&live.quoteVolume>=1500&&normalized>=5500&&ratio>=2;
 return {confirmed,reason:confirmed?"Dakika hacmi doğrulandı":"Gerçek dakika hacmi yetersiz",
  volumeRatio:fix(ratio),minuteVolume:fix(live.quoteVolume,0),rise1:fix(rise1),rise3:fix(rise3)};
}
function snapshot(p,t,timestamp){
 const key=p.name+":"+t.symbol;
 const arr=samples.get(key)||[];
 if(arr.length&&timestamp-arr.at(-1).time<4000)return null;
 arr.push({time:timestamp,price:t.price});
 while(arr.length>16||arr.length&&timestamp-arr[0].time>110000)arr.shift();
 samples.set(key,arr);
 if(arr.length<2)return null;
 const older=arr.filter(x=>x.time<=timestamp-7500).at(-1);
 if(!older)return null;
 const recent=arr.filter(x=>timestamp-x.time<=65000);
 const earliest=recent[0],peak=Math.max(...recent.map(x=>x.price));
 const speed=(t.price/older.price-1)*100;
 const riseWindow=(t.price/earliest.price-1)*100;
 const fall=(peak-t.price)/peak*100;
 const spread=(t.ask-t.bid)/t.ask*100;
 const observedMs=timestamp-earliest.time;
 const late=riseWindow>1.8||(fall>=0.5&&peak/earliest.price>1.008);
 // Never label a negative-price-reaction as an entry candidate.
 if(!late&&(speed<0.24||speed>1.2||riseWindow>1.5||spread>0.3))return null;
 if(!late&&speed<=0)return null;
 if(!firstSeen.has(key))firstSeen.set(key,timestamp);
 const seen=firstSeen.get(key);
 return {key,symbol:t.symbol.replace(/[-_]?USDT$/,"/USDT"),exchange:p.name,
  status:late?"GEÇ KALINDI":"ERKEN UYARI",price:t.price,ask:t.ask,
  spreadPct:fix(spread,3),speedPct:fix(speed),windowRisePct:fix(riseWindow),
  retracePct:fix(fall),observedSeconds:fix(observedMs/1000,0),
  firstSeenAt:seen,lastCheckedAt:timestamp,volume24h:t.volume24h,
  volumeRatio:null,minuteVolume:null,reason:late?"Hızlı yükseliş veya geri çekilme":"Kapanış beklemeden fiyat ivmesi"};
}
async function scanSource(p,timestamp){
 const stat={eligible:0,candidates:0,verified:0,error:null};
 state.sources[p.name]=stat;
 if((blockedUntil.get(p.name)||0)>now()){
  stat.error="Borsa hız sınırı nedeniyle geçici bekleme";
  return [];
 }
 try{
  const ticks=await getTickers(p);
  stat.eligible=ticks.length;
  const list=[];
  for(const t of ticks){
   const x=snapshot(p,t,timestamp);
   if(x)list.push({x,t});
  }
  stat.candidates=list.length;
  // Verify only the newest price accelerations to limit remote API calls.
  const shortlist=list.filter(a=>a.x.status==="ERKEN UYARI")
   .sort((a,b)=>b.x.speedPct-a.x.speedPct).slice(0,MAX_CONFIRM_PER_EXCHANGE);
  await Promise.all(shortlist.map(async a=>{
   try{
    const v=evaluateCandles(await getCandles(p,a.t.symbol),a.t,now());
    a.x.volumeRatio=v.volumeRatio??null;
    a.x.minuteVolume=v.minuteVolume??null;
    a.x.rise1Pct=v.rise1??null;
    a.x.rise3Pct=v.rise3??null;
    a.x.reason=v.reason;
    if(v.late)a.x.status="GEÇ KALINDI";
    else if(v.confirmed&&a.x.observedSeconds>=18&&a.x.spreadPct<=0.3){
     a.x.status="ALIM TEYİDİ";
     stat.verified++;
    }
   }catch(err){a.x.reason="Hacim teyidi alınamadı: "+String(err.message).slice(0,60);}
  }));
  return list.map(a=>a.x);
 }catch(err){
  stat.error=String(err.message);
  return [];
 }
}
export function microMomentumStatus(){return {...state,rows:[...state.rows],sources:{...state.sources}};}
export async function scanMicroMomentum(){
 if(state.running)return microMomentumStatus();
 state.running=true;
 const timestamp=now();
 try{
  const blocks=await Promise.all(providers.map(p=>scanSource(p,timestamp)));
  const live=blocks.flat();
  const types={"ALIM TEYİDİ":0,"ERKEN UYARI":1,"GEÇ KALINDI":2};
  state.rows=live.sort((a,b)=>types[a.status]-types[b.status]||
    b.firstSeenAt-a.firstSeenAt||b.speedPct-a.speedPct).slice(0,60);
  state.checked=providers.filter(p=>!state.sources[p.name].error).length;
  state.eligible=Object.values(state.sources).reduce((s,v)=>s+v.eligible,0);
  state.confirmed=live.filter(x=>x.status==="ALIM TEYİDİ").length;
  state.early=live.filter(x=>x.status==="ERKEN UYARI").length;
  state.late=live.filter(x=>x.status==="GEÇ KALINDI").length;
  state.updatedAt=now();
  for(const [key,arr] of samples)if(!arr.length||timestamp-arr.at(-1).time>120000){
   samples.delete(key);firstSeen.delete(key);
  }
 }finally{state.running=false;}
 return microMomentumStatus();
}
export function startMicroMomentum(){
 scanMicroMomentum().catch(e=>{state.running=false;console.error("Mikro momentum:",e);});
 setInterval(()=>scanMicroMomentum().catch(e=>{state.running=false;console.error("Mikro momentum:",e);}),INTERVAL_MS);
}
