// 1-minute 10-vs-10 moving-average momentum watch, with hysteresis.
// Only completed candles count. Exchange symbols are kept separate.
const state={running:false,updatedAt:0,checked:0,successful:0,failed:0,errors:[],rows:[],universe:{},closest:[],maxChangePct:null};
const active=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const INTERVAL=60000;
const backoffUntil={OKX:0,KUCOIN:0,"GATE.IO":0};
const requestSpacing={OKX:280,KUCOIN:160,"GATE.IO":160};
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
 const b=a.slice(-20);
 if(b.length!==20||now-(b.at(-1).time+INTERVAL)>120000)return null;
 for(let i=1;i<b.length;i++)if(b[i].time-b[i-1].time!==INTERVAL)return null;
 const avg=x=>x.reduce((s,v)=>s+v.close,0)/x.length;
 const previous=avg(b.slice(0,10)),latest=avg(b.slice(10));
 return {changePct:+((latest/previous-1)*100).toFixed(3),price:b.at(-1).close,candleTime:b.at(-1).time,
  previousAverage:previous,currentAverage:latest};
}
async function universe(exchange){
 if(exchange==="OKX"){
  const d=await get("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
  return (d.data||[]).filter(x=>/^[A-Z0-9]+-USDT$/.test(x.instId)&&+x.volCcy24h>0)
   .sort((a,b)=>+b.volCcy24h-+a.volCcy24h).map(x=>x.instId);
 }
 if(exchange==="KUCOIN"){
  const d=await get("https://api.kucoin.com/api/v1/market/allTickers");
  return (d.data?.ticker||[]).filter(x=>/^[A-Z0-9]+-USDT$/.test(x.symbol)&&+x.volValue>0)
   .sort((a,b)=>+b.volValue-+a.volValue).map(x=>x.symbol);
 }
 const d=await get("https://api.gateio.ws/api/v4/spot/tickers");
 return d.filter(x=>/^[A-Z0-9]+_USDT$/.test(x.currency_pair)&&+x.quote_volume>0)
  .sort((a,b)=>+b.quote_volume-+a.quote_volume).map(x=>x.currency_pair);
}
async function candles(e,s){
 if(e==="OKX"){
  const d=await get("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1m&limit=30","OKX");
  return (d.data||[]).map(x=>({time:+x[0],close:+x[4]}));
 }
 if(e==="KUCOIN"){
  const d=await get("https://api.kucoin.com/api/v1/market/candles?type=1min&symbol="+encodeURIComponent(s));
  return (d.data||[]).map(x=>({time:+x[0]*1000,close:+x[2]}));
 }
 const d=await get("https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(s)+"&interval=1m&limit=30","GATE.IO");
 return d.map(x=>({time:+x[0]*1000,close:+x[2]}));
}
let lastDiscovery=0,markets={};
export async function scanMinuteMomentum(){
 if(state.running)return minuteMomentumStatus();
 state.running=true;
 const errors=[],closest=[];let checked=0,successful=0,failed=0;
 try{
  if(Date.now()-lastDiscovery>15*60000){
   for(const e of ["OKX","KUCOIN","GATE.IO"]){
    try{markets[e]=await universe(e);}catch(err){errors.push(e+" semboller: "+err.message);}
   }
   lastDiscovery=Date.now();
  }
  state.universe=Object.fromEntries(Object.entries(markets).map(([k,v])=>[k,v.length]));
  for(const e of ["OKX","KUCOIN","GATE.IO"]){
   for(const symbol of markets[e]||[]){
    checked++;
    const key=e+":"+symbol;
    try{
     const result=detect(await candles(e,symbol));
     if(!result)throw Error("Yeterli ardışık kapanmış mum yok");
     successful++;
     closest.push({exchange:e,symbol:symbol.replace(/[-_]/,"/"),...result});
     const previous=active.get(key);
     if(previous){
      if(result.changePct<=-2){active.delete(key);}
      else active.set(key,{...previous,...result,lastCheckedAt:Date.now()});
     }else if(result.changePct>=2){
      active.set(key,{exchange:e,symbol:symbol.replace(/[-_]/,"/"),...result,firstSeenAt:Date.now(),lastCheckedAt:Date.now()});
     }
    }catch(err){failed++;if(errors.length<12)errors.push(e+" "+symbol+": "+err.message);}
    state.checked=checked;state.successful=successful;state.failed=failed;
    if(checked%10===0){state.closest=[...closest].sort((a,b)=>b.changePct-a.changePct).slice(0,12);state.maxChangePct=state.closest[0]?.changePct??null;}
    await pause(requestSpacing[e]);
   }
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
 return {...state,rows:[...active.values()].sort((a,b)=>b.changePct-a.changePct),
  notice:"Son 10 kapanmış 1 dakikalık mumun ortalama kapanışı, önceki 10 mumun ortalamasından en az %2 yüksekse takip başlar; en az %2 düşükse takipten çıkar. İki eşik arasında takip korunur. Borsalarda işlem hacmi bulunan bütün USDT spot çiftleri kapsamda; sabit coin sınırı yoktur. API hız sınırları nedeniyle tam tarama birkaç dakika veya daha uzun sürebilir."};
}
export function startMinuteMomentum(){scanMinuteMomentum().catch(console.error);
 setInterval(()=>scanMinuteMomentum().catch(console.error),60000);}
