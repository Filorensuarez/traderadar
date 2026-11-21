// 1-minute candle low vs the most recently CLOSED 1-hour candle close.
// Neutral round-robin scan across all active Binance Global / OKX Global USDT spot markets.
const el=id=>document.getElementById(id);
const state={BINANCE:{symbols:[],offset:0,error:""},OKX:{symbols:[],offset:0,error:""}};
const hits=new Map();let running=false,scanned=0,cycles=0;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url){
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error("HTTP "+response.status);
 const body=await response.json();if(body.code&&body.code!=="0")throw Error(body.msg||body.code);
 return body;
}
async function markets(exchange){
 if(exchange==="BINANCE"){
  const data=await json("https://api.binance.com/api/v3/exchangeInfo");
  return data.symbols.filter(x=>x.status==="TRADING"&&x.quoteAsset==="USDT"&&x.isSpotTradingAllowed!==false).map(x=>x.symbol);
 }
 const data=await json("https://www.okx.com/api/v5/public/instruments?instType=SPOT");
 return data.data.filter(x=>x.state==="live"&&x.quoteCcy==="USDT").map(x=>x.instId);
}
async function check(exchange,symbol){
 const now=Date.now();let minute,hour;
 if(exchange==="BINANCE"){
  [minute,hour]=await Promise.all([
   json("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=1m&limit=3"),
   json("https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=1h&limit=3")
  ]);
  minute=minute.filter(x=>Number(x[6])<now).at(-1);
  hour=hour.filter(x=>Number(x[6])<now).at(-1);
  if(!minute||!hour)return;
  minute={low:Number(minute[3]),close:Number(minute[4]),time:Number(minute[6])};
  hour={close:Number(hour[4]),time:Number(hour[6])};
 }else{
  [minute,hour]=await Promise.all([
   json("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(symbol)+"&bar=1m&limit=3"),
   json("https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(symbol)+"&bar=1H&limit=3")
  ]);
  minute=minute.data.filter(x=>x[8]==="1").sort((a,b)=>Number(b[0])-Number(a[0]))[0];
  hour=hour.data.filter(x=>x[8]==="1").sort((a,b)=>Number(b[0])-Number(a[0]))[0];
  if(!minute||!hour)return;
  minute={low:Number(minute[3]),close:Number(minute[4]),time:Number(minute[0])+60000};
  hour={close:Number(hour[4]),time:Number(hour[0])+3600000};
 }
 if(!(hour.close>0&&minute.low>0)||now-minute.time>180000)return;
 const drop=(minute.low/hour.close-1)*100;
 if(drop<=-7){
  hits.set(exchange+":"+symbol,{exchange,symbol:symbol.replace(/-/g,"/").replace(/USDT$/,"/USDT").replace("//","/"),drop,low:minute.low,reference:hour.close,at:now});
 }
}
function render(){
 const list=[...hits.values()].filter(x=>Date.now()-x.at<300000).sort((a,b)=>a.drop-b.drop);
 const total=state.BINANCE.symbols.length+state.OKX.symbols.length;
 el("hourDropStatus").textContent=(running?"Taranıyor":"Duraklatıldı")+" | "+scanned+"/"+total+" parite kontrolü | Tur: "+cycles+" | Eşleşme: "+list.length+
  [state.BINANCE.error,state.OKX.error].filter(Boolean).map(x=>" | "+x).join("");
 const root=el("hourDropResults");root.replaceChildren();
 if(!list.length){const p=document.createElement("p");p.textContent="Son 5 dakikada doğrulanan %7 düşüş bulunamadı.";root.append(p);}
 for(const x of list){
  const card=document.createElement("div");card.className="info-box";
  const h=document.createElement("h3");h.textContent=x.exchange+" · "+x.symbol;
  const p=document.createElement("p");p.textContent="Düşüş: %"+Math.abs(x.drop).toFixed(2)+" | 1 dk dip: "+x.low+" | Son kapanmış 1 saatlik mum kapanışı: "+x.reference;
  card.append(h,p);root.append(card);
 }
}
async function loop(){
 if(running)return;running=true;el("hourDropToggle").textContent="Taramayı Durdur";
 for(const exchange of ["BINANCE","OKX"]){
  try{state[exchange].symbols=await markets(exchange);state[exchange].error="";}
  catch(e){state[exchange].error=exchange+": "+e.message;}
 }
 while(running){
  for(const exchange of ["BINANCE","OKX"]){
   if(!running)break;
   const s=state[exchange];if(!s.symbols.length)continue;
   // No daily performance, liquidity or top-gainer filter.
   const batch=Math.min(12,s.symbols.length);
   for(let i=0;i<batch&&running;i++){
    const symbol=s.symbols[s.offset%s.symbols.length];s.offset++;scanned++;
    try{await check(exchange,symbol);s.error="";}
    catch(e){s.error=exchange+": "+e.message;if(/429|418/.test(e.message)){await wait(60000);break;}}
    render();await wait(exchange==="OKX"?450:180);
   }
  }
  cycles++;render();await wait(1000);
 }
 el("hourDropToggle").textContent="Taramayı Başlat";render();
}
el("hourDropToggle")?.addEventListener("click",()=>{if(running){running=false;}else{void loop();}});
render();
