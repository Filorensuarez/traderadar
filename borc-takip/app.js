import {blankState, normalize, project, cleanNumber, monthOffset} from './model.mjs';
const KEY = 'butcepilot-local-v1';
const $ = selector => document.querySelector(selector);
const tl = n => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(n)||0);
const val = n => Number(n||0).toLocaleString('tr-TR',{maximumFractionDigits:0});
const monthName = code => { const [y,m] = code.split('-').map(Number);return new Intl.DateTimeFormat('tr-TR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1))); };
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state;
try {const saved=localStorage.getItem(KEY);state=saved?normalize(JSON.parse(saved)):blankState();} catch {state=blankState();}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{notify('Tarayıcı kaydı engellendi. JSON yedeğinizi indirin.');}}
let noticeTimer;
function notify(msg){$('#notice').textContent=msg;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').textContent='',7000);}
function download(name,content,type){const b=new Blob([content],{type});const url=URL.createObjectURL(b);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
const titles={dashboard:['Genel görünüm','Bütçeniz, aylık ödemeleriniz ve borçlarınız tek ekranda.'],debts:['Borçlarım','KMH, kredi ve kart bilgilerinizi güncelleyin.'],schedule:['Aylık ödeme planı','Taksitleri, kart ödemelerini ve KMH tahmini seyrini takip edin.'],payments:['Ödeme kayıtları','Gerçekleşen transferleri yerel olarak kaydedin.'],settings:['Gelir ve ayarlar','Simülasyon için gelir, gider ve faiz varsayımlarınızı ayarlayın.']};
let page='dashboard';
function navigate(to){page=to;document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.dataset.page===to));document.querySelectorAll('.nav-btn').forEach(el=>el.classList.toggle('active',el.dataset.nav===to));$('#page-title').textContent=titles[to][0];$('#page-subtitle').textContent=titles[to][1];window.scrollTo({top:0,behavior:'smooth'});render();}
function renderChart(points){const el=$('#debt-chart');if(!points.length||state.banks.length===0){el.innerHTML='<div class="no-data">Grafik için KMH hesabı ekleyin veya yedek dosyanızı yükleyin.</div>';return;}
  const W=780,H=270,left=66,right=12,top=12,bottom=43,pw=W-left-right,ph=H-top-bottom;
  const nums=[project(state).openingKMH,...points.map(r=>r.endBalance)];const topValue=Math.max(1, ...nums)*1.15;
  const coords=nums.map((n,i)=>[left+pw*i/(nums.length-1||1),top+ph*(1-n/topValue)]);
  const path=coords.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
  const area=path+` L ${coords.at(-1)[0].toFixed(1)} ${top+ph} L ${coords[0][0]} ${top+ph} Z`;
  const lines=[0,.25,.5,.75,1].map(f=>{const y=top+ph*(1-f);return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${W-right}" y2="${y}"/><text class="axis-label" text-anchor="end" x="${left-9}" y="${y+4}">${esc(val(topValue*f))}</text>`;}).join('');
  const labs=points.map((r,i)=>({r,i})).filter(({i})=>i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/6))===0).map(({r,i})=>`<text class="axis-label" text-anchor="middle" x="${coords[i+1][0]}" y="${H-15}">${esc(monthName(r.month))}</text>`).join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Aylara göre tahmini kalan KMH borcu"><title>KMH borcu tahmini seyri</title>${lines}<path class="chart-fill" d="${area}"/><path class="chart-line" d="${path}"/>${labs}</svg>`;
}
function renderDashboard(){const model=project(state),first=model.firstMonth;if(!first)return;
 $('#kpi-kmh').textContent=tl(model.openingKMH);
 $('#kpi-capacity').textContent=tl(state.settings.income-state.settings.rent-state.settings.living-state.settings.reserve);
 $('#kpi-interest').textContent=tl(first.interest);
 $('#kpi-gap').textContent=tl(first.shortfall);
 $('#kpi-gap-caption').textContent=first.shortfall>0?'İlk ay karşılanamayan öngörülen tutar':'İlk ayda finansman açığı yok';
 $('#payoff-badge').textContent=model.payoffMonth?'KMH bitiş tahmini: '+monthName(model.payoffMonth):'KMH bitişi henüz görünmüyor';
 renderChart(model.records);
 $('#quick-months').innerHTML=model.records.slice(0,5).map(r=>`<div class="month-summary"><div><strong>${esc(monthName(r.month))}</strong><small>KMH sonrası tahmini bakiye</small></div><div style="text-align:right"><b>${tl(r.endBalance)}</b>${r.shortfall>0?`<small class="warning-text">Açık: ${tl(r.shortfall)}</small>`:'<small class="success-text">Finansman açığı yok</small>'}</div></div>`).join('');
 $('#priority-list').innerHTML=[['1 · Zorunlu giderler','Kira ve aile giderlerini önce ayırın.'],['2 · Vadesi gelen taksitler','Kredi, ek hesap ve kartın banka ekranındaki zorunlu ödemesini doğrulayın.'],['3 · KMH faiz ve anapara','Gerçek zorunlu tutarları teyit ettikten sonra kalan bütçeyi yönlendirin.']].map(([name,desc])=>`<div class="priority-card"><b>${esc(name)}</b><p>${esc(desc)}</p></div>`).join('');
}
function renderDebts(){
 $('#banks-body').innerHTML=state.banks.length?state.banks.map(b=>`<tr><td><input aria-label="Banka adı" class="inline-input" data-bank-id="${esc(b.id)}" data-bank-key="name" maxlength="90" value="${esc(b.name)}"></td><td><input aria-label="KMH borcu" class="inline-input" type="number" min="0" step="1" data-bank-id="${esc(b.id)}" data-bank-key="balance" value="${b.balance}"></td><td><input aria-label="Aylık KMH faiz oranı" class="inline-input" type="number" min="0" max="100" step="0.01" data-bank-id="${esc(b.id)}" data-bank-key="ratePct" value="${b.ratePct}"></td><td><button class="small-btn" data-remove-bank="${esc(b.id)}">Sil</button></td></tr>`).join(''):'<tr><td colspan="4" class="empty">Henüz KMH hesabı yok.</td></tr>';
 $('#loan-installment').value=state.loan.installment;$('#loan-left').value=state.loan.paymentsLeft;$('#loan-first').value=state.loan.firstMonth;
 $('#card-balance').value=state.card.currentBalance;$('#card-limit').value=String(state.card.limitAbove100k);
 $('#extra-list').innerHTML=state.oneOffs.map(o=>`<div class="record-row"><label>Açıklama<input data-extra-id="${esc(o.id)}" data-extra-key="name" value="${esc(o.name)}"></label><label>Ay<input data-extra-id="${esc(o.id)}" data-extra-key="month" type="month" value="${esc(o.month)}"></label><label>Tutar (TL)<input data-extra-id="${esc(o.id)}" data-extra-key="amount" type="number" min="0" value="${o.amount}"></label><button class="small-btn" data-remove-extra="${esc(o.id)}">Sil</button></div>`).join('')||'<p class="helper">Tek seferlik ödeme bulunmuyor.</p>';
}
function renderSchedule(){const model=project(state);$('#schedule-body').innerHTML=model.records.map(r=>`<tr><td>${esc(monthName(r.month))}</td><td>${tl(r.income)}</td><td>${tl(r.fixed)}</td><td>${tl(r.loan+r.extra)}</td><td><input aria-label="${esc(r.month)} kart ödemesi" type="number" class="inline-input edit-highlight" min="0" step="100" data-card-month="${esc(r.month)}" value="${r.card}"></td><td>${tl(r.interest)}</td><td class="positive">${tl(r.principal)}</td><td>${tl(r.endBalance)}</td><td class="${r.shortfall>0?'negative':'muted'}">${r.shortfall>0?tl(r.shortfall):'—'}</td></tr>`).join('');}
function renderPayments(){const rows=[...state.payments].sort((a,b)=>b.date.localeCompare(a.date));$('#payments-body').innerHTML=rows.length?rows.map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.target)}</td><td>${tl(p.amount)}</td><td>${esc(p.note)}</td><td><button class="small-btn" data-remove-payment="${esc(p.id)}">Sil</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Henüz kayıt eklenmedi.</td></tr>';}
function renderSettings(){const s=state.settings;for(const [key,id] of Object.entries({income:'#setting-income',rent:'#setting-rent',living:'#setting-living',reserve:'#setting-reserve',startMonth:'#setting-start',months:'#setting-months',interestTaxPct:'#setting-tax',payoffMethod:'#setting-method'})) $(id).value=s[key];}
function render(){if(page==='dashboard')renderDashboard();else if(page==='debts')renderDebts();else if(page==='schedule')renderSchedule();else if(page==='payments')renderPayments();else if(page==='settings')renderSettings();}
function updated(msg){save();render();if(msg)notify(msg);}
function uid(){return (crypto?.randomUUID ? crypto.randomUUID() : 'id'+Date.now()+Math.random()).slice(0,70);}
document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
$('#backup-btn').addEventListener('click',()=>download('butcepilot-yedek-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json'));
$('#import-input').addEventListener('change',async ev=>{const file=ev.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('Dosya 1 MB sınırını aşıyor.');const loaded=normalize(JSON.parse(await file.text()));if(state.banks.length&&!confirm('Mevcut verilerin yerine içe aktarılan yedek yazılsın mı?'))return;state=loaded;updated('Yedek yüklendi. Borç ve taksitlerinizi kontrol edin.');navigate('dashboard');}catch(err){notify('Dosya yüklenemedi: '+err.message);}finally{ev.target.value='';}});
$('#add-bank').addEventListener('click',()=>{state.banks.push({id:uid(),name:'Yeni banka',balance:0,ratePct:4.25});updated();});
$('#add-extra').addEventListener('click',()=>{state.oneOffs.push({id:uid(),name:'Tek seferlik ödeme',month:state.settings.startMonth,amount:0});updated();});
document.addEventListener('change',e=>{
 const t=e.target;
 if(t.dataset.bankId){const b=state.banks.find(x=>x.id===t.dataset.bankId);if(!b)return;b[t.dataset.bankKey]=t.dataset.bankKey==='name'?t.value.slice(0,90):cleanNumber(t.value);updated();return;}
 if(t.dataset.extraId){const o=state.oneOffs.find(x=>x.id===t.dataset.extraId);if(!o)return;o[t.dataset.extraKey]=t.dataset.extraKey==='amount'?cleanNumber(t.value):t.value;updated();return;}
 if(t.dataset.cardMonth){state.card.scheduled[t.dataset.cardMonth]=cleanNumber(t.value);updated();return;}
 const loanKeys={'loan-installment':'installment','loan-left':'paymentsLeft','loan-first':'firstMonth'};
 if(loanKeys[t.id]){state.loan[loanKeys[t.id]]=t.id==='loan-first'?t.value:cleanNumber(t.value);updated();return;}
 if(t.id==='card-balance'){state.card.currentBalance=cleanNumber(t.value);updated();return;}
 if(t.id==='card-limit'){state.card.limitAbove100k=t.value==='true';updated();return;}
 const settingKeys={'setting-income':'income','setting-rent':'rent','setting-living':'living','setting-reserve':'reserve','setting-start':'startMonth','setting-months':'months','setting-tax':'interestTaxPct','setting-method':'payoffMethod'};
 if(settingKeys[t.id]){state.settings[settingKeys[t.id]]=['setting-start','setting-method'].includes(t.id)?t.value:cleanNumber(t.value);state=normalize(state);updated();}
});
document.addEventListener('click',e=>{
 const el=e.target.closest('button');if(!el)return;
 if(el.dataset.removeBank){if(confirm('KMH hesabı silinsin mi?')){state.banks=state.banks.filter(x=>x.id!==el.dataset.removeBank);updated();}}
 if(el.dataset.removeExtra){state.oneOffs=state.oneOffs.filter(x=>x.id!==el.dataset.removeExtra);updated();}
 if(el.dataset.removePayment){state.payments=state.payments.filter(x=>x.id!==el.dataset.removePayment);updated();}
});
$('#payment-date').value=new Date().toISOString().slice(0,10);
$('#payment-form').addEventListener('submit',ev=>{ev.preventDefault();state.payments.push({id:uid(),date:$('#payment-date').value,target:$('#payment-target').value.trim(),amount:cleanNumber($('#payment-amount').value),note:$('#payment-note').value.trim()});ev.target.reset();$('#payment-date').value=new Date().toISOString().slice(0,10);updated('Ödeme kaydı eklendi. KMH bakiyesi değiştiyse Borçlarım bölümünü de güncelleyin.');});
$('#clear-all').addEventListener('click',()=>{if(confirm('Bu tarayıcıdaki TÜM bütçe ve ödeme kayıtları silinsin mi? Bu işlem geri alınamaz.')){state=blankState();save();navigate('dashboard');notify('Yerel bilgiler temizlendi.');}});
$('#export-csv').addEventListener('click',()=>{
 const fields=['Ay','Gelir','Kira aile rezerv','Kredi','Tek seferlik','Kart planı','KMH tahmini faiz','KMH faiz ödemesi','KMH anapara ödemesi','KMH dönem sonu','Karşılanamayan finansman'];
 const rows=project(state).records.map(r=>[r.month,r.income,r.fixed,r.loan,r.extra,r.card,r.interest,r.paidInterest,r.principal,r.endBalance,r.shortfall]);
 const csv='\ufeff'+[fields,...rows].map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(';')).join('\r\n');
 download('butcepilot-aylik-plan.csv',csv,'text/csv;charset=utf-8');
});
render();