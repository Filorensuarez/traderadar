// Technical V-bottom reversal model using only completed public-market candles.
// A "FULL TECHNICAL CONFIRMATION" is never a guarantee of future price direction.
const valid=Number.isFinite;
const avg=a=>a.reduce((s,x)=>s+x,0)/Math.max(a.length,1);
const pct=(a,b)=>b>0?(a/b-1)*100:null;
const fix=(x,n=2)=>valid(x)?+x.toFixed(n):null;
const maxHigh=a=>Math.max(...a.map(x=>x.high));
function ema(c,n){if(c.length<n)return null;let e=avg(c.slice(0,n)),k=2/(n+1);for(let i=n;i<c.length;i++)e=c[i]*k+e*(1-k);return e;}
function emaSeries(c,n){if(c.length<n)return [];const a=[],k=2/(n+1);let e=avg(c.slice(0,n));a.push(e);for(let i=n;i<c.length;i++){e=c[i]*k+e*(1-k);a.push(e);}return a;}
function rsi(c,n=14){if(c.length<=n)return null;let gains=0,loss=0;for(let i=c.length-n;i<c.length;i++){let d=c[i]-c[i-1];gains+=Math.max(0,d);loss+=Math.max(0,-d);}return loss===0?(gains===0?50:100):100-100/(1+gains/loss);}
function macd(c){
 const a=emaSeries(c,12),b=emaSeries(c,26);
 if(c.length<36)return null;
 const d=a.slice(14).map((x,i)=>x-b[i]),signal=emaSeries(d,9);
 if(signal.length<4)return null;
 const hist=d.slice(8).map((v,i)=>v-signal[i]);
 return {last:hist.at(-1),prev:hist.at(-2),prev2:hist.at(-3)};
}
function atr(c,n=14){if(c.length<=n)return null;let r=[];for(let i=1;i<c.length;i++){const x=c[i],p=c[i-1].close;r.push(Math.max(x.high-x.low,Math.abs(x.high-p),Math.abs(x.low-p)));}return avg(r.slice(-n));}
function stochRsi(c){if(c.length<31)return null;const series=[];for(let i=c.length-17;i<=c.length;i++){const v=rsi(c.slice(0,i),14);if(v===null)return null;series.push(v);}const last=series.slice(-14),lo=Math.min(...last),hi=Math.max(...last);if(hi-lo<1e-7)return null;return {now:(series.at(-1)-lo)/(hi-lo),prev:(series.at(-2)-lo)/(hi-lo)};}
function candleValidity(c,interval,n,now){
 if(!Array.isArray(c)||c.length<n)return false;
 const frame=Math.floor(now/interval)*interval;
 const closed=c.filter(x=>x.time+interval<=now&&x.time<frame).slice(-n);
 if(closed.length<n||closed.at(-1).time!==frame-interval)return false;
 return closed.every((x,i)=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close,x.quoteVolume].every(valid)&&
   x.low>0&&x.high>=x.low&&x.close>0&&x.quoteVolume>=0&&(!i||x.time-closed[i-1].time===interval));
}
function closedFrames(c,interval,now){const frame=Math.floor(now/interval)*interval;return c.filter(x=>x.time+interval<=now&&x.time<frame);}
function rollingVwap(c,n=60){
 const a=c.slice(-n);let weighted=0,base=0;
 for(const x of a){const vol=x.quoteVolume/x.close;if(!(vol>0))continue;
 const typical=(x.high+x.low+x.close)/3;weighted+=typical*vol;base+=vol;}
 return base>0?weighted/base:null;
}
export function detectVBottomGeometry(bars1,ticker,now=Date.now()){
 const spread=(ticker.ask-ticker.bid)/ticker.ask*100;
 if(!(ticker.volume24h>=1000000&&ticker.ask>0&&ticker.bid>0&&ticker.price>0&&ticker.ask>=ticker.bid&&spread<=0.30))return null;
 if(!candleValidity(bars1,60000,68,now))return null;
 const a=closedFrames(bars1,60000,now).slice(-90);
 // Find a recent low AFTER a visible price fall; require two later completed candles.
 const search=a.slice(-13,-2),start=a.length-13;
 let k=0;for(let i=1;i<search.length;i++)if(search[i].low<search[k].low)k=i;
 const lowIndex=start+k,low=a[lowIndex].low;
 if(lowIndex<25)return null;
 const before=a.slice(lowIndex-30,lowIndex-3);
 if(before.length<14)return null;
 const priorHigh=maxHigh(before);
 const dropPct=pct(low,priorHigh);
 const reboundPct=pct(a.at(-1).close,low);
 const risingLow=a.slice(-2).every(x=>x.low>low*1.002);
 const lastClose=a.at(-1).close;
 const previousClose=a.at(-2).close;
 const atr1=atr(a,14);
 const leadPriceMaxDiffPct=Math.abs(pct(ticker.price,lastClose));
 if(!valid(dropPct)||!valid(reboundPct)||!(atr1>0)||!valid(leadPriceMaxDiffPct)||leadPriceMaxDiffPct>2)return null;
 // Find clearly distinct "fall -> low -> rebound" rather than a flat bottom.
 const isV=dropPct<=-3&&dropPct>=-33&&reboundPct>=0.9&&
  reboundPct<=Math.min(12,Math.abs(dropPct)*1.2)&&
  risingLow&&lastClose>previousClose&&lowIndex>=a.length-13;
 if(!isV)return null;
 const baseline=avg(a.slice(lowIndex-23,lowIndex-3).map(x=>x.quoteVolume));
 const recovery=a.slice(lowIndex+1).map(x=>x.quoteVolume);
 const recentVolume=avg(recovery.slice(-3));
 const volRatio=baseline>0?recentVolume/baseline:null;
 const lastChange=pct(lastClose,previousClose);
 return {low,lowTime:a[lowIndex].time,priorHigh,dropPct,reboundPct,volRatio,
  atr1,spreadPct:spread,closed:a,lastClose,lastChange,
  rollVwap:rollingVwap(a),lowAgeMins:a.length-1-lowIndex};
}
export function evaluateVBottom(bars1,bars5,bars15,ticker,now=Date.now()){
 const g=detectVBottomGeometry(bars1,ticker,now);
 if(!g)return null;
 if(!candleValidity(bars5,300000,42,now)||!candleValidity(bars15,900000,38,now))return {
   stage:"VERİ BEKLENİYOR",confirmed:false,reason:"5 ve 15 dakikalık tamamlanmış mumlar eksik",
   price:ticker.price,ask:ticker.ask,bottom:g.low,dropPct:fix(g.dropPct),
   reboundPct:fix(g.reboundPct),volumeRatio:fix(g.volRatio),checks:[],
   stop:null,target:null,riskReward:null,potentialPct:null
 };
 const one=g.closed, five=closedFrames(bars5,300000,now),fifteen=closedFrames(bars15,900000,now);
 const c1=one.map(x=>x.close),c5=five.map(x=>x.close),c15=fifteen.map(x=>x.close);
 const e7=ema(c1,7),e25=ema(c1,25);
 const m1=macd(c1),m5=macd(c5),m15=macd(c15);
 const bottomIndex=one.findIndex(x=>x.time===g.lowTime);
 const rsi7=rsi(c1,7),rsi7AtBottom=bottomIndex>=7?rsi(c1.slice(0,bottomIndex+1),7):null;
 const rsi5=rsi(c5,14),rsi5Prev=rsi(c5.slice(0,-1),14);
 const rsi15=rsi(c15,14),rsi15Prev=rsi(c15.slice(0,-1),14);
 const stoch=stochRsi(c1);
 const last5=five.at(-1),prior5=five.at(-2),last15=fifteen.at(-1),prior15=fifteen.at(-2);
 const rv=g.volRatio!==null&&g.volRatio>=1.5&&avg(one.slice(-3).map(x=>x.quoteVolume))>=1500;
 const rsiReversal=rsi7AtBottom!==null&&rsi7AtBottom<=42&&rsi7>=45&&rsi7>rsi7AtBottom+12;
 const macdPositive=m1&&m1.last>0&&m1.last>m1.prev;
 const stochPositive=stoch&&stoch.now>=0.5&&stoch.now>stoch.prev;
 const emaReclaim=e7!==null&&e25!==null&&g.lastClose>e7&&e7>e25;
 const vwapReclaim=g.rollVwap!==null&&g.lastClose>g.rollVwap;
 const fiveRecovery=m5&&m5.last>m5.prev&&m5.prev>=m5.prev2&&
  last5.close>prior5.close&&rsi5>=43&&rsi5>rsi5Prev;
 const fifteenRecovery=m15&&m15.last>m15.prev&&
  rsi15>rsi15Prev&&last15.close>=prior15.close;
 const currentSpread=g.spreadPct<=0.20;
 // Reject reversals only recognised after a huge bounce: late entries are labelled separately.
 const chasing=g.reboundPct>6||g.lastChange>2.7||(ticker.price/g.low-1)*100>6.5;
 const stop=g.low-g.atr1*0.35;
 const risk=ticker.ask-stop;
 const atr5=atr(five,14);
 const resistance=g.priorHigh;
 const atrTarget=atr5>0?ticker.ask+atr5*2.5:null;
 const target=atrTarget?Math.min(resistance,atrTarget):resistance;
 const riskReward=risk>0&&(target>ticker.ask)?(target-ticker.ask)/risk:null;
 const stopPct=risk>0?risk/ticker.ask*100:null;
 const riskOk=stop>0&&risk>0&&stopPct>=0.2&&stopPct<=4&&
  riskReward!==null&&riskReward>=1.6&&target>ticker.ask&&
  ticker.volume24h>=1000000&&currentSpread;
 const checks=[
  ["Dip geometrisi",true],["RSI7 toparlanması",Boolean(rsiReversal)],
  ["Stokastik RSI dönüşü",Boolean(stochPositive)],
  ["MACD 1dk pozitif",Boolean(macdPositive)],["EMA7/25 kazanımı",Boolean(emaReclaim)],
  ["60dk VWAP üzeri",Boolean(vwapReclaim)],["Alım hacmi artışı",Boolean(rv)],
  ["5dk momentum teyidi",Boolean(fiveRecovery)],["15dk momentum teyidi",Boolean(fifteenRecovery)],
  ["Likidite/makas",Boolean(currentSpread)],["Risk/getiri",Boolean(riskOk)],["Geç kalınmadı",!chasing]
 ];
 const passed=checks.filter(x=>x[1]).length,total=checks.length,score=fix(passed/total*100,0);
 const confirmed=checks.every(x=>x[1])&&!chasing;
 const stage=chasing?"GEÇ KALINDI":confirmed?"TAM TEKNİK TEYİT":"DÖNÜŞ ADAYI";
 return {
  stage,confirmed,score,checks:checks.map(([label,ok])=>({label,ok})),
  price:fix(ticker.price,10),ask:fix(ticker.ask,10),
  bottom:fix(g.low,10),lowTime:g.lowTime,lowAgeMins:g.lowAgeMins,
  dropPct:fix(g.dropPct),reboundPct:fix(g.reboundPct),
  volumeRatio:fix(g.volRatio),spreadPct:fix(g.spreadPct,3),
  vwap:fix(g.rollVwap,10),ema7:fix(e7,10),ema25:fix(e25,10),
  rsi7:fix(rsi7),rsi5:fix(rsi5),rsi15:fix(rsi15),
  macd1:fix(m1?.last,7),macd5:fix(m5?.last,7),macd15:fix(m15?.last,7),
  stochRsi:fix(stoch?.now*100),reason:confirmed?"Bütün 12 teknik kontrol birlikte geçti":
   chasing?"Dipten yükseliş ilerlemiş":checks.filter(x=>!x[1]).map(x=>x[0]).join(", "),
  stop:confirmed?fix(stop,10):null,
  target:confirmed?fix(target,10):null,
  riskReward:confirmed?fix(riskReward):null,
  potentialPct:confirmed?fix(pct(target,ticker.ask)):null,
  horizon:"15–60 dakika",
  note:"Tam teknik teyit kâr garantisi veya gerçekleşmiş işlem değildir. Spot piyasa verisi gecikmesi, likidite ve kayma riski vardır."
 };
}
