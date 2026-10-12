import {observePaperPlan,recoverPaperPlans} from "./paper-performance-72h.js";

// USDT-only spot scanner. Each exchange has independent prices, liquidity and candles.
// The compatibility export names preserve the existing /api/daily-plans routes.
const providers=[
 {name:"BINANCE",kind:"binance",base:"https://data-api.binance.vision"},
 {name:"OKX",kind:"okx",base:"https://www.okx.com"},
 {name:"KUCOIN",kind:"kucoin",base:"https://api.kucoin.com"},
 {name:"GATE.IO",kind:"gate",base:"https://api.gateio.ws"},
 {name:"BITGET",kind:"bitget",base:"https://api.bitget.com"}
];
const POLICY=Object.freeze({
 minDayQuoteVolume:1000000,minMinuteQuoteVolume:3500,minVolumeRatio:2.5,
 minRsi:52,maxRsi:73,maxFiveMinuteRisePct:8,maxSpreadPct:0.4,
 feePerSidePct:0.1,slippagePerSidePct:0.1,riskPerTradePct:0.5,maxAllocationPct:10
});
const MAX_AGE=4*60000,MAX_PER_SOURCE=65;
const now=()=>Date.now(),round=n=>Number(n.toPrecision(10));
const state={running:false,updatedAt:0,startedAt:0,sources:{},plans:[],history:[],quote:"USDT",notice:"Yalnızca gerçek USDT spot işlem çiftleri; sanal işlem planları, otomatik emir değil."};
const plans=new Map(recoverPaperPlans().map(p=>[p.key,p])),history=[];
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function ema(a,n){const k=2/(n+1);let v=mean(a.slice(0,n));for(const x of a.slice(n))v=v*(1-k)+x*k;return v;}
function rsi(a,n=14){const d=a.slice(-n-1).map((x,i,z)=>i?x-z[i-1]:0).slice(1);const gain=mean(d.map(x=>Math.max(x,0))),loss=mean(d.map(x=>Math.max(-x,0)));return loss===0?100:100-100/(1+gain/loss);}
async function get(url){
 const r=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(11000)});
 if(!r.ok)throw Error("HTTP "+r.status);
 return r.json();
}
const validSymbol=s=>/^[A-Z0-9]+(?:-|_)USDT$/.test(s)||/^[A-Z0-9]+USDT$/.test(s);
const leveraged=s=>/(UP|DOWN|BULL|BEAR|[235][SL])(?:-|_)?USDT$/.test(s);
function row(symbol,price,bid,ask,volume){return {symbol,price:+price,bid:+bid,ask:+ask,volume:+volume};}
async function markets(p){
 let rows=[];
 if(p.kind==="binance"){
  const d=await get(p.base+"/api/v3/ticker/24hr");
  if(!Array.isArray(d))throw Error("Binance piyasa listesi alınamadı");
  rows=d.map(x=>row(x.symbol,x.lastPrice,x.bidPrice,x.askPrice,x.quoteVolume));
 }else if(p.kind==="okx"){
  const d=await get(p.base+"/api/v5/market/tickers?instType=SPOT");
  if(d.code!=="0"||!Array.isArray(d.data))throw Error(d.msg||"OKX piyasa verisi alınamadı");
  rows=d.data.map(x=>row(x.instId,x.last,x.bidPx,x.askPx,x.volCcy24h));
 }else if(p.kind==="kucoin"){
  const d=await get(p.base+"/api/v1/market/allTickers");
  if(d.code!=="200000"||!Array.isArray(d.data?.ticker))throw Error(d.msg||"KuCoin piyasa verisi alınamadı");
  rows=d.data.ticker.map(x=>row(x.symbol,x.last,x.buy,x.sell,x.volValue));
 }else if(p.kind==="gate"){
  const d=await get(p.base+"/api/v4/spot/tickers");
  if(!Array.isArray(d))throw Error("Gate.io piyasa verisi alınamadı");
  rows=d.map(x=>row(x.currency_pair,x.last,x.highest_bid,x.lowest_ask,x.quote_volume));
 }else if(p.kind==="bitget"){
  const d=await get(p.base+"/api/v3/market/tickers?category=SPOT");
  if(d.code!=="00000"||!Array.isArray(d.data))throw Error(d.msg||"Bitget piyasa verisi alınamadı");
  rows=d.data.filter(x=>x.category==="SPOT").map(x=>row(x.symbol,x.lastPrice,x.bid1Price,x.ask1Price,x.turnover24h));
 }
 return rows.filter(x=>validSymbol(x.symbol)&&!leveraged(x.symbol)&&Number.isFinite(x.volume)&&x.volume>=POLICY.minDayQuoteVolume&&x.price>0)
  .sort((a,b)=>b.volume-a.volume);
}
async function candles(p,s){
 let d,rows;
 if(p.kind==="binance"){
  d=await get(p.base+"/api/v3/klines?symbol="+encodeURIComponent(s)+"&interval=1m&limit=45");
  if(!Array.isArray(d))throw Error("Binance mum verisi yok");
  rows=d.map(x=>({time:+x[0],close:+x[4],quoteVolume:+x[7]}));
 }else if(p.kind==="okx"){
  d=await get(p.base+"/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1m&limit=45");
  if(d.code!=="0"||!Array.isArray(d.data))throw Error(d.msg||"OKX mum verisi yok");
  rows=d.data.map(x=>({time:+x[0],close:+x[4],quoteVolume:+x[7]}));
 }else if(p.kind==="kucoin"){
  d=await get(p.base+"/api/v1/market/candles?type=1min&symbol="+encodeURIComponent(s));
  if(d.code!=="200000"||!Array.isArray(d.data))throw Error(d.msg||"KuCoin mum verisi yok");
  rows=d.data.map(x=>({time:+x[0]*1000,close:+x[2],quoteVolume:+x[6]}));
 }else if(p.kind==="gate"){
  d=await get(p.base+"/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(s)+"&interval=1m&limit=45");
  if(!Array.isArray(d))throw Error("Gate.io mum verisi yok");
  rows=d.map(x=>({time:+x[0]*1000,close:+x[2],quoteVolume:+x[1]}));
 }else if(p.kind==="bitget"){
  d=await get(p.base+"/api/v3/market/candles?category=SPOT&symbol="+encodeURIComponent(s)+"&interval=1m&limit=45");
  if(d.code!=="00000"||!Array.isArray(d.data))throw Error(d.msg||"Bitget mum verisi alınamadı");
  rows=d.data.map(x=>({time:+x[0],close:+x[4],quoteVolume:+x[6]}));
 }
 return rows;
}
function evaluate(raw){
 const a=raw.filter(x=>Number.isFinite(x.time)&&x.time+60000<=now()&&x.close>0&&x.quoteVolume>=0)
  .sort((x,y)=>x.time-y.time).slice(-31);
 if(a.length!==31||now()-(a.at(-1).time+60000)>120000)return null;
 for(let i=1;i<a.length;i++)if(a[i].time-a[i-1].time!==60000)return null;
 const last=a.at(-1),close=a.map(x=>x.close);
 const change1=(last.close/a.at(-2).close-1)*100;
 const change3=(last.close/a.at(-4).close-1)*100;
 const change5=(last.close/a.at(-6).close-1)*100;
 const volBase=mean(a.slice(-21,-1).map(x=>x.quoteVolume));
 const volumeRatio=volBase>0?last.quoteVolume/volBase:0;
 const fast=ema(close,7),slow=ema(close,25),strength=rsi(close);
 if(!(fast>slow&&last.close>fast&&strength>=POLICY.minRsi&&strength<=POLICY.maxRsi))return null;
 if(!((change1>=0.6||change3>=1.2||change5>=2)&&change5<POLICY.maxFiveMinuteRisePct))return null;
 if(!(last.quoteVolume>=POLICY.minMinuteQuoteVolume&&volumeRatio>=POLICY.minVolumeRatio))return null;
 return {change1:+change1.toFixed(2),change3:+change3.toFixed(2),change5:+change5.toFixed(2),
  volumeRatio:+volumeRatio.toFixed(2),rsi:+strength.toFixed(1),ema7:round(fast),ema25:round(slow),candleTime:last.time};
}
function planState(p,t){
 if(!t||!Number.isFinite(t.price)||t.price<=0||!Number.isFinite(t.ask)||t.ask<=0)return {status:"SİNYAL GEÇERSİZ",reason:"Güncel fiyat yok",terminal:true};
 if(now()-p.createdAt>24*3600000)return {status:"SİNYAL GEÇERSİZ",reason:"24 saatlik süre doldu",terminal:true};
 if(t.price>=p.target)return {status:"HEDEF FİYAT GÖRÜLDÜ",reason:"Gerçekleşmiş satış değil",terminal:true};
 if(t.price<=p.stop)return {status:"SİNYAL GEÇERSİZ",reason:"Stop seviyesi görüldü",terminal:true};
 if(t.ask>p.entry*1.012)return {status:"FİYAT KAÇTI",reason:"Alış kotasyonu referansın %1,2 üzerinde",terminal:true};
 if(!Number.isFinite(t.bid)||t.bid<=0||(t.ask-t.bid)/t.ask*100>POLICY.maxSpreadPct)
  return {status:"BEKLE",reason:"Alış-satış kotasyonu eksik veya makas geniş",terminal:false};
 if(t.ask>=p.entry*0.997&&t.ask<=p.entry*1.003)return {status:"ALIŞ BÖLGESİNDE",reason:"Sanal izleme; otomatik emir yok",terminal:false};
 return {status:"BEKLE",reason:"Referans alış bölgesi dışında",terminal:false};
}
function publish(){
 state.plans=[...plans.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,80);
 state.history=history.slice(0,100);
 state.updatedAt=now();
}
export function researchPositionSize(capital,entry,stop){
 if(![capital,entry,stop].every(Number.isFinite)||capital<=0||entry<=stop||stop<=0)return null;
 const cost=entry*2*(POLICY.feePerSidePct+POLICY.slippagePerSidePct)/100;
 const riskBudget=capital*POLICY.riskPerTradePct/100;
 const quantity=Math.min(riskBudget/(entry-stop+cost),capital*POLICY.maxAllocationPct/100/entry);
 return {quantity:+quantity.toFixed(8),allocationUSDT:round(quantity*entry),
  riskBudgetUSDT:round(riskBudget),maxEstimatedLossUSDT:round(quantity*(entry-stop+cost))};
}
export function tryPlanStatus(){return {...state,plans:[...state.plans],history:[...state.history]};}
async function scanSource(p){
 const stat={checked:0,eligible:0,failed:0,error:null,lastError:null};
 state.sources[p.name]=stat;
 try{
  const universe=await markets(p);
  // Keep established signals in the monitoring group even if no longer top by volume.
  const selected=universe.slice(0,MAX_PER_SOURCE);
  const chosen=new Set(selected.map(x=>x.symbol));
  for(const [key,plan] of plans){
   if(plan.exchange!==p.name)continue;
   const original=key.slice(p.name.length+1);
   const ticker=universe.find(x=>x.symbol===original);
   if(ticker&&!chosen.has(original)){selected.push(ticker);chosen.add(original);}
  }
  stat.eligible=selected.length;
  if(!selected.length)stat.lastError="İşlem hacmi eşiğine uyan USDT paritesi bulunamadı";
  let index=0;
  async function worker(){
   while(index<selected.length){
    const t=selected[index++],key=p.name+":"+t.symbol;
    try{
     const old=plans.get(key);
     if(old){
      old.lastPrice=t.price;old.currentAsk=t.ask;old.lastCheckedAt=now();
      observePaperPlan(old,t.price);
      const next=planState(old,t);old.status=next.status;old.reason=next.reason;
      if(next.terminal){old.closedAt=now();plans.delete(key);history.unshift(old);}
     }else if(!history.some(x=>x.key===key&&now()-x.createdAt<24*3600000)){
      if(!(t.ask>0&&t.bid>0&&(t.ask-t.bid)/t.ask*100<=POLICY.maxSpreadPct))continue;
      const signal=evaluate(await candles(p,t.symbol));
      if(signal){
       const entry=round(t.ask),target=round(entry*1.03),stop=round(entry*0.985);
       const estimatedRoundTripCostPct=2*(POLICY.feePerSidePct+POLICY.slippagePerSidePct);
       const candidate={key,symbol:t.symbol.replace(/[-_]?USDT$/,"/USDT"),exchange:p.name,entry,target,stop,
        quote:"USDT",lastPrice:t.price,currentAsk:t.ask,createdAt:now(),lastCheckedAt:now(),
        status:"BEKLE",reason:"İlk tespit; sanal izleme",estimatedNetTargetPct:round(3-estimatedRoundTripCostPct),
        estimatedNetStopPct:round(-1.5-estimatedRoundTripCostPct),estimatedRoundTripCostPct,
        riskPerTradePct:POLICY.riskPerTradePct,maxAllocationPct:POLICY.maxAllocationPct,
        spreadPct:round((t.ask-t.bid)/t.ask*100),...signal};
       plans.set(key,candidate);observePaperPlan(candidate,t.price);
      }
     }
    }catch(e){stat.failed++;stat.lastError=String(e.message).slice(0,90);}
    finally{stat.checked++;if(stat.checked%5===0)publish();}
   }
  }
  await Promise.all(Array.from({length:Math.min(4,selected.length)},()=>worker()));
  if(stat.failed===stat.checked&&stat.checked>0)stat.error=stat.lastError||"Mum verisi alınamadı";
 }catch(e){stat.error=String(e.message);}
 finally{publish();}
}
export async function scanTryPlans(){
 if(state.running)return tryPlanStatus();
 state.running=true;state.startedAt=now();
 state.sources=Object.fromEntries(providers.map(p=>[p.name,{checked:0,eligible:0,failed:0,error:null,lastError:null}]));
 try{
  await Promise.all(providers.map(p=>scanSource(p)));
  for(const [key,p] of plans){
   if(now()-p.lastCheckedAt>MAX_AGE||now()-p.createdAt>24*3600000){
    plans.delete(key);p.status="SİNYAL GEÇERSİZ";
    p.reason="Yeniden kontrol süresi veya plan geçerliliği doldu";p.closedAt=now();history.unshift(p);
   }
  }
  history.length=Math.min(history.length,100);
  publish();
  console.log("USDT plan taraması: "+Object.entries(state.sources).map(([name,v])=>name+" "+v.checked+"/"+v.eligible+(v.error?" HATA: "+v.error:"")).join(" | ")+" | İzlenen: "+plans.size);
 }finally{state.running=false;}
 return tryPlanStatus();
}
export function startTryPlans(){
 scanTryPlans().catch(e=>{state.running=false;console.error("USDT tarama:",e);});
 setInterval(()=>scanTryPlans().catch(e=>{state.running=false;console.error("USDT tarama:",e);}),90000);
}
