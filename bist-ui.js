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

const autoButton=document.querySelector("#bistAutoScan");
const autoStatus=document.querySelector("#bistAutoStatus");
const autoCards=document.querySelector("#bistAutoCards");
function showAuto(data){
  autoCards.replaceChildren();
  autoStatus.textContent=(data.message||"")+
    (data.updatedAt?" Son tarama: "+new Date(data.updatedAt).toLocaleString("tr-TR"):"")+
    (data.scanned?" | İncelenen: "+data.scanned:"")+
    (data.errors?.length?" | Veri hatası: "+data.errors.length:"");
  for(const x of data.rows||[]){
    const card=document.createElement("article");card.className="coin-card";
    const h=document.createElement("h3");h.textContent=x.symbol+" • "+x.status;
    const p=document.createElement("p");p.textContent="Puan: "+(x.score??"-")+"/100 | Fiyat: "+(x.price??"-")+" TL | Hacim: "+(x.volumeRatio??"-")+"x";
    const note=document.createElement("p");note.textContent=(x.reasons||[]).join(" • ");
    card.append(h,p,note);autoCards.append(card);
  }
}
autoButton.addEventListener("click",async()=>{
  autoButton.disabled=true;autoStatus.textContent="Yetkili veri kaynağı kontrol ediliyor...";
  try{
    const r=await fetch("/api/bist/scan",{method:"POST"});
    const data=await r.json();
    if(!r.ok)throw Error(data.error||"Tarama hatası");
    showAuto(data);
  }catch(e){autoStatus.textContent="Tarama yapılamadı: "+e.message;}
  finally{autoButton.disabled=false;}
});
fetch("/api/bist/status").then(r=>r.json()).then(showAuto)
  .catch(()=>{autoStatus.textContent="Veri sağlayıcı durumu alınamadı.";});

const burkutButton=document.querySelector("#burkutScan");
const burkutStatus=document.querySelector("#burkutStatus");
const burkutCards=document.querySelector("#burkutCards");
function showBurkut(data){
  burkutCards.replaceChildren();
  burkutStatus.textContent=(data.configured?"Bağlantı yapılandırılmış. ":"API anahtarı henüz eklenmedi. ")+
    (data.message||"")+(data.universeCount?" Toplam hisse: "+data.universeCount:"")+
    (data.updatedAt?" Son veri: "+new Date(data.updatedAt).toLocaleString("tr-TR"):"");
  for(const x of data.rows||[]){
    const card=document.createElement("article");card.className="coin-card";
    const title=document.createElement("h3");title.textContent=x.symbol;
    const price=document.createElement("p");price.textContent="Gecikmeli fiyat: "+x.price+" TL | Günlük değişim: %"+x.changePercent;
    const volume=document.createElement("p");volume.textContent="Hacim: "+x.volume+
      " | Veri zamanı: "+(x.updatedAt||"Bilinmiyor");
    card.append(title,price,volume);burkutCards.append(card);
  }
}
burkutButton.addEventListener("click",async()=>{
  burkutButton.disabled=true;burkutStatus.textContent="Ücretsiz veri kaynağı sorgulanıyor...";
  try{
    const r=await fetch("/api/bist/burkut/scan",{method:"POST"});
    const data=await r.json();
    if(!r.ok)throw Error(data.error||"Bağlantı hatası");
    showBurkut(data);
  }catch(e){burkutStatus.textContent="Veri alınamadı: "+e.message;}
  finally{burkutButton.disabled=false;}
});
fetch("/api/bist/burkut/status").then(r=>r.json()).then(showBurkut)
  .catch(()=>{burkutStatus.textContent="Bürküt bağlantı durumu alınamadı.";});
