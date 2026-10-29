const BASE="https://data-api.binance.vision/api/v3";
const state={running:false,checked:0,total:0,rows:[],errors:0,error:null,updatedAt:0,blockedUntil:0,completed:false};
const average=a=>a.reduce((s,v)=>s+v,0)/a.length;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let nextRequestAt=0,requestQueue=Promise.resolve();
function throttle(){const slot=requestQueue.then(async()=>{const wait=Math.max(0,nextRequestAt-Date.now());if(wait)await sleep(wait);nextRequestAt=Date.now()+1800;});requestQueue=slot.catch(()=>{});return slot;}
async function json(url){
 await throttle();
 if(Date.now()<state.blockedUntil)throw Error("API_BLOCKED");
 const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);
 try{const r=await fetch(url,{signal:c.signal});if(r.status===418||r.status===429){const retry=Number(r.headers.get("retry-after"));state.blockedUntil=Date.now()+Math.max(15*60000,Number.isFinite(retry)?retry*1000:0);throw Error("API_BLOCKED");}if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}finally{clearTimeout(t);}
}
export function secondScanStatus(){return {...state,rows:[...state.rows]};}
async function inspect(symbol,now){
 const end=now-1000;
 const secondStart=end-299000;
 const minuteEnd=Math.floor(secondStart/60000)*60000-1;
 const [seconds,minutes]=await Promise.all([
  json(BASE+"/klines?symbol="+symbol+"&interval=1s&startTime="+secondStart+"&endTime="+end+"&limit=300"),
  json(BASE+"/klines?symbol="+symbol+"&interval=1m&endTime="+minuteEnd+"&limit=30")
 ]);
 if(!Array.isArray(seconds)||seconds.length!==300||!Array.isArray(minutes)||minutes.length!==30)return null;
 if(seconds.some((c,i)=>Number(c[0])!==secondStart+i*1000))return null;
 if(minutes.some((c,i)=>i>0&&Number(c[0])-Number(minutes[i-1][0])!==60000))return null;
 const recentPrice=average(seconds.map(c=>Number(c[4])));
 const previousPrice=average(minutes.map(c=>Number(c[4])));
 const recentVolumePerMin=seconds.reduce((a,c)=>a+Number(c[7]),0)/5;
 const previousVolumePerMin=average(minutes.map(c=>Number(c[7])));
 if(!(previousPrice>0))return null;
 const pricePct=(recentPrice/previousPrice-1)*100,volumeX=recentVolumePerMin/previousVolumePerMin;
 if(pricePct<2)return null;
 return {symbol,pricePct:+pricePct.toFixed(2),volumeX:+volumeX.toFixed(2),price:+Number(seconds.at(-1)[4]),updatedAt:Date.now()};
}
export async function runSecondScan(){
 if(state.running||Date.now()<state.blockedUntil)return secondScanStatus();
 state.running=true;state.checked=0;state.total=0;state.rows=[];state.errors=0;state.error=null;state.completed=false;
 try{
  const [exchange,tickers]=await Promise.all([json(BASE+"/exchangeInfo"),json(BASE+"/ticker/24hr")]);
  const active=new Set(exchange.symbols.filter(x=>x.status==="TRADING"&&x.isSpotTradingAllowed!==false&&x.quoteAsset==="USDT").map(x=>x.symbol));
  const markets=tickers.filter(t=>active.has(t.symbol))
   .sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume));
  state.total=markets.length;
  let cursor=0;
  const workers=Array.from({length:2},async()=>{while(cursor<markets.length&&Date.now()>=state.blockedUntil){
   const symbol=markets[cursor++].symbol;
   try{const result=await inspect(symbol,Math.floor(Date.now()/1000)*1000);if(result)state.rows.push(result);}
   catch(e){state.errors++;state.error=String(e.message||e)==="API_BLOCKED"?"Binance API sınırı: tarama duraklatıldı.":String(e.message||e);}
   state.checked++;
  }});
  await Promise.all(workers);
  state.rows.sort((a,b)=>b.pricePct-a.pricePct);
  state.completed=state.checked===state.total&&state.errors===0;
 }catch(e){state.error=String(e.message||e);}
 finally{state.running=false;state.updatedAt=Date.now();}
 return secondScanStatus();
}
