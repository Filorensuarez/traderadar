const TOUCH_API=location.hostname==="filorensuarez.github.io"?"https://traderadar-yro7.onrender.com":location.origin;
const status=document.getElementById("dailyTouchStatus"),cards=document.getElementById("dailyTouchCards"),scanButton=document.getElementById("dailyTouchScan"),stopButton=document.getElementById("dailyTouchStop");
const seen=new Set(),seenEarly=new Set(),seenPrep=new Set();let initialLoad=true;
const fmt=(n,d=4)=>Number.isFinite(n)?n.toLocaleString("tr-TR",{maximumFractionDigits:d}):"—";
function notify(x){const key=x.market+":"+x.day;if(seen.has(key))return;seen.add(key);if(typeof Notification!=="undefined"&&Notification.permission==="granted")new Notification("TradeRadar: momentum",{body:x.symbol+" | 10/30 ortalama farkı: %"+fmt(x.gainPct,2)});}
function chartPanel(card,x){
 const c=x.chart;if(!c?.ready)return;
 const p=document.createElement("p");
 const flag=v=>v?"Evet":"Hayır";
 p.textContent="GRAFİK | Teknik: "+c.score+"/7 | Bollinger sıkışma: "+flag(c.squeeze)+" (genişlik %"+fmt(c.bbWidthPct,2)+") | RSI: "+fmt(c.rsi,1)+" / pozitif uyumsuzluk: "+flag(c.bullishDivergence)+" | MACD dönüş: "+flag(c.macdTurning)+" | VWAP üstü: "+flag(c.aboveVwap)+" | 1/3/5 dk: "+(c.multi||[]).map(v=>v.period+"dk "+(v.up?"↑":"↓/—")).join(", ");
 card.append(p);
}
async function refresh(){
 try{
 const r=await fetch(TOUCH_API+"/api/daily-touch",{cache:"no-store",signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error("HTTP "+r.status);
 const d=await r.json();
 status.textContent="Durum: "+({running:"Taranıyor",completed:"Tarama tamamlandı",stopped:"Durduruldu","rate-limited":"Veri sağlayıcı bekleniyor",error:"Hata",idle:"Hazır"}[d.status]||d.status)+" | İncelenen: "+d.checked+" / "+d.eligible+" | Hazırlık: "+(d.preparationRows||[]).length+" | Erken aday: "+(d.earlyRows||[]).length+" | Teyitli aday: "+d.rows.length+" | Veri hatası: "+d.failed;
 scanButton.disabled=!!d.running;stopButton.disabled=!d.running;cards.replaceChildren();
 const early=d.earlyRows||[],preparation=d.preparationRows||[];
 const live=d.live?.rows||[];
 if(!d.rows.length&&!early.length&&!preparation.length){const p=document.createElement("p");p.textContent="Henüz tüm trend, hacim, alıcı baskısı, likidite ve ikinci teyit koşullarını sağlayan coin yok.";cards.append(p);}
 for(const x of live.filter(x=>x.warning)){
 const card=document.createElement("article");card.className="coin-card";
 const h=document.createElement("h3");h.textContent=x.market+" • 10 SANİYELİK ALIŞ İVMESİ (izleme)";card.append(h);
 const p=document.createElement("p");p.textContent="Alış payı: %"+fmt(x.buyRatio*100,1)+" | İlk 5 kademe alış dengesi: %"+fmt(x.imbalance*100,1)+" | 10 sn işlem hacmi: "+fmt(x.quoteVolume10s,0)+" | Fiyat hareketi: %"+fmt(x.movePct,2);card.append(p);chartPanel(card,x);cards.append(card);
 }
 for(const x of preparation){
 const key=x.market+":"+x.day;
 if(initialLoad)seenPrep.add(key);
 else if(!seenPrep.has(key)){seenPrep.add(key);if(typeof Notification!=="undefined"&&Notification.permission==="granted")new Notification("TradeRadar: hazırlık izleme",{body:x.symbol+" | Sıkışma ve hacim daralması"});}
 const card=document.createElement("article");card.className="coin-card";
 const h=document.createElement("h3");h.textContent=x.symbol+" • HAZIRLIK (izleme) • "+fmt(x.score,0)+"/60";card.append(h);
 const p=document.createElement("p");p.textContent="Fiyat: "+fmt(x.close,8)+" | Fiyat aralığı oranı: "+fmt(x.widthRatio,2)+" | Hacim oranı: "+fmt(x.volumeRatio,2)+" | 10/30 farkı: %"+fmt(x.gainPct,2);card.append(p);cards.append(card);
 }
 for(const x of early){
 const earlyKey=x.market+":"+x.day;
 if(initialLoad)seenEarly.add(earlyKey);
 else if(!seenEarly.has(earlyKey)){seenEarly.add(earlyKey);if(typeof Notification!=="undefined"&&Notification.permission==="granted")new Notification("TradeRadar: erken toparlanma",{body:x.symbol+" | Hacim: "+fmt(x.volumeRatio,2)+"x | 5 dk: %"+fmt(x.fiveRisePct,2)});}
 const card=document.createElement("article");card.className="coin-card";
 const h=document.createElement("h3");h.textContent=x.symbol+" • ERKEN TOPARLANMA • "+fmt(x.score,0)+"/84";card.append(h);
 const p=document.createElement("p");p.textContent="PARTI modeli (izleme, alım teyidi değil) | 10/30 farkı: %"+fmt(x.gainPct,2)+" | 5 dk: %"+fmt(x.fiveRisePct,2)+" | Hacim: "+fmt(x.volumeRatio,2)+"x | Taker alış: %"+fmt(x.takerBuyRatio,1);card.append(p);cards.append(card);
 }
 for(const x of d.rows){
 if(initialLoad)seen.add(x.market+":"+x.day);else if(typeof Notification!=="undefined")notify(x);
 const card=document.createElement("article");card.className="coin-card";
 const h=document.createElement("h3");h.textContent=x.symbol+" • ÇOKLU TEYİT • "+fmt(x.score,0)+"/100";card.append(h);
 for(const line of ["Son 10 mum ortalaması: "+fmt(x.recent,8),"Önceki 30 mum ortalaması: "+fmt(x.baseline,8),"Fark: %"+fmt(x.gainPct,2)+" | Hacim: "+fmt(x.volumeRatio,2)+"x | Taker alış: %"+fmt(x.takerBuyRatio,1)+" | Spread: %"+fmt(x.spreadPct,3)+" | İkinci teyit: +%"+fmt(x.followThroughPct,2)+" | Puan: "+fmt(x.score,0)+" | Fiyat: "+fmt(x.close,8),"Günlük fiyat aralığı: %"+fmt(x.dailyRangePct,2)+" | %5 hedef: "+fmt(x.target5,8)+" | %10 hedef: "+fmt(x.target10,8)+" | Örnek %2 zarar-kes: "+fmt(x.stopExample,8),"Son kapalı mum: "+new Date(x.day).toLocaleString("tr-TR")]){const p=document.createElement("p");p.textContent=line;card.append(p);}
 const link=document.createElement("a");link.textContent="Binance grafiğini aç ↗";link.href="https://www.binance.com/tr/trade/"+encodeURIComponent(x.market.replace(/(USDT|TRY)$/,"_$1"));link.target="_blank";link.rel="noopener noreferrer";card.append(link);chartPanel(card,x);cards.append(card);
 }
 initialLoad=false;
 if(d.error){const p=document.createElement("p");p.textContent="Son hata: "+d.error;cards.append(p);}
 }catch(e){status.textContent="Tarama verisi alınamadı: "+e.message;}
}
scanButton?.addEventListener("click",async()=>{scanButton.disabled=true;try{const r=await fetch(TOUCH_API+"/api/daily-touch/scan",{method:"POST"});if(!r.ok)throw Error("HTTP "+r.status);await refresh();}catch(e){status.textContent="Tarama başlatılamadı: "+e.message;scanButton.disabled=false;}});
stopButton?.addEventListener("click",async()=>{await fetch(TOUCH_API+"/api/daily-touch/stop",{method:"POST"});await refresh();});
document.getElementById("dailyTouchNotify")?.addEventListener("click",async()=>{if(typeof Notification==="undefined")return;const p=await Notification.requestPermission();document.getElementById("dailyTouchNotify").textContent=p==="granted"?"Bildirimler açık":"Bildirim izni verilmedi";});
refresh();setInterval(refresh,2000);
