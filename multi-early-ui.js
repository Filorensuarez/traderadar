const ROOT=location.hostname==="filorensuarez.github.io"?"https://traderadar-yro7.onrender.com":location.origin;
const names=["OKX TR","OKX Global","Binance Global","Binance TR","BtcTurk","KuCoin","Gate.io"];
const start=document.getElementById("oneStart"),status=document.getElementById("oneStatus"),area=document.getElementById("oneCards");
const sections=new Map();area.replaceChildren();
for(const name of names){const section=document.createElement("section");section.style.cssText="padding:12px 0;border-bottom:1px solid #334155";const title=document.createElement("h3");title.textContent=name;const info=document.createElement("p");info.textContent="Bekliyor";const list=document.createElement("div");section.append(title,info,list);area.append(section);sections.set(name,{info,list});}
let polling=null;
async function update(){
 try{
  const response=await fetch(ROOT+"/api/multi-early/status",{cache:"no-store"});if(!response.ok)throw Error("HTTP "+response.status);const data=await response.json();
  start.disabled=!!data.running;status.textContent=data.running?"Bütün borsalar eş zamanlı taranıyor":data.finishedAt?"Tarama tamamlandı":"Tarama başlatılmadı";
  for(const name of names){
   const {info,list}=sections.get(name),st=data.exchanges[name];info.textContent=st?st.status+" • "+st.checked+"/"+st.total+" • Aday: "+st.found+" • Veri hatası: "+st.errors:"Bekliyor";
   list.replaceChildren();
   for(const x of data.results.filter(x=>x.exchange===name).sort((a,b)=>b.score-a.score)){
    const row=document.createElement("details");row.style.cssText="padding:10px;border-bottom:1px solid #334155";
    const summary=document.createElement("summary");summary.textContent=x.symbol+" • "+x.score+"/10 • Yükseliş gerekçeleri";row.append(summary);
    const ul=document.createElement("ul");for(const reason of x.reasons){const li=document.createElement("li");li.textContent=reason;ul.append(li);}row.append(ul);list.append(row);
   }
  }
  if(!data.running&&polling){clearInterval(polling);polling=null;}
 }catch(e){status.textContent="Sunucu bağlantı hatası: "+e.message;}
}
start.addEventListener("click",async()=>{start.disabled=true;try{const response=await fetch(ROOT+"/api/multi-early/start",{method:"POST"});if(!response.ok&&response.status!==409)throw Error("HTTP "+response.status);await update();if(!polling)polling=setInterval(update,2500);}catch(e){status.textContent=e.message;start.disabled=false;}});
update();