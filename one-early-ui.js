const ROOT=location.hostname==="filorensuarez.github.io"?"https://traderadar-yro7.onrender.com":location.origin;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const $=id=>document.getElementById(id);
let active=false;
async function get(path){const r=await fetch(ROOT+path,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error("HTTP "+r.status);const j=await r.json();if(String(j.code)!=="0"||!Array.isArray(j.data))throw Error(j.detail||j.msg||"Veri alınamadı");return j.data;}
function ema(values,n){const k=2/(n+1);let v=values[0];return values.map((x,i)=>v=i?v+(x-v)*k:x);}
function rsi(values,n=14){let gains=0,losses=0;for(let i=values.length-n;i<values.length;i++){const d=values[i]-values[i-1];gains+=Math.max(d,0);losses+=Math.max(-d,0);}return losses===0?100:100-100/(1+gains/losses);}
function analyze(inst,raw){
 const c=raw.filter(x=>x[8]==="1").reverse();if(c.length<70)return null;
 const p=c.map(x=>+x[4]),v=c.map(x=>+x[7]),e7=ema(p,7),e25=ema(p,25),e55=ema(p,55),n=p.length-1;
 const base=p.slice(n-30,n-6),range=(Math.max(...base)-Math.min(...base))/Math.min(...base)*100;
 const volBase=v.slice(n-30,n-6).reduce((a,b)=>a+b,0)/24;
 const volRecent=v.slice(n-3,n+1).reduce((a,b)=>a+b,0)/4;
 const volumeX=volBase>0?volRecent/volBase:0;
 const breakout=p[n]>Math.max(...p.slice(n-13,n-1));
 const emaTurn=e7[n]>e25[n]&&e7[n]>e7[n-3]&&e25[n]>=e25[n-3];
 const recentRise=(p[n]/p[n-6]-1)*100;
 const strength=rsi(p);
 // Require early trend formation, not an already extended rally.
 if(range>10||volumeX<1.7||!emaTurn||recentRise>14||strength<48||strength>76)return null;
 const score=(breakout?3:0)+(e7[n-3]<=e25[n-3]?2:0)+(volumeX>=2.5?2:0)+(range<5?2:0)+(p[n]>e55[n]?1:0);
 if(score<4)return null;
 return {inst,score,range,volumeX,rsi:strength,breakout,price:p[n],recentRise};
}
function card(x){const d=document.createElement("div");d.className="info-box";const h=document.createElement("h3");h.textContent=x.inst.replace("-","/")+" • "+(x.breakout?"KIRILIM":"YAKIN TAKİP");const p=document.createElement("p");p.textContent="Puan: "+x.score+"/10 • Hacim: "+x.volumeX.toFixed(2)+"x • RSI: "+x.rsi.toFixed(1)+" • Önceki yatay aralık: %"+x.range.toFixed(1)+" • Son 6 saat: %"+x.recentRise.toFixed(1);d.append(h,p);return d;}
async function scan(){
 if(active)return;active=true;$("oneStart").disabled=true;const status=$("oneStatus"),cards=$("oneCards");cards.replaceChildren();
 let checked=0,failed=0,found=[];
 try{
  const instruments=(await get("/api/okx-tr/instruments")).filter(x=>x.state==="live"&&x.quoteCcy==="TRY");
  status.textContent=instruments.length+" aktif TRY paritesi taranıyor...";
  for(const x of instruments){
   try{const raw=await get("/api/okx-tr/candles?bar=1H&instId="+encodeURIComponent(x.instId));const result=analyze(x.instId,raw);if(result){found.push(result);found.sort((a,b)=>b.score-a.score||b.volumeX-a.volumeX);cards.replaceChildren(...found.map(card));}}
   catch(e){failed++;if(failed===1)console.warn("ONE tarama:",e);}
   checked++;status.textContent="Kontrol: "+checked+"/"+instruments.length+" • Aday: "+found.length+" • Veri hatası: "+failed;
   await sleep(650);
  }
  if(!found.length){const p=document.createElement("p");p.textContent="Şu anda koşulları sağlayan erken hareket adayı bulunamadı.";cards.append(p);}
 }catch(e){status.textContent="Tarama başlatılamadı: "+e.message;}
 finally{active=false;$("oneStart").disabled=false;}
}
$("oneStart")?.addEventListener("click",scan);
