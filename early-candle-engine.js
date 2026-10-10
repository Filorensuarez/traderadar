// Emerging candle detector using completed 5m bars. This is not tick-by-tick.
export function detectEarlyCandle(input,now=Date.now()){
 const bars=(Array.isArray(input)?input:[]).map(x=>({time:+x.time,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+x.volume}))
  .filter(x=>Object.values(x).every(Number.isFinite)&&x.close>0&&x.volume>=0)
  .sort((a,b)=>a.time-b.time).filter(x=>x.time+300000<=now).slice(-80);
 if(bars.length<35||now-bars.at(-1).time>900000)return null;
 const ema=(a,n)=>{let v=a[0];const k=2/(n+1),out=[];for(const x of a){v+=k*(x-v);out.push(v);}return out;};
 const closes=bars.map(x=>x.close),e7=ema(closes,7),e25=ema(closes,25),i=bars.length-1;
 const gap=(e7[i]/e25[i]-1)*100;
 const crossover=e7[i-1]<=e25[i-1]&&e7[i]>e25[i];
 const nearCross=gap>=-.35&&gap<=1.25&&e7[i]>e7[i-1];
 const recent=bars.slice(-20,-1),avg=recent.reduce((s,x)=>s+x.volume,0)/recent.length;
 const volRatio=avg>0?bars[i].volume/avg:0;
 const body=(bars[i].close/bars[i].open-1)*100;
 const priorHigh=Math.max(...bars.slice(-6,-1).map(x=>x.high));
 const breakout=bars[i].close>priorHigh;
 const early=body>=.25&&body<=2.5&&volRatio>=1.7&&(crossover||nearCross)&&breakout;
 if(!early)return null;
 return {status:"ERKEN YÜKSELİŞ MUMU",decision:"ALIM İÇİN RİSKİ KONTROL ET",
  price:bars[i].close,ema7:e7[i],ema25:e25[i],ema99:null,gapPct:+gap.toFixed(2),
  lastVolumeRatio:+volRatio.toFixed(2),volumeRatio:+volRatio.toFixed(2),
  volumeLevel:volRatio>=4?"PATLAMA HACMİ":"HIZLANIYOR",positiveCandle:true,risingVolume:bars[i].volume>bars[i-1].volume,
  candleTime:bars[i].time,timeframe:"5m",crossAgeHours:null,crossTime:null,
  reason:"5 dakikalık pozitif mum, EMA7/25 yakınlaşması, önceki 5 mum zirvesinin kırılması ve artan hacim. Mum kapanışı sonrasında algılanır.",
  checks:{recentCross:crossover,risingAverages:e7[i]>e7[i-1],aboveEma99:false,volumeAtLeast2x:volRatio>=2,positiveCandle:true,risingVolume:bars[i].volume>bars[i-1].volume}};
}
