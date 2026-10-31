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
            .readTimeout(10,TimeUnit.SECONDS).build();
        final CountDownLatch latch=new CountDownLatch(1);
        final AtomicReference<String> outcome=new AtomicReference<>("OKX TR WebSocket yanıt vermedi; tarama kapalı.");
        final String instrument;
        try{
            Request request=new Request.Builder().url("https://tr.okx.com/api/v5/public/instruments?instType=SPOT").build();
            try(Response response=client.newCall(request).execute()){
                if(!response.isSuccessful()||response.body()==null)return "OKX TR spot kataloğuna erişilemedi; tarama kapalı.";
                java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();
                try(java.io.InputStream stream=response.body().byteStream()){
                    byte[] buffer=new byte[8192];int n;
                    while((n=stream.read(buffer))!=-1){
                        if(bytes.size()+n>8*1024*1024)return "Katalog yanıtı çok büyük; tarama kapalı.";
                        bytes.write(buffer,0,n);
                    }
                }
                String raw=bytes.toString("UTF-8");
                JSONObject catalog=new JSONObject(raw);
                JSONArray rows=catalog.optJSONArray("data");
                if(!"0".equals(catalog.optString("code"))||rows==null)return "OKX TR spot katalog yanıtı geçersiz.";
                String found=null;
                for(int i=0;i<rows.length();i++){
                    JSONObject row=rows.optJSONObject(i);
                    if(row!=null&&"SPOT".equals(row.optString("instType"))&&"live".equals(row.optString("state"))
                        &&row.optString("instId").matches("[A-Z0-9]{1,24}-[A-Z0-9]{1,12}")){
                        if("BTC-TRY".equals(row.optString("instId"))){found="BTC-TRY";break;}
                        if(found==null)found=row.optString("instId");
                    }
                }
                if(found==null)return "Aktif spot parite bulunamadı; tarama kapalı.";
                instrument=found;
            }
        }catch(Exception e){return "OKX TR REST katalog testi başarısız; tarama kapalı.";}
        finally {client.connectionPool().evictAll();}
        final String selected=instrument;
        WebSocket socket=null;
        try{
            socket=client.newWebSocket(new Request.Builder().url("wss://ws.okx.com/ws/v5/public").build(),new WebSocketListener(){
                private boolean acknowledged=false;
                @Override public void onOpen(WebSocket ws,Response response){
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
                        if("subscribe".equals(message.optString("event"))){acknowledged=true;return;}
                        JSONArray trades=message.optJSONArray("data");
                        if(!acknowledged||trades==null)return;
                        long now=System.currentTimeMillis();
                        for(int i=0;i<trades.length();i++){
                            JSONObject trade=trades.optJSONObject(i);
                            if(trade==null||!selected.equals(trade.optString("instId")))continue;
                            long ts=Long.parseLong(trade.getString("ts"));
                            double px=Double.parseDouble(trade.getString("px"));
                            double sz=Double.parseDouble(trade.getString("sz"));
                            if(now-ts>=0&&now-ts<=30000&&px>0&&sz>0
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
            latch.await(20,TimeUnit.SECONDS);
            return outcome.get();
        }catch(Exception e){return "OKX TR WebSocket testi tamamlanamadı; tarama kapalı.";}
        finally{
            if(socket!=null)socket.cancel();
            client.dispatcher().executorService().shutdown();
            client.connectionPool().evictAll();
        }
    }
}
