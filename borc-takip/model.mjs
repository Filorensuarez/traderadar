/**
 * Client-only debt projection. This is an estimate, not a bank amortization statement.
 * Explicit assumptions: one billing period per month, interest on opening KMH balance,
 * selected tax loading on interest, unpaid interest added to the modeled balance.
 */
export const money = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const cleanNumber = value => Math.max(0, money(value));
export const monthOffset = (yyyyMm, offset = 0) => {
  const parts = /^([0-9]{4})-([0-9]{2})$/.exec(String(yyyyMm || ''));
  const year = parts ? Number(parts[1]) : 2026;
  const month = parts ? Number(parts[2]) : 10;
  const d = new Date(Date.UTC(year, month - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
};
export function blankState() {
  return {
    version: 1,
    settings: { income: 0, rent: 0, living: 0, startMonth: monthOffset(new Date().toISOString().slice(0,7)), months: 18, interestTaxPct: 30, reserve: 0, payoffMethod: 'smallest' },
    banks: [],
    loan: { installment: 0, paymentsLeft: 0, firstMonth: monthOffset(new Date().toISOString().slice(0,7)) },
    oneOffs: [],
    card: { currentBalance: 0, limitAbove100k: true, scheduled: {} },
    payments: []
  };
}
export function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Geçersiz yedek biçimi.');
  const b = blankState();
  const s = raw.settings || {};
  b.settings = {
    income: cleanNumber(s.income), rent: cleanNumber(s.rent), living: cleanNumber(s.living),
    startMonth: /^\d{4}-(0[1-9]|1[0-2])$/.test(s.startMonth) ? s.startMonth : b.settings.startMonth,
    months: Math.max(1, Math.min(60, Math.round(money(s.months) || 18))),
    interestTaxPct: Math.min(100, cleanNumber(s.interestTaxPct)),
    reserve: cleanNumber(s.reserve),
    payoffMethod: s.payoffMethod === 'highest' ? 'highest' : 'smallest'
  };
  b.banks = (Array.isArray(raw.banks) ? raw.banks : []).slice(0, 30).map((x, i) => ({
    id: String(x.id || ('bank-' + i)).slice(0, 70),
    name: String(x.name || ('KMH ' + (i + 1))).slice(0, 90),
    balance: cleanNumber(x.balance),
    ratePct: Math.min(100, cleanNumber(x.ratePct ?? 4.25))
  }));
  b.loan = {
    installment: cleanNumber(raw.loan?.installment),
    paymentsLeft: Math.min(120, Math.round(cleanNumber(raw.loan?.paymentsLeft))),
    firstMonth: /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.loan?.firstMonth) ? raw.loan.firstMonth : b.settings.startMonth
  };
  b.oneOffs = (Array.isArray(raw.oneOffs) ? raw.oneOffs : []).slice(0, 60).map((o,i)=>({
    id: String(o.id || 'extra-' + i).slice(0, 70),
    name: String(o.name || 'Tek seferlik ödeme').slice(0, 100),
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(o.month) ? o.month : b.settings.startMonth,
    amount: cleanNumber(o.amount)
  }));
  b.card = {
    currentBalance: cleanNumber(raw.card?.currentBalance),
    limitAbove100k: Boolean(raw.card?.limitAbove100k),
    scheduled: Object.fromEntries(Object.entries(raw.card?.scheduled || {}).filter(([key])=>/^\d{4}-(0[1-9]|1[0-2])$/.test(key)).slice(0,72).map(([key, val])=>[key,cleanNumber(val)]))
  };
  b.payments = (Array.isArray(raw.payments) ? raw.payments : []).slice(0, 2000).map((x,i)=>({
    id: String(x.id || 'payment-' + i).slice(0, 70),
    date: /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : b.settings.startMonth + '-01',
    target: String(x.target || '').slice(0, 100),
    amount: cleanNumber(x.amount),
    note: String(x.note || '').slice(0, 280)
  }));
  return b;
}
export function project(raw) {
  const state = normalize(raw), settings = state.settings;
  const bankBalances = state.banks.map(b=>b.balance);
  const records = [];
  let payoffMonth = null;
  for (let i = 0; i < settings.months; i++) {
    const month = monthOffset(settings.startMonth, i);
    const loanIndex = (()=> { const [sy,sm]=state.loan.firstMonth.split('-').map(Number); const [cy,cm]=month.split('-').map(Number); return (cy-sy)*12+cm-sm; })();
    const loan = loanIndex >=0 && loanIndex < state.loan.paymentsLeft ? state.loan.installment : 0;
    const extra = state.oneOffs.filter(item=>item.month === month).reduce((a,x)=>a+x.amount,0);
    const card = cleanNumber(state.card.scheduled[month]);
    const fixed = settings.rent + settings.living + settings.reserve;
    const availableBeforeKMH = settings.income - fixed - loan - extra - card;
    const budgetForKMH = Math.max(0, availableBeforeKMH);
    const interestByBank = state.banks.map((bank, j)=>bankBalances[j]*bank.ratePct/100*(1+settings.interestTaxPct/100));
    const interest = interestByBank.reduce((a,v)=>a+v,0);
    const paidInterest = Math.min(budgetForKMH,interest);
    const unpaidInterest = interest - paidInterest;
    if (interest) {
      for (let j=0;j<bankBalances.length;j++) {
        bankBalances[j] += interestByBank[j] * (unpaidInterest / interest);
      }
    }
    let principalBudget = Math.max(0, budgetForKMH - paidInterest);
    const prioritized = state.banks.map((bank,idx)=>({...bank,idx})).sort((a,b)=>settings.payoffMethod === 'highest' ? (b.ratePct-a.ratePct || a.balance-b.balance) : (bankBalances[a.idx]-bankBalances[b.idx] || b.ratePct-a.ratePct));
    const paidPrincipal = Array(bankBalances.length).fill(0);
    for (const bank of prioritized) {
      if (principalBudget <= 0) break;
      const principal = Math.min(bankBalances[bank.idx],principalBudget);
      bankBalances[bank.idx] -= principal;
      paidPrincipal[bank.idx] = principal;
      principalBudget -= principal;
    }
    const principal = paidPrincipal.reduce((a,v)=>a+v,0);
    const endBalance = bankBalances.reduce((a,v)=>a+v,0);
    const shortfall = Math.max(0, -availableBeforeKMH) + unpaidInterest;
    const surplus = Math.max(0, availableBeforeKMH - paidInterest - principal);
    if (endBalance < 0.01 && payoffMonth===null && state.banks.length) payoffMonth=month;
    records.push({month, income:settings.income, fixed, loan, extra, card, availableBeforeKMH, interest, paidInterest, unpaidInterest, principal, endBalance, shortfall, surplus, bankBalances: [...bankBalances], paidPrincipal });
  }
  return {records, payoffMonth, openingKMH:state.banks.reduce((sum,b)=>sum+b.balance,0), openingCard:state.card.currentBalance, openingLoan:state.loan.installment * state.loan.paymentsLeft, firstMonth: records[0], totalInterest: records.reduce((sum,r)=>sum+r.interest,0), totalShortfall: records.reduce((sum,r)=>sum+r.shortfall,0)};
}