// Two-stage five-minute dip/crossover and volume confirmation detector.
export function detectEarlyCandle(input,now=Date.now()){
 const bars=(Array.isArray(input)?input:[]).map(x=>({time:+x.time,open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+x.volume}))
  .filter(x=>Object.values(x).every(Number.isFinite)&&x.close>0&&x.volume>=0&&x.high>=x.low)
  .sort((a,b)=>a.time-b.time).filter(x=>x.time+300000<=now).slice(-120);
 if(bars.length<40||now-bars.at(-1).time>900000)return null;
 const ema=(values,n)=>{const k=2/(n+1),out=[];let v=values[0];for(const x of values){v+=k*(x-v);out.push(v);}return out;};
 const closes=bars.map(x=>x.close),e7=ema(closes,7),e25=ema(closes,25),i=bars.length-1;
 const baseline=bars.slice(-21,-1).reduce((sum,b)=>sum+b.volume,0)/20;
 if(baseline<=0)return null;
 const last=bars[i],volRatio=last.volume/baseline,bodyPct=(last.close/last.open-1)*100;
 const recentLow=Math.min(...bars.slice(-13,-3).map(x=>x.low));
 const dipRecently=bars.slice(-5).some(b=>b.low<=recentLow*1.012);
 const gapPct=(e7[i]/e25[i]-1)*100;
 const crossNow=e7[i-1]<=e25[i-1]&&e7[i]>e25[i];
 const approaching=gapPct>=-.35&&gapPct<=.65&&e7[i]>e7[i-1];
 const recentCross=Array.from({length:4},(_,n)=>i-n).some(j=>j>0&&e7[j-1]<=e25[j-1]&&e7[j]>e25[j]);
 const priceFromDipPct=(last.close/recentLow-1)*100;
 const setup=dipRecently&&(crossNow||approaching)&&priceFromDipPct<=4;
 const breakout=last.close>Math.max(...bars.slice(-6,-1).map(b=>b.high));
 const volumeConfirmed=recentCross&&e7[i]>e25[i]&&bodyPct>=.25&&bodyPct<=2.5&&volRatio>=1.7&&breakout&&priceFromDipPct<=7;
 const common={price:last.close,ema7:e7[i],ema25:e25[i],ema99:null,gapPct:+gapPct.toFixed(2),
  lastVolumeRatio:+volRatio.toFixed(2),volumeRatio:+volRatio.toFixed(2),
  volumeLevel:volRatio>=4?"PATLAMA HACMİ":volRatio>=1.7?"HIZLANIYOR":"NORMAL",
  positiveCandle:bodyPct>0,risingVolume:last.volume>bars[i-1].volume,
  candleTime:last.time,timeframe:"5m",dipPrice:+recentLow.toPrecision(10),priceFromDipPct:+priceFromDipPct.toFixed(2)};
 if(volumeConfirmed)return {...common,status:"HACİMLİ MUM TEYİDİ",decision:"AL SİNYALİ — RİSKİ KONTROL ET",
  reason:"Dip sonrası EMA7/25 yukarı kesişimi, pozitif 5 dakikalık kırılım ve en az 1,7 kat hacim birlikte doğrulandı. Kesin kazanç veya otomatik emir değildir."};
 if(setup)return {...common,status:"DİP SONRASI KESİŞİM",decision:"TAKİP ET",
  reason:"Yakın dipten sonra EMA7/25 kesişimi veya yakınlaşması başladı. Hacimli kırılım mumu henüz teyit edilmedi."};
 return null;
}
