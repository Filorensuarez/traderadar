package com.traderadar.pro;

import java.util.*;

/** The same seven checkpoints and gross target definition as pro/history.js. */
public final class NativeOutcome {
    public static final int[] HORIZONS={1,3,5,10,15,30,60};
    public final String id,symbol;public final long time;public final double price,spreadPct;
    public final NativeScanModel.Config config;
    public long lastEnd,targetAt=-1;public boolean coverage=true,complete=false;
    public String outcome="PENDING",liveStatus="VERİ KULLANILAMIYOR";
    public double maxPrice,minPrice,currentPrice;
    public final Map<Integer,Checkpoint> checkpoints=new TreeMap<>();
    public static final class Checkpoint {public long time;public double grossPct,netPct;public boolean coverage;}
    public NativeOutcome(String s,long t,double p,double spread,NativeScanModel.Config c){symbol=s;time=t;id=s+":"+t;price=p;spreadPct=spread;config=c.copy();lastEnd=t;maxPrice=minPrice=currentPrice=p;}
    public static double netMove(double gross,NativeScanModel.Config c,double spread){
        if(!Double.isFinite(spread))return Double.NaN;
        return ((1+gross/100)*(1-c.slippagePct/100)*(1-spread/200)*(1-c.commissionPct/100)/((1+c.slippagePct/100)*(1+spread/200)*(1+c.commissionPct/100))-1)*100;
    }
    public void observe(NativeScanModel.Bar b){
        long end=b.time+1000;if(complete||end<=time||b.time<time||end<=lastEnd||end>time+3600000)return;
        if(b.time!=lastEnd)coverage=false;lastEnd=end;currentPrice=b.close;maxPrice=Math.max(maxPrice,b.high);minPrice=Math.min(minPrice,b.low);
        if(targetAt<0&&end<=time+config.horizonMinutes*60000L&&(b.high/price-1)*100+1e-10>=config.targetPct)targetAt=end;
        for(int m:HORIZONS)if(end==time+m*60000L){Checkpoint p=new Checkpoint();p.time=end;p.grossPct=(b.close/price-1)*100;p.netPct=netMove(p.grossPct,config,spreadPct);p.coverage=coverage;checkpoints.put(m,p);}
        if(end==time+config.horizonMinutes*60000L)outcome=coverage?(targetAt>=0?"SUCCESS":"FAILED"):"INSUFFICIENT_DATA";
        if(end==time+3600000)complete=true;
    }
    public void expire(long now){if(now>=time+3605000){complete=true;coverage=false;if(outcome.equals("PENDING"))outcome="INSUFFICIENT_DATA";}}
    public void interrupt(){coverage=false;liveStatus="VERİ KULLANILAMIYOR";}
    public static String weekOf(long time){Calendar c=Calendar.getInstance(TimeZone.getTimeZone("Europe/Istanbul"),Locale.ROOT);c.setTimeInMillis(time);int d=(c.get(Calendar.DAY_OF_WEEK)+5)%7;c.add(Calendar.DATE,-d);return String.format(Locale.ROOT,"%04d-%02d-%02d",c.get(Calendar.YEAR),c.get(Calendar.MONTH)+1,c.get(Calendar.DATE));}
}
