package com.traderadar.pro;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.*;
import android.provider.Settings;
import android.webkit.*;
import android.widget.*;
import android.view.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Local bundled UI only. No remote origin can ever reach the native bridge. */
public final class ProActivity extends Activity {
    private WebView browser;private TextView state;private NativeRuntime runtime;
    private static final String ORIGIN=LocalUiPolicy.ORIGIN;
    private static final int NOTIFICATIONS=33;
    private volatile WebMessagePort nativePort;private volatile boolean bridgeReady;private volatile long bridgeGeneration;
    private HandlerThread bridgeThread;private Handler bridgeHandler;private final Handler uiHandler=new Handler(Looper.getMainLooper());private int bridgeAttempts;
    private final Runnable bridgeRetry=()->offerBridge();
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
    @Override public void onCreate(Bundle saved){super.onCreate(saved);runtime=NativeRuntime.get(this);
        getWindow().setStatusBarColor(Color.rgb(11,18,32));getWindow().setNavigationBarColor(Color.rgb(11,18,32));
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(11,18,32));
        LinearLayout controls=new LinearLayout(this);controls.setPadding(dp(8),dp(4),dp(8),dp(4));
        Button start=new Button(this);start.setText("Başlat");start.setOnClickListener(v->requestStart());controls.addView(start,new LinearLayout.LayoutParams(0,dp(48),1));
        Button stop=new Button(this);stop.setText("Durdur");stop.setOnClickListener(v->{stopService(new Intent(this,ScanService.class));runtime.stopped("Tarama kullanıcı tarafından durduruldu");state.setText("Tarama tamamen durduruldu");});controls.addView(stop,new LinearLayout.LayoutParams(0,dp(48),1));
        Button help=new Button(this);help.setText("Pil / izin");help.setOnClickListener(v->batteryHelp());controls.addView(help,new LinearLayout.LayoutParams(0,dp(48),1));root.addView(controls);
        state=new TextView(this);state.setTextColor(Color.rgb(239,199,120));state.setPadding(dp(12),dp(4),dp(12),dp(8));state.setText(runtime.status);root.addView(state);
        LinearLayout diagnostic=new LinearLayout(this);Button test=new Button(this);test.setText("Telefonda resmî belge bağlantısını test et");test.setOnClickListener(v->probeDocumentation());diagnostic.addView(test,new LinearLayout.LayoutParams(-1,dp(48)));root.addView(diagnostic);
        bridgeThread=new HandlerThread("local-ui-messages");bridgeThread.start();bridgeHandler=new Handler(bridgeThread.getLooper());
        WebView.setWebContentsDebuggingEnabled(false);browser=new WebView(this);browser.setBackgroundColor(Color.rgb(11,18,32));WebSettings s=browser.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(false);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSafeBrowsingEnabled(true);s.setUserAgentString(s.getUserAgentString()+" TradeRadarNative/1");
        CookieManager.getInstance().setAcceptCookie(false);CookieManager.getInstance().setAcceptThirdPartyCookies(browser,false);
        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !LocalUiPolicy.navigation(request.getUrl().toString());}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){closeBridge();}
            @Override public void onPageCommitVisible(WebView view,String url){bridgeAttempts=0;offerBridge();}
            @Override public void onPageFinished(WebView view,String url){if(!bridgeReady){bridgeAttempts=0;offerBridge();}}
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                String file=LocalUiPolicy.asset(request.getUrl().toString(),request.getMethod());
                if(file==null)return blocked();
                try{String mime=file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html";Map<String,String> headers=new HashMap<>();headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'none'");headers.put("X-Content-Type-Options","nosniff");headers.put("Cache-Control","no-store");return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,getAssets().open("pro/"+file));}catch(IOException e){return blocked();}
            }
        });
        root.addView(browser,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);browser.loadUrl(ORIGIN+"/pro/index.html");
    }
    private WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream("Uzak içerik kapalı".getBytes(StandardCharsets.UTF_8)));}
    private void requestStart(){
        if(!OfficialSource.isConfigured()){state.setText(OfficialSource.BLOCKER);return;}
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATIONS);return;}
        startScan();
    }
    private void startScan(){try{startForegroundService(new Intent(this,ScanService.class).setAction(ScanService.START));state.setText("Tarama başlatma isteği gönderildi; bağlantı doğrulanmazsa çalışmaz");}catch(RuntimeException e){state.setText("Android hizmeti başlatamadı. Uygulama açıkken tekrar deneyin.");}}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);if(code==NOTIFICATIONS&&grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)startScan();else state.setText("Kalıcı bildirim izni verilmedi; tarama başlatılmadı");}
    private void batteryHelp(){new AlertDialog.Builder(this).setTitle("Android çalışma sınırları").setMessage("Tarama yalnız Başlat ile çalışır; Durdur tüm bağlantıları kapatır. Ekran kapalıyken kısmi uyanıklık kilidi pil tüketebilir. Android 15+ dataSync hizmetlerinin süre kotası ve üretici pil kısıtları vardır; kesintisizlik garanti edilmez. Yeniden başlatmada otomatik tarama yoktur. Pil ayarını yalnız ihtiyacınız varsa kendiniz değiştirin.").setPositiveButton("Pil ayarları",(d,w)->{try{startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));}catch(ActivityNotFoundException e){state.setText("Bu cihazda pil ayarları açılamadı");}}).setNegativeButton("Kapat",null).show();}
    private void probeDocumentation(){state.setText("Bu Android cihazından resmî belge kontrol ediliyor; veri taraması değil...");new Thread(()->{
        javax.net.ssl.HttpsURLConnection connection=null;String result;
        try{connection=(javax.net.ssl.HttpsURLConnection)new java.net.URL(OfficialSource.DOCUMENTATION).openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);int code=connection.getResponseCode();String cache=connection.getHeaderField("X-Cache");result="Android cihazı: HTTP "+code+(cache==null?"":" · "+cache)+". Bu test REST/WebSocket doğrulaması değildir.";
        }catch(IOException e){result="Android cihazında bağlantı kurulamadı. Bu sonuç Codex bulut testinden ayrıdır.";}finally{if(connection!=null)connection.disconnect();}
        final String message=result;runOnUiThread(()->{if(!isFinishing())state.setText(message);});
    },"official-doc-probe").start();}
    @Override protected void onResume(){super.onResume();if(state!=null)state.setText(runtime.status);}
    private void closeBridge(){bridgeGeneration++;bridgeReady=false;uiHandler.removeCallbacks(bridgeRetry);WebMessagePort old=nativePort;nativePort=null;if(old!=null)old.close();}
    private void offerBridge(){
        uiHandler.removeCallbacks(bridgeRetry);if(bridgeReady||browser==null||isDestroyed()||!LocalUiPolicy.navigation(browser.getUrl())||bridgeAttempts++>=20)return;
        WebMessagePort old=nativePort;if(old!=null)old.close();final long generation=++bridgeGeneration;WebMessagePort[] ports=browser.createWebMessageChannel();final WebMessagePort port=ports[0];nativePort=port;
        port.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort p,WebMessage message){
            if(nativePort!=port||bridgeGeneration!=generation)return;String raw=message.getData();if(raw==null||raw.length()>20000)return;
            try{org.json.JSONObject request=new org.json.JSONObject(raw);if("ready".equals(request.optString("type"))){runOnUiThread(()->{if(nativePort==port&&bridgeGeneration==generation)bridgeReady=true;});return;}
                Object id=request.opt("id");if(!(id instanceof Number))return;double numericId=((Number)id).doubleValue();if(numericId<=0||numericId!=Math.rint(numericId)||numericId>9007199254740991d)return;
                if(!(request.opt("path") instanceof String)||!(request.opt("method") instanceof String)||!(request.opt("body") instanceof String))return;
                String path=request.getString("path"),method=request.getString("method"),body=request.getString("body");if(path.length()>200||body.length()>16384||!(method.equals("GET")||method.equals("PATCH")))return;
                Object result=new org.json.JSONTokener(runtime.request(path,method,body)).nextValue();String response=NativeJson.obj("id",((Number)id).longValue(),"result",result).toString();
                runOnUiThread(()->{if(!isDestroyed()&&nativePort==port&&bridgeGeneration==generation)port.postMessage(new WebMessage(response));});
            }catch(org.json.JSONException ignored){/* Invalid messages never reach the native API. */}
        }},bridgeHandler);
        browser.postWebMessage(new WebMessage("{\"type\":\"TRADERADAR_NATIVE_PORT\",\"version\":1}",new WebMessagePort[]{ports[1]}),android.net.Uri.parse(ORIGIN));
        uiHandler.postDelayed(bridgeRetry,500);
    }
    @Override protected void onDestroy(){closeBridge();if(bridgeThread!=null)bridgeThread.quitSafely();if(browser!=null)browser.destroy();super.onDestroy();/* A user-started native service is deliberately not stopped here. */}
}
