/**
 * TradeRadar conditional decision engine.
 * Educational paper-trade plans only; no exchange orders or guaranteed signals.
 */
const isNum=x=>Number.isFinite(Number(x));
const base=s=>String(s||"").toUpperCase().replace(/[-_/](USDT|TRY|USD)$/,"").replace(/[^A-Z0-9]/g,"");
const exchange=s=>String(s||"").toUpperCase().replace("GATE.IO","GATE");
function choose(rows,source,coin) {
  return rows.find(r=>base(r.symbol)===coin&&exchange(r.source)===source);
}
export function buildDecisionPlans(daily,radar,scenarios,now=Date.now()) {
  const reasons=[];
  if(!daily?.updatedAt||now-daily.updatedAt>12*60*1000)
    return {ok:false,status:"BEKLE",reason:"Günlük tarama verisi güncel değil.",rows:[]};
  if(!radar?.updatedAt||now-radar.updatedAt>6*60*1000)
    return {ok:false,status:"BEKLE",reason:"Anlık radar verisi güncel değil.",rows:[]};
  const dailyRows=["okx","kucoin","gate"].flatMap(k=>(daily[k]?.rows||[]).map(r=>({...r,source:r.source||k})));
  const radarRows=radar.rows||[];
  const scenarioRows=[1,2,3,4].flatMap(n=>(scenarios?.["scenario"+n]?.rows||[]).map(r=>({...r,scenario:n})));
  const out=[];
  for(const d of dailyRows){
    if(!d.confirmed)continue;
    const coin=base(d.symbol),src=exchange(d.source);
    const r=choose(radarRows,src,coin);
    if(!r||!r.dataFresh||r.lateMove||r.momentumWeakening||r.stageNumber<2)continue;
    const entry=Number(r.price),atr=Number(d.atr),resistance=Number(d.resistance);
    if(![entry,atr,resistance].every(Number.isFinite)||entry<=0||atr<=0)continue;
    const drift=Math.abs(entry/Number(d.price)-1)*100;
    if(!Number.isFinite(drift)||drift>4)continue;
    const stop=entry-1.5*atr;
    if(stop<=0)continue;
    const risk=(entry-stop)/entry*100;
    if(risk<0.35||risk>5)continue;
    const target=entry+3*atr;
    const rr=(target-entry)/(entry-stop);
    const hasScenario=scenarioRows.some(s=>base(s.symbol)===coin&&exchange(s.source)===src&&Number(s.score)>=70);
    const hasResistance=Number.isFinite(resistance)&&resistance>entry;
    const resistanceRoom=hasResistance?(resistance-entry)/(entry-stop):null;
    const warnings=[];
    if(!hasScenario)warnings.push("Bağımsız senaryo teyidi yok.");
    if(hasResistance&&resistanceRoom<1.5)warnings.push("Yakın direnç hedefe ulaşmayı zorlaştırabilir.");
    if(!Number.isFinite(Number(r.volumeAcceleration))||Number(r.volumeAcceleration)<1.2)
      warnings.push("Anlık hacim artışı yetersiz.");
    // No executable buy recommendation without verified bid/ask, liquidity and slippage.
    out.push({
      symbol:coin+"/USDT",source:src==="GATE"?"GATE.IO":src,
      status:"BEKLE – İŞLEM ÖNCESİ KONTROL",paperOnly:true,
      entry:Number(entry.toPrecision(8)),stop:Number(stop.toPrecision(8)),
      target:Number(target.toPrecision(8)),riskPercent:Number(risk.toFixed(2)),
      riskReward:Number(rr.toFixed(2)),dailyScore:Number(d.score||0),
      radarScore:Number(r.score||0),scenarioConfirmed:hasScenario,
      resistance:hasResistance?resistance:null,resistanceRoom:resistanceRoom===null?null:Number(resistanceRoom.toFixed(2)),
      warnings,requirements:[
        "Güncel alış/satış fiyatı ve emir defteri likiditesi doğrulanmalı.",
        "Komisyon, fiyat kayması ve piyasa yönü kontrol edilmeli.",
        "Sanal işlem performansı yeterli örneklemle ölçülmeli."
      ],time:now
    });
  }
  out.sort((a,b)=>Number(b.scenarioConfirmed)-Number(a.scenarioConfirmed)||b.radarScore-a.radarScore);
  return {ok:true,status:"SİMÜLASYON",reason:"Gerçek emir gönderilmez. Fiyatlar canlı alış/satış teklifi değildir.",rows:out.slice(0,20),updatedAt:now};
}
