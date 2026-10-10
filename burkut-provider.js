/**
 * Bürküt free API adapter: delayed quotes and daily OHLCV only.
 * The free plan is limited to 1000 requests/month, so automatic refresh
 * is deliberately restricted. This is not a 5/15-minute live scanner.
 */
const BASE="https://api.burkutportfoy.com/api/public/v1";
const key=()=>process.env.BURKUT_API_KEY||"";
const watchlist=(process.env.BIST_SYMBOLS||
 "THYAO,ASELS,TUPRS,BIMAS,AKBNK,GARAN,ISCTR,EREGL,KCHOL,SAHOL,SISE,TCELL,TOASO,FROTO,PGSUS")
 .split(",").map(x=>x.trim().toUpperCase()).filter(x=>/^[A-Z0-9]{2,8}$/.test(x)).slice(0,25);
let state={updatedAt:0,rows:[],errors:[],provider:"Bürküt (15 dk gecikmeli)",interval:"1D",
  message:"Ücretsiz Bürküt anahtarı Railway üzerinde tanımlanmadı.",configured:false};
let running=false;
let lastRequest=0;
let requestsThisMonth=0;
let month="";
function monthKey(){return new Date().toISOString().slice(0,7);}
function normalizeQuote(x){
  const symbol=String(x.symbol||x.code||"").toUpperCase();
  const price=Number(x.price??x.currentPrice);
  if(!/^[A-Z0-9]{2,8}$/.test(symbol)||!Number.isFinite(price)||price<=0)return null;
  return {symbol,price,changePercent:Number(x.changePercent??x.dailyChangePct??0),
    volume:Number(x.volume??0),updatedAt:x.updatedAt||null,
    stale:x.stale===true};
}
async function call(path){
  if(month!==monthKey()){month=monthKey();requestsThisMonth=0;}
  if(requestsThisMonth>=900)throw Error("Güvenlik için aylık 900 istek sınırına ulaşıldı.");
  const response=await fetch(BASE+path,{headers:{"X-API-Key":key(),Accept:"application/json"},
    signal:AbortSignal.timeout(16000)});
  requestsThisMonth++;
  if(!response.ok)throw Error("Bürküt HTTP "+response.status);
  return response.json();
}
export async function scanBurkut({force=false}={}){
  if(!key())return {...state,configured:false};
  if(running)return {...state,scanning:true};
  const now=Date.now();
  if(now-lastRequest<30*60*1000)return {...state,
    message:"Ücretsiz kotayı korumak için en fazla 30 dakikada bir güncellenir."};
  running=true;lastRequest=now;
  try{
    // One bulk call for the full stock universe. No fabricated intraday candles.
    const raw=await call("/stocks");
    const array=Array.isArray(raw)?raw:Array.isArray(raw.data)?raw.data:
      Array.isArray(raw.stocks)?raw.stocks:Array.isArray(raw.results)?raw.results:null;
    if(!array)throw Error("Toplu fiyat yanıtının biçimi beklenenden farklı.");
    const all=array.map(normalizeQuote).filter(Boolean);
    const tracked=all.filter(x=>watchlist.includes(x.symbol));
    state={updatedAt:Date.now(),rows:tracked,universeCount:all.length,errors:[],
      configured:true,provider:"Bürküt (15 dk gecikmeli)",interval:"Gecikmeli anlık görüntü",
      requestsThisMonth,quota:1000,
      message:"Fiyat/hacim listesi. Dakikalık EMA, MACD ve kırılım teyidi bu veriyle hesaplanmaz."};
    return {...state};
  }catch(e){
    state={...state,configured:true,errors:[e.message],requestsThisMonth,
      message:"Bürküt veri sorgusu başarısız: "+e.message};
    return {...state};
  }finally{running=false;}
}
export function burkutState(){return {...state,configured:!!key(),scanning:running,
  requestsThisMonth,quota:1000};}
