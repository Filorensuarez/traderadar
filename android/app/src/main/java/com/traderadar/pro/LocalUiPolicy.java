package com.traderadar.pro;

import java.net.URI;
import java.util.Set;
import java.util.HashSet;
import java.util.Arrays;

/** Exact local asset origin; no credentials, alternate ports, paths or schemes. */
public final class LocalUiPolicy {
    public static final String ORIGIN="https://appassets.androidplatform.net";
    private static final Set<String> FILES=new HashSet<>(Arrays.asList("index.html","style.css","app.js","config.js","android-transport.js"));
    private static final Set<String> SECTIONS=new HashSet<>(Arrays.asList("signals","chart","history","reports","health","settings"));
    private static URI local(String value){
        try{URI u=new URI(value);if(!"https".equals(u.getScheme())||!"appassets.androidplatform.net".equals(u.getHost())||
            u.getRawUserInfo()!=null||(u.getPort()!=-1&&u.getPort()!=443)||u.getRawQuery()!=null||u.getRawPath()==null||!u.getRawPath().equals(u.getPath()))return null;return u;
        }catch(Exception e){return null;}
    }
    public static String asset(String value,String method){URI u=local(value);if(u==null||!"GET".equals(method)||u.getRawFragment()!=null)return null;
        String p=u.getPath();if(!p.startsWith("/pro/"))return null;String name=p.substring(5);return FILES.contains(name)?name:null;}
    public static boolean navigation(String value){URI u=local(value);return u!=null&&"/pro/index.html".equals(u.getPath())&&(u.getRawFragment()==null||SECTIONS.contains(u.getRawFragment()));}
}
