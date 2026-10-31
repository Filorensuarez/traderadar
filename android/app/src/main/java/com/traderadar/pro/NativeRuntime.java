package com.traderadar.pro;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.*;
import java.util.*;

/** Native service-owned state. WebView is a renderer, never the scan engine. */
final class NativeRuntime implements OfficialSource.Listener {
    private static NativeRuntime instance;
    static synchronized NativeRuntime get(Context c){if(instance==null)instance=new NativeRuntime(c.getApplicationContext());return instance;}
    final NativeStore store;private final SharedPreferences preferences;
    NativeScanModel.Config config;volatile boolean running;volatile String status=OfficialSource.BLOCKER;
    long received,lastMessage,lastLatency,lastTick;double lastScanMs,p95;int rejected;
    private final Map<String,String> markets=new TreeMap<>();
    private final Set<String> quarantinedMarkets=new HashSet<>();
    private final Map<String,NativeScanModel.Window> feeds=new HashMap<>();
    private final Map<String,List<NativeScanModel.Bar>> minutes=new HashMap<>();
    private final Map<String,NativeScanModel.Book> books=new HashMap<>();
    private final Map<String,NativeScanModel.Result> results=new HashMap<>();
    private final Map<String,Long> processed=new HashMap<>();
    private final Map<String,NativeOutcome> pending=new HashMap<>();
    private final List<Double> durations=new ArrayList<>();
    interface Alert {void signal(String id,String symbol,double price,long time);}
    private NativeRuntime(Context c){store=new NativeStore(c);preferences=c.getSharedPreferences("native-pro",Context.MODE_PRIVATE);
        config=new NativeScanModel.Config();try{config=NativeJson.config(new JSONObject(preferences.getString("config","{}")),config);}catch(Exception e){status="Ayar kaydı okunamadı; tarama kapalı";}
        for(NativeOutcome r:store.pending())pending.put(r.id,r);
        if(preferences.getBoolean("wasRunning",false)){status="Önceki tarama Android tarafından kesilmiş olabilir. Yeniden Başlat düğmesini kullanın.";preferences.edit().putBoolean("wasRunning",false).apply();}
    }
    synchronized void started(){quarantinedMarkets.clear();markets.clear();feeds.clear();minutes.clear();books.clear();results.clear();processed.clear();received=0;lastMessage=0;lastLatency=0;running=true;status="Kaynak doğrulandı; gerçek veri ve kapalı mumlar bekleniyor";preferences.edit().putBoolean("wasRunning",true).apply();}
    synchronized void stopped(String reason){running=false;status=reason;for(NativeScanModel.Window w:feeds.values())w.disconnect();results.clear();books.clear();minutes.clear();processed.clear();for(NativeOutcome r:pending.values()){r.interrupt();store.save(r);}preferences.edit().putBoolean("wasRunning",false).apply();}
    public synchronized void market(String s,String base){if(!running)return;if(s!=null&&quarantinedMarkets.contains(s)){rejected++;return;}if(s==null||base==null||!s.matches("[A-Z0-9]{1,24}_[A-Z0-9]{1,12}")||!base.matches("[A-Z0-9]{1,24}")){rejected++;return;}String prior=markets.get(s);if(prior!=null&&!prior.equals(base)){disconnected(s);feeds.remove(s);markets.remove(s);quarantinedMarkets.add(s);rejected++;status="Parite kimliği çelişkili; parite taramadan çıkarıldı";return;}markets.put(s,base);}
    public synchronized void connected(String s,long time){if(!running||!markets.containsKey(s))return;NativeScanModel.Window previous=feeds.get(s);if(previous!=null)previous.disconnect();NativeScanModel.Window w=new NativeScanModel.Window();feeds.put(s,w);processed.remove(s);books.remove(s);minutes.remove(s);w.connect(time);}
    public synchronized void disconnected(String s){NativeScanModel.Window w=feeds.get(s);if(w!=null)w.disconnect();results.remove(s);books.remove(s);minutes.remove(s);processed.remove(s);for(NativeOutcome r:pending.values())if(r.symbol.equals(s)){r.interrupt();store.save(r);}}
    public synchronized void trade(String s,long id,long time,double price,double quantity,boolean buy){if(!running)return;NativeScanModel.Window w=feeds.get(s);if(w==null||w.continuousSince<0||!w.add(id,time,price,quantity,buy,System.currentTimeMillis())){rejected++;return;}received++;lastMessage=System.currentTimeMillis();lastLatency=lastMessage-time;}
    public synchronized void minutes(String s,List<NativeScanModel.Bar> bars){
        NativeScanModel.Window feed=feeds.get(s);
        if(!running||!markets.containsKey(s)||feed==null||feed.continuousSince<0||bars==null||bars.size()<30||bars.size()>1000){rejected++;return;}
        long now=System.currentTimeMillis(),previous=-1;
        List<NativeScanModel.Bar> copy=new ArrayList<>(bars.size());
        for(NativeScanModel.Bar b:bars){
            if(b==null||b.time<0||b.time%60000!=0||b.time>now-60000
                ||(previous>=0&&b.time-previous!=60000)
                ||!Double.isFinite(b.open)||!Double.isFinite(b.high)||!Double.isFinite(b.low)||!Double.isFinite(b.close)
                ||!Double.isFinite(b.volume)||!Double.isFinite(b.quoteVolume)||b.volume<0||b.quoteVolume<0
                ||b.open<=0||b.high<=0||b.low<=0||b.close<=0
                ||b.high<Math.max(b.open,Math.max(b.close,b.low))
                ||b.low>Math.min(b.open,Math.min(b.close,b.high))){rejected++;return;}
            previous=b.time;copy.add(b.copy());
        }
        List<NativeScanModel.Bar> existing=minutes.get(s);
        if(existing!=null&&!existing.isEmpty()&&previous<existing.get(existing.size()-1).time){rejected++;return;}
        // Never replace an already accepted closed minute with a contradictory OHLCV value.
        if(existing!=null&&!existing.isEmpty()){
            Map<Long,NativeScanModel.Bar> previousBars=new HashMap<>();
            for(NativeScanModel.Bar bar:existing)previousBars.put(bar.time,bar);
            for(NativeScanModel.Bar bar:copy){
                NativeScanModel.Bar prior=previousBars.get(bar.time);
                if(prior!=null&&(prior.open!=bar.open||prior.high!=bar.high||prior.low!=bar.low
                    ||prior.close!=bar.close||prior.volume!=bar.volume||prior.quoteVolume!=bar.quoteVolume)){
                    rejected++;return;
                }
            }
        }
        minutes.put(s,copy);
    }
    public synchronized void book(String s,NativeScanModel.Book b){
        NativeScanModel.Window feed=feeds.get(s);
        long now=System.currentTimeMillis();
        if(!running||!markets.containsKey(s)||feed==null||feed.continuousSince<0||b==null
            ||b.time>now||now-b.time>config.staleMs
            ||!Double.isFinite(b.bid)||!Double.isFinite(b.ask)||!Double.isFinite(b.depthQuote)
            ||b.bid<=0||b.ask<=b.bid||b.depthQuote<=0){rejected++;return;}
        NativeScanModel.Book prior=books.get(s);
        if(prior!=null&&b.time<prior.time){rejected++;return;}
        books.put(s,b);
    }
    public synchronized void error(String safeMessage){status="Veri bağlantısı başarısız; kaynak desteğini ve erişimi kontrol edin";for(String s:new ArrayList<>(feeds.keySet()))disconnected(s);}
    synchronized void tick(long now,Alert alert){
        if(!running)return;long began=System.nanoTime(),end=Math.floorDiv(now,1000)*1000;
        for(String s:markets.keySet()){
            NativeScanModel.Window w=feeds.get(s);if(w==null)continue;
            long previous=processed.getOrDefault(s,end);
            for(long t=Math.max(previous,end-3600000);t<end;t+=1000){NativeScanModel.Bar b=w.bars.get(t);if(b!=null)for(NativeOutcome r:pending.values())if(r.symbol.equals(s))r.observe(b);}
            processed.put(s,end);NativeScanModel.Result r=NativeScanModel.analyze(w.seconds(now),minutes.getOrDefault(s,Collections.emptyList()),books.get(s),now,config);results.put(s,r);
            NativeOutcome active=null;for(NativeOutcome row:pending.values())if(row.symbol.equals(s)&&now<row.time+3600000){active=row;break;}
            if(r.ready&&!r.category.equals("KOŞULLAR SAĞLANMIYOR")){
                if(active==null){active=new NativeOutcome(s,end,r.price,r.spreadPct,config);pending.put(active.id,active);}
                if(r.category.equals("ÇOKLU TEYİT")&&store.notifyOnce(active.id,s,r.price,now))alert.signal(active.id,s,r.price,now);
            }
            if(active!=null)active.liveStatus=r.ready?r.category:"VERİ KULLANILAMIYOR";
        }
        Iterator<NativeOutcome> it=pending.values().iterator();while(it.hasNext()){NativeOutcome r=it.next();r.expire(now);store.save(r);if(r.complete)it.remove();}
        lastTick=now;lastScanMs=(System.nanoTime()-began)/1000000.0;durations.add(lastScanMs);if(durations.size()>300)durations.remove(0);List<Double> sorted=new ArrayList<>(durations);Collections.sort(sorted);p95=sorted.get((int)Math.floor((sorted.size()-1)*.95));
    }
    synchronized JSONObject snapshot(){
        long now=System.currentTimeMillis();JSONArray rows=new JSONArray(),unavailable=new JSONArray();int evaluated=0;
        for(String s:markets.keySet()){NativeScanModel.Result r=results.get(s);NativeScanModel.Window w=feeds.get(s);
            if(r==null||!r.ready){unavailable.put(NativeJson.obj("symbol",s,"reason",r==null?"Gerçek kapalı mumlar bekleniyor":r.reason));continue;}evaluated++;
            if(!running||w==null||w.continuousSince<0||now-r.observedAt>config.staleMs||r.category.equals("KOŞULLAR SAĞLANMIYOR"))continue;
            NativeOutcome signal=null;for(NativeOutcome o:pending.values())if(o.symbol.equals(s)){signal=o;break;}rows.put(NativeJson.result(s,markets.get(s),r,signal));
        }
        return NativeJson.obj("now",now,"running",running,"rows",rows,"config",NativeJson.config(config),"rejected",unavailable,"memoryBytes",Runtime.getRuntime().totalMemory()-Runtime.getRuntime().freeMemory(),"formula","(ortalama(300 kapalı 1s kapanışı) / ortalama(pencere öncesi 30 kapalı 1m kapanışı) − 1) × 100",
            "source",NativeJson.obj("source","OKX TR","sourceVerification",running?"REST ve WebSocket doğrulama kapısı açık":"GÜNCEL RESMÎ DESTEK DOĞRULANMADI","documentationUrl",OfficialSource.DOCUMENTATION,"adapterEnabled",running,"connected",running&&feeds.values().stream().anyMatch(w->w.continuousSince>=0),"fresh",running&&received>0&&now-lastMessage<=5000,"lastMessageAt",lastMessage==0?null:lastMessage,"catalogAt",null,"error",status,"requests",0,"errors",0,"rejected",rejected,"receivedTrades",received,"lastLatencyMs",received>0?lastLatency:null,"eligibleMarkets",markets.size(),"socketCount",0),
            "metrics",NativeJson.obj("evaluated",evaluated,"unavailable",unavailable.length(),"lastScanMs",lastTick==0?null:lastScanMs,"p95ScanMs",lastTick==0?null:p95,"lastScanAt",lastTick==0?null:lastTick));
    }
    synchronized String request(String path,String method,String body){try{
        if(path.length()>200||body.length()>16384)throw new IllegalArgumentException("İstek çok büyük");Uri uri=Uri.parse(path);String route=uri.getPath();
        if(route.equals("settings")&&method.equals("PATCH")){NativeScanModel.Config next=NativeJson.config(new JSONObject(body),config);preferences.edit().putString("config",NativeJson.config(next).toString()).apply();config=next;results.clear();return NativeJson.config(config).toString();}
        if(!method.equals("GET"))throw new IllegalArgumentException("İstek reddedildi");
        switch(route){case"session":return NativeJson.obj("canEdit",true,"csrf","").toString();case"status":return snapshot().toString();case"reports":return store.reports().toString();case"notifications":return store.notifications().toString();
            case"history":int limit=Integer.parseInt(uri.getQueryParameter("limit")==null?"100":uri.getQueryParameter("limit"));long before=Long.parseLong(uri.getQueryParameter("before")==null?String.valueOf(Long.MAX_VALUE):uri.getQueryParameter("before"));String id=uri.getQueryParameter("beforeId");if(limit<1||limit>500||before<0)throw new IllegalArgumentException("Geçersiz sayfalama");return store.history(limit,before,id==null?"":id).toString();
            case"chart":String symbol=uri.getQueryParameter("symbol");if(symbol==null||!markets.containsKey(symbol))throw new IllegalArgumentException("Katalogda parite yok");JSONArray bars=new JSONArray();NativeScanModel.Window w=feeds.get(symbol);if(w!=null){List<NativeScanModel.Bar> all=new ArrayList<>(w.bars.values());for(int i=Math.max(0,all.size()-300);i<all.size();i++){NativeScanModel.Bar b=all.get(i);if(b.time+1000<=System.currentTimeMillis())bars.put(NativeJson.bar(b));}}return NativeJson.obj("symbol",symbol,"source","OKX TR","bars",bars).toString();
            default:throw new IllegalArgumentException("İstek reddedildi");}
    }catch(Exception e){return NativeJson.obj("error","İstek işlenemedi; veri ve ayarları kontrol edin").toString();}}
}
