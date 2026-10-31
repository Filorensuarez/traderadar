package com.traderadar.pro;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import okhttp3.*;

/** User-triggered, read-only connectivity test. Never enables the trading scanner. */
public final class OkxTrWsProbe {
    private OkxTrWsProbe(){}
    public static String check(){
        OkHttpClient client=new OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS)
            .readTimeout(10,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build();
        final CountDownLatch latch=new CountDownLatch(1);
        final AtomicReference<String> outcome=new AtomicReference<>("OKX TR WebSocket yanıt vermedi; tarama kapalı.");
        final String instrument;
        try{
            java.util.List<String> symbols=OkxTrCatalog.fetch(client);
            instrument=symbols.contains("BTC-TRY")?"BTC-TRY":symbols.get(0);
        }catch(Exception e){return "OKX TR REST katalog testi başarısız; tarama kapalı.";}
        finally {client.connectionPool().evictAll();}
        final String selected=instrument;
        WebSocket socket=null;
        try{
            socket=client.newWebSocket(new Request.Builder().url("wss://ws.okx.com/ws/v5/public").build(),new WebSocketListener(){
                private boolean acknowledged=false;
                private long lastTradeId=-1;
                @Override public void onOpen(WebSocket ws,Response response){
                    if(response.code()!=101||response.priorResponse()!=null){outcome.set("WebSocket bağlantı yanıtı doğrulanamadı.");latch.countDown();ws.cancel();return;}
                    try{
                        JSONObject arg=new JSONObject().put("channel","trades").put("instId",selected);
                        ws.send(new JSONObject().put("op","subscribe").put("args",new JSONArray().put(arg)).toString());
                    }catch(JSONException e){outcome.set("WebSocket aboneliği hazırlanamadı.");latch.countDown();}
                }
                @Override public void onMessage(WebSocket ws,String text){
                    try{
                        if("pong".equals(text))return;
                        JSONObject message=new JSONObject(text);
                        if("error".equals(message.optString("event"))){outcome.set("OKX TR aboneliği reddedildi.");latch.countDown();return;}
                        JSONObject arg=message.optJSONObject("arg");
                        if(arg==null||!"trades".equals(arg.optString("channel"))||!selected.equals(arg.optString("instId")))return;
                        if("subscribe".equals(message.optString("event"))){
                            if(acknowledged){outcome.set("Tekrarlanan WebSocket abonelik onayı; tarama kapalı.");latch.countDown();return;}
                            acknowledged=true;return;
                        }
                        JSONArray trades=message.optJSONArray("data");
                        if(!acknowledged||trades==null)return;
                        long now=System.currentTimeMillis();
                        for(int i=0;i<trades.length();i++){
                            JSONObject trade=trades.optJSONObject(i);
                            if(trade==null||!selected.equals(trade.optString("instId")))continue;
                            long tradeId=Long.parseLong(trade.getString("tradeId"));
                            long ts=Long.parseLong(trade.getString("ts"));
                            double px=Double.parseDouble(trade.getString("px"));
                            double sz=Double.parseDouble(trade.getString("sz"));
                            if(tradeId<=lastTradeId){outcome.set("Tekrarlanan veya sırasız işlem kimliği; tarama kapalı.");latch.countDown();return;}
                            lastTradeId=tradeId;
                            if(now-ts>=0&&now-ts<=30000&&Double.isFinite(px)&&Double.isFinite(sz)&&px>0&&sz>0
                                &&("buy".equals(trade.optString("side"))||"sell".equals(trade.optString("side")))){
                                outcome.set("OKX TR WebSocket işlemi doğrulandı: "+selected+". Tarama hâlâ kapalı.");
                                latch.countDown();return;
                            }
                        }
                    }catch(Exception e){outcome.set("OKX TR WebSocket işlem verisi geçersiz.");latch.countDown();}
                }
                @Override public void onFailure(WebSocket ws,Throwable t,Response response){
                    outcome.set("OKX TR WebSocket bağlantısı başarısız; tarama kapalı.");latch.countDown();
                }
                @Override public void onClosed(WebSocket ws,int code,String reason){latch.countDown();}
            });
            if(!latch.await(20,TimeUnit.SECONDS))return "OKX TR WebSocket testi zaman aşımına uğradı; tarama kapalı.";
            return outcome.get();
        }catch(Exception e){return "OKX TR WebSocket testi tamamlanamadı; tarama kapalı.";}
        finally{
            if(socket!=null)socket.cancel();
            client.dispatcher().executorService().shutdown();
            client.connectionPool().evictAll();
        }
    }
}
