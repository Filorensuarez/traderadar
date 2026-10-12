// TRY-quoted spot watchlist. Each exchange's prices and candles stay separate.
const state={running:false,updatedAt:0,sources:{},plans:[],history:[]};
const plans=new Map(),history=[];
const now=()=>Date.now(),round=x=>Number(x.toPrecision(9));
async function get(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(11000)});
 if(!r.ok)throw Error("HTTP "+r.status);
 return r.json();
}
const providers=[
 {name:"BINANCE TRY",ticker:"https://data-api.binance.vision/api/v3/ticker/24hr",kind:"binance",base:"https://data-api.binance.vision"},
 {name:"OKX TR",ticker:"https://tr.okx.com/api/v5/market/tickers?instType=SPOT",kind:"okx",base:"https://tr.okx.com"},
 {name:"BINANCE TR",ticker:"https://api.binance.me/api/v3/ticker/24hr",kind:"binanceTR",base:"https://api.binance.me"}
];
function normalize(p,data){
 if(p.kind==="okx"){
  if(data.code!=="0")throw Error(data.msg||"API hata");
  return (data.data||[]).filter(x=>/^[A-Z0-9]+-TRY$/.test(x.instId))
   .map(x=>({symbol:x.instId,volume:Number(x.volCcy24h)*Number(x.last),price:Number(x.last),bid:Number(x.bidPx),ask:Number(x.askPx)}));
 }
 const rows=Array.isArray(data)?data:Array.isArray(data.data)?data.data:[];
 if(!rows.length)throw Error("Piyasa listesi alınamadı");
 return rows.filter(x=>/^[A-Z0-9]+TRY$/.test(x.symbol))
  .map(x=>({symbol:x.symbol,volume:Number(x.quoteVolume),price:Number(x.lastPrice),bid:Number(x.bidPrice),ask:Number(x.askPrice)}));
}
async function candles(p,s){
 const url=p.kind==="okx"?
  p.base+"/api/v5/market/candles?instId="+encodeURIComponent(s)+"&bar=1m&limit=45":
  p.base+(p.kind==="binanceTR"?"/api/v1/klines":"/api/v3/klines")+"?symbol="+encodeURIComponent(s)+"&interval=1m&limit=45";
 const d=await get(url);
 if(p.kind==="okx"){
  if(d.code!=="0")throw Error(d.msg||"mum API hatası");
  return d.data.map(x=>({time:Number(x[0]),close:Number(x[4]),high:Number(x[2]),volume:Number(x[7])}));
 }
 const rows=Array.isArray(d)?d:d.data;
 if(!Array.isArray(rows))throw Error("Mum verisi alınamadı");
 return rows.map(x=>({time:Number(x[0]),close:Number(x[4]),high:Number(x[2]),volume:Number(x[7])}));
}
function evaluate(raw){
 const a=raw.filter(x=>x.time+60000<=now()).sort((x,y)=>x.time-y.time).slice(-31);
 if(a.length!==31||now()-(a.at(-1).time+60000)>120000)return null;
 for(let i=1;i<a.length;i++)if(a[i].time-a[i-1].time!==60000)return null;
 const last=a.at(-1),prev=a.at(-2),prev3=a.at(-4),prev5=a.at(-6);
 if(![last.close,prev.close,prev3.close,prev5.close].every(x=>x>0))return null;
 const change1=(last.close/prev.close-1)*100,change3=(last.close/prev3.close-1)*100,change5=(last.close/prev5.close-1)*100;
 const volBase=a.slice(-21,-1).reduce((s,x)=>s+x.volume,0)/20;
 const volumeRatio=volBase>0?last.volume/volBase:0;
 if(!((change1>=0.6||change3>=1.2||change5>=2)&&change5<12&&volumeRatio>=2.5&&last.volume>=300000))return null;
 return {change1:+change1.toFixed(2),change3:+change3.toFixed(2),change5:+change5.toFixed(2),volumeRatio:+volumeRatio.toFixed(2),candleTime:last.time};
}
export function tryPlanStatus(){return {...state,plans:[...state.plans],history:[...history]};}
export async function scanTryPlans(){
 if(state.running)return tryPlanStatus();
 state.running=true;const sourceState={};state.sources=sourceState;
 try{
  for(const p of providers){
   const stat={checked:0,eligible:0,error:null};sourceState[p.name]=stat;state.sources={...sourceState};
   try{
    const tickers=normalize(p,await get(p.ticker)).filter(x=>x.volume>=3000000&&x.price>0&&Number.isFinite(x.volume)&&
     !/(UP|DOWN|BULL|BEAR|[235][SL])(?:-|)TRY$/.test(x.symbol)).sort((a,b)=>b.volume-a.volume).slice(0,80);
    stat.eligible=tickers.length;
    let idx=0;
    async function worker(){
     while(idx<tickers.length){
      const t=tickers[idx++],key=p.name+":"+t.symbol;
      try{
       const existing=plans.get(key);
       if(existing){
        existing.lastPrice=t.price;existing.lastCheckedAt=now();
        if(t.price>=existing.target){existing.status="HEDEF FİYAT GÖRÜLDÜ";existing.closedAt=now();}
        else if(t.price<=existing.stop){existing.status="STOP FİYATI GÖRÜLDÜ";existing.closedAt=now();}
        else if(t.price>existing.entry*1.012){existing.status="ALIŞ SEVİYESİ KAÇTI";existing.closedAt=now();}
        else if(now()-existing.createdAt>24*3600000){existing.status="SÜRESİ DOLDU";existing.closedAt=now();}
        if(existing.closedAt){plans.delete(key);history.unshift(existing);}
       }else if(!history.some(x=>x.key===key&&now()-x.createdAt<24*3600000)){
        const signal=evaluate(await candles(p,t.symbol));
        if(signal&&t.ask>0&&t.bid>0&&(t.ask-t.bid)/t.ask<0.008){
         const entry=round(t.ask),target=round(entry*1.03),stop=round(entry*0.985);
         plans.set(key,{key,symbol:t.symbol.replace(/[-]?TRY$/,"/TRY"),exchange:p.name,entry,target,stop,
          lastPrice:t.price,createdAt:now(),lastCheckedAt:now(),status:"İZLEME ADAYI",...signal});
        }
       }
      }catch(e){stat.error=stat.error||e.message;}
      stat.checked++;
      if(stat.checked%5===0){state.sources={...sourceState};state.plans=[...plans.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,50);state.updatedAt=now();}
     }
    }
    await Promise.all(Array.from({length:3},()=>worker()));
   }catch(e){stat.error=e.message;}
   state.sources={...sourceState};state.plans=[...plans.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,50);state.updatedAt=now();
  }
  for(const [key,p] of plans)if(now()-p.createdAt>24*3600000){plans.delete(key);p.status="SÜRESİ DOLDU";p.closedAt=now();history.unshift(p);}
  history.length=Math.min(history.length,100);
  state.plans=[...plans.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,50);
  state.updatedAt=now();state.sources=sourceState;
 }finally{state.running=false;}
 return tryPlanStatus();
}
export function startTryPlans(){scanTryPlans().catch(console.error);setInterval(()=>scanTryPlans().catch(console.error),90000);}
