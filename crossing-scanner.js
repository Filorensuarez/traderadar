import {detectDailyDipCross} from "./daily-dip-cross-engine.js";
const state={updatedAt:0,rows:[],checked:0,errors:[],running:false,universes:{}};
const timeout=()=>AbortSignal.timeout(11000);
async function json(url){const r=await fetch(url,{signal:timeout()});if(!r.ok)throw Error("HTTP "+r.status);return r.json();}
async function universe(exchange){
 if(exchange==="OKX"){const d=await json("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
  return (d.data||[]).filter(x=>/^[A-Z0-9]+-USDT$/.test(x.instId)&&+x.volCcy24h>1000)
   .sort((a,b)=>+b.volCcy24h-+a.volCcy24h).slice(0,65).map(x=>x.instId);}
 if(exchange==="KUCOIN"){const d=await json("https://api.kucoin.com/api/v1/market/allTickers");
  return (d.data?.ticker||[]).filter(x=>/^[A-Z0-9]+-USDT$/.test(x.symbol)&&+x.volValue>1000)
   .sort((a,b)=>+b.volValue-+a.volValue).slice(0,65).map(x=>x.symbol);}
 const d=await json("https://api.gateio.ws/api/v4/spot/tickers");
 return d.filter(x=>/^[A-Z0-9]+_USDT$/.test(x.currency_pair)&&+x.quote_volume>1000)
  .sort((a,b)=>+b.quote_volume-+a.quote_volume).slice(0,65).map(x=>x.currency_pair);
}
async function candles(exchange,symbol){
 if(exchange==="OKX"){const d=await json("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(symbol)+"&bar=1D&limit=150");
  return (d.data||[]).map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]}));}
 if(exchange==="KUCOIN"){const d=await json("https://api.kucoin.com/api/v1/market/candles?type=1day&symbol="+encodeURIComponent(symbol));
  return (d.data||[]).map(x=>({time:+x[0]*1000,open:+x[1],close:+x[2],high:+x[3],low:+x[4],volume:+x[5]}));}
 const d=await json("https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(symbol)+"&interval=1d&limit=150");
 return d.map(x=>({time:+x[0]*1000,volume:+x[1],close:+x[2],high:+x[3],low:+x[4],open:+x[5]}));
}
let lastUniverse=0,universeCache={};
export async function scanCrossings(){
 if(state.running)return crossingStatus();
 state.running=true;
 try{
  if(Date.now()-lastUniverse>15*60000){
   const results=await Promise.allSettled(["OKX","KUCOIN","GATE.IO"].map(async e=>[e,await universe(e)]));
   for(let i=0;i<results.length;i++){const e=["OKX","KUCOIN","GATE.IO"][i];if(results[i].status==="fulfilled")universeCache[e]=results[i].value[1];else state.errors.push(e+": "+results[i].reason.message);}
   lastUniverse=Date.now();
  }
  const errors=[],rows=[];let checked=0;
  for(const e of ["OKX","KUCOIN","GATE.IO"]){
   const list=universeCache[e]||[];
   for(let i=0;i<list.length;i+=8){
    const batch=await Promise.allSettled(list.slice(i,i+8).map(async symbol=>{
     const result=detectDailyDipCross(await candles(e,symbol));
     return {key:e+":"+symbol,row:result?{symbol:symbol.replace(/[-_]/,"/"),exchange:e,...result}:null};
    }));
    for(const x of batch){
     checked++;
     if(x.status==="fulfilled"&&x.value.row)rows.push(x.value.row);
     else if(x.status==="rejected"&&errors.length<10)errors.push(e+": "+x.reason.message);
    }
   }
  }
  state.rows=rows.sort((a,b)=>a.crossAgeDays-b.crossAgeDays||a.priceFromDipPct-b.priceFromDipPct).slice(0,150);
  state.checked=checked;state.updatedAt=Date.now();state.errors=errors;state.universes=Object.fromEntries(Object.entries(universeCache).map(([k,v])=>[k,v.length]));
 }finally{state.running=false;}
 return crossingStatus();
}
export function crossingStatus(){return {...state,notice:"Yalnızca tamamlanmış günlük mumlar; son 3 mumda EMA7/25 yukarı kesişimi ve 2–10 mum önce dip arar. Borsa başına ilk 65 USDT çifti taranır."};}
