/**
 * Every eligible Binance SPOT USDT/TRY market, with no volume or count cap.
 * An active-market catalog is preferred, tickers are the fallback.
 */
export function eligibleDailyTouchMarkets(tickers,exchangeInfo=null){
  if(!Array.isArray(tickers))throw new TypeError("Ticker list missing");
  let active=null;
  if(Array.isArray(exchangeInfo?.symbols)){
    active=new Set(exchangeInfo.symbols.filter(s=>
      s.status==="TRADING"&&s.isSpotTradingAllowed!==false&&
      (s.quoteAsset==="USDT"||s.quoteAsset==="TRY")
    ).map(s=>s.symbol));
  }
  const seen=new Set(),markets=[];
  for(const row of tickers){
    const symbol=String(row?.symbol||"");
    if(!/^[A-Z0-9]{2,20}(USDT|TRY)$/.test(symbol) ||
      seen.has(symbol) || (active&&!active.has(symbol)))continue;
    const price=Number(row.lastPrice);
    if(!Number.isFinite(price)||price<=0)continue;
    seen.add(symbol);
    markets.push({symbol,price,quote:symbol.endsWith("TRY")?"TRY":"USDT",
      volume24h:Math.max(0,Number(row.quoteVolume)||0)});
  }
  markets.sort((a,b)=>b.volume24h-a.volume24h || a.symbol.localeCompare(b.symbol));
  return markets;
}
