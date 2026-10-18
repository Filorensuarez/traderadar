// Real 30 x 1s / previous 30 x 1m momentum presentation. Confirmed results only.
import {confirmedMomentumRows} from "./momentum-visibility.js";
const button=document.querySelector("#momentumButton");
const section=document.querySelector("#momentum");
const status=document.querySelector("#momentumStatus");
const cards=document.querySelector("#momentumCards");
const scanButton=document.querySelector("#momentumScan");
let busy=false,refreshing=false;
const fmt=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString("tr-TR",{minimumFractionDigits:0,maximumFractionDigits:d}):"—";
function line(parent,content,className){
 const p=document.createElement("p");
 if(className)p.className=className;
 p.textContent=content;parent.append(p);
 return p;
}
async function refresh(){
 if(!section||section.hidden||refreshing)return;
 refreshing=true;
 try{
  const r=await fetch("/api/minute-momentum",{cache:"no-store",signal:AbortSignal.timeout(11000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  const confirmed=confirmedMomentumRows(d.rows);
  const sources=Object.entries(d.sources||{}).map(([name,s])=>
   !s.supported?name+": 1 sn verisi bu sürümde yok":
   name+": "+s.checked+"/"+s.eligible+" (tam veri "+s.successful+
   ", eksik "+s.missing+", hata "+s.failed+")"+(s.error?" ["+s.error+"]":"")).join(" | ");
  status.textContent=(d.running?"Tarama sürüyor | ":"")+
   "Son kontrol: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"İlk tarama bekleniyor")+
   " | Tam teyit: "+confirmed.length+
   " (EMA "+confirmed.filter(x=>x.signalType==="EMA_SQUEEZE_BREAKOUT").length+
   " / Hızlı fiyat "+confirmed.filter(x=>x.signalType==="PRICE_30S").length+")"+
   " | Bu tur hedef: Binance 200 + OKX 16 = 216 borsa/parite"+
   " | Denenen: "+(d.checked||0)+" | Geçerli karşılaştırma: "+(d.successful||0)+
   " | Eksik mum: "+(d.missing||0)+" | API hata: "+(d.failed||0)+
   (sources?"\nBorsalar: "+sources:"")+
   ((d.errors||[]).length?"\nİlk sorun: "+d.errors[0]:"");
  cards.replaceChildren();
  if(!confirmed.length)line(cards,d.running?
   "Tarama devam ediyor. Tam teyit alan coinler burada gösterilecek.":
   "Şu anda EMA yukarı kırılımı veya +%2 fiyat momentumu için tam teyitli coin bulunamadı.");
  for(const x of confirmed){
   const card=document.createElement("article");card.className="coin-card";
   const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange;card.append(title);
   if(x.signalType==="EMA_SQUEEZE_BREAKOUT"){
    line(card,"BUY • EMA7 / EMA25 / EMA99 SIKIŞMA KIRILIMI","first-reaction-decision decision-watch-buy");
    line(card,"EMA7: "+fmt(x.ema7,9)+" | EMA25: "+fmt(x.ema25,9)+
      " | EMA99: "+fmt(x.ema99,9)+" USDT");
    line(card,"Kırılım direnci: "+fmt(x.breakoutLevel,9)+" USDT | Kırılım: +%"+
      fmt(x.breakoutPct,3)+" | Önceki EMA sıkışması: %"+fmt(x.squeezePct,3),"description");
    line(card,"Önceki yatay bölgenin alt sınırı: "+fmt(x.invalidation,9)+
      " USDT | Onay: "+new Date(x.signalAt).toLocaleTimeString("tr-TR")+
      " | Hacim şartı yok. Bu bir işlem garantisi değildir.","description");
   }else{
    line(card,"30 SN FİYAT MOMENTUM TEYİDİ","first-reaction-decision decision-watch-buy");
    line(card,"30 sn fiyat ort.: "+fmt(x.currentAverage,9)+" USDT | Önceki 30 dk ort.: "+
      fmt(x.previousAverage,9)+" USDT | Fark: +%"+fmt(x.priceChangePct,3));
    line(card,"Fiyat teyidi: +%2 eşiği aşıldı. Hacim koşulu aranmaz.","description");
    line(card,"Son 1 sn kapanışı: "+fmt(x.price,9)+" USDT | Makas: %"+fmt(x.spreadPct,3)+
      " | İlk tespit: "+new Date(x.firstSeenAt).toLocaleTimeString("tr-TR")+
      " | Son 1 sn mum kapanışı: "+new Date(x.candleTime+1000).toLocaleTimeString("tr-TR")+
      " | Son analiz: "+new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR"),"description");
   }
   cards.append(card);
  }

 }catch(e){status.textContent="30 saniyelik momentum verileri alınamadı: "+e.message;}
 finally{refreshing=false;}
}
button?.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(el=>el.hidden=el!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
 refresh();
});
document.querySelectorAll("nav.tabs .tab:not(#momentumButton)").forEach(el=>el.addEventListener("click",()=>{
 section.hidden=true;button?.classList.remove("active");
}));
scanButton?.addEventListener("click",async()=>{
 if(busy)return;
 busy=true;scanButton.disabled=true;scanButton.textContent="Tarama başlıyor...";
 try{
  const r=await fetch("/api/minute-momentum/scan",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  await refresh();
 }catch(e){status.textContent="30 saniyelik tarama başlatılamadı: "+e.message;}
 finally{busy=false;scanButton.disabled=false;scanButton.textContent="Şimdi Tara";}
});
setInterval(refresh,3000);
