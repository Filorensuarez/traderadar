const start=100000,goal=3000000;
const el=id=>document.getElementById(id);
const money=n=>n.toLocaleString("tr-TR",{maximumFractionDigits:2});
const storageKey="traderadar-capital-journal";
let records=[];
try{records=JSON.parse(localStorage.getItem(storageKey)||"[]");if(!Array.isArray(records))records=[];}catch{records=[];}
let draft=null;
let selectedExchange="";
const planKey="traderadar-capital-plans";
let plans=[];try{plans=JSON.parse(localStorage.getItem(planKey)||"[]");if(!Array.isArray(plans))plans=[];}catch{plans=[];}
function stats(){
 const total=start+records.reduce((sum,r)=>sum+Number(r.pnl||0),0);
 const day=new Date().toDateString();
 const today=records.filter(r=>new Date(r.at).toDateString()===day).reduce((sum,r)=>sum+r.pnl,0);
 return {total,today,locked:today<=-2000||total<=90000};
}
function render(){
 const s=stats();
 el("capitalSummary").textContent="Manuel kayıtlı sermaye: "+money(s.total)+" TL | Hedef: "+money(goal)+" TL | 12 ayda gerekli aylık bileşik getiri: %32,77.";
 el("capitalLimits").textContent="İşlem başına risk sınırı: %0,5 | Günlük kayıp sınırı: 2.000 TL | Toplam kayıp uyarısı: 10.000 TL.";
 el("capitalWarnings").textContent=s.locked?"Risk sınırı aşıldı: yeni plan oluşturmayın.":"Borsa bağlantısı yoktur; bütün kayıtlar manueldir.";
 el("capitalLedger").textContent="Kaydedilen işlem sonucu: "+records.length+" | Kayıtlı plan: "+plans.length+" | Bugünkü net sonuç: "+money(s.today)+" TL.";
 el("capitalRecord").disabled=!draft||s.locked;
}
el("capitalScenario").addEventListener("click",()=>{
 const entry=Number(el("capitalEntry").value);
 if(!(entry>0)){el("capitalPlan").textContent="Önce geçerli bir giriş fiyatı girin.";return;}
 el("capitalStop").value=Number((entry*.98).toPrecision(10));
 el("capitalTarget").value=Number((entry*1.04).toPrecision(10));
 el("capitalPlan").textContent="ÖRNEK: %2 zarar-kes ve %4 hedef varsayımı girildi. Gerçek destek/direnç veya ATR analizi değildir; otomatik işlem yapmayın.";
});
el("capitalCalculate").addEventListener("click",()=>{
 const s=stats(),entry=Number(el("capitalEntry").value),stop=Number(el("capitalStop").value),target=Number(el("capitalTarget").value);
 const symbol=el("capitalSymbol").value.trim().toUpperCase();
 draft=null;
 if(s.locked||!symbol||!(entry>stop&&stop>0&&target>entry)){
  el("capitalPlan").textContent="Risk kilidi açık veya fiyat bilgileri geçersiz.";render();return;
 }
 const distance=(entry-stop)/entry;
 const size=Math.min(s.total*.2,s.total*.005/distance);
 const loss=size*distance,profit=size*(target/entry-1);
 draft={symbol,exchange:selectedExchange||"MANUEL",entry,stop,target,size,loss,profit};
 el("capitalPlan").textContent="Teorik pozisyon: "+money(size)+" TL | Zarar-kes riski: "+money(loss)+" TL | Hedef kâr: "+money(profit)+" TL. Komisyon ve kayma hariç.";
 render();
});
el("capitalRecord").addEventListener("click",()=>{if(!draft||stats().locked)return;plans.push({...draft,at:Date.now(),type:"MANUAL_PLAN"});try{localStorage.setItem(planKey,JSON.stringify(plans));}catch{}el("capitalPlan").textContent="Plan günlüğe kaydedildi. Gerçek emir gönderilmedi.";draft=null;render();});
el("capitalAddPnl").addEventListener("click",()=>{
 const value=el("capitalPnl").value.trim(),pnl=Number(value);
 if(!value||!Number.isFinite(pnl))return;
 records.push({at:Date.now(),pnl});try{localStorage.setItem(storageKey,JSON.stringify(records));}catch{}
 el("capitalPnl").value="";render();
});
el("capitalExport").addEventListener("click",()=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify({realizedResults:records,plans},null,2)],{type:"application/json"}));
 const a=document.createElement("a");a.href=url;a.download="sermaye-gunlugu.json";a.click();URL.revokeObjectURL(url);
});
const button=el("capitalButton"),section=el("capital");
button.addEventListener("click",()=>{
 document.querySelectorAll("main > section").forEach(s=>s.hidden=s!==section);
 document.querySelectorAll("nav.tabs .tab").forEach(b=>b.classList.toggle("active",b===button));
 render();
});
document.querySelectorAll("nav.tabs .tab:not(#capitalButton)").forEach(b=>b.addEventListener("click",()=>{section.hidden=true;button.classList.remove("active");}));
render();
