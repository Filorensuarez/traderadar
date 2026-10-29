const status=document.getElementById("patlamaStatus");
const cards=document.getElementById("patlamaCards");
const button=document.getElementById("patlamaScan");
let running=false;
const input=id=>document.getElementById(id);
function target(){const v=Number(input("patlamaThreshold")?.value);return Number.isFinite(v)&&v>=.1&&v<=50?v:null}
function riskPlan(){const capital=Number(input("patlamaCapital")?.value),risk=Number(input("patlamaRisk")?.value),stop=Number(input("patlamaStop")?.value);const out=input("patlamaRiskPlan");if(!out)return;if(!(capital>0&&risk>0&&stop>0&&stop<=50)){out.textContent="Geçerli bütçe, risk ve stop girin.";return;}const position=Math.min(capital,risk/(stop/100));out.textContent="Azami pozisyon: "+position.toLocaleString("tr-TR",{maximumFractionDigits:0})+" TL | Stopta tahmini zarar: "+(position*stop/100).toLocaleString("tr-TR",{maximumFractionDigits:0})+" TL | 2:1 brüt hedef: "+(position*stop/100*2).toLocaleString("tr-TR",{maximumFractionDigits:0})+" TL";}
for(const id of ["patlamaCapital","patlamaRisk","patlamaStop"])input(id)?.addEventListener("input",riskPlan);riskPlan();
const CONCURRENCY=4;
const BATCH_PAUSE_MS=350;
async function json(url){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(url,{cache:"no-store",signal:controller.signal});if(!r.ok){let detail="";try{const e=await r.json();detail=e.detail||e.error||"";}catch{}throw Error("HTTP "+r.status+(detail?": "+detail:""));}return await r.json();}finally{clearTimeout(timeout);}}
function analyze(rows,symbol,exchange,url){
 const sorted=[...rows].sort((a,b)=>Number(a[0])-Number(b[0]));
 const now=Date.now();
 const closed=sorted.filter(r=>{const t=Number(r[0]);return Number.isFinite(t)&&(t<1e11?t*1000:t)+60000<=now&&String(r[8])==="1";});
 if(closed.length<33)return null;
 const last=closed.at(-1),recent=closed.slice(-3),previous=closed.slice(-33,-3);
 const avg=previous.reduce((s,r)=>s+Number(r[4]),0)/30;
 const p=Number(last[4]),gain=(p/avg-1)*100;
 if(!Number.isFinite(p)||!Number.isFinite(avg)||avg<=0||gain<(target()??Infinity))return null;
 const timestamp=Number(last[0]);const minuteStart=timestamp<1e11?timestamp*1000:timestamp;
 return {symbol,exchange,url,p,gain,minuteStart,stage:"PATLAMA TAKİBİ"};
}
const markets=[
 {name:"OKX TR",async list(){const j=await json("https://traderadar-yro7.onrender.com/api/okx-tr/instruments");if(String(j.code)!=="0"||!Array.isArray(j.data))throw Error(j.msg||"OKX TR pariteleri alınamadı");return j.data.filter(x=>x.instType==="SPOT"&&x.state==="live").map(x=>({symbol:x.instId.replace("-","/"),id:x.instId,url:"https://tr.okx.com/tr/trade-spot/"+x.instId.toLowerCase()}));},async candles(x){const j=await json("https://traderadar-yro7.onrender.com/api/okx-tr/candles?instId="+encodeURIComponent(x.id)+"");if(String(j.code)!=="0"||!Array.isArray(j.data))throw Error(j.msg||"OKX TR mum API hatası");return j.data;}}
];
function render(items,stats){
 cards.replaceChildren();
 const summary=document.createElement("div");summary.className="info-box";
 summary.textContent=stats.map(s=>s.name+": "+s.ok+"/"+s.total+" incelendi"+(s.error?" (HATA: "+s.error+")":"")).join(" • ");
 cards.append(summary);
 status.textContent=(running?"Tarama sürüyor":"Tarama tamamlandı")+" • "+stats.reduce((a,s)=>a+s.ok,0)+" mum verisi incelendi • "+items.length+" hedef yükseliş koşulunu sağlayan aday.";
 if(!items.length&&!running){const p=document.createElement("p");p.textContent="Seçilen yükseliş oranını sağlayan aday bulunamadı.";cards.append(p);}
 for(const x of items.sort((a,b)=>b.gain-a.gain)){
  const el=document.createElement("article");el.className="coin-card";el.style.cssText="padding:16px;border:1px solid #41516a;border-radius:12px;margin:8px 0";
  const title=document.createElement("h3");title.textContent=x.exchange+" • "+x.symbol+" — TAKİPTE";
  const desc=document.createElement("p");desc.textContent="Son 3 mumun son kapanışı / önceki 30 dk ortalaması: +"+x.gain.toFixed(2)+"% • Fiyat: "+x.p;
  const link=document.createElement("a");link.href=x.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Grafiği aç";
  el.append(title,desc,link);cards.append(el);
 }
}
async function scan(){if(running)return;if(target()===null){status.textContent="Hedef yükseliş %0,1–%50 arasında olmalı.";return;}running=true;button.disabled=true;cards.textContent="OKX TR üzerindeki tüm uygun pariteler taranıyor...";const items=[],stats=[],seen=new Set();try{for(const market of markets){const s={name:market.name,total:0,ok:0,error:""};stats.push(s);status.textContent=market.name+" taranıyor...";try{const symbols=await market.list();s.total=symbols.length;let failures=0;for(let i=0;i<symbols.length;i+=CONCURRENCY){await Promise.all(symbols.slice(i,i+CONCURRENCY).map(async x=>{try{const rows=await market.candles(x);if(!Array.isArray(rows)||rows.length<34)throw Error("Yetersiz mum");s.ok++;const hit=analyze(rows,x.symbol,market.name,x.url);if(hit){hit.stage="PATLAMA TAKİBİ";const key=market.name+":"+x.symbol;if(!seen.has(key)){seen.add(key);items.push(hit);render(items,stats);}}}catch(e){failures++;s.error=e.message;}}));status.textContent=market.name+" "+Math.min(i+CONCURRENCY,s.total)+"/"+s.total+" işlendi • Başarılı: "+s.ok+" • Toplam aday: "+items.length;await new Promise(resolve=>setTimeout(resolve,BATCH_PAUSE_MS));}if(failures===0)s.error="";else s.error=failures+" parite okunamadı; son hata: "+s.error;}catch(e){s.error=e.message;}render(items,stats);}}finally{running=false;button.disabled=false;render(items,stats);}}
button?.addEventListener("click",scan);
let timer=null;
function startAuto(){if(timer)return;scan();timer=setInterval(()=>{if(!document.hidden)scan();},60000);}
document.getElementById("momentumButton")?.addEventListener("click",startAuto);
if(!document.getElementById("momentum")?.hidden)startAuto();

