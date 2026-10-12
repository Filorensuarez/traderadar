// Dedicated strict V-bottom radar UI. No charts or model-probability claims.
const vSection=document.querySelector("#vbottom");
const vButton=document.querySelector("#vBottomButton");
const vStatus=document.querySelector("#vBottomStatus");
const vCards=document.querySelector("#vBottomCards");
const vRefresh=document.querySelector("#vBottomScan");
const vShowCandidates=document.querySelector("#vBottomCandidates");
const vFormat=(x,d=2)=>x!==null&&x!==undefined&&Number.isFinite(Number(x))
 ?Number(x).toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d}):"Veri yok";
const vPrice=x=>x!==null&&x!==undefined&&Number(x)>0
 ?Number(x).toLocaleString("tr-TR",{maximumSignificantDigits:10}):"Veri yok";
let vData=null;
function vText(parent,content,className){
 const p=document.createElement("p");p.textContent=content;
 if(className)p.className=className;parent.append(p);return p;
}
function vCard(x){
 const card=document.createElement("article");card.className="coin-card";
 const title=document.createElement("h3");
 title.textContent=x.symbol+" • "+x.exchange+" | "+x.stage+" | "+vFormat(x.score,0)+"/100";
 card.append(title);
 const badge=document.createElement("div");badge.className="confirmation "+(x.confirmed?"confirmed":"candidate");
 badge.textContent=x.confirmed?"12/12 kontrol: TAM TEKNİK TEYİT — kesin getiri değildir":x.stage;
 card.append(badge);
 vText(card,"Anlık fiyat: "+vPrice(x.price)+" USDT | Alış kotasyonu: "+vPrice(x.ask)+
  " USDT | Tespit edilen dip: "+vPrice(x.bottom)+
  " USDT | Önceki düşüş: %"+vFormat(x.dropPct)+
  " | Dipten toparlanma: %"+vFormat(x.reboundPct));
 vText(card,"RSI 1/5/15 dk: "+vFormat(x.rsi7,1)+" / "+vFormat(x.rsi5,1)+" / "+vFormat(x.rsi15,1)+
  " | Stokastik RSI: "+vFormat(x.stochRsi,0)+
  " | Hacim artışı: "+vFormat(x.volumeRatio)+" kat"+
  " | Makas: %"+vFormat(x.spreadPct,3),"description");
 vText(card,"EMA7: "+vPrice(x.ema7)+" | EMA25: "+vPrice(x.ema25)+
  " | VWAP (60dk): "+vPrice(x.vwap)+
  " | MACD histogram 1/5/15dk: "+vFormat(x.macd1,6)+" / "+
   vFormat(x.macd5,6)+" / "+vFormat(x.macd15,6),"description");
 if(x.confirmed){
  vText(card,"TEKNİK PLAN (15–60 dakika) — İzlenen giriş: "+vPrice(x.ask)+
   " USDT | Zarar-kes: "+vPrice(x.stop)+" USDT | Hedef: "+vPrice(x.target)+
   " USDT | Teknik yükseliş alanı: %"+vFormat(x.potentialPct)+
   " | Risk/getiri: 1:"+vFormat(x.riskReward));
 }else{
  vText(card,"Tam teyit verilmedi: "+x.reason+". Bu aşamada onaylı giriş, hedef veya stop gösterilmez.");
 }
 const checks=document.createElement("details");checks.style.marginTop="9px";
 const label=document.createElement("summary");label.textContent="Tüm teyit kontrollerini göster";checks.append(label);
 if(x.checks?.length){
  const list=document.createElement("ul");
  for(const item of x.checks){
   const li=document.createElement("li");li.textContent=(item.ok?"Geçti: ":"Geçmedi: ")+item.label;list.append(li);
  }
  checks.append(list);
 }else vText(checks,"Zaman dilimi verisi henüz yeterli değil.");
 card.append(checks);
 vText(card,"24 saat hacim: "+vFormat(x.volume24h,0)+" USDT | İlk gözlem: "+
  (x.firstSeenAt?new Date(x.firstSeenAt).toLocaleTimeString("tr-TR"):"-")+
  " | Son kontrol: "+(x.lastCheckedAt?new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR"):"-"),
  "description");
 return card;
}
function vRender(){
 if(!vData)return;
 const d=vData,onlyConfirm=!vShowCandidates?.checked;
 const shown=(d.rows||[]).filter(x=>!onlyConfirm||x.confirmed);
 vCards.replaceChildren();
 const expl=document.createElement("p");expl.className="description";
 expl.textContent=onlyConfirm?"Yalnızca 12 teknik koşulu birlikte geçen coinler gösteriliyor.":
 "Adaylar ve reddedilen hareketler de gösteriliyor; yalnız TAM TEKNİK TEYİT giriş planı üretir.";
 vCards.append(expl);
 if(shown.length===0){
  vText(vCards,d.running?"Tarama devam ediyor; 5 borsanın sonuçları bekleniyor.":
   "Bu taramada seçili koşulları geçen coin bulunamadı. Sinyal uydurulmaz; borsalar dönüşümlü taranır.");
 }
 for(const row of shown)vCards.append(vCard(row));
}
async function vLoad(){
 if(vSection.hidden)return;
 try{
  const r=await fetch("/api/v-bottom",{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  vData=await r.json();
  const d=vData;
  const sources=Object.entries(d.sources||{}).map(([ex,s])=>ex+" "+(s.checked||0)+"/"+(s.eligible||0)+
   (s.error?" [HATA: "+s.error+"]":"")).join(" | ");
  vStatus.textContent=(d.running?"Tarama sürüyor | ":"")+
   "Son tamamlanan: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yok")+
   " | Bu tur kontrol: "+(d.checked||0)+" / Uygun piyasa: "+(d.eligible||0)+
   " | 12/12 teyit: "+(d.confirmed||0)+
   " | Aday: "+(d.candidates||0)+
   " | Geç kalındı: "+(d.late||0)+
   " | Veri hatası: "+(d.failed||0)+
   (sources?"\nBorsalar: "+sources:"")+
   ((d.errors||[]).length?"\nİlk hata: "+d.errors[0]:"");
  vRender();
 }catch(err){vStatus.textContent="V tipi dip verileri alınamadı: "+err.message;}
}
vShowCandidates?.addEventListener("change",vRender);
vRefresh?.addEventListener("click",async()=>{
 if(vRefresh.disabled)return;
 vRefresh.disabled=true;vRefresh.textContent="Tarama başlatılıyor...";
 try{
  const r=await fetch("/api/v-bottom/scan",{method:"POST"});
  if(!r.ok)throw Error("HTTP "+r.status);
  await vLoad();
 }catch(e){vStatus.textContent="Tarama başlatılamadı: "+e.message;}
 finally{vRefresh.disabled=false;vRefresh.textContent="Şimdi Tara";}
});
vButton?.addEventListener("click",()=>{queueMicrotask(vLoad);});
setInterval(vLoad,5000);
