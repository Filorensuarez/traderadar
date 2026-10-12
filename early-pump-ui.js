const section=document.querySelector("#earlypump");
const button=document.querySelector("#earlyPumpButton");
const status=document.querySelector("#earlyPumpStatus");
const cards=document.querySelector("#earlyPumpCards");
const fmt=(v,d=2)=>Number.isFinite(Number(v))&&v!==null&&v!==undefined
 ?Number(v).toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d}):"Veri yok";
const price=v=>v>0?Number(v).toLocaleString("tr-TR",{maximumSignificantDigits:10}):"Veri yok";
let latest=null;
let filter="ALL";
const stageOptions=[
 ["ALL","Tüm aşamalar"],["KIRILIM TEYİDİ","Kırılım teyidi"],
 ["KIRILIM YAKIN","Kırılım yakın"],["SIKIŞMA İZLENİYOR","Sıkışma"],
 ["KIRILIM ADAYI","Kırılım adayı"],["GEÇ KALINDI","Geç kalındı"]
];
const selector=document.createElement("select");
selector.className="x-field";
selector.setAttribute("aria-label","Erken yükseliş aşaması");
selector.style.maxWidth="240px";
selector.style.margin="8px 0";
for(const [value,text] of stageOptions){const opt=document.createElement("option");opt.value=value;opt.textContent=text;selector.append(opt);}
selector.addEventListener("change",()=>{filter=selector.value;renderRows();});
function paragraph(parent,text,cls){
 const p=document.createElement("p");if(cls)p.className=cls;p.textContent=text;parent.append(p);return p;
}
function addCard(x){
 const card=document.createElement("article");card.className="coin-card";
 const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.exchange+
  " | "+x.stage+" | Puan: "+fmt(x.score,0)+"/100";
 card.append(h);
 paragraph(card,"Teknik formasyon: "+(x.contractions||[]).map(n=>"%"+fmt(n)).join(" → ")+
  " | Sıkışmada hacim: "+fmt(x.dryVolumeRatio)+" kat"+
  " | ATR: %"+fmt(x.atrPct)+" | Son 5 dk: %"+fmt(x.change5Pct));
 paragraph(card,"Direnç: "+price(x.resistance)+" USDT"+
  " | Dirence uzaklık: %"+fmt(x.distancePct)+
  " | Hacim genişlemesi: "+fmt(x.rvol)+" kat"+
  " | Z-skoru: "+fmt(x.zScore)+
  " | BTC'ye göre 20 dk güç: "+(x.relativeStrengthPct===null?"BTC verisi yok":"%"+fmt(x.relativeStrengthPct)),
  "description");
 if(x.potential){
  paragraph(card,"Tahmini kalan yükseliş senaryosu (5–30 dk): %"+
   fmt(x.potential.lowerPct)+" – %"+fmt(x.potential.upperPct)+
   " | Üst teknik hedef: "+price(x.potential.upperPrice)+" USDT"+
   " | Dayanak: "+x.potential.basis);
 }else paragraph(card,"Potansiyel: Geç kalınmış veya yeterli güvenli teknik alan yok.");
 if(x.plan){
  paragraph(card,"Örnek risk planı — Alış kotasyonu: "+price(x.plan.entry)+
   " | Stop: "+price(x.plan.stop)+" (risk %"+fmt(x.plan.stopPct)+")"+
   " | Teknik hedef: "+price(x.plan.target)+
   " | Risk/getiri: 1:"+fmt(x.plan.rewardRisk));
 }else paragraph(card,"İşlem planı onaylanmadı: risk/getiri, makas veya veri koşulları yetersiz.");
 paragraph(card,"Makas: %"+fmt(x.spreadPct,3)+
  " | Hacim 24 saat: "+fmt(x.volume24h,0)+" USDT"+
  " | "+(x.reasons||[]).join(" • ")+
  " | İlk tespit: "+new Date(x.firstSeenAt).toLocaleTimeString("tr-TR")+
  " | Son kontrol: "+new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR"),
  "description");
 return card;
}
function renderRows(){
 if(!latest||section.hidden)return;
 const rows=(latest.rows||[]).filter(x=>filter==="ALL"||x.stage===filter);
 const head=document.createElement("p");head.className="description";
 head.textContent="VCP/SEPA uyarlaması: 3×20 dk fiyat daralması, hacim kuruması, ATR, direnç ve göreceli güç. Nicel kontrol: normalize anlık hacim ve Z-skoru. Sinyal puanı tarihsel başarı ihtimali değildir.";
 cards.replaceChildren(head);
 cards.append(selector);
 const count=document.createElement("p");count.className="description";
 count.textContent="Gösterilen: "+rows.length+" | Toplam sinyal: "+(latest.rows||[]).length+
  " | Her borsanın spot USDT evreni zaman içinde rotasyonla taranır; tek turda tamamı kontrol edilmez.";
 cards.append(count);
 if(!rows.length){
  paragraph(cards,latest.running?"Tarama sürüyor; ölçümler birikiyor.":"Bu filtrede tüm koşulları sağlayan doğrulanmış sinyal yok. Bu, piyasanın tamamının bu tur tarandığı anlamına gelmez.");
 }
 for(const x of rows)cards.append(addCard(x));
}
async function refreshEarly(){
 if(section.hidden)return;
 try{
  const r=await fetch("/api/early-pump",{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();latest=d;
  const sources=Object.entries(d.sources||{});
  const coverage=sources.map(([name,x])=>name+": "+(x.checked||0)+"/"+(x.eligible||0)+
   (x.error?" (hata: "+x.error+")":"")).join(" | ");
  status.textContent=(d.running?"Tarama sürüyor | ":"")+
   "Son tamamlanan: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yok")+
   " | Bu tur incelenen: "+(d.checked||0)+" / Uygun evren: "+(d.eligible||0)+
   " | Başarısız mum isteği: "+(d.failed||0)+
   " | Sinyal: "+(d.rows||[]).length+
   (coverage?"\nBorsa kapsamı: "+coverage:"")+
   ((d.errors||[]).length?"\nİlk hata: "+d.errors[0]:"");
  let stats=document.querySelector("#earlyRiseStats");
  if(!stats){stats=document.createElement("div");stats.id="earlyRiseStats";stats.className="info-box";status.after(stats);}
  const p=d.stats||{};
  stats.textContent="72 saatlik gözlemsel test: "+(p.evaluated||0)+" değerlendirilen / "+
   (p.recorded||0)+" kayıt | +%0,5'e ulaşan: "+(p.wins||0)+
   " | 15 dk sonrası gerçekleşen başarı oranı: "+
   (p.successPct===null||p.successPct===undefined?"Veri yok":"%"+fmt(p.successPct,1))+
   " | Ortalama 15 dk değişim: "+
   (p.avgReturnPct===null||p.avgReturnPct===undefined?"Veri yok":"%"+fmt(p.avgReturnPct,2))+
   ((p.evaluated||0)<30?" | Örnek az; başarı oranı güvenilir değil.":"")+
   " | Bu metrik komisyonlu işlem getirisi veya gelecekte kazanma olasılığı değildir."+
   (p.storageWarning?" | Kayıt sorunu: "+p.storageWarning:"");
  renderRows();
 }catch(e){status.textContent="Erken yükseliş verisi alınamadı: "+e.message;}
}
button?.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(el=>el.hidden=el!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
 refreshEarly();
});
document.querySelectorAll("nav.tabs .tab:not(#earlyPumpButton)").forEach(el=>el.addEventListener("click",()=>{section.hidden=true;button.classList.remove("active");}));
const manual=document.querySelector("#earlyPumpScan");
manual?.addEventListener("click",async()=>{
 if(manual.disabled)return;
 manual.disabled=true;
 try{
  const r=await fetch("/api/early-pump/scan",{method:"POST"});
  if(!r.ok)throw Error("HTTP "+r.status);
  await refreshEarly();
 }catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{manual.disabled=false;}
});
setInterval(refreshEarly,5000);
