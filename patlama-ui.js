const status=document.getElementById("patlamaStatus");
const cards=document.getElementById("patlamaCards");
const button=document.getElementById("patlamaScan");
let running=false;
const CONCURRENCY=8;
const BATCH_PAUSE_MS=150;
async function json(url){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(url,{cache:"no-store",signal:controller.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}finally{clearTimeout(timeout);}}
function analyze(rows,symbol,exchange,url){
 const sorted=[...rows].sort((a,b)=>Number(a[0])-Number(b[0]));
 const now=Date.now();
 const closed=sorted.filter(r=>{const t=Number(r[0]);return Number.isFinite(t)&&(t<1e11?t*1000:t)+60000<=now;});
 if(closed.length<32)return null;
 const last=closed.at(-1),previous=closed.slice(-31,-1);
 const avg=previous.reduce((s,r)=>s+Number(r[4]),0)/30;
 const p=Number(last[4]),gain=(p/avg-1)*100;
 const volumes=previous.map(r=>Number(r[5]));
 const vol=Number(last[5]),avgVol=volumes.reduce((a,b)=>a+b,0)/30;
 const prev5=volumes.slice(-5).reduce((a,b)=>a+b,0)/5;
 const prev5Before=volumes.slice(-10,-5).reduce((a,b)=>a+b,0)/5;
 if(![p,avg,vol,avgVol,prev5,prev5Before].every(Number.isFinite)||avg<=0||avgVol<=0||prev5Before<=0)return null;
 const volumeRatio=vol/avgVol,volumeSpeed=vol/prev5;
 // Volume must exceed its 30-minute baseline AND recent volume momentum must accelerate.
 if(gain<2||volumeRatio<1.5||volumeSpeed<1.2||prev5<=prev5Before)return null;
 const timestamp=Number(last[0]);const minuteStart=timestamp<1e11?timestamp*1000:timestamp;
 return {symbol,exchange,url,p,gain,volumeRatio,volumeSpeed,minuteStart,stage:"ALICI TEYİDİ BEKLENİYOR"};
}
async function buyerTrades(market,x,minuteStart){
 const twoStart=minuteStart-60000,end=minuteStart+60000;
 let trades;
 if(market.name==="BINANCE TR"){const j=await json("https://api.binance.me/api/v3/aggTrades?symbol="+encodeURIComponent(x.id)+"&startTime="+twoStart+"&endTime="+(end-1)+"&limit=1000");if(j.code!==0||!Array.isArray(j.data))throw Error(j.msg||"Binance TR işlem API hatası");trades=j.data.map(t=>({time:+t.T,buy:!t.m}));}
 else if(market.name==="OKX"){const j=await json("https://www.okx.com/api/v5/market/trades?instId="+encodeURIComponent(x.id)+"&limit=500");if(j.code!=="0")throw Error(j.msg||"API");trades=j.data.map(t=>({time:+t.ts,buy:t.side==="buy"}));}
 else if(market.name==="KUCOIN"){const j=await json("https://api.kucoin.com/api/v1/market/histories?symbol="+encodeURIComponent(x.id));if(j.code!=="200000")throw Error(j.msg||"API");trades=j.data.map(t=>({time:Number(t.time)/1e6,buy:t.side==="buy"}));}
 else if(market.name==="GATE.IO"){const j=await json("https://api.gateio.ws/api/v4/spot/trades?currency_pair="+encodeURIComponent(x.id)+"&limit=1000");trades=j.map(t=>({time:Math.round(Number(t.create_time_ms||Number(t.create_time)*1000)),buy:t.side==="buy"}));}
 else if(market.name==="COINBASE"){const j=await json("https://api.exchange.coinbase.com/products/"+encodeURIComponent(x.id)+"/trades?limit=1000");trades=j.map(t=>({time:Date.parse(t.time),buy:t.side==="sell"}));}
 else return null;
 trades=trades.filter(t=>Number.isFinite(t.time)).sort((a,b)=>a.time-b.time);
 // Do not infer unique buyer identities: each record is a buyer-initiated execution.
 // Reject partial two-minute samples instead of reporting misleading buyer growth.
 if(trades.length<2||trades[0].time>twoStart+5000||trades.at(-1).time<end-5000)return null;
 const prior=trades.filter(t=>t.time>=twoStart&&t.time<minuteStart&&t.buy).length;
 const current=trades.filter(t=>t.time>=minuteStart&&t.time<end&&t.buy).length;
 if(prior===0||current<=prior)return null;
 return {prior,current,growth:(current/prior-1)*100};
}
const markets=[
 {name:"BINANCE TR",async list(){const j=await json("https://www.binance.tr/open/v1/common/symbols");if(j.code!==0||!Array.isArray(j.data?.list))throw Error(j.msg||"Binance TR pariteleri alınamadı");return j.data.list.filter(x=>x.type===1&&x.spotTradingEnable===1&&["USDT","TRY"].includes(x.quoteAsset)).map(x=>({symbol:x.symbol.replace("_","/"),id:x.symbol.replace("_",""),url:"https://www.binance.tr/tr/trade/"+x.symbol}));},async candles(x){const j=await json("https://api.binance.me/api/v1/klines?symbol="+encodeURIComponent(x.id)+"&interval=1m&limit=120");if(j.code!==0||!Array.isArray(j.data))throw Error(j.msg||"Binance TR mum API hatası");return j.data;}},
 {name:"OKX",async list(){const j=await json("https://www.okx.com/api/v5/market/tickers?instType=SPOT");if(j.code!=="0")throw Error(j.msg||"API");return j.data.filter(x=>x.instId.endsWith("-USDT")&&+x.volCcy24h>0).sort((a,b)=>+b.volCcy24h-+a.volCcy24h).map(x=>({symbol:x.instId.replace("-",""),id:x.instId,url:"https://www.okx.com/trade-spot/"+x.instId.toLowerCase()}));},async candles(x){const j=await json("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(x.id)+"&bar=1m&limit=120");if(j.code!=="0")throw Error(j.msg||"API");return j.data.map(a=>[a[0],a[1],a[2],a[3],a[4],a[5]]).reverse();}},
 {name:"KUCOIN",async list(){const j=await json("https://api.kucoin.com/api/v1/market/allTickers");if(j.code!=="200000")throw Error(j.msg||"API");return j.data.ticker.filter(x=>x.symbol.endsWith("-USDT")&&+x.volValue>0).sort((a,b)=>+b.volValue-+a.volValue).map(x=>({symbol:x.symbol.replace("-",""),id:x.symbol,url:"https://www.kucoin.com/trade/"+x.symbol}));},async candles(x){const j=await json("https://api.kucoin.com/api/v1/market/candles?symbol="+encodeURIComponent(x.id)+"&type=1min");if(j.code!=="200000")throw Error(j.msg||"API");return j.data.slice(0,120).reverse().map(a=>[a[0],a[1],a[3],a[4],a[2],a[5]]);}},
 {name:"GATE.IO",async list(){const t=await json("https://api.gateio.ws/api/v4/spot/tickers");return t.filter(x=>x.currency_pair.endsWith("_USDT")&&+x.quote_volume>0).sort((a,b)=>+b.quote_volume-+a.quote_volume).map(x=>({symbol:x.currency_pair.replace("_",""),id:x.currency_pair,url:"https://www.gate.com/trade/"+x.currency_pair}));},async candles(x){const j=await json("https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(x.id)+"&interval=1m&limit=120");return j.map(a=>[a[0],a[5],a[3],a[4],a[2],a[6]]).sort((a,b)=>+a[0]-+b[0]);}},
 {name:"COINBASE",async list(){const t=await json("https://api.exchange.coinbase.com/products");return t.filter(x=>x.quote_currency==="USDT"&&x.status==="online"&&!x.trading_disabled).map(x=>({symbol:x.id.replace("-",""),id:x.id,url:"https://www.coinbase.com/advanced-trade/spot/"+x.id}));},async candles(x){const j=await json("https://api.exchange.coinbase.com/products/"+encodeURIComponent(x.id)+"/candles?granularity=60");if(!Array.isArray(j))throw Error("Mum verisi yok");return j.slice(0,120).reverse().map(a=>[a[0],a[3],a[2],a[1],a[4],a[5]]);}}
];
function render(items,stats){
 cards.replaceChildren();
 const summary=document.createElement("div");summary.className="info-box";
 summary.textContent=stats.map(s=>s.name+": "+s.ok+"/"+s.total+" incelendi"+(s.error?" (HATA: "+s.error+")":"")).join(" • ");
 cards.append(summary);
 status.textContent=(running?"Tarama sürüyor":"Tarama tamamlandı")+" • "+stats.reduce((a,s)=>a+s.ok,0)+" mum verisi incelendi • "+items.length+" alıcı işlemleri teyitli aday. Alıcı sayısı benzersiz kişi sayısı değildir.";
 if(!items.length&&!running){const p=document.createElement("p");p.textContent="Fiyat, hacim ivmesi ve alıcı yönlü işlem sayısı artışı koşullarını birlikte doğrulayan aday bulunamadı. Eksik işlem geçmişi sinyal olarak gösterilmez.";cards.append(p);}
 for(const x of items.sort((a,b)=>b.gain-a.gain)){
  const el=document.createElement("article");el.className="coin-card";el.style.cssText="padding:16px;border:1px solid #41516a;border-radius:12px;margin:8px 0";
  const title=document.createElement("h3");title.textContent=x.exchange+" • "+x.symbol+" — TAKİPTE";
  const desc=document.createElement("p");desc.textContent="Son 1 dk kapanışı / önceki 30 dk ortalaması: +"+x.gain.toFixed(2)+"% • Hacim / 30 dk ortalaması: "+x.volumeRatio.toFixed(2)+"x • Hacim hızı: "+x.volumeSpeed.toFixed(2)+"x • Alıcı yönlü işlem sayısı: "+x.buyers.prior+" → "+x.buyers.current+" (+"+x.buyers.growth.toFixed(1)+"%) • Fiyat: "+x.p;
  const link=document.createElement("a");link.href=x.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Grafiği aç";
  el.append(title,desc,link);cards.append(el);
 }
}
async function scan(){if(running)return;running=true;button.disabled=true;cards.textContent="Beş borsanın verileri taranıyor...";const items=[],stats=[],seen=new Set();try{for(const market of markets){const s={name:market.name,total:0,ok:0,error:""};stats.push(s);status.textContent=market.name+" taranıyor...";try{const symbols=await market.list();s.total=symbols.length;let failures=0;for(let i=0;i<symbols.length;i+=CONCURRENCY){await Promise.all(symbols.slice(i,i+CONCURRENCY).map(async x=>{try{const rows=await market.candles(x);if(!Array.isArray(rows)||rows.length<33)throw Error("Yetersiz mum");s.ok++;const hit=analyze(rows,x.symbol,market.name,x.url);if(hit){const buyers=await buyerTrades(market,x,hit.minuteStart);if(!buyers)return;hit.buyers=buyers;hit.stage="PATLAMA TAKİBİ";const key=market.name+":"+x.symbol;if(!seen.has(key)){seen.add(key);items.push(hit);render(items,stats);}}}catch(e){failures++;s.error=e.message;}}));status.textContent=market.name+" "+Math.min(i+CONCURRENCY,s.total)+"/"+s.total+" işlendi • Başarılı: "+s.ok+" • Toplam aday: "+items.length;await new Promise(resolve=>setTimeout(resolve,BATCH_PAUSE_MS));}if(failures===0)s.error="";else s.error=failures+" parite okunamadı; son hata: "+s.error;}catch(e){s.error=e.message;}render(items,stats);}}finally{running=false;button.disabled=false;render(items,stats);}}
button?.addEventListener("click",scan);
let timer=null;
function startAuto(){if(timer)return;scan();timer=setInterval(()=>{if(!document.hidden)scan();},60000);}
document.getElementById("momentumButton")?.addEventListener("click",startAuto);
if(!document.getElementById("momentum")?.hidden)startAuto();
