package com.traderadar.pro;

import java.io.IOException;
import java.util.List;

/** OS-independent lifecycle gate; late callbacks from a stopped session are ignored. */
public final class ScanSessionController {
    private OfficialSource.Session active;private volatile long generation;
    private final OfficialSource.Listener listener;
    public ScanSessionController(OfficialSource.Listener listener){this.listener=listener;}
    public synchronized boolean running(){return active!=null;}
    public synchronized boolean start(OfficialSource.Session source,boolean userInitiated){
        if(active!=null)return true;
        if(!userInitiated||source==null||!source.restVerified()||!source.websocketVerified()){close(source);return false;}
        active=source;final long token=++generation;
        try{source.start(new OfficialSource.Listener(){
            private boolean current(){return token==generation;}
            public void market(String s,String b){if(current())listener.market(s,b);}
            public void connected(String s,long t){if(current())listener.connected(s,t);}
            public void disconnected(String s){if(current())listener.disconnected(s);}
            public void trade(String s,long i,long t,double p,double q,boolean b){if(current())listener.trade(s,i,t,p,q,b);}
            public void minutes(String s,List<NativeScanModel.Bar> b){if(current())listener.minutes(s,b);}
            public void book(String s,NativeScanModel.Book b){if(current())listener.book(s,b);}
            public void error(String m){if(current())listener.error(m);}
        });return true;}catch(RuntimeException e){stop();return false;}
    }
    public synchronized void stop(){generation++;OfficialSource.Session old=active;active=null;close(old);}
    private static void close(OfficialSource.Session s){if(s!=null)try{s.close();}catch(IOException ignored){}}
}
