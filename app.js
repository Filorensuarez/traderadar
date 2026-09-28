const C=document.querySelector("#cards");
const K=document.querySelector("#conn");
const T=document.querySelector("#time");

const f=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toFixed(d):"-";

const alarms=new Map();
const COOLDOWN=10*60*1000;

async function enableNotifications(){
  if(!("Notification" in window)){
    alert("Tarayıcınız bildirimleri desteklemiyor.");
    return;
  }

  const p=await Notification.requestPermission();

  if(p==="granted"){
    notifyBtn.textContent="Bildirimler Açık";
    alert("TradeRadar bildirimleri açıldı.");
  }
}

function beep(strong=false){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value=strong?880:620;
    gain.gain.value=0.15;

    osc.start();

    setTimeout(()=>{
      osc.stop();
      ctx.close();
    },strong?700:350);
  }catch(e){}
}

function alarm(x){
  if(
    x.status!=="ERKEN UYARI" &&
    x.status!=="GÜÇLÜ ERKEN UYARI"
  ) return;

  const strong=x.status==="GÜÇLÜ ERKEN UYARI";
  const key=x.symbol+":"+(strong?"strong":"alert");
  const last=alarms.get(key)||0;

  if(Date.now()-last<COOLDOWN) return;

  alarms.set(key,Date.now());

  const m=x.metrics||{};
  const w30=m.w30||{};

  const title=
    (strong?"GÜÇLÜ ERKEN UYARI — ":"ERKEN UYARI — ")+x.symbol;

  const body=
    "Puan: "+x.score+"/100\n"+
    "Alış baskısı: %"+f(w30.buyRatio,1)+"\n"+
    "Hacim: "+f(m.volX)+"x | İşlem: "+f(m.tradeX)+"x";

  beep(strong);

  if("vibrate" in navigator){
    navigator.vibrate(
      strong
        ? [300,150,300,150,500]
        : [250,120,250]
    );
  }

  if(
    "Notification" in window &&
    Notification.permission==="granted"
  ){
    new Notification(title,{
      body:body,
      tag:key
    });
  }
}

function render(rows){
  T.textContent=new Date().toLocaleTimeString("tr-TR");

  rows.forEach(alarm);

  C.innerHTML=rows.map(x=>{
    const m=x.metrics||{};
    const w10=m.w10||{};
    const w30=m.w30||{};
    const w60=m.w60||{};
    const w120=m.w120||{};

    const symbol=x.symbol.replace("-USDT","/USDT");

    return `
      <article class="card">

        <div class="top">
          <div>
            <div class="sym">${symbol}</div>
            <span class="status">${x.status}</span>
          </div>

          <div>
            <div class="score">${x.score}/100</div>
            <small>${x.price}</small>
          </div>
        </div>

        <div class="bar">
          <i style="width:${x.score}%"></i>
        </div>

        <div class="metrics">

          <div class="m">
            <span>120 sn hacim</span>
            <b>${f(m.volX)}x</b>
          </div>

          <div class="m">
            <span>İşlem hızı</span>
            <b>${f(m.tradeX)}x</b>
          </div>

          <div class="m">
            <span>30 sn alış baskısı</span>
            <b>%${f(w30.buyRatio,1)}</b>
          </div>

          <div class="m">
            <span>10 sn fiyat</span>
            <b>%${f(w10.ret)}</b>
          </div>

          <div class="m">
            <span>60 sn fiyat</span>
            <b>%${f(w60.ret)}</b>
          </div>

          <div class="m">
            <span>120 sn fiyat</span>
            <b>%${f(w120.ret)}</b>
          </div>

          <div class="m">
            <span>8 mum sıkışma</span>
            <b>${f(m.compression,0)}/100</b>
          </div>

          <div class="m">
            <span>Dirence uzaklık</span>
            <b>%${f(m.resistanceDistance)}</b>
          </div>

        </div>
      </article>
    `;
  }).join("");
}

const notifyBtn=document.createElement("button");

notifyBtn.textContent=
  ("Notification" in window &&
   Notification.permission==="granted")
  ? "Bildirimler Açık"
  : "Bildirimleri Aç";

notifyBtn.style.cssText=
  "position:fixed;right:15px;bottom:18px;z-index:999;"+
  "padding:13px 18px;border:0;border-radius:24px;"+
  "font-weight:700;cursor:pointer";

notifyBtn.onclick=enableNotifications;

document.body.appendChild(notifyBtn);

let ws=null;

function connect(){
  const protocol=
    location.protocol==="https:" ? "wss" : "ws";

  ws=new WebSocket(
    protocol+"://"+location.host+"/live"
  );

  ws.onopen=()=>{
    K.textContent="OKX Canlı";
  };

  ws.onmessage=e=>{
    try{
      const d=JSON.parse(e.data);

      if(d.type==="radar"){
        render(d.rows||[]);
      }
    }catch(err){}
  };

  ws.onerror=()=>{
    K.textContent="Bağlantı hatası";
  };

  ws.onclose=()=>{
    K.textContent="Yeniden bağlanıyor...";
    setTimeout(connect,2000);
  };
}

connect();
