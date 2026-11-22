const base="https://traderadar-yro9.onrender.com";
const status=document.getElementById("memoryRadarStatus"),cards=document.getElementById("memoryRadarCards");
let busy=false;
async function refreshMemory(){
 if(busy||!status||!cards)return;busy=true;
 try{
 const response=await fetch(base+"/api/live-rise",{cache:"no-store"});
 if(!response.ok)throw Error("HTTP "+response.status);
 const data=await response.json();
 status.textContent="Hafızada "+(data.trackedSymbols||0)+" parite · "+Object.values(data.feeds||{}).map(f=>f.name+": "+(f.connected?"Bağlı":"Bağlantı yok")).join(" · ")+" · "+(data.rows||[]).length+" hareket";
 cards.replaceChildren();
 for(const r of data.rows||[]){
 const card=document.createElement("article");card.className="coin-card";
 const h=document.createElement("h3");h.textContent=r.symbol+" · "+r.source;
 const p=document.createElement("p");p.textContent="Fiyat "+r.price+" USDT | 5 sn: "+(r.change5s??"—")+"% | 10 sn: "+(r.change10s??"—")+"% | 20 sn: "+(r.change20s??"—")+"% | 60 sn: "+(r.change60s??"—")+"%";
 const note=document.createElement("p");note.textContent="Fiyat ivmesi: "+r.score+" | Alım baskısı: doğrulanmadı";
 card.append(h,p,note);cards.append(card);
 }
 if(!data.rows?.length){const p=document.createElement("p");p.textContent="Canlı fiyat hafızası doluyor; şu anda eşiği aşan yükseliş yok.";cards.append(p);}
 }catch(e){status.textContent="Bağlantı hatası: "+e.message;}
 finally{busy=false;}
}
document.getElementById("memoryRadarRefresh")?.addEventListener("click",refreshMemory);
refreshMemory();setInterval(()=>{if(!document.hidden)refreshMemory();},2000);