/* Dipten dönüş adayları: 1 saatlik kapanmış mumlar, OKX TR spot. */
const dipButton=document.getElementById("patlamaDipScan");
const dipStatus=document.getElementById("patlamaDipStatus");
const dipCards=document.getElementById("patlamaDipCards");
let dipRunning=false;
function dipRsi(closes){
 if(closes.length<16)return NaN;
 let gains=0,losses=0;
 for(let i=closes.length-14;i<closes.length;i++){const d=closes[i]-closes[i-1];gains+=Math.max(0,d);losses+=Math.max(0,-d);}
 return losses===0?100:100-100/(1+gains/losses);
}
function dipAnalyze(raw,x){
 const now=Date.now();
 const bars=raw.map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5],confirmed:String(r[8])==="1"}))
 .filter(r=>r.confirmed&&r.t+3600000<=now&&r.c>0&&r.h>=r.l&&r.v>=0).sort((a,b)=>a.t-b.t);
 if(bars.length<55)return null;
 const last=bars.at(-1),prior=bars.slice(-49,-1),range=bars.slice(-49);
 const low=Math.min(...range.map(b=>b.l)),high=Math.max(...range.map(b=>b.h));
 const rangePct=(high-low)/low*100;if(rangePct<5)return null;
 const position=(last.c-low)/(high-low)*100;
 const closes=bars.map(b=>b.c),rsi=dipRsi(closes);
 const prevRsi=dipRsi(closes.slice(0,-1));
 const ema20=closes.slice(-35).reduce((ema,p,i)=>i===0?p:ema+(p-ema)*2/21,closes.at(-35));
 const avgVolume=prior.slice(-20).reduce((s,b)=>s+b.v,0)/20;
 const volumeRatio=avgVolume>0?last.v/avgVolume:0;
 const recentLow=Math.min(...bars.slice(-7,-1).map(b=>b.l));
 const bounce=(last.c/recentLow-1)*100;
 const turnUp=last.c>last.o&&last.c>bars.at(-2).c;
 // Require a real depressed price location and an early upward turn; no guarantee of breakout.
 if(position>32||rsi>48||rsi<20||!turnUp||bounce<0.3||bounce>9)return null;
 const score=Math.round(Math.max(0,32-position)*1.2+Math.max(0,48-rsi)*.8+
 Math.min(volumeRatio,3)*9+(last.c>ema20?12:0)+(rsi>prevRsi?12:0));
 return {symbol:x.symbol,url:x.url,price:last.c,position,rsi,prevRsi,volumeRatio,bounce,score,aboveEma:last.c>ema20};
}
async function scanDip(){
 if(dipRunning)return;dipRunning=true;dipButton.disabled=true;dipCards.replaceChildren();
 const hits=[];let checked=0,failed=0,total=0,lastError="";
 try{
  dipStatus.textContent="OKX TR spot pariteleri alınıyor...";
  const symbols=await markets[0].list();total=symbols.length;
  for(let i=0;i<symbols.length;i+=3){
   await Promise.all(symbols.slice(i,i+3).map(async x=>{
    try{
     const j=await json("https://traderadar-yro7.onrender.com/api/okx-tr/candles?bar=1H&instId="+encodeURIComponent(x.id));
     if(String(j.code)!=="0"||!Array.isArray(j.data))throw Error(j.msg||"Mum verisi yok");
     const hit=dipAnalyze(j.data,x);checked++;if(hit)hits.push(hit);
    }catch(e){failed++;lastError=e.message;}
   }));
   dipStatus.textContent="Dip taraması: "+Math.min(i+3,total)+"/"+total+" • Okunan: "+checked+" • Aday: "+hits.length+" • Hata: "+failed;
   if(i%15===0)await new Promise(resolve=>setTimeout(resolve,300));
  }
  hits.sort((a,b)=>b.score-a.score);
  for(const x of hits){
   const card=document.createElement("article");card.className="coin-card";
   const h=document.createElement("h3");h.textContent=x.symbol+" • Dipten dönüş adayı • Puan "+x.score;
   const p=document.createElement("p");p.textContent="Fiyat: "+x.price+" • 48 saatlik aralıkta konum: %"+x.position.toFixed(1)+" • RSI(14): "+x.rsi.toFixed(1)+" • Son mum hacmi / 20 saat ort.: "+x.volumeRatio.toFixed(2)+"x • Son 6 saat dipten uzaklık: %"+x.bounce.toFixed(2)+(x.aboveEma?" • EMA20 üstü":" • EMA20 altı");
   const a=document.createElement("a");a.href=x.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Grafiği aç";
   card.append(h,p,a);dipCards.append(card);
  }
  if(!hits.length)dipCards.textContent="Koşulları sağlayan dipten dönüş adayı bulunamadı.";
  dipStatus.textContent="Tamamlandı • "+checked+"/"+total+" parite • "+hits.length+" aday • "+failed+" veri hatası"+(failed?" • Son hata: "+lastError:"");
 }catch(e){dipStatus.textContent="Dip taraması başarısız: "+e.message;}
 finally{dipRunning=false;dipButton.disabled=false;}
}
dipButton?.addEventListener("click",scanDip);
