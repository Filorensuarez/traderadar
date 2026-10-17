// Responsible per-cycle market coverage while preserving real 1-second candle validation.
// Higher numbers are targets; exchanges may return fewer eligible pairs or rate-limit.
export const MOMENTUM_SCAN_INTERVAL_MS = 60_000;
export const MOMENTUM_SCAN_TARGETS=Object.freeze({BINANCE:70,OKX:16});
export const MOMENTUM_MIN_REQUEST_SPACING_MS=Object.freeze({BINANCE:140,OKX:1500});
export function chooseMomentumMarkets(provider,rawMarkets,offset=0){
 const limit=MOMENTUM_SCAN_TARGETS[provider]||0;
 if(!Array.isArray(rawMarkets)||!limit)return {selected:[],nextOffset:0};
 const seen=new Set(),markets=[];
 for(const market of rawMarkets){
  if(!market||typeof market.symbol!=="string"||seen.has(market.symbol))continue;
  seen.add(market.symbol);markets.push(market);
 }
 const selected=[],taken=new Set();
 const add=x=>{
  if(!x||taken.has(x.symbol)||selected.length>=limit)return;
  selected.push(x);taken.add(x.symbol);
 };
 const top=provider==="OKX"?4:12;
 for(const market of markets.slice(0,top))add(market);
 const leaders=provider==="OKX"?3:8;
 const gainers=markets.filter(x=>Number.isFinite(x.dayChange))
  .sort((a,b)=>b.dayChange-a.dayChange);
 for(const market of gainers.slice(0,leaders))add(market);
 const remaining=markets.filter(market=>!taken.has(market.symbol));
 const start=remaining.length?(Math.trunc(offset)%remaining.length+remaining.length)%remaining.length:0;
 const slots=Math.max(0,limit-selected.length);
 for(let i=0;i<Math.min(slots,remaining.length);i++)add(remaining[(start+i)%remaining.length]);
 return {
  selected,
  nextOffset:remaining.length?(start+Math.max(1,slots))%remaining.length:0
 };
}
