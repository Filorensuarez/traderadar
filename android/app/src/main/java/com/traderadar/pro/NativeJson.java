package com.traderadar.pro;

import org.json.*;

final class NativeJson {
    static JSONObject obj(Object... pairs){JSONObject o=new JSONObject();for(int i=0;i<pairs.length;i+=2)put(o,(String)pairs[i],pairs[i+1]);return o;}
    static void put(JSONObject o,String k,Object v){try{o.put(k,v instanceof Double&&!Double.isFinite((Double)v)?JSONObject.NULL:v==null?JSONObject.NULL:v);}catch(JSONException e){throw new IllegalArgumentException("Geçersiz veri",e);}}
    static JSONObject config(NativeScanModel.Config c){return obj("thresholdPct",c.thresholdPct,"volumeFilter",c.volumeFilter,"minVolumeRatio",c.minVolumeRatio,"maxSpreadPct",c.maxSpreadPct,"minBuyShare",c.minBuyShare,"minIndependentGroups",c.minIndependentGroups,"targetPct",c.targetPct,"horizonMinutes",c.horizonMinutes,"commissionPct",c.commissionPct,"slippagePct",c.slippagePct,"minimumSample",c.minimumSample,"staleMs",c.staleMs);}
    static NativeScanModel.Config config(JSONObject p,NativeScanModel.Config previous){
        NativeScanModel.Config c=previous.copy();java.util.Iterator<String> keys=p.keys();
        while(keys.hasNext()){String k=keys.next();Object v=p.opt(k);
            if(k.equals("volumeFilter")){if(!(v instanceof Boolean))throw new IllegalArgumentException("Boolean gerekli");c.volumeFilter=(Boolean)v;continue;}
            if(!(v instanceof Number))throw new IllegalArgumentException("Sayısal ayar gerekli");double n=((Number)v).doubleValue();
            if(java.util.Arrays.asList("minIndependentGroups","horizonMinutes","minimumSample","staleMs").contains(k)&&n!=Math.rint(n))throw new IllegalArgumentException("Tam sayı gerekli");
            switch(k){case"thresholdPct":c.thresholdPct=n;break;case"minVolumeRatio":c.minVolumeRatio=n;break;case"maxSpreadPct":c.maxSpreadPct=n;break;case"minBuyShare":c.minBuyShare=n;break;case"targetPct":c.targetPct=n;break;case"commissionPct":c.commissionPct=n;break;case"slippagePct":c.slippagePct=n;break;case"minIndependentGroups":c.minIndependentGroups=(int)n;break;case"horizonMinutes":c.horizonMinutes=(int)n;break;case"minimumSample":c.minimumSample=(int)n;break;case"staleMs":c.staleMs=(int)n;break;default:throw new IllegalArgumentException("Bilinmeyen ayar");}
        }c.validate();return c;
    }
    static JSONObject bar(NativeScanModel.Bar b){return obj("time",b.time,"open",b.open,"high",b.high,"low",b.low,"close",b.close,"volume",b.volume,"quoteVolume",b.quoteVolume);}
    static JSONObject result(String symbol,String coin,NativeScanModel.Result r,NativeOutcome signal){
        return obj("symbol",symbol,"coin",coin,"source","BINANCE TR","ready",r.ready,"category",r.category,"score",r.score,"price",r.price,"gainPct",r.gainPct,"actualChangePct",r.actualChangePct,"referenceMean",r.referenceMean,"recentMean",r.recentMean,"quoteVolume",r.quoteVolume,"volumeRatio",r.volumeRatio,"buyShare",r.buyShare,"spreadPct",r.spreadPct,"depthQuote",r.depthQuote,"observedAt",r.observedAt,"signalTime",signal==null?r.observedAt:signal.time,"signalPrice",signal==null?r.price:signal.price,"risk",r.risk,"groups",obj("price",r.priceGroup,"volume",r.volumeGroup,"orderFlow",r.orderFlowGroup,"liquidity",r.liquidityGroup),"indicators",obj("ema9",r.ema9,"ema21",r.ema21,"rsi14",r.rsi14,"trend",r.trend,"volatilityPct",r.volatilityPct,"support",r.support,"resistance",r.resistance,"breakout",r.breakout,"macd",obj("line",r.macdLine,"signal",r.macdSignal,"histogram",r.macdHistogram)));
    }
    static JSONObject outcome(NativeOutcome r){
        JSONObject points=new JSONObject();for(java.util.Map.Entry<Integer,NativeOutcome.Checkpoint> e:r.checkpoints.entrySet()){
            NativeOutcome.Checkpoint p=e.getValue();put(points,String.valueOf(e.getKey()),obj("time",p.time,"grossPct",p.grossPct,"netPct",p.netPct,"coverage",p.coverage));}
        return obj("id",r.id,"symbol",r.symbol,"time",r.time,"price",r.price,"spreadPct",r.spreadPct,"config",config(r.config),"lastEnd",r.lastEnd,"coverage",r.coverage,"complete",r.complete,"outcome",r.outcome,"maxPrice",r.maxPrice,"minPrice",r.minPrice,"currentPrice",r.currentPrice,"maxFavorablePct",(r.maxPrice/r.price-1)*100,"maxAdversePct",(r.minPrice/r.price-1)*100,"targetAt",r.targetAt<0?null:r.targetAt,"timeToTargetMs",r.targetAt<0?null:r.targetAt-r.time,"checkpoints",points,"liveStatus",r.liveStatus);
    }
    static NativeOutcome restore(JSONObject p)throws JSONException{
        NativeOutcome r=new NativeOutcome(p.getString("symbol"),p.getLong("time"),p.getDouble("price"),p.optDouble("spreadPct",Double.NaN),config(p.getJSONObject("config"),new NativeScanModel.Config()));
        r.lastEnd=p.getLong("lastEnd");r.coverage=p.getBoolean("coverage");r.complete=p.getBoolean("complete");r.outcome=p.getString("outcome");r.maxPrice=p.getDouble("maxPrice");r.minPrice=p.getDouble("minPrice");r.currentPrice=p.getDouble("currentPrice");r.targetAt=p.isNull("targetAt")?-1:p.getLong("targetAt");
        JSONObject points=p.getJSONObject("checkpoints");java.util.Iterator<String> keys=points.keys();while(keys.hasNext()){String k=keys.next();JSONObject b=points.getJSONObject(k);NativeOutcome.Checkpoint c=new NativeOutcome.Checkpoint();c.time=b.getLong("time");c.grossPct=b.getDouble("grossPct");c.netPct=b.optDouble("netPct",Double.NaN);c.coverage=b.getBoolean("coverage");r.checkpoints.put(Integer.valueOf(k),c);}r.interrupt();return r;
    }
}
