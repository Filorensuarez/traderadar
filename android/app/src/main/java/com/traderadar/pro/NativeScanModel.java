package com.traderadar.pro;

import java.util.*;

/** Pure Java mirror of pro/analysis.js. No Android, network or execution-order API. */
public final class NativeScanModel {
    public static final class Config {
        public double thresholdPct=2, minVolumeRatio=1.5, maxSpreadPct=.45, minBuyShare=.55;
        public boolean volumeFilter=false;
        public int minIndependentGroups=2, horizonMinutes=15, minimumSample=100, staleMs=5000;
        public double targetPct=2, commissionPct=.1, slippagePct=.1;
        public Config copy() {
            Config c=new Config(); c.thresholdPct=thresholdPct;c.minVolumeRatio=minVolumeRatio;c.maxSpreadPct=maxSpreadPct;
            c.minBuyShare=minBuyShare;c.volumeFilter=volumeFilter;c.minIndependentGroups=minIndependentGroups;
            c.horizonMinutes=horizonMinutes;c.minimumSample=minimumSample;c.staleMs=staleMs;
            c.targetPct=targetPct;c.commissionPct=commissionPct;c.slippagePct=slippagePct;return c;
        }
        public void validate() {
            range(thresholdPct,.1,50);range(minVolumeRatio,.1,100);range(maxSpreadPct,.01,10);range(minBuyShare,.5,1);
            range(minIndependentGroups,2,4);range(horizonMinutes,1,60);range(minimumSample,30,10000);range(staleMs,2000,30000);
            range(targetPct,.1,100);range(commissionPct,0,5);range(slippagePct,0,5);
        }
        private void range(double n,double lo,double hi){if(!Double.isFinite(n)||n<lo||n>hi)throw new IllegalArgumentException("Ayar aralık dışında");}
    }
    public static final class Bar {
        public long time, first, last, firstId, lastId; public int trades;
        public double open,high,low,close,volume,quoteVolume,buyQuote=Double.NaN;
        public Bar(long t,double p,double v){time=t;open=high=low=close=p;volume=v/p;quoteVolume=v;first=t;last=t+999;}
        public Bar copy(){Bar b=new Bar(time,open,quoteVolume);b.high=high;b.low=low;b.close=close;b.volume=volume;b.buyQuote=buyQuote;b.first=first;b.last=last;b.trades=trades;b.firstId=firstId;b.lastId=lastId;return b;}
    }
    public static final class Book {public long time;public double bid,ask,depthQuote;public Book(long t,double b,double a,double d){time=t;bid=b;ask=a;depthQuote=d;}}
    public static final class Result {
        public boolean ready=false;public String reason="",category="KOŞULLAR SAĞLANMIYOR",trend="BİLİNMİYOR",risk="YÜKSEK / LİKİDİTE BELİRSİZ";
        public int score,independentGroups; public long observedAt,windowStart,windowEnd,referenceEnd;
        public double price,gainPct,actualChangePct,referenceMean,recentMean,quoteVolume;
        public double volumeRatio=Double.NaN,buyShare=Double.NaN,spreadPct=Double.NaN,depthQuote=Double.NaN;
        public double ema9,ema21,rsi14,macdLine,macdSignal,macdHistogram,volatilityPct,support,resistance;
        public boolean priceGroup,volumeGroup,orderFlowGroup,liquidityGroup,breakout;
    }
    public static final class Window {
        public final TreeMap<Long,Bar> bars=new TreeMap<>();
        private final Map<Long,Long> ids=new HashMap<>();
        public long continuousSince=-1,lastTradeAt;public int rejected;
        public void connect(long now){continuousSince=now;}
        public void disconnect(){continuousSince=-1;}
        public void prune(long now){bars.headMap(now-360000).clear();ids.entrySet().removeIf(e->e.getValue()<now-360000);}
        public boolean add(long id,long time,double price,double quantity,boolean buy,long now){
            if(id<0||time<now-360000||time>now+1000||!Double.isFinite(price)||price<=0||!Double.isFinite(quantity)||quantity<=0){rejected++;return false;}
            if(ids.containsKey(id))return false;
            if(ids.size()>=100000){prune(now);if(ids.size()>=100000){rejected++;disconnect();return false;}}
            ids.put(id,time);long key=Math.floorDiv(time,1000)*1000;Bar b=bars.get(key);
            if(b==null){b=new Bar(key,price,0);b.volume=0;b.first=b.last=time;b.firstId=b.lastId=id;b.buyQuote=0;bars.put(key,b);}
            if(time<b.first||(time==b.first&&id<b.firstId)){b.first=time;b.firstId=id;b.open=price;}
            if(time>b.last||(time==b.last&&id>b.lastId)){b.last=time;b.lastId=id;b.close=price;}
            b.high=Math.max(b.high,price);b.low=Math.min(b.low,price);b.volume+=quantity;b.quoteVolume+=price*quantity;
            b.buyQuote+=buy?price*quantity:0;b.trades++;lastTradeAt=Math.max(lastTradeAt,time);return true;
        }
        public List<Bar> seconds(long now){
            prune(now);long end=Math.floorDiv(now,1000)*1000,start=end-300000;
            if(continuousSince<0||continuousSince>start)return Collections.emptyList();
            List<Bar> out=new ArrayList<>();for(long t=start;t<end;t+=1000){Bar b=bars.get(t);if(b==null)return Collections.emptyList();out.add(b.copy());}return out;
        }
    }
    private static List<Bar> closed(List<Bar> raw,long interval,long now){
        TreeMap<Long,Bar> values=new TreeMap<>();
        for(Bar b:raw){
            if(b.time%interval!=0||b.time+interval>now)continue;
            if(!valid(b))throw new IllegalArgumentException("Geçersiz OHLCV");
            Bar p=values.putIfAbsent(b.time,b);
            if(p!=null&&(p.open!=b.open||p.high!=b.high||p.low!=b.low||p.close!=b.close||p.volume!=b.volume||p.quoteVolume!=b.quoteVolume||
                (Double.isFinite(p.buyQuote)||Double.isFinite(b.buyQuote))&&p.buyQuote!=b.buyQuote))throw new IllegalArgumentException("Çelişkili tekrar mum");
        }
        return new ArrayList<>(values.values());
    }
    private static boolean valid(Bar b){return Double.isFinite(b.open)&&Double.isFinite(b.high)&&Double.isFinite(b.low)&&Double.isFinite(b.close)&&Double.isFinite(b.volume)&&Double.isFinite(b.quoteVolume)&&Math.min(Math.min(b.open,b.close),b.low)>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&b.high>=b.low&&b.volume>=0&&b.quoteVolume>=0;}
    private static List<Bar> tail(List<Bar> b,int n){return b.subList(Math.max(0,b.size()-n),b.size());}
    private static boolean continuous(List<Bar> b,long step){for(int i=1;i<b.size();i++)if(b.get(i).time-b.get(i-1).time!=step)return false;return true;}
    private static double mean(double[] a){return Arrays.stream(a).sum()/a.length;}
    private static double[] ema(double[] a,int period){
        if(a.length<period)return new double[0];double v=mean(Arrays.copyOfRange(a,0,period)),k=2.0/(period+1);
        double[] out=new double[a.length-period+1];out[0]=v;for(int i=period;i<a.length;i++){v+=(a[i]-v)*k;out[i-period+1]=v;}return out;
    }
    private static double last(double[] a){return a.length==0?Double.NaN:a[a.length-1];}
    public static Result analyze(List<Bar> rawSeconds,List<Bar> rawMinutes,Book book,long now,Config c){
        c.validate();Result r=new Result();List<Bar> s,m;long end=Math.floorDiv(now,1000)*1000;
        try{s=tail(closed(rawSeconds,1000,now),300);}catch(IllegalArgumentException e){r.reason=e.getMessage();return r;}
        if(s.size()!=300||!continuous(s,1000)||s.get(299).time!=end-1000){r.reason="300 güncel ve ardışık kapalı saniye gerekli";return r;}
        long start=s.get(0).time;
        try{m=tail(closed(rawMinutes,60000,start),30);}catch(IllegalArgumentException e){r.reason=e.getMessage();return r;}
        if(m.size()!=30||!continuous(m,60000)||m.get(29).time+60000!=Math.floorDiv(start,60000)*60000){r.reason="Pencere öncesi 30 kapalı dakika gerekli";return r;}
        if(now-s.get(299).last>c.staleMs){r.reason="İşlem verisi eski";return r;}
        double[] prices=s.stream().mapToDouble(b->b.close).toArray();r.recentMean=mean(prices);r.referenceMean=m.stream().mapToDouble(b->b.close).average().getAsDouble();
        r.gainPct=(r.recentMean/r.referenceMean-1)*100;r.actualChangePct=(s.get(299).close/s.get(0).open-1)*100;
        r.quoteVolume=s.stream().mapToDouble(b->b.quoteVolume).sum();double baseline=m.stream().mapToDouble(b->b.quoteVolume).sum()/1800;
        if(baseline>0)r.volumeRatio=(r.quoteVolume/300)/baseline;
        if(r.quoteVolume>0&&s.stream().allMatch(b->Double.isFinite(b.buyQuote)&&b.buyQuote>=0&&b.buyQuote<=b.quoteVolume))r.buyShare=s.stream().mapToDouble(b->b.buyQuote).sum()/r.quoteVolume;
        boolean fresh=book!=null&&book.time<=now&&now-book.time<=c.staleMs&&Double.isFinite(book.bid)&&Double.isFinite(book.ask)&&book.bid>0&&book.ask>=book.bid;
        if(fresh){r.spreadPct=(book.ask-book.bid)/((book.ask+book.bid)/2)*100;if(Double.isFinite(book.depthQuote)&&book.depthQuote>0)r.depthQuote=book.depthQuote;}
        r.priceGroup=r.gainPct+1e-10>=c.thresholdPct;r.volumeGroup=Double.isFinite(r.volumeRatio)&&r.volumeRatio>=c.minVolumeRatio;
        r.orderFlowGroup=Double.isFinite(r.buyShare)&&r.buyShare>=c.minBuyShare;r.liquidityGroup=Double.isFinite(r.spreadPct)&&r.spreadPct<=c.maxSpreadPct&&Double.isFinite(r.depthQuote);
        r.independentGroups=(r.priceGroup?1:0)+(r.volumeGroup?1:0)+(r.orderFlowGroup?1:0)+(r.liquidityGroup?1:0);r.score=r.independentGroups*25;
        boolean eligible=r.priceGroup&&(!c.volumeFilter||r.volumeGroup);
        r.category=!eligible?"KOŞULLAR SAĞLANMIYOR":r.independentGroups>=c.minIndependentGroups&&r.liquidityGroup?"ÇOKLU TEYİT":"YAKINDAN TAKİP";
        r.ema9=last(ema(prices,9));r.ema21=last(ema(prices,21));r.trend=r.ema9>r.ema21?"YUKARI":r.ema9<r.ema21?"AŞAĞI":"YATAY";
        double gain=0,loss=0;for(int i=1;i<15;i++){double d=prices[i]-prices[i-1];gain+=Math.max(0,d)/14;loss+=Math.max(0,-d)/14;}
        for(int i=15;i<prices.length;i++){double d=prices[i]-prices[i-1];gain=(gain*13+Math.max(0,d))/14;loss=(loss*13+Math.max(0,-d))/14;}r.rsi14=loss==0?(gain==0?50:100):100-100/(1+gain/loss);
        double[] fast=ema(prices,12),slow=ema(prices,26),line=new double[slow.length];for(int i=0;i<slow.length;i++)line[i]=fast[i+14]-slow[i];
        r.macdLine=last(line);r.macdSignal=last(ema(line,9));r.macdHistogram=r.macdLine-r.macdSignal;
        double[] returns=new double[299];for(int i=1;i<300;i++)returns[i-1]=Math.log(prices[i]/prices[i-1]);double avg=mean(returns),variance=0;for(double x:returns)variance+=(x-avg)*(x-avg)/returns.length;r.volatilityPct=Math.sqrt(variance)*100;
        r.support=Double.POSITIVE_INFINITY;r.resistance=0;for(int i=0;i<299;i++){r.support=Math.min(r.support,s.get(i).low);r.resistance=Math.max(r.resistance,s.get(i).high);}r.breakout=prices[299]>r.resistance;
        r.price=prices[299];r.observedAt=now;r.windowStart=start;r.windowEnd=end;r.referenceEnd=m.get(29).time+60000;
        if(r.liquidityGroup)r.risk="ÖLÇÜLEN · FİYAT RİSKİ SÜRER";r.ready=true;return r;
    }
}
