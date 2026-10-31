package com.traderadar.pro;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Read-only official OKX TR spot catalog. Network failures never enable scanning. */
final class OkxTrCatalog {
    static final String URL="https://tr.okx.com/api/v5/public/instruments?instType=SPOT";
    private static final int MAX_BYTES=8*1024*1024;
    private OkxTrCatalog(){}

    static List<String> fetch(OkHttpClient client) throws IOException, JSONException {
        Request request=new Request.Builder().url(URL).header("Accept","application/json").build();
        try(Response response=client.newCall(request).execute()){
            if(!response.isSuccessful()||response.body()==null)throw new IOException("Spot catalog HTTP error");
            if(response.priorResponse()!=null)throw new IOException("Unexpected catalog redirect");
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            try(InputStream input=response.body().byteStream()){
                byte[] buffer=new byte[8192];int n;
                while((n=input.read(buffer))!=-1){
                    if(out.size()+n>MAX_BYTES)throw new IOException("Catalog response too large");
                    out.write(buffer,0,n);
                }
            }
            return parse(new JSONObject(out.toString("UTF-8")));
        }
    }

    static List<String> parse(JSONObject catalog) throws JSONException, IOException {
        if(!"0".equals(catalog.optString("code")))throw new IOException("Catalog status invalid");
        JSONArray rows=catalog.optJSONArray("data");
        if(rows==null)throw new IOException("Catalog data missing");
        List<String> symbols=new ArrayList<>();
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.optJSONObject(i);
            if(row==null||!"SPOT".equals(row.optString("instType"))
                ||!"live".equals(row.optString("state")))continue;
            String id=row.optString("instId");
            if(!id.matches("[A-Z0-9]{1,24}-[A-Z0-9]{1,12}"))continue;
            if(!symbols.contains(id))symbols.add(id);
        }
        if(symbols.isEmpty())throw new IOException("No active spot instruments");
        Collections.sort(symbols);
        return Collections.unmodifiableList(symbols);
    }
}
