/**
 * LUMIA-style early aggressive-buy detector.
 * Only past executed trades are used. No promise of future price movement.
 */
export function detectFastBuy(trades,now=Date.now()){
 const recent=trades.filter(t=>t.time>=now-10000&&t.time<=now);
 const baseline=trades.filter(t=>t.time>=now-70000&&t.time<now-10000);
 const value=(list,side)=>list.reduce((sum,t)=>sum+(t.side===side?t.value:0),0);
 const buy10=value(recent,"buy"),sell10=value(recent,"sell");
 const baselineBuy=value(baseline,"buy")/6;
 const acceleration=baselineBuy>0?buy10/baselineBuy:null;
 const share=buy10+sell10>0?buy10/(buy10+sell10)*100:null;
 const previous=trades.filter(t=>t.time>=now-40000&&t.time<now-30000);
 const middle=trades.filter(t=>t.time>=now-30000&&t.time<now-20000);
 const lastPrice=recent.at(-1)?.price;
 const middlePrice=middle.at(-1)?.price;
 const oldPrice=previous.at(-1)?.price;
 const firstMove=oldPrice>0&&middlePrice>0?(middlePrice/oldPrice-1)*100:null;
 const secondMove=middlePrice>0&&lastPrice>0?(lastPrice/middlePrice-1)*100:null;
 const priceAccelerating=firstMove!==null&&secondMove!==null&&secondMove>0&&secondMove>firstMove;
 const move30=oldPrice>0&&lastPrice>0?(lastPrice/oldPrice-1)*100:null;
 const late=move30!==null&&move30>=3;
 const sufficient=recent.length>=5&&baseline.length>=12&&buy10+sell10>=2000&&
  acceleration!==null&&share!==null&&priceAccelerating;
 const alert=Boolean(sufficient&&acceleration>=2&&share>=65&&!late);
 return {fastBuyAlert:alert,buy10Usdt:Math.round(buy10),sell10Usdt:Math.round(sell10),
  buySharePercent:share===null?null:Number(share.toFixed(1)),
  buySpeed10s:acceleration===null?null:Number(acceleration.toFixed(2)),
  priceAccelerating,priceChange30s:move30===null?null:Number(move30.toFixed(2)),
  signal:"OLAĞAN DIŞI HIZLI ALIŞ",dataSufficient:sufficient};
}
