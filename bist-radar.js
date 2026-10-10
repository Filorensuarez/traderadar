// BIST kısa vade teknik tarama: yalnız sağlanan gerçek OHLCV verileri.
const average = a => a.reduce((s,v)=>s+v,0)/a.length;
const ema=(a,n)=>{let v=a[0],k=2/(n+1);return a.map((x,i)=>v=i===0?x:v+k*(x-v));};
const rsi=(close,n=14)=>{
  let up=0,down=0;
  for(let i=close.length-n;i<close.length;i++){const d=close[i]-close[i-1];up+=Math.max(d,0);down+=Math.max(-d,0);}
  return down===0?(up>0?100:50):100-100/(1+up/down);
};
export function scanBistCandles(symbol,raw,meta={}){
  const c=(Array.isArray(raw)?raw:[]).map(x=>({
    time:Number(x.time),open:Number(x.open),high:Number(x.high),
    low:Number(x.low),close:Number(x.close),volume:Number(x.volume)
  })).filter(x=>[x.time,x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)&&
    x.open>0&&x.close>0&&x.low>0&&x.high>=Math.max(x.low,x.open,x.close)&&x.volume>=0)
    .sort((a,b)=>a.time-b.time);
  if(c.length<60)return {symbol,status:"VERİ YETERSİZ",reason:"En az 60 tamamlanmış mum gerekli."};
  if(c.some((x,i)=>i>0&&x.time<=c[i-1].time))
    return {symbol,status:"VERİ HATASI",reason:"Yinelenen mum zamanı."};
  const close=c.map(x=>x.close),vol=c.map(x=>x.volume),last=c.at(-1);
  const e20=ema(close,20),e50=ema(close,50),e9=ema(close,9),e12=ema(close,12),e26=ema(close,26);
  const macd=e12.at(-1)-e26.at(-1),macdPrev=e12.at(-3)-e26.at(-3);
  const previous=c.slice(-21,-1);
  const resistance=Math.max(...previous.map(x=>x.high));
  const support=Math.min(...previous.map(x=>x.low));
  const volBase=average(vol.slice(-21,-1));
  const volumeRatio=volBase>0?last.volume/volBase:0;
  const momentum=rsi(close);
  const trend=last.close>e20.at(-1)&&e20.at(-1)>e50.at(-1);
  const slope=e20.at(-1)>e20.at(-4);
  const near=last.close>=resistance*.985&&last.close<=resistance*1.025;
  const breakout=last.close>resistance*1.003;
  const macdRising=macd>macdPrev;
  const fiveChange=(last.close/close.at(-6)-1)*100;
  const extended=fiveChange>9||(last.close/e20.at(-1)-1)*100>10;
  const range=(Math.max(...previous.map(x=>x.high))/Math.min(...previous.map(x=>x.low))-1)*100;
  const squeeze=range<7;
  const score=(trend?20:0)+(slope?10:0)+(volumeRatio>=1.5?20:0)+
    (momentum>=50&&momentum<=72?15:0)+(macdRising?10:0)+
    (near?10:0)+(breakout?10:0)+(squeeze?5:0);
  const warning=[];
  if(extended)warning.push("Hareket fazla ilerlemiş; geç giriş riski.");
  if(momentum>80)warning.push("RSI aşırı alım bölgesinde.");
  if(volumeRatio<1)warning.push("Hacim teyidi zayıf.");
  const status=extended?"GEÇ KALINDI":
    score>=75&&breakout&&trend&&volumeRatio>=1.5?"YÜKSELİŞ TEYİDİ":
    score>=65&&near&&trend?"YÜKSELİŞ HAZIRLIĞI":
    score>=45?"İZLE":"BEKLE";
  return {symbol,status,score,price:last.close,asOf:last.time,
    interval:meta.interval||"bilinmiyor",source:meta.source||"CSV",
    dataDelay:meta.dataDelay||"Bilinmiyor",resistance,support,
    volumeRatio:Number(volumeRatio.toFixed(2)),rsi:Number(momentum.toFixed(1)),
    ema20:e20.at(-1),ema50:e50.at(-1),macd,warning,
    reasons:[trend?"EMA20 > EMA50 ve fiyat EMA20 üzerinde":null,
      slope?"EMA20 yükseliyor":null,volumeRatio>=1.5?"Hacim artışı":null,
      near?"Dirence yakın":null,breakout?"Direnç kırılımı":null,
      macdRising?"MACD güçleniyor":null,squeeze?"Fiyat aralığı dar":null].filter(Boolean),
    simulationOnly:true};
}
