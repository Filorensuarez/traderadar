const status=document.getElementById("patlamaStatus");
const cards=document.getElementById("patlamaCards");
const button=document.getElementById("patlamaScan");
let running=false;
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
 if(!Number.isFinite(p)||!Number.isFinite(avg)||avg<=0||gain<2)return null;
 const timestamp=Number(last[0]);const minuteStart=timestamp<1e11?timestamp*1000:timestamp;
 return {symbol,exchange,url,p,gain,minuteStart,stage:"PATLAMA TAKİBİ"};
}
const markets=[
 {name:"OKX TR",async list(){const j=await json("https://traderadar-v3-production.up.railway.app/api/okx-tr/instruments");if(String(j.code)!=="0"||!Array.isArray(j.data))throw Error(j.msg||"OKX TR pariteleri alınamadı");return j.data.filter(x=>x.instType==="SPOT"&&x.state==="live").map(x=>({symbol:x.instId.replace("-","/"),id:x.instId,url:"https://tr.okx.com/tr/trade-spot/"+x.instId.toLowerCase()}));},async candles(x){const j=await json("https://traderadar-v3-production.up.railway.app/api/okx-tr/candles?instId="+encodeURIComponent(x.id)+"");if(String(j.code)!=="0"||!Array.isArray(j.data))throw Error(j.msg||"OKX TR mum API hatası");return j.data;}}
];
function render(items,stats){
 cards.replaceChildren();
 const summary=document.createElement("div");summary.className="info-box";
 summary.textContent=stats.map(s=>s.name+": "+s.ok+"/"+s.total+" incelendi"+(s.error?" (HATA: "+s.error+")":"")).join(" • ");
 cards.append(summary);
 status.textContent=(running?"Tarama sürüyor":"Tarama tamamlandı")+" • "+stats.reduce((a,s)=>a+s.ok,0)+" mum verisi incelendi • "+items.length+" %2 fiyat yükselişi koşulunu sağlayan aday.";
 if(!items.length&&!running){const p=document.createElement("p");p.textContent="%2 fiyat yükselişi koşulunu sağlayan aday bulunamadı.";cards.append(p);}
 for(const x of items.sort((a,b)=>b.gain-a.gain)){
  const el=document.createElement("article");el.className="coin-card";el.style.cssText="padding:16px;border:1px solid #41516a;border-radius:12px;margin:8px 0";
  const title=document.createElement("h3");title.textContent=x.exchange+" • "+x.symbol+" — TAKİPTE";
  const desc=document.createElement("p");desc.textContent="Son 3 mumun son kapanışı / önceki 30 dk ortalaması: +"+x.gain.toFixed(2)+"% • Fiyat: "+x.p;
  const link=document.createElement("a");link.href=x.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Grafiği aç";
  el.append(title,desc,link);cards.append(el);
 }
}
async function scan(){if(running)return;running=true;button.disabled=true;cards.textContent="OKX TR üzerindeki tüm uygun pariteler taranıyor...";const items=[],stats=[],seen=new Set();try{for(const market of markets){const s={name:market.name,total:0,ok:0,error:""};stats.push(s);status.textContent=market.name+" taranıyor...";try{const symbols=await market.list();s.total=symbols.length;let failures=0;for(let i=0;i<symbols.length;i+=CONCURRENCY){await Promise.all(symbols.slice(i,i+CONCURRENCY).map(async x=>{try{const rows=await market.candles(x);if(!Array.isArray(rows)||rows.length<34)throw Error("Yetersiz mum");s.ok++;const hit=analyze(rows,x.symbol,market.name,x.url);if(hit){hit.stage="PATLAMA TAKİBİ";const key=market.name+":"+x.symbol;if(!seen.has(key)){seen.add(key);items.push(hit);render(items,stats);}}}catch(e){failures++;s.error=e.message;}}));status.textContent=market.name+" "+Math.min(i+CONCURRENCY,s.total)+"/"+s.total+" işlendi • Başarılı: "+s.ok+" • Toplam aday: "+items.length;await new Promise(resolve=>setTimeout(resolve,BATCH_PAUSE_MS));}if(failures===0)s.error="";else s.error=failures+" parite okunamadı; son hata: "+s.error;}catch(e){s.error=e.message;}render(items,stats);}}finally{running=false;button.disabled=false;render(items,stats);}}
button?.addEventListener("click",scan);
let timer=null;
function startAuto(){if(timer)return;scan();timer=setInterval(()=>{if(!document.hidden)scan();},60000);}
document.getElementById("momentumButton")?.addEventListener("click",startAuto);
if(!document.getElementById("momentum")?.hidden)startAuto();
