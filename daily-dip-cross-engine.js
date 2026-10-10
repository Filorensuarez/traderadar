// TradeRadar single daily setup: recovery, fresh EMA cross, breakout, volume and risk/reward.
// Closed candles only. All prices are in the exchange pair quote currency.
function ema(values,n){const k=2/(n+1),out=[];let v=values[0];for(const x of values){v+=k*(x-v);out.push(v);}return out;}
const round=x=>Number(x.toPrecision(9));
export function detectDailyDipCross(input,now=Date.now()){
 const DAY=86400000;
 const bars=(Array.isArray(input)?input:[]).map(b=>({time:+b.time,open:+b.open,high:+b.high,low:+b.low,close:+b.close,volume:+b.volume}))
  .filter(b=>Object.values(b).every(Number.isFinite)&&b.open>0&&b.low>0&&b.close>0&&b.high>=Math.max(b.open,b.close,b.low)&&b.volume>=0)
  .sort((a,b)=>a.time-b.time).filter(b=>b.time+DAY<=now).slice(-150);
 if(bars.length<65||now-(bars.at(-1).time+DAY)>DAY*2)return null;
 const i=bars.length-1,price=bars[i].close;
 const closes=bars.map(b=>b.close),e7=ema(closes,7),e25=ema(closes,25);
 const lows=bars.slice(i-19,i+1);
 const dip=Math.min(...lows.map(b=>b.low));
 const dipIndex=bars.findIndex((b,j)=>j>=i-19&&b.low===dip);
 const daysSinceDip=i-dipIndex;
 // Dip should be sufficiently recent but not the current candle.
 if(daysSinceDip<2||daysSinceDip>14)return null;
 const rebound=price/dip-1;
 if(rebound<0||rebound>.25)return null;
 let crossIndex=-1;
 for(let j=i;j>=i-4;j--)if(j>0&&e7[j-1]<=e25[j-1]&&e7[j]>e25[j]){crossIndex=j;break;}
 if(crossIndex<0||e7[i]<=e25[i])return null;
 const crossAge=i-crossIndex;
 const rising=e7[i]>e7[i-1]&&e25[i]>=e25[i-1];
 const priorHigh=Math.max(...bars.slice(i-5,i).map(b=>b.high));
 const breakout=price>priorHigh;
 const volumeAverage=bars.slice(i-20,i).reduce((n,b)=>n+b.volume,0)/20;
 const volumeRatio=volumeAverage>0?bars[i].volume/volumeAverage:0;
 const ranges=[];
 for(let j=i-13;j<=i;j++){
  const prev=bars[j-1].close;
  ranges.push(Math.max(bars[j].high-bars[j].low,Math.abs(bars[j].high-prev),Math.abs(bars[j].low-prev)));
 }
 const atr=ranges.reduce((n,v)=>n+v,0)/ranges.length;
 if(!(atr>0))return null;
 const stop=Math.max(0,Math.min(bars[i].low,Math.min(...bars.slice(i-5,i+1).map(b=>b.low)))-.25*atr);
 const risk=price-stop;
 if(risk<=0)return null;
 const riskPct=risk/price*100;
 const target1=price+2*risk,target2=price+3*risk;
 const historicalResistance=bars.slice(Math.max(0,i-60),i).map(b=>b.high).filter(v=>v>price).sort((a,b)=>a-b)[0]??null;
 const resistanceBlocks=historicalResistance!==null&&historicalResistance<target1;
 const candlePositive=price>bars[i].open;
 const notChasing=rebound<=.10&&(price/e7[i]-1)<=.05;
 const checks={
  recentDip:true,freshCross:true,risingAverages:rising,positiveCandle:candlePositive,
  volumeConfirmed:volumeRatio>=1.5,breakout,notChasing,
  stopValid:riskPct>=1&&riskPct<=6,unblockedTarget:!resistanceBlocks
 };
 const missing={
  risingAverages:"Ortalamalar birlikte yükselmiyor",
  positiveCandle:"Son günlük mum pozitif değil",
  volumeConfirmed:"Hacim 20 günlük ortalamanın 1,5 katına ulaşmadı",
  breakout:"Son 5 mumun zirvesi kapanışla aşılamadı",
  notChasing:"Fiyat dipten veya EMA7'den fazla uzaklaştı",
  stopValid:"Zarar-kes mesafesi %1–6 aralığında değil",
  unblockedTarget:"İlk hedefin önünde yakın geçmiş direnç var"
 };
 const reasons=Object.entries(missing).filter(([k])=>!checks[k]).map(([,v])=>v);
 const qualified=reasons.length===0;
 return {
  status:qualified?"ALIM KOŞULLARI UYGUN":"YENİ KESİŞİM — İZLE",
  decision:qualified?"ALIM KOŞULLARI UYGUN":"TAKİP ET",timeframe:"1d",
  symbolTime:bars[i].time,price:round(price),ema7:round(e7[i]),ema25:round(e25[i]),
  gapPct:+((e7[i]/e25[i]-1)*100).toFixed(2),dipPrice:round(dip),dipTime:bars[dipIndex].time,
  priceFromDipPct:+(rebound*100).toFixed(2),dipToCrossDays:crossIndex-dipIndex,
  crossAgeDays:crossAge,crossTime:bars[crossIndex].time+DAY,candleTime:bars[i].time,
  volumeRatio:+volumeRatio.toFixed(2),stop:round(stop),stopPct:+riskPct.toFixed(2),
  target1:round(target1),target2:round(target2),resistance:historicalResistance===null?null:round(historicalResistance),
  rewardRisk:2,checks,reasons,
  reason:qualified?"Teknik koşullar sağlandı. Likidite, komisyon ve fiyat kayması ayrıca doğrulanmalıdır.":"Eksik teyitler: "+reasons.join("; ")
 };
}
