// Weekly MA200 dashboard for completed-candle BUY / SELL / IZLE signals.
// No auto orders, no profit guarantees, and no fabricated price levels.
const earlySection=document.querySelector("#earlypump");
const earlyButton=document.querySelector("#earlyPumpButton");
const earlyStatus=document.querySelector("#earlyPumpStatus");
const earlyCards=document.querySelector("#earlyPumpCards");
const earlyScan=document.querySelector("#earlyPumpScan");
const filterButtons=[...document.querySelectorAll("[data-ma-filter]")];
let earlyFilter="ALL",earlyRows=[],isRefreshing=false;
const fmt=(x,d=2)=>Number.isFinite(Number(x))&&x!==null?
  Number(x).toLocaleString("tr-TR",{maximumFractionDigits:d,minimumFractionDigits:Math.min(2,d)}):"—";
const price=x=>x>0?Number(x).toLocaleString("tr-TR",{maximumSignificantDigits:9}):"—";
const date=x=>x?new Date(x).toLocaleString("tr-TR",{day:"2-digit",month:"short",year:"numeric"}):"—";
const add=(where,tag,text,cls)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=text;where.appendChild(el);return el;
};
function openGraph(exchange,symbol){
 if(window.TradeRadarMA200Chart?.open)window.TradeRadarMA200Chart.open(exchange,symbol);
 else earlyStatus.textContent="Grafik bileşeni henüz yüklenmedi. Sayfayı yenileyin.";
}
function renderCards(){
 earlyCards.replaceChildren();
 const rows=earlyRows.filter(r=>earlyFilter==="ALL"||r.status===earlyFilter);
 if(!rows.length){
  add(earlyCards,"div",earlyFilter!=="ALL"?
   "Bu kategoride teyit edilmiş coin bulunmuyor. İZLE adayları veya tüm sonuçları görüntüleyin.":
   "Henüz MA200 dönüş koşullarını sağlayan coin bulunamadı. Haftalık kapanışlar beklenir; taranan pariteler dönüşümlü değişir. Yukarıdan manuel coin grafiği açabilirsiniz.","empty-card");
  return;
 }
 for(const x of rows){
  const card=document.createElement("article");card.className="ma-result-card ma-"+x.status.toLowerCase();
  const button=add(card,"button","","ma-result-button");button.type="button";
  button.setAttribute("aria-label",x.symbol+" "+x.exchange+" haftalık MA200 grafiğini aç");
  const head=add(button,"div","","ma-card-head");
  add(head,"strong",x.symbol,"ma-card-symbol");
  add(head,"span",x.exchange,"ma-source");
  add(head,"span",x.status==="BUY"?"BUY • ALIŞ TEYİDİ":x.status==="SELL"?"SELL • RİSK UYARISI":"İZLE • TEYİT BEKLENİYOR","ma-signal");
  const stats=add(button,"div","","ma-row-metrics");
  for(const [label,value] of [
   ["Son kapanış",price(x.weekClose)+" USDT"],
   ["MA200",price(x.sma200)],
   ["MA200 farkı",((x.distancePct>=0)?"+":"")+fmt(x.distancePct)+"%"],
   ["RSI (14)",fmt(x.rsi14)],
   ["24s hacim",fmt(x.volume24h,0)+" USDT"]
  ]){
   const block=add(stats,"span","","ma-metric");
   add(block,"small",label);
   add(block,"b",value);
  }
  add(button,"p",x.reason||"Haftalık görünümü açarak teyit koşullarına bakın.","ma-card-reason");
  add(button,"div","Grafiği aç → • "+x.exchange+" • kapanan hafta "+date(x.lastClosedAt),"ma-card-action");
  button.addEventListener("click",()=>openGraph(x.exchange,x.market||x.symbol));
  earlyCards.appendChild(card);
 }
}
function refreshFilterCounters(){
 for(const btn of filterButtons){
  const status=btn.dataset.maFilter;
  const count=status==="ALL"?earlyRows.length:earlyRows.filter(x=>x.status===status).length;
  btn.textContent=(status==="ALL"?"Tümü":status==="IZLE"?"İZLE":status)+" ("+count+")";
  btn.setAttribute("aria-pressed",String(status===earlyFilter));
 }
}
async function updateWeeklyRadar(){
 if(!earlySection||earlySection.hidden||isRefreshing)return;
 isRefreshing=true;
 try{
  const response=await fetch("/api/early-pump",{cache:"no-store",signal:AbortSignal.timeout(14000)});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  earlyRows=Array.isArray(data.rows)?data.rows:[];
  const sources=Object.entries(data.sources||{}).map(([exchange,v])=>
    exchange+": "+(v.checked||0)+" tarandı"+
    (v.skippedHistory?" / "+v.skippedHistory+" geçmişi yetersiz":"")+
    (v.error?" / HATA: "+v.error:"")).join(" | ");
  const count=t=>earlyRows.filter(x=>x.status===t).length;
  earlyStatus.textContent=(data.running?"Haftalık tarama sürüyor • ":"")+
    "Son tarama: "+(data.updatedAt?new Date(data.updatedAt).toLocaleString("tr-TR"):"İlk tarama bekleniyor")+
    " | BUY "+count("BUY")+" • SELL "+count("SELL")+" • İZLE "+count("IZLE")+
    " | İncelenen "+(data.checked||0)+"/"+(data.eligible||0)+
    " • Veri hatası "+(data.failed||0)+
    (sources?"\n"+sources:"")+
    ((data.errors||[]).length?"\nİlk hata: "+data.errors[0]:"")+
    "\nYalnız kapanmış haftalık mumlar. Coinler sırayla taranır. Sinyal garantisi yok.";
  refreshFilterCounters();renderCards();
 }catch(err){earlyStatus.textContent="MA200 taraması görüntülenemedi: "+err.message;}
 finally{isRefreshing=false;}
}
filterButtons.forEach(button=>button.addEventListener("click",()=>{
 earlyFilter=button.dataset.maFilter;refreshFilterCounters();renderCards();
}));
earlyButton?.addEventListener("click",()=>queueMicrotask(updateWeeklyRadar));
earlyScan?.addEventListener("click",async()=>{
 if(earlyScan.disabled)return;
 earlyScan.disabled=true;earlyScan.textContent="Taranıyor...";
 try{
  const response=await fetch("/api/early-pump/scan",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(14000)});
  if(!response.ok)throw Error("HTTP "+response.status);
  await updateWeeklyRadar();
 }catch(err){earlyStatus.textContent="Tarama başlatılamadı: "+err.message;}
 finally{earlyScan.disabled=false;earlyScan.textContent="Şimdi Tara";}
});
const lookup=document.querySelector("#maLookup");
lookup?.addEventListener("submit",event=>{
 event.preventDefault();
 const exchange=document.querySelector("#maChartExchange")?.value||"BINANCE";
 const symbol=String(document.querySelector("#maChartSymbol")?.value||"").trim().toUpperCase();
 if(!/^[A-Z0-9]{2,18}(?:[-_]?USDT)?$/.test(symbol)){
  earlyStatus.textContent="Geçersiz coin sembolü. Örnek: BTC veya BTCUSDT.";
  return;
 }
 openGraph(exchange,symbol);
});
setInterval(updateWeeklyRadar,20000);
refreshFilterCounters();
