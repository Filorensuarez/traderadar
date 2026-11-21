// Responsible per-cycle market coverage while preserving real 1-second candle validation.
// Higher numbers are targets; exchanges may return fewer eligible pairs or rate-limit.
export const MOMENTUM_SCAN_INTERVAL_MS = 120_000;
export const MOMENTUM_SCAN_TARGETS=Object.freeze({BINANCE:200,OKX:16});
export const MOMENTUM_MIN_REQUEST_SPACING_MS=Object.freeze({BINANCE:180,OKX:2600});
// Shared-IP OKX limits may also be consumed by the other TradeRadar scanners.
export const MOMENTUM_RATE_LIMIT_COOLDOWN_MS=Object.freeze({BINANCE:90000,OKX:180000});
export function chooseMomentumMarkets(provider,rawMarkets,offset=0){
 const limit=MOMENTUM_SCAN_TARGETS[provider]||0;
 if(!Array.isArray(rawMarkets)||!limit)return {selected:[],nextOffset:0};
 const seen=new Set(),markets=[];
 for(const market of rawMarkets){
  if(!market||typeof market.symbol!=="string"||seen.has(market.symbol))continue;
  seen.add(market.symbol);markets.push(market);
 }
 // Neutral round-robin coverage: daily gain/loss and volume never determine eligibility.
 // Each cycle advances through the entire available universe without favoring leaders.
 const start=markets.length?(Math.trunc(offset)%markets.length+markets.length)%markets.length:0;
 const count=Math.min(limit,markets.length);
 const selected=Array.from({length:count},(_,i)=>markets[(start+i)%markets.length]);
 return {selected,nextOffset:markets.length?(start+count)%markets.length:0};
}
