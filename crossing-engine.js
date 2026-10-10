// Completed 1-hour candles only; never uses a future candle.
function ema(values,n){const k=2/(n+1),out=[];let v=values[0];for(const x of values){v=v+k*(x-v);out.push(v);}return out;}
export function detectCrossing(input,now=Date.now()){
 const bars=input.map(x=>({time:+x.time,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+x.volume}))
  .filter(x=>Object.values(x).every(Number.isFinite)&&x.close>0&&x.high>=x.low&&x.volume>=0)
  .sort((a,b)=>a.time-b.time).filter(x=>x.time+3600000<=now).slice(-150);
 if(bars.length<105)return null;
 if(now-bars.at(-1).time>3*3600000)return null;
 const closes=bars.map(x=>x.close),e7=ema(closes,7),e25=ema(closes,25),e99=ema(closes,99),i=bars.length-1;
 const crossed=e7[i-1]<=e25[i-1]&&e7[i]>e25[i];
 const crossedRecently=Array.from({length:4},(_,n)=>i-n).some(j=>j>1&&e7[j-1]<=e25[j-1]&&e7[j]>e25[j]);
 const gap=Math.abs(e7[i]-e25[i])/e25[i]*100;
 const near99=Math.abs(bars[i].close-e99[i])/e99[i]*100;
 const rising=e7[i]>e7[i-1]&&e25[i]>=e25[i-1];
 const avg=bars.slice(-25,-5).reduce((s,x)=>s+x.volume,0)/20;
 const volRatio=avg>0?bars.slice(-3).reduce((s,x)=>s+x.volume,0)/3/avg:0;
 const baseline=bars.slice(-21,-1).reduce((sum,b)=>sum+b.volume,0)/20;
 const lastVolumeRatio=baseline>0?bars[i].volume/baseline:0;
 const risingVolume=bars[i].volume>bars[i-1].volume&&bars[i-1].volume>bars[i-2].volume;
 const positiveCandle=bars[i].close>bars[i].open;
 const volumeLevel=lastVolumeRatio>=4?"PATLAMA HACMİ":lastVolumeRatio>=2?"HIZLANIYOR":"NORMAL";
 const fastVolume=lastVolumeRatio>=2&&positiveCandle;
 const above99=bars[i].close>=e99[i]*.995;
 const preparing=gap<=1.5&&near99<=5&&rising&&above99;
 const trendActive=e7[i]>e25[i]&&e7[i]>=e7[i-1]*.995;
 const endConfirmed=e7[i]<e25[i]&&e7[i-1]<e25[i-1];
 if(!crossedRecently&&!preparing&&!trendActive&&!endConfirmed)return null;
 const status=endConfirmed?"YÜKSELİŞ SONA ERDİ":crossed?"YENİ KESİŞİM":trendActive?"YÜKSELİŞ DEVAM EDİYOR":crossedRecently?"Kesişim Sonrası":"KESİŞİM ADAYI";
 const decision=!endConfirmed&&crossedRecently&&rising&&above99&&fastVolume?"ALIM KOŞULLARI OLUŞUYOR":"BEKLE";
 return {status,decision,price:bars[i].close,ema7:e7[i],ema25:e25[i],ema99:e99[i],
  trendActive,endConfirmed,gapPct:+gap.toFixed(2),volumeRatio:+volRatio.toFixed(2),lastVolumeRatio:+lastVolumeRatio.toFixed(2),volumeLevel,risingVolume,positiveCandle,near99Pct:+near99.toFixed(2),
  candleTime:bars[i].time,reason:decision==="BEKLE"?"Kesişim, EMA99 konumu veya son mumda en az 2 kat pozitif hacim teyidi eksik.":"EMA7/25 kesişimi, yükselen ortalamalar ve hacim teyidi var. İşlem riski ayrıca kontrol edilmeli."};
}
