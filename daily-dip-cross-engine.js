// Scan only completed daily candles for a recent dip and fresh EMA7/25 bullish crossover.
function ema(values,n){const k=2/(n+1),out=[];let v=values[0];for(const x of values){v+=k*(x-v);out.push(v);}return out;}
export function detectDailyDipCross(input,now=Date.now()){
 const DAY=86400000;
 const bars=(Array.isArray(input)?input:[]).map(b=>({time:Number(b.time),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume)}))
  .filter(b=>Object.values(b).every(Number.isFinite)&&b.low>0&&b.close>0&&b.high>=b.low&&b.volume>=0)
  .sort((a,b)=>a.time-b.time).filter(b=>b.time+DAY<=now).slice(-160);
 if(bars.length<45||now-(bars.at(-1).time+DAY)>DAY*2)return null;
 const i=bars.length-1,close=bars.map(b=>b.close),e7=ema(close,7),e25=ema(close,25);
 let crossIndex=-1;
 for(let j=i;j>=Math.max(1,i-2);j--){if(e7[j-1]<=e25[j-1]&&e7[j]>e25[j]){crossIndex=j;break;}}
 if(crossIndex<0||e7[i]<=e25[i])return null;
 const windowStart=i-19;
 let dipIndex=windowStart;
 for(let j=windowStart+1;j<=i;j++)if(bars[j].low<bars[dipIndex].low)dipIndex=j;
 const dip=bars[dipIndex].low;
 if(dipIndex+5>i)return null;
 for(let j=dipIndex+1;j<=dipIndex+5;j++)if(!(bars[j].close>bars[j-1].close))return null;
 const distance=(bars[i].close/dip-1)*100;
 if(distance<0)return null;
 const dipAge=crossIndex-dipIndex;
 if(dipAge<0)return null;
 // Extended moves are retained only while the completed-candle trend remains positive.
 const trendContinues=e7[i]>e25[i]&&e7[i]>=e7[i-1]&&
  bars[i].close>=e7[i]&&bars[i].close>=bars[i-1].close;
 if(distance>10&&!trendContinues)return null;
 // Historical resistance and ATR give conditional targets, not a knowable top.
 const ranges=[];
 for(let j=Math.max(1,i-13);j<=i;j++){
  const prev=bars[j-1].close;
  ranges.push(Math.max(bars[j].high-bars[j].low,Math.abs(bars[j].high-prev),Math.abs(bars[j].low-prev)));
 }
 const atr=ranges.reduce((sum,n)=>sum+n,0)/ranges.length;
 const priorHighs=bars.slice(Math.max(0,i-60),i).map(b=>b.high).filter(h=>h>bars[i].close).sort((a,b)=>a-b);
 const resistance=priorHighs.length?priorHighs[0]:null;
 const target1=bars[i].close+1.5*atr;
 const target2=bars[i].close+3*atr;
 const upperScenario=resistance!==null?Math.max(target2,resistance):target2;
 const projectedUpsidePct=(upperScenario/bars[i].close-1)*100;
 const extended=distance>10;
 const volumeBase=bars.slice(Math.max(0,i-20),i).reduce((s,b)=>s+b.volume,0)/Math.min(20,i);
 const volumeRatio=volumeBase>0?bars[i].volume/volumeBase:0;
 return {status:extended?"YÜKSELİŞ DEVAM EDİYOR":"GÜNLÜK YENİ KESİŞİM",decision:extended?"UZAMIŞ HAREKET — RİSKİ KONTROL ET":"TAKİP ET",timeframe:"1d",
  price:bars[i].close,ema7:e7[i],ema25:e25[i],gapPct:+((e7[i]/e25[i]-1)*100).toFixed(2),
  dipPrice:dip,dipTime:bars[dipIndex].time,dipToCrossDays:dipAge,priceFromDipPct:+distance.toFixed(2),higherClosesAfterDip:5,lookbackCandles:20,
  crossTime:bars[crossIndex].time+DAY,crossAgeDays:i-crossIndex,candleTime:bars[i].time,
  volumeRatio:+volumeRatio.toFixed(2),lastVolumeRatio:+volumeRatio.toFixed(2),
  trendContinues,extended,atr:+atr.toPrecision(8),target1:+target1.toPrecision(8),target2:+target2.toPrecision(8),
  resistance:resistance===null?null:+resistance.toPrecision(8),upperScenario:+upperScenario.toPrecision(8),
  projectedUpsidePct:+projectedUpsidePct.toFixed(2),
  reason:extended?"Dipten %10 üzerinde yükseldi; EMA7/25 ve son kapanışla trend sürüyor. Hedefler ATR ve geçmiş dirençten türetilen koşullu senaryolardır.":"Dip sonrası beş yükselen kapanış ve yeni EMA7/25 kesişimi görüldü. Hedefler ATR ve geçmiş dirençten türetilen koşullu senaryolardır."};
}
