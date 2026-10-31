package com.traderadar.pro;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;
import java.util.*;

final class NativeStore extends SQLiteOpenHelper {
    NativeStore(Context c){super(c,"traderadar-pro.sqlite",null,1);}
    public void onCreate(SQLiteDatabase db){db.execSQL("CREATE TABLE signals(id TEXT PRIMARY KEY,time INTEGER NOT NULL,week TEXT NOT NULL,complete INTEGER NOT NULL,body TEXT NOT NULL)");db.execSQL("CREATE INDEX signal_time ON signals(time)");db.execSQL("CREATE TABLE notifications(id TEXT PRIMARY KEY,time INTEGER NOT NULL,body TEXT NOT NULL)");}
    public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){throw new IllegalStateException("Veri geçişi tanımlanmadı");}
    synchronized void save(NativeOutcome r){ContentValues v=new ContentValues();v.put("id",r.id);v.put("time",r.time);v.put("week",NativeOutcome.weekOf(r.time));v.put("complete",r.complete?1:0);v.put("body",NativeJson.outcome(r).toString());getWritableDatabase().insertWithOnConflict("signals",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    synchronized List<NativeOutcome> pending(){List<NativeOutcome> out=new ArrayList<>();try(Cursor c=getReadableDatabase().rawQuery("SELECT body FROM signals WHERE complete=0",null)){while(c.moveToNext())try{out.add(NativeJson.restore(new JSONObject(c.getString(0))));}catch(JSONException e){throw new IllegalStateException("Sinyal kaydı okunamadı",e);}}return out;}
    synchronized boolean notifyOnce(String id,String symbol,double price,long time){JSONObject body=NativeJson.obj("id",id,"symbol",symbol,"price",price,"time",time,"category","ÇOKLU TEYİT");ContentValues v=new ContentValues();v.put("id",id);v.put("time",time);v.put("body",body.toString());return getWritableDatabase().insertWithOnConflict("notifications",null,v,SQLiteDatabase.CONFLICT_IGNORE)!=-1;}
    synchronized JSONArray history(int limit,long before,String id){return query("SELECT body FROM signals WHERE time<? OR (time=? AND id<?) ORDER BY time DESC,id DESC LIMIT ?",new String[]{String.valueOf(before),String.valueOf(before),id,String.valueOf(limit)});}
    synchronized JSONArray notifications(){return query("SELECT body FROM notifications ORDER BY time DESC LIMIT 100",null);}
    private JSONArray query(String sql,String[] args){JSONArray rows=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery(sql,args)){while(c.moveToNext())try{rows.put(new JSONObject(c.getString(0)));}catch(JSONException e){throw new IllegalStateException("Veri kaydı okunamadı",e);}}return rows;}
    synchronized JSONArray reports(){
        Map<String,JSONObject> groups=new LinkedHashMap<>();
        try(Cursor cursor=getReadableDatabase().rawQuery("SELECT week,body FROM signals ORDER BY time DESC",null)){
            while(cursor.moveToNext())try{JSONObject row=new JSONObject(cursor.getString(1)),cfg=row.getJSONObject("config");String week=cursor.getString(0),key=week+":"+cfg.getDouble("targetPct")+":"+cfg.getInt("horizonMinutes")+":"+cfg.getInt("minimumSample");JSONObject group=groups.get(key);
                if(group==null){group=NativeJson.obj("week",week,"targetPct",cfg.getDouble("targetPct"),"horizonMinutes",cfg.getInt("horizonMinutes"),"minimumSample",cfg.getInt("minimumSample"),"total",0,"wins",0,"failed",0,"pending",0,"insufficient",0);groups.put(key,group);}
                NativeJson.put(group,"total",group.getInt("total")+1);String outcome=row.getString("outcome"),field=outcome.equals("SUCCESS")?"wins":outcome.equals("FAILED")?"failed":outcome.equals("PENDING")?"pending":"insufficient";NativeJson.put(group,field,group.getInt(field)+1);
            }catch(JSONException e){throw new IllegalStateException("Rapor kaydı okunamadı",e);}
        }
        JSONArray out=new JSONArray();for(JSONObject g:groups.values()){int n=g.optInt("wins")+g.optInt("failed");NativeJson.put(g,"evaluated",n);NativeJson.put(g,"sampleRatePct",n>0?100.0*g.optInt("wins")/n:null);NativeJson.put(g,"reliable",n>=g.optInt("minimumSample"));NativeJson.put(g,"calibratedProbability",null);NativeJson.put(g,"definition",g.optInt("horizonMinutes")+" dakika içinde brüt +%"+g.optDouble("targetPct")+"; maliyetler ayrı");out.put(g);}return out;
    }
}
