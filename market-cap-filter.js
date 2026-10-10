// Fail-closed USD circulating market-cap filter.
// Symbol collisions are excluded; unknown or stale caps never pass.
const LIMIT=100_000_000;
const REFRESH_MS=60*60*1000;
let cache=new Map(),ambiguous=new Set(),updatedAt=0,lastError=null,loading=null;
export async function refreshMarketCaps(force=false){
 if(!force&&Date.now()-updatedAt<REFRESH_MS&&cache.size)return;
 if(loading)return loading;
 loading=(async()=>{
  const seen=new Map(),duplicates=new Set();
  try{
   for(let page=1;page<=12;page++){
    const url="https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page="+page+"&sparkline=false";
    const headers={Accept:"application/json"};
    if(process.env.COINGECKO_DEMO_KEY)headers["x-cg-demo-api-key"]=process.env.COINGECKO_DEMO_KEY;
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error("CoinGecko HTTP "+response.status);
    const items=await response.json();
    if(!Array.isArray(items))throw Error("Geçersiz piyasa değeri verisi");
    for(const item of items){
     const symbol=String(item.symbol||"").toUpperCase();
     const cap=Number(item.market_cap);
     if(!/^[A-Z0-9]{2,24}$/.test(symbol)||!Number.isFinite(cap)||cap<=0)continue;
     if(seen.has(symbol)&&seen.get(symbol).id!==item.id)duplicates.add(symbol);
     else seen.set(symbol,{id:item.id,cap});
    }
    if(items.length<250)break;
   }
   if(!seen.size)throw Error("Piyasa değeri listesi boş");
   cache=seen;ambiguous=duplicates;updatedAt=Date.now();lastError=null;
  }catch(e){lastError=e.message;cache=new Map();ambiguous=new Set();updatedAt=0;}
  finally{loading=null;}
 })();
 return loading;
}
export function eligibleMarketCap(symbol){
 const key=String(symbol||"").toUpperCase().replace(/[-_/]USDT$/,"");
 if(!updatedAt||Date.now()-updatedAt>2*REFRESH_MS||ambiguous.has(key))return null;
 const item=cache.get(key);
 return item&&item.cap<=LIMIT?item.cap:null;
}
export function marketCapStatus(){return {updatedAt,known:cache.size,ambiguous:ambiguous.size,lastError,
 maxUsd:LIMIT,stale:!updatedAt||Date.now()-updatedAt>2*REFRESH_MS};}
