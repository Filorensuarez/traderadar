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
 const start=Math.max(0,crossIndex-10),end=Math.max(start,crossIndex-2);
 const candidates=bars.slice(start,end+1);
 if(!candidates.length)return null;
 let dipIndex=start;
 for(let j=start+1;j<=end;j++)if(bars[j].low<bars[dipIndex].low)dipIndex=j;
 const dip=bars[dipIndex].low;
 const earlier=bars.slice(Math.max(0,dipIndex-12),dipIndex);
 if(earlier.length<5||dip>Math.min(...earlier.map(b=>b.low))*1.005)return null;
 const dipAge=crossIndex-dipIndex;
 if(dipAge<2||dipAge>10)return null;
 if(bars[crossIndex].close<=dip||bars[i].close<=dip)return null;
 const distance=(bars[i].close/dip-1)*100;
 const volumeBase=bars.slice(Math.max(0,i-20),i).reduce((s,b)=>s+b.volume,0)/Math.min(20,i);
 const volumeRatio=volumeBase>0?bars[i].volume/volumeBase:0;
 return {status:"GÜNLÜK YENİ KESİŞİM",decision:"TAKİP ET",timeframe:"1d",
  price:bars[i].close,ema7:e7[i],ema25:e25[i],gapPct:+((e7[i]/e25[i]-1)*100).toFixed(2),
  dipPrice:dip,dipTime:bars[dipIndex].time,dipToCrossDays:dipAge,priceFromDipPct:+distance.toFixed(2),
  crossTime:bars[crossIndex].time+DAY,crossAgeDays:i-crossIndex,candleTime:bars[i].time,
  volumeRatio:+volumeRatio.toFixed(2),lastVolumeRatio:+volumeRatio.toFixed(2),
  reason:"Dipten sonra EMA7, EMA25'i son üç tamamlanmış günlük mumda yukarı kesti. Kesin alım önerisi değildir."};
}
