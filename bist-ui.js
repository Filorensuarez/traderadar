import {scanBistCandles} from "./bist-radar.js";
const file=document.querySelector("#bistFile");
const status=document.querySelector("#bistStatus");
const cards=document.querySelector("#bistCards");
document.querySelector("#bistScan").addEventListener("click",async()=>{
  if(!file.files.length){status.textContent="Önce CSV dosyası seçin.";return;}
  try{
    const content=await file.files[0].text();
    const lines=content.trim().split(String.fromCharCode(10));
    const sep=lines[0].includes(";")?";":",";
    const header=lines.shift().split(sep).map(x=>x.trim().toLowerCase());
    const required=["symbol","time","open","high","low","close","volume"];
    if(required.some(k=>!header.includes(k)))throw Error("CSV sütunları eksik.");
    const groups=new Map();
    for(const line of lines.slice(0,100000)){
      const cols=line.split(sep);if(cols.length!==header.length)continue;
      const v=Object.fromEntries(header.map((k,i)=>[k,cols[i].trim()]));
      const symbol=String(v.symbol||"").toUpperCase().replace(".IS","");
      if(!symbol||symbol.length>12)continue;
      const t=Number(v.time);
      const time=Number.isFinite(t)&&t>0?(t<1e11?t*1000:t):Date.parse(v.time);
      if(!Number.isFinite(time))continue;
      const row={time};
      for(const k of required.slice(2))row[k]=Number(v[k]);
      if(!groups.has(symbol))groups.set(symbol,[]);
      groups.get(symbol).push(row);
    }
    const results=[...groups].map(([symbol,rows])=>scanBistCandles(symbol,rows)).sort((a,b)=>(b.score||0)-(a.score||0));
    cards.replaceChildren();
    for(const r of results){
      const card=document.createElement("article");card.className="coin-card";
      const h=document.createElement("h3");h.textContent=r.symbol+" | "+r.status;
      const p=document.createElement("p");
      p.textContent=r.score===undefined?r.reason:
        "Puan "+r.score+"/100 | Fiyat "+r.price+" TL | RSI "+r.rsi+" | Hacim "+r.volumeRatio+"x";
      const d=document.createElement("p");d.textContent=(r.reasons||[]).join(" • ");
      const w=document.createElement("small");w.textContent=(r.warning||[]).join(" • ");
      card.append(h,p,d,w);cards.append(card);
    }
    status.textContent=results.length+" hisse analiz edildi. Kaynak: yüklediğiniz CSV; canlı veri değildir.";
  }catch(e){status.textContent="Hata: "+e.message;}
});
