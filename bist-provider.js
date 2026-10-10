import {scanBistCandles} from "./bist-radar.js";

const allowedSymbols = (process.env.BIST_SYMBOLS || "THYAO,ASELS,TUPRS,BIMAS,AKBNK,GARAN,ISCTR,EREGL,KCHOL,SAHOL,SISE,TCELL,TOASO,FROTO,PGSUS").split(",").map(s=>s.trim().toUpperCase()).filter(s=>/^[A-Z0-9]{2,8}$/.test(s)).slice(0,100);
const providerUrl=process.env.BIST_DATA_URL || "";
const token=process.env.BIST_DATA_TOKEN || "";
const cache={updatedAt:0,rows:[],errors:[],scanned:0,providerConnected:false,source:"Yetkilendirilmiş veri sağlayıcısı"};
let busy=false;
function configured(){
  if(!providerUrl)return false;
  try{
    const url=new URL(providerUrl.replace("{symbol}","THYAO"));
    return url.protocol==="https:" && providerUrl.includes("{symbol}");
  }catch{return false;}
}
async function getCandles(symbol){
  const url=providerUrl.replace("{symbol}",encodeURIComponent(symbol));
  const headers={Accept:"application/json"};
  if(token)headers.Authorization="Bearer "+token;
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("Veri sağlayıcı HTTP "+response.status);
  const body=await response.json();
  const candles=Array.isArray(body)?body:body.candles;
  if(!Array.isArray(candles))throw Error("Beklenen candles dizisi bulunamadı");
  const now=Date.now();
  const normalized=candles.map(c=>({...c,time:typeof c.time==="string"&&!/^\d+$/.test(c.time)?Date.parse(c.time):Number(c.time)}))
    .map(c=>({...c,time:c.time<1e11?c.time*1000:c.time}))
    .filter(c=>Number.isFinite(c.time)&&c.time<=now);
  return normalized;
}
export async function scanBistProvider(){
  if(busy)return {...cache,scanning:true};
  if(!configured())return {...cache,providerConnected:false,
    message:"Lisanslı veri sağlayıcı bağlantısı tanımlanmadı. CSV taraması kullanılabilir."};
  busy=true;
  const results=[],errors=[];
  try{
    for(let i=0;i<allowedSymbols.length;i+=5){
      const batch=await Promise.allSettled(allowedSymbols.slice(i,i+5).map(async symbol=>{
        const candles=await getCandles(symbol);
        const result=scanBistCandles(symbol,candles,{source:"Yetkili veri sağlayıcısı"});
        return result;
      }));
      batch.forEach((r,j)=>{
        if(r.status==="fulfilled")results.push(r.value);
        else errors.push({symbol:allowedSymbols[i+j],error:String(r.reason?.message||"Veri hatası")});
      });
    }
    cache.rows=results.sort((a,b)=>(b.score||0)-(a.score||0));
    cache.errors=errors;cache.updatedAt=Date.now();cache.scanned=allowedSymbols.length;
    cache.providerConnected=true;
    return {...cache};
  }finally{busy=false;}
}
export function getBistState(){return {...cache,providerConnected:configured(),scanning:busy,
  message:configured()?"Veri sağlayıcı bağlantısı tanımlı.":"Veri sağlayıcı bağlantısı yok. CSV kullanın."};}
