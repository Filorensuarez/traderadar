const ROOT=location.hostname==="filorensuarez.github.io"?"https://traderadar-yro7.onrender.com":location.origin;
const start=document.getElementById("brokerStart"),status=document.getElementById("brokerStatus"),venues=document.getElementById("brokerVenues"),results=document.getElementById("brokerResults");
let busy=false;
const fmt=n=>Number(n).toLocaleString("tr-TR",{maximumSignificantDigits:7});
function el(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
async function refresh(){
 try{
  const r=await fetch(ROOT+"/api/broker/status",{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();start.disabled=!!d.running||busy;
  status.textContent=d.running?"Tüm borsalar taranıyor; yalnızca emir akışı doğrulanan adaylar gösterilir.":d.finishedAt?"Tarama tamamlandı • Alım önerisi için inceleme adayı: "+d.results.length:"Tarama başlatılmadı.";
  venues.replaceChildren();
  for(const [name,s] of Object.entries(d.exchanges||{})){
   venues.append(el("p",name+": "+s.checked+"/"+s.total+" tarandı; "+s.verified+" doğrulandı; "+s.eligible+" aday • "+(s.verification||s.status)+(s.errors?" • Veri hatası: "+s.errors:"")));
  }
  results.replaceChildren();
  for(const x of (d.results||[]).sort((a,b)=>b.score-a.score)){
   const card=el("article","");card.className="info-box";card.style.marginBottom="12px";
   card.append(el("h3","ALIM İÇİN İNCELE • "+x.symbol+" • "+x.exchange+" • "+x.score+"/100"));
   card.append(el("p","Fiyat: "+fmt(x.price)+" • Spread: %"+fmt(x.spread)+" • CVD oranı: "+fmt(x.cvd)+" • OBI: "+fmt(x.obi)));
   card.append(el("p","Limit alış aralığı: "+fmt(x.entryLow)+" – "+fmt(x.entryHigh)+" • Zarar durdurma: "+fmt(x.stop)));
   card.append(el("p","Hedef 1: "+fmt(x.target1)+" • Hedef 2: "+fmt(x.target2)));
   const ul=el("ul","");for(const reason of x.reasons)ul.append(el("li",reason));card.append(ul);
   card.append(el("small",x.limitations.join(" • ")));results.append(card);
  }
  if(d.finishedAt&&!d.results?.length)results.append(el("p","Tüm doğrulama şartlarını geçen alım adayı bulunamadı. Eksik veri alım sinyali sayılmaz."));
 }catch(e){status.textContent="Broker API bağlantı hatası: "+e.message;}
}
start.addEventListener("click",async()=>{
 busy=true;start.disabled=true;
 try{const r=await fetch(ROOT+"/api/broker/start",{method:"POST"});const d=await r.json();if(!r.ok)throw Error(d.error||"HTTP "+r.status);status.textContent="Tarama başladı.";}
 catch(e){status.textContent="Başlatılamadı: "+e.message;}
 finally{busy=false;refresh();}
});
setInterval(()=>{if(!document.getElementById("broker").hidden)refresh();},5000);
refresh();
