const status=document.getElementById("patlamaStatus");
const cards=document.getElementById("patlamaCards");
const button=document.getElementById("patlamaScan");
let running=false;
const CONCURRENCY=8;
const BATCH_PAUSE_MS=150;
async function json(url){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(url,{cache:"no-store",signal:controller.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}finally{clearTimeout(timeout);}}
function analyze(rows,symbol,exchange,url){
 const sorted=[...rows].sort((a,b)=>Number(a[0])-Number(b[0]));
 if(sorted.length<33)return null;
 const now=Date.now();
 const closed=sorted.filter(r=>{const t=Number(r[0]);return Number.isFinite(t)&&(t<1e11?t*1000:t)+60000<=now;});
 if(closed.length<32)return null;
 const recent=closed.slice(-2);
 const base=closed.at(-32);
 const basePrice=Number(base[4]);
 const lastPrice=Number(recent.at(-1)[4]);
 if(!Number.isFinite(basePrice)||basePrice<=0||!Number.isFinite(lastPrice))return null;
 const gain=(lastPrice/basePrice-1)*100;
 if(gain<2)return null;
 return {symbol,exchange,url,p:lastPrice,gain,stage:"TAKİPTE"};
}
const markets=[
 {name:"BINANCE",async list(){const t=await json("https://api.binance.com/api/v3/ticker/24hr");return t.filter(x=>x.symbol.endsWith("USDT")&&+x.quoteVolume>0&&!/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol)).sort((a,b)=>+b.quoteVolume-+a.quoteVolume).map(x=>({symbol:x.symbol,id:x.symbol,url:"https://www.binance.com/en/trade/"+x.symbol.replace(/USDT$/,"_USDT")}));},async candles(x){return await json("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(x.id)+"&interval=1m&limit=120");}},
 {name:"OKX",async list(){const j=await json("https://www.okx.com/api/v5/market/tickers?instType=SPOT");if(j.code!=="0")throw Error(j.msg||"API");return j.data.filter(x=>x.instId.endsWith("-USDT")&&+x.volCcy24h>0).sort((a,b)=>+b.volCcy24h-+a.volCcy24h).map(x=>({symbol:x.instId.replace("-",""),id:x.instId,url:"https://www.okx.com/trade-spot/"+x.instId.toLowerCase()}));},async candles(x){const j=await json("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(x.id)+"&bar=1m&limit=120");if(j.code!=="0")throw Error(j.msg||"API");return j.data.map(a=>[a[0],a[1],a[2],a[3],a[4]]).reverse();}},
 {name:"KUCOIN",async list(){const j=await json("https://api.kucoin.com/api/v1/market/allTickers");if(j.code!=="200000")throw Error(j.msg||"API");return j.data.ticker.filter(x=>x.symbol.endsWith("-USDT")&&+x.volValue>0).sort((a,b)=>+b.volValue-+a.volValue).map(x=>({symbol:x.symbol.replace("-",""),id:x.symbol,url:"https://www.kucoin.com/trade/"+x.symbol}));},async candles(x){const j=await json("https://api.kucoin.com/api/v1/market/candles?symbol="+encodeURIComponent(x.id)+"&type=1min");if(j.code!=="200000")throw Error(j.msg||"API");return j.data.slice(0,120).reverse().map(a=>[a[0],a[1],a[3],a[4],a[2]]);}},
 {name:"GATE.IO",async list(){const t=await json("https://api.gateio.ws/api/v4/spot/tickers");return t.filter(x=>x.currency_pair.endsWith("_USDT")&&+x.quote_volume>0).sort((a,b)=>+b.quote_volume-+a.quote_volume).map(x=>({symbol:x.currency_pair.replace("_",""),id:x.currency_pair,url:"https://www.gate.com/trade/"+x.currency_pair}));},async candles(x){const j=await json("https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(x.id)+"&interval=1m&limit=120");return j.map(a=>[a[0],a[5],a[3],a[4],a[2]]).sort((a,b)=>+a[0]-+b[0]);}},
 {name:"COINBASE",async list(){const t=await json("https://api.exchange.coinbase.com/products");return t.filter(x=>x.quote_currency==="USDT"&&x.status==="online"&&!x.trading_disabled).map(x=>({symbol:x.id.replace("-",""),id:x.id,url:"https://www.coinbase.com/advanced-trade/spot/"+x.id}));},async candles(x){const j=await json("https://api.exchange.coinbase.com/products/"+encodeURIComponent(x.id)+"/candles?granularity=60");if(!Array.isArray(j))throw Error("Mum verisi yok");return j.slice(0,120).reverse().map(a=>[a[0],a[3],a[2],a[1],a[4]]);}}
];
function render(items,stats){
 cards.replaceChildren();
 const summary=document.createElement("div");summary.className="info-box";
 summary.textContent=stats.map(s=>s.name+": "+s.ok+"/"+s.total+" incelendi"+(s.error?" (HATA: "+s.error+")":"")).join(" • ");
 cards.append(summary);
 status.textContent="Tarama tamamlandı • "+stats.reduce((a,s)=>a+s.ok,0)+" parite • "+items.length+" takipte.";
 if(!items.length){const p=document.createElement("p");p.textContent=stats.some(s=>s.error)?"Bazı borsalar taranamadı; sonuçlar eksik olabilir.":"30 dakika öncesine göre son 2 mum sonunda %2 yükselen coin bulunamadı.";cards.append(p);}
 for(const x of items.sort((a,b)=>b.gain-a.gain)){
  const el=document.createElement("article");el.className="coin-card";el.style.cssText="padding:16px;border:1px solid #41516a;border-radius:12px;margin:8px 0";
  const title=document.createElement("h3");title.textContent=x.exchange+" • "+x.symbol+" — TAKİPTE";
  const desc=document.createElement("p");desc.textContent="30 dakika öncesine göre yükseliş: +"+x.gain.toFixed(2)+"% • Son kapanış: "+x.p;
  const link=document.createElement("a");link.href=x.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Grafiği aç";
  el.append(title,desc,link);cards.append(el);
 }
}
async function scan(){if(running)return;running=true;button.disabled=true;cards.textContent="Beş borsanın verileri taranıyor...";const items=[],stats=[];try{for(const market of markets){const s={name:market.name,total:0,ok:0,error:""};stats.push(s);status.textContent=market.name+" taranıyor...";try{const symbols=await market.list();s.total=symbols.length;let failures=0;for(let i=0;i<symbols.length;i+=CONCURRENCY){await Promise.all(symbols.slice(i,i+CONCURRENCY).map(async x=>{try{const rows=await market.candles(x);if(!Array.isArray(rows)||rows.length<33)throw Error("Yetersiz mum");s.ok++;const hit=analyze(rows,x.symbol,market.name,x.url);if(hit)items.push(hit);}catch(e){failures++;s.error=e.message;}}));status.textContent=market.name+" "+Math.min(i+CONCURRENCY,s.total)+"/"+s.total+" işlendi • Başarılı: "+s.ok+" • Toplam aday: "+items.length;await new Promise(resolve=>setTimeout(resolve,BATCH_PAUSE_MS));}if(failures===0)s.error="";else s.error=failures+" parite okunamadı; son hata: "+s.error;}catch(e){s.error=e.message;}render(items,stats);}}finally{running=false;button.disabled=false;}}
button?.addEventListener("click",scan);
let timer=null;
function startAuto(){if(timer)return;scan();timer=setInterval(()=>{if(!document.hidden)scan();},60000);}
document.getElementById("momentumButton")?.addEventListener("click",startAuto);
if(!document.getElementById("momentum")?.hidden)startAuto();
