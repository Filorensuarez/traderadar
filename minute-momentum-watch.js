// 1-minute 10-vs-30 moving-average momentum watch, with hysteresis.
// Only completed candles count. Exchange symbols are kept separate.
const state={running:false,updatedAt:0,checked:0,successful:0,failed:0,errors:[],rows:[],universe:{},closest:[],maxChangePct:null,missing:0,attempted:0};
const active=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const INTERVAL=60000;
const backoffUntil={OKX:0,KUCOIN:0,"GATE.IO":0,BINANCE:0,COINBASE:0,BYBIT:0};
const concurrency={OKX:2,KUCOIN:2,"GATE.IO":2,BINANCE:2,COINBASE:2,BYBIT:2};
async function get(url,e){
 for(let attempt=0;attempt<3;attempt++){
  if(e&&backoffUntil[e]>Date.now())await pause(backoffUntil[e]-Date.now());
  const r=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if((r.status===429||r.status===418)&&e){
   const retry=Number(r.headers.get("retry-after"));
   const delay=Number.isFinite(retry)&&retry>0?Math.min(retry*1000,120000):Math.min(30000,2500*2**attempt);
   backoffUntil[e]=Date.now()+delay;
   if(attempt<2)continue;
  }
  if(!r.ok)throw Error("HTTP "+r.status);
  return r.json();
 }
}
function detect(raw,now=Date.now()){
 const a=raw.map(x=>({time:+x.time,close:+x.close})).filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.close)&&x.close>0&&x.time+INTERVAL<=now)
  .sort((x,y)=>x.time-y.time);
 const b=a.slice(-35);
 if(b.length!==35||now-(b.at(-1).time+INTERVAL)>120000)return null;
 for(let i=1;i<b.length;i++)if(b[i].time-b[i-1].time!==INTERVAL)return null;
 const avg=x=>x.reduce((s,v)=>s+v.close,0)/x.length;
 const previous=avg(b.slice(0,30)),latest=avg(b.slice(30));
 return {changePct:+((latest/previous-1)*100).toFixed(3),price:b.at(-1).close,candleTime:b.at(-1).time,
  previousAverage:previous,currentAverage:latest};
}
async function universe(exchange){
 if(exchange==="COINBASE"){
  const d=await get("https://api.coinbase.com/api/v3/brokerage/market/products?product_type=SPOT&limit=250&get_all_products=true","COINBASE");
  const products=d.products||[];
  return products.filter(x=>x.status==="online"&&x.product_type==="SPOT"&&x.quote_currency_id==="USD"&&
   !x.is_disabled&&!x.trading_disabled&&Number(x.volume_24h||0)*Number(x.price||0)>=1000000&&
   !/(UP|DOWN|BULL|BEAR|[235][SL])$/i.test(x.base_currency_id||""))
   .sort((a,b)=>(Number(b.volume_24h||0)*Number(b.price||0))-(Number(a.volume_24h||0)*Number(a.price||0)))
   .map(x=>x.product_id);
 }
 if(exchange==="BINANCE"){
  const [info,tickers]=await Promise.all([
   get("https://data-api.binance.vision/api/v3/exchangeInfo"),
   get("https://data-api.binance.vision/api/v3/ticker/24hr")
  ]);
  const volumes=new Map((tickers||[]).map(x=>[x.symbol,Number(x.quoteVolume)]));
  return (info.symbols||[]).filter(x=>x.status==="TRADING"&&x.quoteAsset==="USDT"&&x.isSpotTradingAllowed!==false&&
   (volumes.get(x.symbol)||0)>=1000000&&!/(UP|DOWN|BULL|BEAR|[235][SL])USDT$/i.test(x.symbol))
   .sort((a,b)=>(volumes.get(b.symbol)||0)-(volumes.get(a.symbol)||0)).map(x=>x.symbol);
 }
 if(exchange==="BYBIT"){
  const d=await get("https://api.bybit.com/v5/market/tickers?category=spot","BYBIT");
  if(Number(d.retCode)!==0)throw Error("Bybit API: "+(d.retMsg||"hata"));
  return (d.result?.list||[]).filter(x=>/^[A-Z0-9]+USDT$/.test(x.symbol)&&Number(x.turnover24h)>=1000000&&!/(UP|DOWN|BULL|BEAR|[235][SL])USDT$/i.test(x.symbol))
   .sort((a,b)=>+b.turnover24h-+a.turnover24h).map(x=>x.symbol);
 }
 if(exchange==="OKX"){
  const d=await get("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
  return (d.data||[]).filter(x=>/^[A-Z0-9]+-USDT$/.test(x.instId)&&Number(x.volCcy24h)>=1000000&&!/(^|[-_])(3S|3L|5S|5L|UP|DOWN)([-_]|$)/i.test(x.instId))
   .sort((a,b)=>+b.volCcy24h-+a.volCcy24h).map(x=>x.instId);
 }
 if(exchange==="KUCOIN"){
  const d=await get("https://api.kucoin.com/api/v1/market/allTickers");
  return (d.data?.ticker||[]).filter(x=>/^[A-Z0-9]+-USDT$/.test(x.symbol)&&Number(x.volValue)>=1000000&&!/(^|[-_])(3S|3L|5S|5L|UP|DOWN)([-_]|$)/i.test(x.symbol))
   .sort((a,b)=>+b.volValue-+a.volValue).map(x=>x.symbol);
 }
 const d=await get("https://api.gateio.ws/api/v4/spot/tickers");
 return d.filter(x=>/^[A-Z0-9]+_USDT$/.test(x.currency_pair)&&Number(x.quote_volume)>=1000000&&!/(^|[-_])(3S|3L|5S|5L|UP|DOWN)([-_]|$)/i.test(x.currency_pair))
  .sort((a,b)=>+b.quote_volume-+a.quote_volume).map(x=>x.currency_pair);
}
async function candles(e,s){
 if(e==="COINBASE"){
  const end=Math.floor(Date.now()/1000),start=end-3600;
  const d=await get("https://api.coinbase.com/api/v3/brokerage/market/products/"+encodeURIComponent(s)+"/candles?start="+start+"&end="+end+"&granularity=ONE_MINUTE","COINBASE");
  return (d.candles||[]).map(x=>({time:+x.start*1000,close:+x.close}));
 }
 if(e==="BINANCE"){
  const d=await get("https://data-api.binance.vision/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval=1m&limit=50","BINANCE");
  return (d||[]).map(x=>({time:+x[0],close:+x[4]}));
 }
 if(e==="BYBIT"){
  const d=await get("https://api.bybit.com/v5/market/kline?category=spot&symbol="+encodeURIComponent(s)+"&interval=1&limit=50","BYBIT");
  if(Number(d.retCode)!==0)throw Error("Bybit API: "+(d.retMsg||"hata"));
  return (d.result?.list||[]).map(x=>({time:+x[0],close:+x[4]}));
 }
 if(e==="OKX"){
  const d=await get("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1m&limit=50","OKX");
  return (d.data||[]).map(x=>({time:+x[0],close:+x[4]}));
 }
 if(e==="KUCOIN"){
  const d=await get("https://api.kucoin.com/api/v1/market/candles?type=1min&symbol="+encodeURIComponent(s));
  return (d.data||[]).map(x=>({time:+x[0]*1000,close:+x[2]}));
 }
 const d=await get("https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(s)+"&interval=1m&limit=50","GATE.IO");
 return d.map(x=>({time:+x[0]*1000,close:+x[2]}));
}
let lastDiscovery=0,markets={};
export async function scanMinuteMomentum(){
 if(state.running)return minuteMomentumStatus();
 state.running=true;
 const errors=[],closest=[];let checked=0,successful=0,failed=0,missing=0;
 state.checked=0;state.successful=0;state.failed=0;state.missing=0;state.attempted=0;state.errors=[];
 try{
  if(Date.now()-lastDiscovery>15*60000){
   for(const e of ["BINANCE","COINBASE","BYBIT","OKX","KUCOIN","GATE.IO"]){
    try{markets[e]=await universe(e);}catch(err){errors.push(e+" semboller: "+err.message);}
   }
   lastDiscovery=Date.now();
  }
  const eligible=new Set(Object.entries(markets).flatMap(([exchange,symbols])=>symbols.map(symbol=>exchange+":"+symbol)));
  for(const key of active.keys())if(!eligible.has(key))active.delete(key);
  state.universe=Object.fromEntries(Object.entries(markets).map(([k,v])=>[k,v.length]));
  for(const e of ["BINANCE","COINBASE","BYBIT","OKX","KUCOIN","GATE.IO"]){
   const symbols=markets[e]||[];
   let next=0;
   async function worker(){
    while(next<symbols.length){
     const symbol=symbols[next++];
     const key=e+":"+symbol;
     try{
      const result=detect(await candles(e,symbol));
      if(!result){missing++;continue;}
      successful++;
      closest.push({exchange:e,symbol:symbol.replace(/[-_]/,"/"),...result});
      const previous=active.get(key);
      if(previous){
       if(result.changePct<=-2)active.delete(key);
       else active.set(key,{...previous,...result,lastCheckedAt:Date.now()});
      }else if(result.changePct>=2){
       active.set(key,{exchange:e,symbol:symbol.replace(/[-_]/,"/"),...result,firstSeenAt:Date.now(),lastCheckedAt:Date.now()});
      }
     }catch(err){
      failed++;
      if(errors.length<12)errors.push(e+" "+symbol+": "+err.message);
     }finally{
      checked++;
      state.checked=checked;state.successful=successful;state.failed=failed;state.missing=missing;state.attempted=checked;state.missing=missing;state.attempted=checked;state.errors=[...errors];
      state.closest=[...closest].sort((a,b)=>b.changePct-a.changePct).slice(0,12);
      state.maxChangePct=state.closest[0]?.changePct??null;
     }
    }
   }
   await Promise.all(Array.from({length:Math.min(concurrency[e],symbols.length)},()=>worker()));
  }

  state.checked=checked;state.successful=successful;state.failed=failed;
  state.updatedAt=Date.now();state.errors=errors;
  state.closest=closest.sort((a,b)=>b.changePct-a.changePct).slice(0,12);
  state.maxChangePct=state.closest.length?state.closest[0].changePct:null;
  state.universe=Object.fromEntries(Object.entries(markets).map(([k,v])=>[k,v.length]));
 }finally{state.running=false;}
 return minuteMomentumStatus();
}
export function minuteMomentumStatus(){
 return {...state,rows:[...active.values()].sort((a,b)=>b.firstSeenAt-a.firstSeenAt||b.changePct-a.changePct),
  notice:"Son 5 kapanmış 1 dakikalık mumun ortalama kapanışı önceki 30 mumun ortalamasından en az %2 yüksekse takip başlar; %-2 veya altına düşerse takipten çıkar. Günlük işlem hacmi en az 1 milyon USDT olan aktif USDT spot pariteleri taranır; 3S/3L/5S/5L ve UP/DOWN kaldıraçlı tokenlar hariç tutulur. Eksik mum verisi olanlar ayrı sayılır; analiz edilemeyen coinler başarılı taranmış sayılmaz."};
}
export function startMinuteMomentum(){
 scanMinuteMomentum().catch(console.error);
 setInterval(()=>scanMinuteMomentum().catch(console.error),60000);
}
