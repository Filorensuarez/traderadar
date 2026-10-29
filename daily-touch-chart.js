// Closed-candle technical context; descriptive indicators, not a buy recommendation.
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN;
const ema=(a,n)=>{if(a.length<n)return NaN;let v=avg(a.slice(0,n));const k=2/(n+1);for(const x of a.slice(n))v+=k*(x-v);return v;};
const rsi=(c,n=14)=>{if(c.length<n+1)return NaN;let up=0,down=0;for(let i=c.length-n;i<c.length;i++){const d=c[i]-c[i-1];up+=Math.max(d,0);down+=Math.max(-d,0);}return down===0?(up===0?50:100):100-100/(1+up/down);};
const pct=(a,b)=>b?100*(a/b-1):NaN;
export function chartContext(candles){
 const c=candles.filter(x=>Number.isFinite(x.close)&&Number.isFinite(x.high)&&Number.isFinite(x.low)&&Number.isFinite(x.quoteVolume));
 if(c.length<110)return {ready:false,reason:"En az 110 kapanmış mum gerekli"};
 const closes=c.map(x=>x.close),last=c.at(-1),n=closes.length;
 const band=(end)=>{const a=closes.slice(end-20,end),m=avg(a),sd=Math.sqrt(avg(a.map(x=>(x-m)**2)));return {mid:m,width:m>0?4*sd/m:NaN,upper:m+2*sd,lower:m-2*sd};};
 const bb=band(n),prior=Array.from({length:40},(_,i)=>band(n-40+i).width).filter(Number.isFinite);
 const squeeze=bb.width<=Math.min(...prior)*1.12;
 const rsis=Array.from({length:16},(_,i)=>rsi(closes.slice(0,n-15+i)));
 const lows=c.slice(-16).map(x=>x.low);
 const lowA=Math.min(...lows.slice(0,8)),lowB=Math.min(...lows.slice(8));
 const rsiA=Math.min(...rsis.slice(0,8)),rsiB=Math.min(...rsis.slice(8));
 const bullishDivergence=lowB<lowA&&rsiB>rsiA+2;
 const macd=(end)=>ema(closes.slice(0,end),12)-ema(closes.slice(0,end),26);
 const hist=(end)=>macd(end)-ema(Array.from({length:34},(_,i)=>macd(end-33+i)).filter(Number.isFinite),9);
 const h0=hist(n),h1=hist(n-1),h2=hist(n-2);
 const macdTurning=Number.isFinite(h0)&&h0>h1&&h1>=h2;
 const typical=c.slice(-30).map(x=>(x.high+x.low+x.close)/3);
 const volume=c.slice(-30).map(x=>x.quoteVolume);
 const vwap=volume.reduce((s,v,i)=>s+v*typical[i],0)/Math.max(volume.reduce((s,v)=>s+v,0),1e-12);
 const tf=(period)=>{const count=Math.floor(c.length/period);const bars=[];for(let i=count-1;i>=Math.max(0,count-6);i--){const slice=c.slice(c.length-(i+1)*period,c.length-i*period);if(slice.length===period)bars.push({close:slice.at(-1).close,open:slice[0].open,high:Math.max(...slice.map(x=>x.high))});}return {period,up:bars.length>=3&&bars.at(-1).close>bars.at(-2).close&&bars.at(-1).close>bars.at(-1).open,close:bars.at(-1)?.close??null};};
 const multi=[tf(1),tf(3),tf(5)];
 const score=[squeeze,bullishDivergence,macdTurning,last.close>vwap,multi[0].up,multi[1].up,multi[2].up].filter(Boolean).length;
 return {ready:true,bbWidthPct:Number((bb.width*100).toFixed(2)),squeeze,rsi:Number(rsi(closes).toFixed(1)),bullishDivergence,macdHistogram:Number(h0.toFixed(6)),macdTurning,vwap,aboveVwap:last.close>vwap,multi,score,scoreMax:7};
}
