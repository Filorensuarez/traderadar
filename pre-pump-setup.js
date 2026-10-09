/**
 * GMT/OGN-inspired early acceleration detector (1-minute OHLCV).
 * Signals are hypotheses, NOT guaranteed forecasts or orders.
 * Uses only candles available at evaluation time.
 */
export function detectPrePumpSetup(input, now=Date.now()) {
  const candles=(Array.isArray(input)?input:[]).map(c=>({
    time:Number(c.time),open:Number(c.open),high:Number(c.high),
    low:Number(c.low),close:Number(c.close),volume:Number(c.volume)
  })).filter(c=>[c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)
    &&c.open>0&&c.close>0&&c.low>0&&c.high>=c.low&&c.volume>=0)
    .sort((a,b)=>a.time-b.time).filter((c,i,a)=>i===0||c.time!==a[i-1].time).slice(-40);
  const unavailable={setup:"VERİ YETERSİZ",setupScore:0,setupReasons:[],
    setupWarnings:["Yeterli güncel 1 dakikalık mum bulunamadı."],
    setupResistance:null,setupDistancePct:null,setupVolumeRatio:null,
    setupPhase:"NONE",setupAction:"BEKLE"};
  if(candles.length<35)return unavailable;
  const last=candles.at(-1),age=now-last.time;
  if(age< -65000||age>125000)return {...unavailable,setupWarnings:["Mum verisi güncel değil."]};
  // Detect missing minutes. Gaps must not be interpreted as quiet accumulation.
  let gaps=0;
  for(let i=1;i<candles.length;i++){
    const delta=candles[i].time-candles[i-1].time;
    if(delta>90000||delta<=0)gaps++;
  }
  if(gaps>2)return {...unavailable,setupWarnings:["Dakikalık veri boşlukları mevcut."]};
  const avg=arr=>arr.reduce((s,x)=>s+x,0)/arr.length;
  const ema=(arr,n)=>{let value=arr[0];const k=2/(n+1);
    for(let i=1;i<arr.length;i++)value=arr[i]*k+value*(1-k);return value;};
  const closes=candles.map(x=>x.close);
  const historical=candles.slice(-35,-5);
  const recent=candles.slice(-5);
  const oldHigh=Math.max(...historical.map(x=>x.high));
  const oldLow=Math.min(...historical.map(x=>x.low));
  const oldRangePct=(oldHigh/oldLow-1)*100;
  const baseVolume=avg(historical.map(x=>x.volume));
  const vol3=avg(candles.slice(-3).map(x=>x.volume));
  const volumeRatio=baseVolume>0?vol3/baseVolume:0;
  const volNow=baseVolume>0?last.volume/baseVolume:0;
  const distancePct=(oldHigh-last.close)/oldHigh*100;
  const ema7=ema(closes,7),ema25=ema(closes,25);
  const prevEma7=ema(closes.slice(0,-3),7);
  const prevEma25=ema(closes.slice(0,-3),25);
  const emaTurn=ema7>prevEma7&&ema7>=ema25*.995&&ema25>=prevEma25;
  const green=recent.filter(c=>c.close>c.open).length;
  const risingLows=recent.at(-1).low>Math.min(...recent.slice(0,-1).map(c=>c.low));
  const nearResistance=distancePct>=-0.25&&distancePct<=1.5;
  const compression=oldRangePct<=3.5;
  const accumulation=compression&&green>=3&&risingLows;
  const closeLocation=(last.close-last.low)/Math.max(last.high-last.low,last.close*.000001);
  const breakout=last.close>oldHigh*1.001&&closeLocation>=.65;
  const falseBreakout=last.high>oldHigh*1.002&&last.close<oldHigh*.997;
  const change5=(last.close/candles.at(-6).close-1)*100;
  const change15=(last.close/candles.at(-16).close-1)*100;
  const extended=change5>=3||change15>=7;
  const sellPressure=last.close<last.open&&volNow>=2&&closeLocation<.3;
  const score=(compression?20:0)+(accumulation?15:0)+(emaTurn?20:0)+
    (volumeRatio>=1.5?20:0)+(nearResistance?15:0)+(breakout?10:0);
  const reasons=[
    compression?"30 dakikalık sıkışma":null,
    accumulation?"Yükselen dipler ve pozitif mum dizilimi":null,
    emaTurn?"EMA7 yukarı dönüyor, EMA25 destekliyor":null,
    volumeRatio>=1.5?"Son 3 dakikada hacim artışı":null,
    nearResistance?"Geçmiş direnç yakınında":null,
    breakout?"Direnç üzerinde güçlü mum kapanışı":null
  ].filter(Boolean);
  const warnings=[
    extended?"Yükselişin önemli bölümü gerçekleşmiş olabilir.":null,
    falseBreakout?"Sahte kırılım riski.":null,
    sellPressure?"Hacimli satış mumu.":null,
    baseVolume===0?"Referans hacim yok.":null
  ].filter(Boolean);
  let setup="BEKLE",setupPhase="NONE";
  if(extended||falseBreakout||sellPressure){
    setup="RİSK YÜKSEK";setupPhase="RISK";
  }else if(compression&&emaTurn&&volumeRatio>=1.5&&nearResistance&&score>=70){
    setup=breakout?"YÜKSELİŞ BAŞLIYOR":"YÜKSELİŞ HAZIRLIĞI";
    setupPhase=breakout?"BREAKOUT":"PRE_BREAKOUT";
  }else if(score>=50){setup="İZLE";setupPhase="WATCH";}
  return {setup,setupPhase,setupScore:score,setupReasons:reasons,setupWarnings:warnings,
    setupResistance:oldHigh,setupDistancePct:Number(distancePct.toFixed(3)),
    setupVolumeRatio:Number(volumeRatio.toFixed(2)),setupChange5:Number(change5.toFixed(2)),
    setupChange15:Number(change15.toFixed(2)),setupAction:"BEKLE",
    // No 5-minute countdown: OHLCV cannot guarantee the timing of a jump.
    predictedMinutes:null,asOf:last.time};
}
