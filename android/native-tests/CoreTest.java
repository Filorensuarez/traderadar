import com.traderadar.pro.*;
import java.nio.file.*;
import java.util.*;

public class CoreTest {
    private static int passed;
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);passed++;}
    private static void near(double actual,double expected,String message){check(Double.isNaN(expected)?Double.isNaN(actual):Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),message+" actual="+actual+" expected="+expected);}
    private static final long NOW=1793361600000L;
    private static void parity(Path file)throws Exception{
        List<NativeScanModel.Bar> seconds=new ArrayList<>(),minutes=new ArrayList<>();Map<String,String> expected=new LinkedHashMap<>();NativeScanModel.Config config=new NativeScanModel.Config();NativeScanModel.Book book=null;long now=0;
        for(String line:Files.readAllLines(file)){String[] x=line.split("\t");switch(x[0]){
            case"N":now=Long.parseLong(x[1]);break;
            case"V":config.volumeFilter=Boolean.parseBoolean(x[1]);break;
            case"S":case"M":NativeScanModel.Bar b=new NativeScanModel.Bar(Long.parseLong(x[1]),Double.parseDouble(x[2]),Double.parseDouble(x[7]));b.high=Double.parseDouble(x[3]);b.low=Double.parseDouble(x[4]);b.close=Double.parseDouble(x[5]);b.volume=Double.parseDouble(x[6]);b.buyQuote=Double.parseDouble(x[8]);b.last=Long.parseLong(x[9]);(x[0].equals("S")?seconds:minutes).add(b);break;
            case"B":book=new NativeScanModel.Book(Long.parseLong(x[1]),Double.parseDouble(x[2]),Double.parseDouble(x[3]),Double.parseDouble(x[4]));break;
            case"E":expected.put(x[1],x[2]);break;
        }}
        NativeScanModel.Result r=NativeScanModel.analyze(seconds,minutes,book,now,config);
        check(String.valueOf(r.ready).equals(expected.get("ready")),file+" ready");check(r.category.equals(expected.get("category")),file+" category");
        if(r.ready){for(String key:Arrays.asList("gainPct","actualChangePct","price","recentMean","referenceMean","volumeRatio","buyShare","spreadPct","ema9","ema21","rsi14","macdLine","macdSignal","macdHistogram","volatilityPct","support","resistance")){near(NativeScanModel.Result.class.getField(key).getDouble(r),Double.parseDouble(expected.get(key)),file+" "+key);}check(r.score==Integer.parseInt(expected.get("score")),file+" score");}
    }
    private static void windows(){NativeScanModel.Window w=new NativeScanModel.Window();w.connect(NOW-400000);
        for(int i=1;i<=300;i++)check(w.add(i,NOW-i*1000,100,1,true,NOW),"trade accepted");
        check(w.seconds(NOW).size()==300,"300 closed seconds");check(!w.add(1,NOW-1000,999,1,true,NOW),"duplicate ignored");
        check(w.add(999,NOW,999,1,false,NOW),"open trade accepted");near(w.seconds(NOW).get(299).close,100,"open second excluded");
        w.disconnect();check(w.seconds(NOW).isEmpty(),"disconnect invalidates continuity");w.connect(NOW);check(w.seconds(NOW).isEmpty(),"reconnect warmup");
        NativeScanModel.Window ordered=new NativeScanModel.Window();ordered.add(3,NOW-500,103,2,true,NOW);ordered.add(2,NOW-900,102,2,true,NOW);ordered.add(1,NOW-900,101,2,true,NOW);
        near(ordered.bars.firstEntry().getValue().open,101,"timestamp tie trade id");near(ordered.bars.firstEntry().getValue().close,103,"out-of-order close");
        check(!ordered.add(4,NOW+2000,1,1,true,NOW),"future trade rejected");check(!ordered.add(5,NOW-10,Double.NaN,1,true,NOW),"NaN rejected");
    }
    private static void outcomes(){NativeScanModel.Config c=new NativeScanModel.Config();NativeOutcome r=new NativeOutcome("A_TRY",NOW,100,.1,c);
        for(int i=0;i<3600;i++)r.observe(new NativeScanModel.Bar(NOW+i*1000,i>=59?103:100,10));
        check(r.checkpoints.size()==7,"all horizons");check(r.outcome.equals("SUCCESS"),"gross target success");check(r.targetAt-NOW==60000,"target time");check(r.complete,"hour complete");check(r.checkpoints.get(1).netPct<r.checkpoints.get(1).grossPct,"costs separate");
        NativeOutcome gap=new NativeOutcome("A_TRY",NOW,100,Double.NaN,c);gap.observe(new NativeScanModel.Bar(NOW+899000,100,10));check(gap.outcome.equals("INSUFFICIENT_DATA"),"gap not failed");check(!gap.checkpoints.containsKey(1),"no latest-price checkpoint substitution");check(Double.isNaN(NativeOutcome.netMove(2,c,Double.NaN)),"unknown spread not zero");
        NativeOutcome close=new NativeOutcome("A_TRY",NOW,100,.1,c);close.interrupt();close.expire(NOW+3606000);check(close.outcome.equals("INSUFFICIENT_DATA"),"closed app not failed");
        check(NativeOutcome.weekOf(java.time.Instant.parse("2026-11-01T20:59:00Z").toEpochMilli()).equals("2026-10-26"),"Sunday Istanbul");check(NativeOutcome.weekOf(java.time.Instant.parse("2026-11-01T21:00:00Z").toEpochMilli()).equals("2026-11-02"),"Monday Istanbul");
    }
    private static final class Listener implements OfficialSource.Listener {
        int trades;public void market(String s,String b){}public void connected(String s,long t){}public void disconnected(String s){}public void minutes(String s,List<NativeScanModel.Bar> b){}public void book(String s,NativeScanModel.Book b){}public void error(String m){}public void trade(String s,long id,long t,double p,double q,boolean b){trades++;}
    }
    private static final class Source implements OfficialSource.Session {
        boolean rest,ws,closed;OfficialSource.Listener listener;Source(boolean r,boolean w){rest=r;ws=w;}public boolean restVerified(){return rest;}public boolean websocketVerified(){return ws;}public void start(OfficialSource.Listener l){listener=l;}public void close(){closed=true;}
    }
    private static void lifecycle(){Listener listener=new Listener();ScanSessionController c=new ScanSessionController(listener);
        check(!c.start(null,true),"no official source no scan");Source noWs=new Source(true,false);check(!c.start(noWs,true)&&noWs.closed,"REST alone insufficient");Source noRest=new Source(false,true);check(!c.start(noRest,true)&&noRest.closed,"WS alone insufficient");Source automatic=new Source(true,true);check(!c.start(automatic,false)&&automatic.closed,"no automatic start");
        Source good=new Source(true,true);check(c.start(good,true)&&c.running(),"explicit start");good.listener.trade("A_TRY",1,NOW,100,1,true);check(listener.trades==1,"valid callback");c.stop();check(!c.running()&&good.closed,"stop closes transport");good.listener.trade("A_TRY",2,NOW,999,1,true);check(listener.trades==1,"late callback ignored");check(OfficialSource.createVerifiedSession()==null,"production source remains locked");
    }
    public static void main(String[] args)throws Exception{
        try(java.util.stream.Stream<Path> files=Files.list(Path.of(args[0]))){for(Path file:(Iterable<Path>)files.sorted()::iterator)parity(file);}
        windows();outcomes();lifecycle();
        NativeScanModel.Config c=new NativeScanModel.Config();List<NativeScanModel.Bar> s=new ArrayList<>(),m=new ArrayList<>();for(int i=0;i<300;i++)s.add(new NativeScanModel.Bar(NOW-300000+i*1000,102,10));for(int i=0;i<30;i++)m.add(new NativeScanModel.Bar(NOW-2100000+i*60000,100,600));
        long began=System.nanoTime();for(int i=0;i<1000;i++)check(NativeScanModel.analyze(s,m,null,NOW,c).ready,"load analysis");
        System.out.println("PASS: "+passed+" assertions; 1000 JVM fixture analyses "+((System.nanoTime()-began)/1000000.0)+" ms. Not an Android battery/background test.");
    }
}
