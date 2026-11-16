const start=document.getElementById("twentyStart"),stop=document.getElementById("twentyStop");
const names=["binance","okx"];
const state=Object.fromEntries(names.map(k=>[k,{socket:null,history:new Map(),alerts:new Map(),connected:false,error:"",last:0,retry:null,connections:[],tracked:0}]));
let running=false,renderTimer=null;
const esc=x=>String(x??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function observe(kind,symbol,price){
 if(!running||!(price>0)||!/USDT$/.test(symbol))return;
 const st=state[kind],now=Date.now();st.last=now;
 let h=st.history.get(symbol);if(!h){h=[];st.history.set(symbol,h);}
 if(h.length&&now-h.at(-1).t<300)return;
 h.push({t:now,p:price});while(h.length>1&&h[0].t<now-22000)h.shift();
 const prior=h.find(x=>x.t<=now-18000);if(!prior)return;
 const change=100*(price/prior.p-1);
 if(change>=2){const old=st.alerts.get(symbol);st.alerts.set(symbol,{symbol:symbol.replace(/USDT$/,"/USDT"),price,change:+change.toFixed(2),at:now,first:old?.first||now});}
}
function reconnect(kind,fn){const st=state[kind];st.connected=false;if(running&&!st.retry)st.retry=setTimeout(()=>{st.retry=null;fn();},5000);}
function binance(){
 if(!running)return;const st=state.binance;
 try{
 const ws=new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");st.socket=ws;st.connections.push(ws);
 ws.onopen=()=>{st.connected=true;st.error="";};
 ws.onmessage=e=>{try{const data=JSON.parse(e.data);if(Array.isArray(data))for(const t of data)observe("binance",String(t.s||""),Number(t.c));}catch(err){st.error=err.message;}};
 ws.onerror=()=>{st.error="Binance WebSocket bağlantısı engellenmiş olabilir (451).";};
 ws.onclose=()=>reconnect("binance",binance);
 }catch(e){st.error=e.message;reconnect("binance",binance);}
}
async function okx(){
 if(!running)return;const st=state.okx;
 try{
 const response=await fetch("https://www.okx.com/api/v5/public/instruments?instType=SPOT",{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error("OKX parite listesi HTTP "+response.status);
 const data=await response.json();if(String(data.code)!=="0")throw Error("OKX parite listesi alınamadı");
 const symbols=(data.data||[]).filter(x=>x.quoteCcy==="USDT"&&x.state==="live").map(x=>x.instId);
 st.tracked=symbols.length;
 if(!symbols.length)throw Error("Aktif USDT paritesi bulunamadı");
 const chunks=[];for(let i=0;i<symbols.length;i+=80)chunks.push(symbols.slice(i,i+80));
 let index=0;
 for(const chunk of chunks){
  if(!running)return;
  const ws=new WebSocket("wss://ws.okx.com:8443/ws/v5/public");st.connections.push(ws);
  ws.onopen=()=>{st.connected=true;st.error="";ws.send(JSON.stringify({op:"subscribe",args:chunk.map(instId=>({channel:"tickers",instId}))}));};
  ws.onmessage=e=>{try{const msg=JSON.parse(e.data);if(msg.event==="error"){st.error=msg.msg||"Abonelik hatası";return;}if(msg.arg?.channel==="tickers")for(const t of msg.data||[])observe("okx",String(t.instId||"").replace("-",""),Number(t.last));}catch(err){st.error=err.message;}};
  ws.onerror=()=>{st.error="OKX WebSocket bağlantı hatası";};
  ws.onclose=()=>{st.connected=st.connections.some(x=>x.readyState===1);if(running)reconnect("okx",restartOkx);};
  index++;if(index%3===0)await new Promise(resolve=>setTimeout(resolve,350));
 }
 }catch(e){st.error=e.message;reconnect("okx",restartOkx);}
}
function restartOkx(){for(const ws of state.okx.connections){ws.onclose=null;ws.close();}state.okx.connections=[];okx();}
function render(){
 for(const kind of names){
 const st=state[kind],status=document.getElementById(kind+"TwentyStatus"),cards=document.getElementById(kind+"TwentyCards");
 if(!status||!cards)return;
 const now=Date.now();for(const [key,v] of st.alerts)if(now-v.at>300000)st.alerts.delete(key);
 const rows=[...st.alerts.values()].sort((a,b)=>b.change-a.change).slice(0,50);
 const connected=st.connected&&now-st.last<15000;
 status.textContent=(connected?"CANLI":"BAĞLANTI BEKLENİYOR")+" · İzlenen: "+(kind==="okx"?st.tracked:st.history.size)+" · Sinyal: "+rows.length+(st.error?" · Hata: "+st.error:"");
 cards.innerHTML=rows.length?rows.map(x=>'<article class="info-box"><h3>'+esc(x.symbol)+' · %'+esc(x.change)+'</h3><p>Fiyat: '+esc(x.price)+' USDT · Tespit: '+new Date(x.first).toLocaleTimeString("tr-TR")+'</p><p>20 saniyelik canlı fiyat hareketi; mum kapanış teyidi değildir.</p></article>').join(""):'<p>'+(!connected?"Canlı veri bekleniyor. Bu durum sıfır sinyal anlamına gelmez.":"Henüz %2 eşiğine ulaşan coin yok.")+'</p>';
 }
}
function begin(){
 if(running)return;running=true;start.disabled=true;stop.disabled=false;
 for(const k of names){const st=state[k];st.history.clear();st.alerts.clear();st.error="";st.last=0;st.connected=false;}
 binance();okx();render();renderTimer=setInterval(render,1000);
}
function end(){
 running=false;start.disabled=false;stop.disabled=true;clearInterval(renderTimer);
 for(const k of names){const st=state[k];clearTimeout(st.retry);st.retry=null;for(const ws of st.connections){ws.onclose=null;ws.close();}st.connections=[];st.socket=null;st.connected=false;document.getElementById(k+"TwentyStatus").textContent="Durduruldu";}
}
start?.addEventListener("click",begin);stop?.addEventListener("click",end);
