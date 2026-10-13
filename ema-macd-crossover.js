// 1-hour EMA7/EMA25 + MACD(DIF/DEA 12,26,9) bullish dual crossover.
// Uses only COMPLETED hourly candles. Screenshot additionally shows EMA99;
// EMA99 is shown for context, not used as a third signal. Does not place orders.
export const HOUR=3600000;
const NEEDED=125,MAX_GAP_BARS=6,POST_CROSS_BARS=2;
const round=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)):null;
function movingExponential(values,period){
 const result=Array(values.length).fill(null);
 if(values.length<period)return result;
 let value=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
 result[period-1]=value;
 const a=2/(period+1);
 for(let i=period;i<values.length;i++){value=value+a*(values[i]-value);result[i]=value;}
 return result;
}
export function analyzeHourlyDualCross(candles,ticker,at=Date.now()){
 if(!Array.isArray(candles)||candles.length<NEEDED)return null;
 const openHour=Math.floor(at/HOUR)*HOUR;
 const closed=candles.filter(c=>c.time<openHour&&c.time+HOUR<=at)
  .sort((a,b)=>a.time-b.time);
 if(closed.length<NEEDED)return null;
 const recent=closed.slice(-180);
 if(recent.at(-1).time!==openHour-HOUR)return null;
 for(let i=0;i<recent.length;i++){
  const c=recent[i];
  if(!Number.isFinite(c.time)||![c.open,c.high,c.low,c.close,c.quoteVolume].every(Number.isFinite)
    ||c.open<=0||c.high<c.low||c.low<=0||c.close<=0||c.quoteVolume<0)return null;
  if(i&&c.time-recent[i-1].time!==HOUR)return null;
 }
 const price=Number(ticker?.price),ask=Number(ticker?.ask),bid=Number(ticker?.bid),dailyVolume=Number(ticker?.volume24h);
 if(!(price>0&&ask>=bid&&bid>0&&dailyVolume>=1000000))return null;
 const spread=(ask-bid)/ask*100;
 if(spread>0.5)return null;
 const closes=recent.map(c=>c.close);
 const ema7=movingExponential(closes,7);
 const ema25=movingExponential(closes,25);
 const ema99=movingExponential(closes,99);
 const fast=movingExponential(closes,12);
 const slow=movingExponential(closes,26);
 const dif=fast.map((v,i)=>v!==null&&slow[i]!==null?v-slow[i]:null);
 const fullDif=dif.filter(v=>v!==null);
 const fullSignal=movingExponential(fullDif,9);
 const dea=Array(closes.length).fill(null);
 let offset=dif.findIndex(v=>v!==null);
 for(let i=0;i<fullSignal.length;i++)dea[offset+i]=fullSignal[i];
 const hist=dif.map((v,i)=>v!==null&&dea[i]!==null?v-dea[i]:null);
 const idx=recent.length-1;
 function crossesUp(seriesA,seriesB,i){
  return i>=1&&seriesA[i]!==null&&seriesB[i]!==null&&
   seriesA[i-1]!==null&&seriesB[i-1]!==null&&
   seriesA[i-1]<=seriesB[i-1]&&seriesA[i]>seriesB[i];
 }
 const searchStart=idx-(MAX_GAP_BARS+POST_CROSS_BARS);
 let emaCross=null,macdCross=null;
 for(let i=searchStart;i<=idx;i++){
  if(crossesUp(ema7,ema25,i))emaCross=i;
  if(crossesUp(dif,dea,i))macdCross=i;
 }
 if(emaCross===null||macdCross===null||Math.abs(emaCross-macdCross)>MAX_GAP_BARS)return null;
 const lastCross=Math.max(emaCross,macdCross);
 if(idx-lastCross>POST_CROSS_BARS)return null;
 // Both crosses must remain bullish after they occurred. No intra-hour crossover.
 const ema99Value=ema99[idx],close=closes[idx],lastQuote=price;
 if(!(ema7[idx]>ema25[idx]&&dif[idx]>dea[idx]&&hist[idx]>0))return null;
 // Avoid showing a stale setup if the price already dropped below EMA99 or
 // the ticker drifted too far from the last completed hour.
 if(!(lastQuote>=ema25[idx]&&Math.abs(lastQuote/close-1)<=0.06))return null;
 const crossCloseAt=recent[lastCross].time+HOUR;
 // ATR and price level are descriptive only, not extra entry criteria.
 const tr=[];
 for(let i=recent.length-14;i<recent.length;i++){
  const c=recent[i],p=recent[i-1].close;
  tr.push(Math.max(c.high-c.low,Math.abs(c.high-p),Math.abs(c.low-p)));
 }
 const atr=tr.reduce((a,b)=>a+b,0)/tr.length;
 const atrPct=atr/ask*100;
 const potentialPct=round(Math.max(0,Math.min(8,2*atrPct)));
 return {
  stage:"EMA + MACD YUKARI KESİŞİM",timeframe:"1 saat",
  crossCandleTime:recent[lastCross].time,
  signalConfirmedAt:crossCloseAt,
  lastClosedCandleTime:recent[idx].time,
  emaCrossAt:recent[emaCross].time+HOUR,
  macdCrossAt:recent[macdCross].time+HOUR,
  barsSinceCross:idx-lastCross,
  ema7:round(ema7[idx],10),ema25:round(ema25[idx],10),ema99:round(ema99Value,10),
  macdDIF:round(dif[idx],10),macdDEA:round(dea[idx],10),macdHistogram:round(hist[idx],10),
  price:round(price,10),ask:round(ask,10),spreadPct:round(spread,3),
  volume24h:dailyVolume,
  riseFromCrossPct:round((price/recent[lastCross].close-1)*100),
  potentialPct,technicalTarget:round(ask*(1+potentialPct/100),10),
  note:"Yalnızca kapanmış 1 saatlik mumda EMA7/EMA25 ve MACD DIF/DEA pozitif kesişimi. EMA99 bilgi amaçlıdır. Teknik kesişim sonraki yükselişi garanti etmez."
 };
}
