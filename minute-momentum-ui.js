const button=document.querySelector("#momentumButton");
const section=document.querySelector("#momentum");
const status=document.querySelector("#momentumStatus");
const cards=document.querySelector("#momentumCards");
let busy=false;
async function refresh(){
 if(section.hidden)return;
 try{
  const r=await fetch("/api/minute-momentum",{cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  status.textContent=(d.running?"Tarama sürüyor | ":"")+
   "Son tarama: "+(d.updatedAt?new Date(d.updatedAt).toLocaleTimeString("tr-TR"):"Henüz yok")+
   " | Denenen: "+d.checked+" | Başarılı: "+d.successful+" | Hatalı: "+d.failed+
   " | Takipte: "+d.rows.length+" | En yüksek değişim: "+(d.maxChangePct===null?"Veri yok":"%"+d.maxChangePct)+(d.errors.length?" | İlk hata: "+d.errors[0]:"");
  cards.replaceChildren();
  for(const x of d.rows){
   const card=document.createElement("article");card.className="coin-card";
   const title=document.createElement("h3");title.textContent=x.symbol+" • "+x.exchange;card.append(title);
   const decision=document.createElement("p");decision.className="first-reaction-decision decision-watch-buy";
   decision.textContent="TAKİPTE";card.append(decision);
   const p=document.createElement("p");
   p.textContent="Son 10 / önceki 10 ortalama değişimi: %"+x.changePct+
    " | Fiyat: "+x.price+" | Önceki ortalama: "+x.previousAverage.toPrecision(8)+
    " | Son ortalama: "+x.currentAverage.toPrecision(8);
   card.append(p);
   const t=document.createElement("p");t.className="description";
   t.textContent="İlk tespit: "+new Date(x.firstSeenAt).toLocaleString("tr-TR")+
    " | Son kapanmış mum: "+new Date(x.candleTime+60000).toLocaleString("tr-TR")+
    " | Son kontrol: "+new Date(x.lastCheckedAt).toLocaleTimeString("tr-TR");
   card.append(t);cards.append(card);
  }
  if(!d.rows.length){
   const p=document.createElement("p");p.textContent="Henüz %2 eşiğini karşılayan takip sinyali yok. "+d.notice;cards.append(p);
   if(d.closest?.length){
    const heading=document.createElement("h3");heading.textContent="Eşiğe en yakın coinler (takip sinyali değil)";cards.append(heading);
    for(const x of d.closest.slice(0,8)){
     const line=document.createElement("p");line.textContent=x.symbol+" • "+x.exchange+" | 10/10 ortalama değişim: %"+x.changePct;cards.append(line);
    }
   }
  }
 }catch(e){status.textContent="Tarama hatası: "+e.message;}
}
button?.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(el=>el.hidden=el!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(el=>el.classList.toggle("active",el===button));
 refresh();
});
document.querySelectorAll("nav.tabs .tab:not(#momentumButton)").forEach(el=>el.addEventListener("click",()=>{section.hidden=true;button.classList.remove("active");}));
document.querySelector("#momentumScan")?.addEventListener("click",async()=>{
 if(busy)return;busy=true;
 try{const r=await fetch("/api/minute-momentum/scan",{method:"POST"});if(!r.ok)throw Error("HTTP "+r.status);}
 catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{busy=false;refresh();}
});
setInterval(refresh,3000);
