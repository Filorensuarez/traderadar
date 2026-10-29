const BASE="https://data-api.binance.vision/api/v3";
const state={running:false,checked:0,total:0,rows:[],errors:0,error:null,updatedAt:0};
const average=a=>a.reduce((s,v)=>s+v,0)/a.length;
async function json(url){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);
 try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}finally{clearTimeout(t);}
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
 if(!(previousPrice>0&&previousVolumePerMin>0))return null;
 const pricePct=(recentPrice/previousPrice-1)*100,volumeX=recentVolumePerMin/previousVolumePerMin;
 if(pricePct<2||volumeX<3)return null;
 return {symbol,pricePct:+pricePct.toFixed(2),volumeX:+volumeX.toFixed(2),price:+Number(seconds.at(-1)[4]),updatedAt:Date.now()};
}
export async function runSecondScan(){
 if(state.running)return secondScanStatus();
 state.running=true;state.checked=0;state.total=0;state.rows=[];state.errors=0;state.error=null;
 try{
  const [exchange,tickers]=await Promise.all([json(BASE+"/exchangeInfo"),json(BASE+"/ticker/24hr")]);
  const active=new Set(exchange.symbols.filter(x=>x.status==="TRADING"&&x.isSpotTradingAllowed!==false&&x.quoteAsset==="USDT").map(x=>x.symbol));
  const markets=tickers.filter(t=>active.has(t.symbol))
   .sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume));
  state.total=markets.length;
  let cursor=0;
  const workers=Array.from({length:3},async()=>{while(cursor<markets.length){
   const symbol=markets[cursor++].symbol;
   try{const result=await inspect(symbol,Math.floor(Date.now()/1000)*1000);if(result)state.rows.push(result);}
   catch(e){state.errors++;state.error=String(e.message||e);}
   state.checked++;
  }});
  await Promise.all(workers);
  state.rows.sort((a,b)=>b.volumeX-a.volumeX||b.pricePct-a.pricePct);
 }catch(e){state.error=String(e.message||e);}
 finally{state.running=false;state.updatedAt=Date.now();}
 return secondScanStatus();
}
