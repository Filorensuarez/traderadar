// Interactive, self-rendered weekly candlestick chart.
// Screenshot-inspired red SMA200 overlay, BUY and SELL markers; no TradingView data copying.
(() => {
 const dialog=document.querySelector("#maChartDialog");
 if(!dialog)return;
 const canvas=document.querySelector("#maChartCanvas"),feedback=document.querySelector("#maChartFeedback");
 const details=document.querySelector("#maChartDetails"),title=document.querySelector("#maChartTitle");
 const btnClose=document.querySelector("#maChartClose");
 const zoomIn=document.querySelector("#maZoomIn"),zoomOut=document.querySelector("#maZoomOut");
 const fit=document.querySelector("#maZoomAll"),mode=document.querySelector("#maScaleToggle");
 const note=document.querySelector("#maChartNote");
 const history=document.querySelector("#maChartSignalHistory");
 const ctx=canvas.getContext("2d");
 let data=null,windowSize=180,endAt=0,logScale=true,selected=-1,controller=null,lastRect=null;
 let down=null,pointerMoved=false;
 const money=new Intl.NumberFormat("en-US",{maximumSignificantDigits:6});
 const t=ms=>new Date(ms).toLocaleDateString("tr-TR",{month:"short",year:"numeric",timeZone:"UTC"});
 const format=v=>Number.isFinite(v)?money.format(v):"—";
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function show(message){feedback.textContent=message;}
 function resize(){
  const target=canvas.parentElement?.getBoundingClientRect().width||900;
  const width=Math.max(310,Math.floor(target));
  const height=window.innerWidth<650?380:520;
  const ratio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  canvas.style.width=width+"px";canvas.style.height=height+"px";
  ctx.setTransform(ratio,0,0,ratio,0,0);
  draw(width,height);
 }
 function draw(w=canvas.clientWidth,h=canvas.clientHeight){
  if(!ctx||!w||!h)return;
  const c=ctx;
  c.clearRect(0,0,w,h);c.fillStyle="#e5e7ed";c.fillRect(0,0,w,h);
  c.font="12px system-ui,-apple-system,sans-serif";
  const plot={left:12,right:w-79,top:37,bottom:h-51};
  c.fillStyle="#e5e7ed";c.fillRect(plot.left,plot.top,plot.right-plot.left,plot.bottom-plot.top);
  if(!data||!data.candles?.length){
   c.fillStyle="#364353";c.fillText("Haftalık veri bekleniyor...",20,h/2);return;
  }
  const candles=data.candles;
  const stop=clamp(endAt,Math.min(1,candles.length),candles.length);
  const start=Math.max(0,stop-windowSize);
  const subset=candles.slice(start,stop);
  if(!subset.length)return;
  const ma=data.ma||data.ma200||[];
  const maLabel="MA"+(data.referencePeriod||"—");
  const lows=subset.map(x=>x.low),highs=subset.map(x=>x.high);
  for(let i=start;i<stop;i++)if(ma[i]!=null&&ma[i]>0){lows.push(ma[i]);highs.push(ma[i]);}
  let lo=Math.min(...lows),hi=Math.max(...highs);
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo<=0)return;
  if(logScale){lo*=.87;hi*=1.17;}else{const delta=(hi-lo)||hi*.01;lo=Math.max(.0000000001,lo-delta*.14);hi+=delta*.17;}
  const transform=v=>logScale?Math.log(Math.max(.0000000001,v)):v;
  const min=transform(lo),max=transform(hi),amp=Math.max(1e-12,max-min);
  const y=v=>plot.bottom-(transform(v)-min)/amp*(plot.bottom-plot.top);
  const step=(plot.right-plot.left)/subset.length;
  const x=i=>plot.left+(i-start+.5)*step;
  lastRect={plot,start,stop,step};
  // Price grid
  for(let k=0;k<=5;k++){
   const lineY=plot.top+(plot.bottom-plot.top)*k/5;
   c.beginPath();c.strokeStyle="#c9cdd8";c.lineWidth=.8;c.moveTo(plot.left,lineY);c.lineTo(plot.right,lineY);c.stroke();
   const price=logScale?Math.exp(max-(max-min)*k/5):hi-(hi-lo)*k/5;
   c.fillStyle="#556074";c.textAlign="left";c.font="11px system-ui";c.fillText(format(price),plot.right+7,lineY+4);
  }
  // Time grid
  let prevYear=null;
  for(let i=start;i<stop;i++){
   const year=new Date(candles[i].time).getUTCFullYear();
   if(year!==prevYear){
    prevYear=year;
    const px=x(i);
    c.beginPath();c.strokeStyle="#cdd1db";c.setLineDash([3,5]);c.moveTo(px,plot.top);c.lineTo(px,plot.bottom);c.stroke();c.setLineDash([]);
    c.fillStyle="#606a7d";c.font="11px system-ui";c.textAlign="center";c.fillText(String(year),px,plot.bottom+25);
   }
  }
  // Candlestick shadows and bodies
  for(let i=start;i<stop;i++){
   const k=candles[i],px=x(i),green=k.close>=k.open,col=green?"#2c9872":"#d45b65";
   c.strokeStyle=col;c.lineWidth=Math.max(1,Math.min(2.4,step*.18));c.beginPath();c.moveTo(px,y(k.high));c.lineTo(px,y(k.low));c.stroke();
   c.fillStyle=col;
   const body=Math.max(1.5,Math.abs(y(k.open)-y(k.close)));
   c.fillRect(px-Math.max(1,step*.32),Math.min(y(k.open),y(k.close)),Math.max(2,step*.64),body);
  }
  // Draw actual reference MA; MA50 or MA20 must not be relabeled MA200.
  c.beginPath();let started=false;
  for(let i=start;i<stop;i++){
   if(ma[i]==null||ma[i]<=0){started=false;continue;}
   if(!started){c.moveTo(x(i),y(ma[i]));started=true;}else c.lineTo(x(i),y(ma[i]));
  }
  c.strokeStyle="#dc2848";c.lineWidth=Math.max(2.1,Math.min(3.3,w/300));c.lineJoin="round";c.stroke();
  c.font="bold 12px system-ui";c.textAlign="left";c.fillStyle="#d32243";
  c.fillText(maLabel,Math.max(16,plot.left+12),plot.top+17);
  // Signal markers, every label corresponds to completed weekly evidence
  for(const m of data.markers||[]){
   if(m.index<start||m.index>=stop)continue;
   const px=x(m.index),py= m.kind==="BUY"?y(candles[m.index].low)+18:y(candles[m.index].high)-18;
   const label=m.kind,red=m.kind==="SELL";
   const yy=clamp(py,plot.top+28,plot.bottom-17);
   c.lineWidth=1.4;c.strokeStyle=red?"#ad2635":"#145d3e";c.fillStyle=red?"#ffe9ec":"#e3ffec";
   c.beginPath();c.roundRect(px-21,yy-12,42,24,10);c.fill();c.stroke();
   c.fillStyle=red?"#a52038":"#165d38";c.textAlign="center";c.font="bold 12px system-ui";c.fillText(label,px,yy+4);
   c.beginPath();c.arc(px,red?y(candles[m.index].high):y(candles[m.index].low),2.8,0,Math.PI*2);c.fill();
  }
  c.fillStyle="#1a2434";c.textAlign="left";c.font="bold 13px system-ui";
  c.fillText(data.symbol+"  •  "+data.exchange+"  •  "+(data.timeframe==="7D"?"7D":"1W")+"  •  "+maLabel,plot.left+4,22);
  // crosshair overlay on touch/mouse
  if(selected>=start&&selected<stop){
   const px=x(selected),k=candles[selected];
   c.strokeStyle="#5b647b";c.lineWidth=1;c.setLineDash([5,5]);c.beginPath();c.moveTo(px,plot.top);c.lineTo(px,plot.bottom);c.stroke();c.setLineDash([]);
   c.fillStyle="#162b42";c.textAlign="left";c.font="11px system-ui";
   c.fillText(t(k.time)+" | O "+format(k.open)+"  H "+format(k.high)+"  L "+format(k.low)+"  C "+format(k.close)+"  MA "+format(ma[selected]),plot.left+6,h-9);
  }else{
   c.fillStyle="#626f84";c.textAlign="left";c.font="11px system-ui";
   c.fillText("BUY: kapalı hafta dönüşü   •   SELL: teknik risk uyarısı   •   İşlem önerisi değil",plot.left+6,h-9);
  }
 }
 function setWindow(count){
  if(!data)return;
  windowSize=clamp(Math.round(count),25,data.candles.length);
  endAt=clamp(endAt,windowSize,data.candles.length);
  resize();
 }
 function indexForX(clientX){
  if(!lastRect)return -1;
  const bounds=canvas.getBoundingClientRect();
  const px=clientX-bounds.left;
  return clamp(Math.floor((px-lastRect.plot.left)/lastRect.step)+lastRect.start,lastRect.start,lastRect.stop-1);
 }
 canvas.addEventListener("pointerdown",e=>{
  if(!data)return;
  down={x:e.clientX,stop:endAt,id:e.pointerId};pointerMoved=false;
  selected=indexForX(e.clientX);
  try{canvas.setPointerCapture(e.pointerId);}catch{}
  resize();
 });
 canvas.addEventListener("pointermove",e=>{
  if(!data)return;
  if(down&&down.id===e.pointerId){
   const shifted=Math.round((e.clientX-down.x)/(lastRect?.step||2));
   if(Math.abs(shifted)>=1)pointerMoved=true;
   endAt=clamp(down.stop-shifted,Math.min(windowSize,data.candles.length),data.candles.length);
  }
  selected=indexForX(e.clientX);resize();
 });
 canvas.addEventListener("pointerup",e=>{down=null;});
 canvas.addEventListener("pointercancel",e=>{down=null;});
 zoomIn?.addEventListener("click",()=>setWindow(windowSize*.70));
 zoomOut?.addEventListener("click",()=>setWindow(windowSize*1.4));
 fit?.addEventListener("click",()=>{if(!data)return;windowSize=data.candles.length;endAt=data.candles.length;resize();});
 mode?.addEventListener("click",()=>{logScale=!logScale;mode.textContent=logScale?"LOG ölçek":"Doğrusal ölçek";resize();});
 btnClose?.addEventListener("click",()=>dialog.close());
 dialog.addEventListener("close",()=>{controller?.abort();controller=null;});
 window.addEventListener("resize",()=>{if(dialog.open)resize()});
 const open=async(exchange,symbol)=>{
  controller?.abort();controller=new AbortController();
  data=null;selected=-1;show("Gerçek haftalık mumlar alınıyor...");
  if(history)history.replaceChildren();
  details.textContent="";title.textContent="Grafik hazırlanıyor...";note.textContent="";
  if(!dialog.open)dialog.showModal();
  resize();
  try{
   const url="/api/early-pump/chart?exchange="+encodeURIComponent(exchange)+"&symbol="+encodeURIComponent(symbol);
   const timeout=setTimeout(()=>controller?.abort(),17000);
   let response;
   try{response=await fetch(url,{cache:"no-store",signal:controller.signal});}
   finally{clearTimeout(timeout);}
   const body=await response.json();
   if(!response.ok)throw Error(body.error||"Borsa grafiği yüklenemedi");
   data=body;windowSize=Math.min(body.candles.length,window.innerWidth<650?145:240);
   endAt=body.candles.length;
   title.textContent=body.symbol+" • "+body.exchange+" • "+(body.timeframe==="7D"?"7 günlük":"1 haftalık")+" mumlar";
   const maText=body.referencePeriod?"MA"+body.referencePeriod:"MA yok";
   details.textContent="Son kapalı mum: "+t(body.lastClosedAt)+" | Kapanış: "+format(body.candles.at(-1)?.close)+
     " USDT | "+maText+": "+format(body.referenceMA)+
     " | MA farkı: "+(Number.isFinite(body.distancePct)?body.distancePct.toFixed(2)+"%":"—")+
     " | "+(body.status||"YENİ TEYİTLİ SİNYAL YOK");
   note.textContent=body.insufficient?
     "En az 26 kapanmış haftalık mum gerekli. Yetersiz geçmişte sahte BUY/SELL oluşturulmaz.":
     body.notice+" MA50 ve MA20, MA200 ile aynı uzun vadeli gösterge değildir.";
   const buys=(body.markers||[]).filter(m=>m.kind==="BUY");
   const sells=(body.markers||[]).filter(m=>m.kind==="SELL");
   show("Kırmızı çizgi: "+maText+" ("+(body.referencePeriod||"—")+
     " haftalık). Tarihsel BUY: "+buys.length+" • SELL: "+sells.length+
     ". Grafiği sürükleyip yakınlaştırabilirsiniz.");
   if(history){
     const heading=document.createElement("strong");
     heading.textContent="Grafikteki geçmiş BUY / SELL işaretleri ("+(body.markers||[]).length+")";
     history.appendChild(heading);
     if(!(body.markers||[]).length){
       const message=document.createElement("p");
       message.textContent="Bu fiyat geçmişinde modelin teyit koşullarını karşılayan BUY/SELL oluşmamış. Bu nedenle grafik üzerinde sahte etiket gösterilmiyor.";
       history.appendChild(message);
     }else{
       for(const marker of [...body.markers].reverse().slice(0,18)){
         const button=document.createElement("button");
         button.type="button";
         button.className="ma-history-"+marker.kind.toLowerCase();
         button.textContent=marker.kind+" · MA"+(marker.period||body.referencePeriod)+
           " · "+t(marker.confirmedAt)+" · "+format(marker.price)+" USDT";
         button.title=marker.reason||"Kapanmış haftalık sinyal";
         button.addEventListener("click",()=>{
           endAt=clamp(marker.index+Math.round(windowSize*.7),Math.min(windowSize,body.candles.length),body.candles.length);
           selected=marker.index;
           resize();
         });
         history.appendChild(button);
       }
     }
   }
   requestAnimationFrame(resize);
  }catch(error){
   if(error.name==="AbortError")show("Grafik sorgusu zaman aşımına uğradı veya iptal edildi.");
   else show("Grafik alınamadı: "+error.message);
  }
 };
 window.TradeRadarMA200Chart={open};
})();
