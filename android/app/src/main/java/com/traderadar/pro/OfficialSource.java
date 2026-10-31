package com.traderadar.pro;

import java.io.Closeable;
import java.util.List;

/** No endpoints may be guessed or enabled by a user-supplied URL/boolean. */
public final class OfficialSource {
    public static final String DOCUMENTATION="https://www.binance.tr/apidocs/";
    public static final String BLOCKER="Resmî Binance TR REST/WebSocket sözleşmesi doğrulanamadı. Canlı adaptör kapalı; sinyal üretilmez.";
    private OfficialSource(){}
    public interface Session extends Closeable {
        boolean restVerified(); boolean websocketVerified();
        void start(Listener listener);
    }
    public interface Listener {
        void market(String symbol,String base);
        void connected(String symbol,long time);
        void disconnected(String symbol);
        void trade(String symbol,long id,long time,double price,double quantity,boolean buy);
        void minutes(String symbol,List<NativeScanModel.Bar> bars);
        void book(String symbol,NativeScanModel.Book book);
        void error(String safeMessage);
    }
    // Implement only after an accessible official document AND device REST/WS
    // observations establish the contract. No Binance Global fallback is present.
    public static Session createVerifiedSession(){return null;}
}
