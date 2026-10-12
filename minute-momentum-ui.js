// Real 30 x 1s / previous 30 x 1m momentum presentation.
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
  const sources=Object.entries(d.sources||{}).map(([name,s])=>
   !s.supported?name+": 1 sn verisi bu sürümde yok":
   name+": "+s.checked+"/"+s.eligible+" (tam veri "+s.successful+
   ", eksik "+s.missing+", hata "+s.failed+")"+(s.error?" ["+s.error+"]":"")).join(" | ");
  status.textContent=(d.running?"Tarama sürüyor | ":"")+
   "Son kontrol: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"İlk tarama bekleniyor")+
   " | 30 sn / 30 dk teyit: "+(d.rows?.length||0)+
   " | Denenen: "+(d.checked||0)+" | Geçerli karşılaştırma: "+(d.successful||0)+
   " | Eksik mum: "+(d.missing||0)+" | API hata: "+(d.failed||0)+
   (sources?"\nBorsalar: "+sources:"")+
   ((d.errors||[]).length?"\nİlk sorun: "+d.errors[0]:"");
  cards.replaceChildren();
  line(cards,"SİNYAL: Son 30 tamamlanmış 1 sn mumunun fiyat ortalaması, önceki 30 tamamlanmış 1 dk mum ortalamasından en az %2 yüksek olacak. 30 sn hacim, önceki 30 dk normaline göre en az 2,5 kat artacak. Son 3 adet 10 sn hacim dilimi kademeli hızlanacak.","description");
  if(!d.rows?.length)line(cards,d.running?"Gerçek 1 sn mumları analiz ediliyor...":
   "Şu anda fiyat +%2 ve hızlanan hacim koşullarını aynı anda sağlayan işlem çifti yok. Sinyal üretilmedi.");
  for(const x of d.rows||[]){
   const card=document.createElement("article");card.className="coin-card";
   const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange;card.append(title);
   line(card,"30 SN HACİMLİ MOMENTUM TEYİDİ","first-reaction-decision decision-watch-buy");
   line(card,"30 sn fiyat ort.: "+fmt(x.currentAverage,9)+" USDT | Önceki 30 dk ort.: "+
    fmt(x.previousAverage,9)+" USDT | Fark: +%"+fmt(x.priceChangePct,3));
   line(card,"30 sn işlem hacmi: "+fmt(x.volume30USDT,0)+" USDT | Normal 30 sn hacmi: "+
    fmt(x.expected30USDT,0)+" USDT | Hacim çarpanı: "+fmt(x.volumeRatio)+"×","description");
   line(card,"İlk 10 sn: "+fmt(x.first10USDT,0)+" | Orta 10 sn: "+fmt(x.middle10USDT,0)+
    " | Son 10 sn: "+fmt(x.last10USDT,0)+" USDT | Son/orta ivme: "+
    fmt(x.lastVsMiddle)+"× | Son/ilk ivme: "+fmt(x.lastVsFirst)+"×","description");
   line(card,"Son 1 sn kapanışı: "+fmt(x.price,9)+" USDT | Makas: %"+fmt(x.spreadPct,3)+
    " | İlk tespit: "+new Date(x.firstSeenAt).toLocaleTimeString("tr-TR")+
    " | Son 1 sn mum kapanışı: "+new Date(x.candleTime+1000).toLocaleTimeString("tr-TR")+
    " | Son analiz: "+new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR"),"description");
   cards.append(card);
  }
  const candidates=(d.closest||[]).filter(x=>!x.confirmed&&x.priceChangePct>=0.8).slice(0,10);
  if(candidates.length){
   const header=document.createElement("h3");header.textContent="Eşiğe yaklaşanlar (TEYİT DEĞİL)";cards.append(header);
   for(const x of candidates){
    line(cards,x.symbol+" • "+x.exchange+" | Fiyat farkı: %"+fmt(x.priceChangePct,3)+
     " | Hacim çarpanı: "+fmt(x.volumeRatio)+"× | Hacim hızlanıyor: "+
     (x.volumeAccelerating?"Evet":"Hayır")+" | "+x.reason,"description");
   }
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
