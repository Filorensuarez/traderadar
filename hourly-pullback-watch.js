// Detect >20% pullbacks from recent highs and wait for the next completed green 1-hour candle.
// Supported exchanges mirror TradeRadar's existing market scanners.
const EXCHANGES=["BINANCE","COINBASE","BYBIT","OKX","KUCOIN","GATE.IO"];
const state={running:false,updatedAt:0,checked:0,successful:0,failed:0,missing:0,universe:{},errors:[],rows:[],notice:""};
const setups=new Map();
const backoffUntil={};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const HOUR=3600000, DAY=86400000, MIN_VOLUME=1000000, MAX_SYMBOLS=80;
async function get(url,exchange){
 for(let attempt=0;attempt<3;attempt++){
  if(backoffUntil[exchange]>Date.now())await pause(backoffUntil[exchange]-Date.now());
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if((response.status===429||response.status===418)&&attempt<2){
   const retry=Number(response.headers.get("retry-after"));
   const delay=Number.isFinite(retry)&&retry>0?Math.min(retry*1000,120000):Math.min(30000,2500*2**attempt);
   backoffUntil[exchange]=Date.now()+delay;continue;
  }
  if(!response.ok)throw Error("HTTP "+response.status);
  return response.json();
 }
 throw Error("İstek sınırı aşıldı");
}
function cleanLeveraged(s){return !/(UP|DOWN|BULL|BEAR|[235][SL])(?:USDT|USD)?$/i.test(s);}
async function universe(exchange){
 if(exchange==="BINANCE"){
  const [info,tickers]=await Promise.all([
   get("https://data-api.binance.vision/api/v3/exchangeInfo",exchange),
   get("https://data-api.binance.vision/api/v3/ticker/24hr",exchange)
  ]);
  const vol=new Map((tickers||[]).map(x=>[x.symbol,Number(x.quoteVolume)]));
  return (info.symbols||[]).filter(x=>x.status==="TRADING"&&x.quoteAsset==="USDT"&&x.isSpotTradingAllowed!==false&&
   (vol.get(x.symbol)||0)>=MIN_VOLUME&&cleanLeveraged(x.symbol))
   .sort((a,b)=>(vol.get(b.symbol)||0)-(vol.get(a.symbol)||0)).slice(0,MAX_SYMBOLS).map(x=>x.symbol);
 }
 if(exchange==="COINBASE"){
  const d=await get("https://api.coinbase.com/api/v3/brokerage/market/products?product_type=SPOT&limit=250&get_all_products=true",exchange);
  return (d.products||[]).filter(x=>x.status==="online"&&x.product_type==="SPOT"&&x.quote_currency_id==="USD"&&
   !x.is_disabled&&!x.trading_disabled&&Number(x.volume_24h||0)*Number(x.price||0)>=MIN_VOLUME&&cleanLeveraged(x.base_currency_id||""))
   .sort((a,b)=>(Number(b.volume_24h||0)*Number(b.price||0))-(Number(a.volume_24h||0)*Number(a.price||0)))
   .slice(0,MAX_SYMBOLS).map(x=>x.product_id);
 }
 if(exchange==="BYBIT"){
  let d,last;
  for(const host of ["https://api.bybit.tr","https://api.bybit.com","https://api.bytick.com"]){
   try{d=await get(host+"/v5/market/tickers?category=spot",exchange);if(Number(d.retCode)!==0)throw Error(d.retMsg||"API hatası");break;}catch(e){last=e;d=null;}
  }
  if(!d)throw last||Error("Bybit coin listesi alınamadı");
  return (d.result?.list||[]).filter(x=>/^[A-Z0-9]+USDT$/.test(x.symbol)&&Number(x.turnover24h)>=MIN_VOLUME&&cleanLeveraged(x.symbol))
   .sort((a,b)=>Number(b.turnover24h)-Number(a.turnover24h)).slice(0,MAX_SYMBOLS).map(x=>x.symbol);
 }
 if(exchange==="OKX"){
  const d=await get("https://www.okx.com/api/v5/market/tickers?instType=SPOT",exchange);
  return (d.data||[]).filter(x=>/^[A-Z0-9]+-USDT$/.test(x.instId)&&Number(x.volCcy24h)>=MIN_VOLUME&&cleanLeveraged(x.instId))
   .sort((a,b)=>Number(b.volCcy24h)-Number(a.volCcy24h)).slice(0,MAX_SYMBOLS).map(x=>x.instId);
 }
 if(exchange==="KUCOIN"){
  const d=await get("https://api.kucoin.com/api/v1/market/allTickers",exchange);
  return (d.data?.ticker||[]).filter(x=>/^[A-Z0-9]+-USDT$/.test(x.symbol)&&Number(x.volValue)>=MIN_VOLUME&&cleanLeveraged(x.symbol))
   .sort((a,b)=>Number(b.volValue)-Number(a.volValue)).slice(0,MAX_SYMBOLS).map(x=>x.symbol);
 }
 const d=await get("https://api.gateio.ws/api/v4/spot/tickers",exchange);
 return (d||[]).filter(x=>/^[A-Z0-9]+_USDT$/.test(x.currency_pair)&&Number(x.quote_volume)>=MIN_VOLUME&&cleanLeveraged(x.currency_pair))
  .sort((a,b)=>Number(b.quote_volume)-Number(a.quote_volume)).slice(0,MAX_SYMBOLS).map(x=>x.currency_pair);
}
async function candles(exchange,symbol){
 if(exchange==="BINANCE"){
  const d=await get("https://data-api.binance.vision/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=1h&limit=180",exchange);
  return (d||[]).map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4]}));
 }
 if(exchange==="COINBASE"){
  const end=Math.floor(Date.now()/1000),start=end-180*3600;
  const d=await get("https://api.coinbase.com/api/v3/brokerage/market/products/"+encodeURIComponent(symbol)+"/candles?start="+start+"&end="+end+"&granularity=ONE_HOUR",exchange);
  return (d.candles||[]).map(x=>({time:+x.start*1000,open:+x.open,high:+x.high,low:+x.low,close:+x.close}));
 }
 if(exchange==="BYBIT"){
  let d,last;
  const q="category=spot&symbol="+encodeURIComponent(symbol)+"&interval=60&limit=180";
  for(const host of ["https://api.bybit.tr","https://api.bybit.com","https://api.bytick.com"]){
   try{d=await get(host+"/v5/market/kline?"+q,exchange);if(Number(d.retCode)!==0)throw Error(d.retMsg||"API hatası");break;}catch(e){last=e;d=null;}
  }
  if(!d)throw last||Error("Bybit mumları alınamadı");
  return (d.result?.list||[]).map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4]}));
 }
 if(exchange==="OKX"){
  const d=await get("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(symbol)+"&bar=1H&limit=180",exchange);
  return (d.data||[]).map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4]}));
 }
 if(exchange==="KUCOIN"){
  const d=await get("https://api.kucoin.com/api/v1/market/candles?type=1hour&symbol="+encodeURIComponent(symbol),exchange);
  return (d.data||[]).map(x=>({time:+x[0]*1000,open:+x[1],close:+x[2],high:+x[3],low:+x[4]}));
 }
 const d=await get("https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(symbol)+"&interval=1h&limit=180",exchange);
 return (d||[]).map(x=>({time:+x[0]*1000,volume:+x[1],close:+x[2],high:+x[3],low:+x[4],open:+x[5]}));
}
function analyze(exchange,symbol,raw,now=Date.now()){
 const candlesList=raw.filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)&&x.close>0&&x.high>0&&x.open>0&&x.time+HOUR<=now)
  .sort((a,b)=>a.time-b.time);
 const dedup=[];for(const c of candlesList){if(!dedup.length||dedup[dedup.length-1].time!==c.time)dedup.push(c);}
 const data=dedup.slice(-168);
 if(data.length<48)return null;
 const last=data[data.length-1];
 const peak=Math.max(...data.slice(0,-1).map(x=>x.high));
 if(!Number.isFinite(peak)||peak<=0)return null;
 return {exchange,symbol:symbol.replace(/[-_]/,"/"),rawSymbol:symbol,price:last.close,peakPrice:peak,
  pullbackPct:+((peak-last.close)/peak*100).toFixed(2),candleTime:last.time,green:last.close>last.open,
  candleOpen:last.open,candleClose:last.close};
}
let markets={},lastDiscovery=0;
export async function scanHourlyPullbacks(){
 if(state.running)return hourlyPullbackStatus();
 state.running=true;
 let checked=0,successful=0,failed=0,missing=0;const errors=[];
 try{
  if(Date.now()-lastDiscovery>15*60*1000){
   for(const e of EXCHANGES){try{markets[e]=await universe(e);}catch(err){if(errors.length<12)errors.push(e+" parite listesi: "+err.message);}}
   lastDiscovery=Date.now();
  }
  state.universe=Object.fromEntries(EXCHANGES.map(e=>[e,(markets[e]||[]).length]));
  for(const exchange of EXCHANGES){
   const symbols=markets[exchange]||[];let next=0;
   async function worker(){
    while(next<symbols.length){
     const symbol=symbols[next++],key=exchange+":"+symbol;
     try{
      const result=analyze(exchange,symbol,await candles(exchange,symbol));
      if(!result){missing++;continue;}successful++;
      let setup=setups.get(key);
      if(setup&&Date.now()-setup.triggeredAt>7*DAY){setups.delete(key);setup=null;}
      if(setup&&result.pullbackPct<15){setups.delete(key);setup=null;}
      if(setup){
       setup.lastCheckedAt=Date.now();setup.pullbackPct=result.pullbackPct;setup.price=result.price;setup.lastCandleTime=result.candleTime;
       if(!setup.alerted&&result.candleTime>setup.triggerCandleTime&&result.green){
        setup.alerted=true;setup.alertedAt=Date.now();setup.signalCandleTime=result.candleTime;setup.signalPrice=result.price;
       }
      }else if(result.pullbackPct>=20){
       setups.set(key,{...result,triggeredAt:Date.now(),triggerCandleTime:result.candleTime,lastCandleTime:result.candleTime,
        lastCheckedAt:Date.now(),alerted:false,alertedAt:null,signalCandleTime:null,signalPrice:null});
      }
     }catch(err){failed++;if(errors.length<12)errors.push(exchange+" "+symbol+": "+err.message);}
     finally{checked++;state.checked=checked;state.successful=successful;state.failed=failed;state.missing=missing;}
    }
   }
   await Promise.all(Array.from({length:Math.min(3,symbols.length)},()=>worker()));
  }
  state.updatedAt=Date.now();state.checked=checked;state.successful=successful;state.failed=failed;state.missing=missing;state.errors=errors;
 }finally{state.running=false;}
 return hourlyPullbackStatus();
}
export function hourlyPullbackStatus(){
 const now=Date.now();
 for(const [key,x] of setups)if(now-x.triggeredAt>7*DAY)setups.delete(key);
 const rows=[...setups.values()].filter(x=>!x.alerted||now-x.alertedAt<48*3600000)
  .sort((a,b)=>Number(b.alerted)-Number(a.alerted)||b.triggeredAt-a.triggeredAt);
 return {...state,rows,notice:"BINANCE, COINBASE, BYBIT, OKX, KUCOIN ve GATE.IO Spot pariteleri taranır. Günlük hacim en az 1 milyon USD/USDT olan her borsadaki en yüksek hacimli 80 parite incelenir. %20 düşüş, son 168 tamamlanmış saatlik mumdaki en yüksek fiyata göre hesaplanır. Alım fırsatı yalnız düşüş tespitinden sonraki tamamlanmış yeşil 1 saatlik mumda işaretlenir; otomatik emir gönderilmez."};
}
export function startHourlyPullbacks(){
 scanHourlyPullbacks().catch(e=>console.error("Saatlik geri çekilme taraması:",e.message));
 setInterval(()=>scanHourlyPullbacks().catch(e=>console.error("Saatlik geri çekilme taraması:",e.message)),10*60*1000);
}
