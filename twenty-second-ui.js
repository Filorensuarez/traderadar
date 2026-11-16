const status=document.getElementById("twentySecondStatus"),cards=document.getElementById("twentySecondCards");
const base=location.hostname==="filorensuarez.github.io"?"https://traderadar-yro7.onrender.com":"";
const escapeHtml=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let busy=false;
async function update(){
 if(busy||!status||!cards)return;busy=true;
 try{
  const response=await fetch(base+"/api/twenty-second-radar",{cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  status.textContent=(data.connected?"CANLI":"BAĞLANTI BEKLENİYOR")+" · İzlenen: "+data.trackedSymbols+" · Doğrulanan: "+data.rows.length+" · Kontrol edilen: "+data.checking+" · "+new Date().toLocaleTimeString("tr-TR")+(data.lastError?" · "+data.lastError:"");
  cards.innerHTML=data.rows.length?data.rows.map(r=>'<article class="info-box"><h3>'+escapeHtml(r.symbol)+' · %'+escapeHtml(r.changePct)+'</h3><p>Önceki kapanmış 5 dk: '+escapeHtml(r.referenceClose)+' · Son 20 saniye tepe: '+escapeHtml(r.peakPrice)+'</p><p>Son fiyat: '+escapeHtml(r.lastPrice)+' · '+new Date(r.detectedAt).toLocaleTimeString("tr-TR")+'</p></article>').join(""):'<p>Son 5 dakikada doğrulanmış %2 yükseliş sinyali yok.</p>';
 }catch(e){status.textContent="Radar sunucusuna erişilemiyor: "+e.message;cards.innerHTML="<p>Bağlantı yok. Sıfır sinyal olarak değerlendirilmez.</p>";}
 finally{busy=false;}
}
update();setInterval(()=>{if(!document.hidden)update();},2000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)update();});
