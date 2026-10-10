export function analyzeBistCandles(symbol, rows) {
  const candles = rows.map(x => ({
    time: Number(x.time), open: Number(x.open), high: Number(x.high),
    low: Number(x.low), close: Number(x.close), volume: Number(x.volume)
  })).filter(x => Object.values(x).every(Number.isFinite) && x.close > 0 && x.low > 0)
    .sort((a,b) => a.time-b.time);
  if (candles.length < 65) return {symbol,status:"VERİ YETERSİZ",score:0};
  const close = candles.map(x=>x.close), volume = candles.map(x=>x.volume);
  const ema=(a,n)=>a.reduce((v,x,i)=>i===0?x:v+(2/(n+1))*(x-v),0);
  const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const last=candles.at(-1), e9=ema(close,9), e21=ema(close,21),e50=ema(close,50);
  const resistance=Math.max(...candles.slice(-21,-1).map(x=>x.high));
  const support=Math.min(...candles.slice(-21,-1).map(x=>x.low));
  const volBase=avg(volume.slice(-21,-1));
  const volumeRatio=volBase>0?last.volume/volBase:0;
  const trend=e9>e21&&e21>e50&&last.close>e21;
  const slope=e9>ema(close.slice(0,-3),9);
  const near=last.close>=resistance*.985&&last.close<=resistance*1.01;
  const breakout=last.close>resistance*1.002&&last.close>last.open;
  const compressed=(resistance/support-1)*100<7;
  const extended=last.close/close.at(-6)>1.08||last.close/e21>1.10;
  const score=(trend?25:0)+(slope?10:0)+(volumeRatio>=1.6?20:0)+
    (near?15:0)+(breakout?15:0)+(compressed?15:0);
  const status=extended?"GEÇ KALINDI":
    trend&&breakout&&volumeRatio>=1.6&&score>=75?"YÜKSELİŞ TEYİDİ":
    near&&score>=55?"YÜKSELİŞ HAZIRLIĞI":"BEKLE";
  return {symbol,status,score,price:last.close,resistance,support,ema9:e9,ema21:e21,
    ema50:e50,volumeRatio:Number(volumeRatio.toFixed(2)),asOf:last.time,
    reasons:[trend&&"EMA9/21/50 olumlu",slope&&"EMA9 yukarı",
      volumeRatio>=1.6&&"Hacim artıyor",near&&"Dirence yakın",
      breakout&&"Kırılım",compressed&&"Sıkışma"].filter(Boolean)};
}
