import {dailyContact} from "./daily-touch-model.js";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const state={running:false,checked:0,eligible:0,failed:0,updatedAt:0,rows:[],error:null};
let offset=0;
export const dailyTouchStatus=()=>({...state,rows:[...state.rows]});
export async function scanDailyTouch(){
 if(state.running)return dailyTouchStatus();
 state.running=true;state.checked=0;state.failed=0;state.error=null;
 try{
  const base="https://data-api.binance.vision";
  const response=await fetch(base+"/api/v3/ticker/24hr",{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("Binance HTTP "+response.status);
  const all=(await response.json()).filter(x=>/^[A-Z0-9]{2,20}(USDT|TRY)$/.test(x.symbol)&&+x.lastPrice>0&&+x.quoteVolume>0).sort((a,b)=>+b.quoteVolume-+a.quoteVolume);
  state.eligible=all.length;
  const selected=all.slice(0,30),seen=new Set(selected.map(x=>x.symbol));
  const pool=all.filter(x=>!seen.has(x.symbol));
  for(let i=0;i<Math.min(120,pool.length);i++)selected.push(pool[(offset+i)%pool.length]);
  offset=pool.length?(offset+120)%pool.length:0;
  const found=[];let next=0;
  async function worker(){
   while(next<selected.length){
    const t=selected[next++];
    try{
     const r=await fetch(base+"/api/v3/klines?symbol="+encodeURIComponent(t.symbol)+"&interval=1d&limit=140",{signal:AbortSignal.timeout(12000)});
     if(r.status===429||r.status===418)throw Error("API hız sınırı "+r.status);
     if(!r.ok)throw Error("HTTP "+r.status);
     const raw=(await r.json()).map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4]}));
     const a=dailyContact(raw);
     if(a.match)found.push({...a,exchange:"BINANCE",symbol:t.symbol.replace(/(USDT|TRY)$/,"/$1"),market:t.symbol});
    }catch(e){state.failed++;if(!state.error)state.error=String(e.message).slice(0,100);}
    finally{state.checked++;}
    await sleep(240);
   }
  }
  await Promise.all([worker(),worker()]);
  state.rows=found.sort((a,b)=>Math.abs(a.ema7/a.ema25-1)-Math.abs(b.ema7/b.ema25-1));
  state.updatedAt=Date.now();
 }catch(e){state.error=String(e.message).slice(0,140);}
 finally{state.running=false;}
 return dailyTouchStatus();
}
export function startDailyTouch(){scanDailyTouch().catch(console.error);setInterval(()=>scanDailyTouch().catch(console.error),1800000);}
