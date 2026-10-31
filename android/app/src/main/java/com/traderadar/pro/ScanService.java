package com.traderadar.pro;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import java.util.concurrent.*;

/** User-started dataSync service. No boot receiver, alarm, or sticky restart. */
public final class ScanService extends Service {
    public static final String START="com.traderadar.pro.START",STOP="com.traderadar.pro.STOP";
    private static final String CHANNEL="pro-scan",SIGNALS="pro-signals";private static final int NOTIFICATION=301;
    private ScheduledExecutorService executor;private PowerManager.WakeLock wakeLock;
    private ScanSessionController session;private NativeRuntime runtime;private String stopReason="Tarama durduruldu";
    private NotificationManager notifications;
    public void onCreate(){super.onCreate();runtime=NativeRuntime.get(this);notifications=getSystemService(NotificationManager.class);
        NotificationChannel scan=new NotificationChannel(CHANNEL,"Tarama durumu",NotificationManager.IMPORTANCE_LOW);scan.setDescription("Kullanıcı başlatmalı taramanın kalıcı durumu");notifications.createNotificationChannel(scan);
        NotificationChannel signals=new NotificationChannel(SIGNALS,"Çoklu teyit sinyalleri",NotificationManager.IMPORTANCE_HIGH);signals.setDescription("Tekilleştirilmiş gerçek veri sinyalleri; ses Android kanal ayarlarından değişir");notifications.createNotificationChannel(signals);
        session=new ScanSessionController(runtime);
    }
    private PendingIntent open(){return PendingIntent.getActivity(this,0,new Intent(this,ProActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private Notification notification(){PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,ScanService.class).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_traderadar).setContentTitle("TradeRadar Pro · Tarama aktif").setContentText("Android izin verdiği sürece sürer · Durdur ile tamamen kapatın").setOngoing(true).setContentIntent(open()).addAction(new Notification.Action.Builder(null,"Durdur",stop).build()).build();}
    public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null||!START.equals(intent.getAction())){stopReason="Tarama kullanıcı tarafından durduruldu";stopSelf();return START_NOT_STICKY;}
        if(session.running())return START_NOT_STICKY;
        OfficialSource.Session source=OfficialSource.createVerifiedSession();
        if(source==null){runtime.stopped(OfficialSource.BLOCKER);stopSelf();return START_NOT_STICKY;}
        try{
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(NOTIFICATION,notification());
            runtime.started();if(!session.start(source,true)){runtime.stopped(OfficialSource.BLOCKER);stopSelf();return START_NOT_STICKY;}
            wakeLock=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"TradeRadar:UserScan");wakeLock.setReferenceCounted(false);wakeLock.acquire(600000L);
            executor=Executors.newSingleThreadScheduledExecutor();executor.scheduleWithFixedDelay(()->{
                try{runtime.tick(System.currentTimeMillis(),this::signal);}catch(RuntimeException e){stopReason="Tarama hatası; sinyal üretimi durduruldu";stopSelf();}
            },0,1,TimeUnit.SECONDS);
            executor.scheduleAtFixedRate(()->{if(session.running()&&wakeLock!=null)wakeLock.acquire(600000L);},9,9,TimeUnit.MINUTES);
        }catch(RuntimeException e){stopReason="Android tarama hizmetini başlatamadı; bildirim ve pil ayarlarını kontrol edin";stopSelf();}
        return START_NOT_STICKY;
    }
    private void signal(String id,String symbol,double price,long time){
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
        java.text.SimpleDateFormat formatter=new java.text.SimpleDateFormat("HH:mm:ss",java.util.Locale.forLanguageTag("tr-TR"));formatter.setTimeZone(java.util.TimeZone.getTimeZone("Europe/Istanbul"));String clock=formatter.format(new java.util.Date(time));
        Notification n=new Notification.Builder(this,SIGNALS).setSmallIcon(R.drawable.ic_traderadar).setContentTitle("Çoklu Teyit · "+symbol).setContentText("Fiyat: "+price+" · "+clock).setContentIntent(open()).setAutoCancel(true).setOnlyAlertOnce(true).build();notifications.notify(id,302,n);
    }
    @Override public void onTimeout(int startId,int fgsType){stopReason="Android dataSync süre sınırı doldu. Tarama durdu; yeniden başlatmak için uygulamayı açın.";stopSelf();}
    @Override public void onTaskRemoved(Intent rootIntent){super.onTaskRemoved(rootIntent);/* User-started foreground session may continue, subject to the OS. */}
    @Override public void onDestroy(){if(runtime!=null)runtime.stopped(stopReason);if(executor!=null){executor.shutdownNow();try{executor.awaitTermination(2,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}
        if(session!=null)session.stop();if(wakeLock!=null&&wakeLock.isHeld())wakeLock.release();if(runtime!=null)runtime.stopped(stopReason);stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    public IBinder onBind(Intent intent){return null;}
}
