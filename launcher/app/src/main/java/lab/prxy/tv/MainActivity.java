package lab.prxy.tv;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.media.tv.TvContract;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.VideoView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Prxy TV: a WebView that shows assets/index.html and bridges the few things a web page cannot do (list/launch apps). */
public class MainActivity extends Activity {
    private WebView web;
    private VideoView video;
    private SharedPreferences prefs;
    private BroadcastReceiver pkgReceiver;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("prxy-tv", MODE_PRIVATE);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#14171C"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setAllowFileAccess(true);          // our own assets only (file:///android_asset)
        s.setAllowContentAccess(false);
        s.setDomStorageEnabled(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !r.getUrl().toString().startsWith("file:///android_asset/"); // never navigate away
            }
        });
        web.addJavascriptInterface(new Bridge(), "Tv");
        FrameLayout frame = new FrameLayout(this);
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        video = new VideoView(this);
        video.setVisibility(View.GONE);
        video.setOnCompletionListener(m -> stopVideo());
        video.setOnErrorListener((m, w, x) -> { stopVideo(); return true; });
        frame.addView(video, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onStart() {
        super.onStart();
        pkgReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                web.post(() -> web.evaluateJavascript("window.refreshApps&&window.refreshApps()", null));
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addDataScheme("package");
        registerReceiver(pkgReceiver, f);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (pkgReceiver != null) { unregisterReceiver(pkgReceiver); pkgReceiver = null; }
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        web.evaluateJavascript("window.onShow&&window.onShow()", null);
    }

    /** Back closes the menu if one is open, otherwise leaves the launcher. */
    private void stopVideo() {
        if (video == null || video.getVisibility() != View.VISIBLE) return;
        video.stopPlayback();
        video.setVisibility(View.GONE);
        web.evaluateJavascript("window.onVideoEnd&&window.onVideoEnd()", null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (video != null && video.getVisibility() == View.VISIBLE) video.pause();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (video != null && video.getVisibility() == View.VISIBLE) {         // while the briefing plays, the remote controls it
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                int k = e.getKeyCode();
                if (k == KeyEvent.KEYCODE_BACK) stopVideo();
                else if (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || k == KeyEvent.KEYCODE_MEDIA_PLAY || k == KeyEvent.KEYCODE_MEDIA_PAUSE) { if (video.isPlaying()) video.pause(); else video.start(); }
                else if (k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_MEDIA_REWIND) video.seekTo(Math.max(0, video.getCurrentPosition() - 10000));
                else if (k == KeyEvent.KEYCODE_DPAD_RIGHT || k == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) video.seekTo(video.getCurrentPosition() + 10000);
            }
            return true;
        }
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.onBack&&window.onBack()", v -> { if (!"true".equals(v)) finish(); });
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    private static String b64(Bitmap bm, boolean jpeg) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        if (jpeg) bm.compress(Bitmap.CompressFormat.JPEG, 82, o); else bm.compress(Bitmap.CompressFormat.PNG, 100, o);
        return Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP);
    }

    private static Bitmap draw(Drawable d, int w, int h, boolean opaque) {
        Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bm);
        if (opaque) c.drawColor(Color.parseColor("#1B1F26"));
        d.setBounds(0, 0, w, h);
        d.draw(c);
        return bm;
    }

    private class Bridge {
        /** [{p: package, l: label, b: banner jpeg base64 | null, i: icon png base64}] - stays on this device. */
        @JavascriptInterface
        public String apps() {
            PackageManager pm = getPackageManager();
            List<ResolveInfo> all = new ArrayList<>();
            for (String cat : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
                all.addAll(pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(cat), 0));
            }
            Set<String> seen = new HashSet<>();
            JSONArray out = new JSONArray();
            for (ResolveInfo r : all) {
                String pkg = r.activityInfo.packageName;
                if (pkg.equals(getPackageName()) || !seen.add(pkg)) continue;
                try {
                    JSONObject o = new JSONObject();
                    o.put("p", pkg);
                    o.put("l", String.valueOf(r.loadLabel(pm)));
                    Drawable ban = r.activityInfo.loadBanner(pm);
                    if (ban == null) ban = r.activityInfo.applicationInfo.loadBanner(pm);
                    o.put("b", ban != null ? b64(draw(ban, 320, 180, true), true) : JSONObject.NULL);
                    o.put("i", b64(draw(r.loadIcon(pm), 128, 128, false), false));
                    out.put(o);
                } catch (Exception ignored) { /* skip an app we cannot read */ }
            }
            return out.toString();
        }

        @JavascriptInterface
        public void launch(String pkg) {
            runOnUiThread(() -> {
                PackageManager pm = getPackageManager();
                Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
                if (i == null) i = pm.getLaunchIntentForPackage(pkg);
                if (i != null) startActivity(i);
            });
        }

        @JavascriptInterface
        public void appInfo(String pkg) {
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))));
        }

        @JavascriptInterface
        public void system(String kind) {
            String a = Settings.ACTION_SETTINGS;
            if ("network".equals(kind)) a = Settings.ACTION_WIFI_SETTINGS;
            else if ("display".equals(kind)) a = Settings.ACTION_DISPLAY_SETTINGS;
            final String action = a;
            runOnUiThread(() -> {
                try { startActivity(new Intent(action)); } catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
            });
        }

        /** Asks the lab feed for counts (and weather). Result arrives asynchronously as window.onFeed(jsonString|null). */
        @JavascriptInterface
        public void refreshFeed() {
            new Thread(() -> {
                String json = null;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(prefs.getString("feed", "http://10.20.40.137:8081/feed")).openConnection();
                    c.setConnectTimeout(3000); c.setReadTimeout(4000);
                    if (c.getResponseCode() == 200) {
                        BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
                        StringBuilder sb = new StringBuilder(); String ln;
                        while ((ln = r.readLine()) != null && sb.length() < 20000) sb.append(ln);
                        json = sb.toString();
                    }
                    c.disconnect();
                } catch (Exception ignored) { /* lab not reachable */ }
                final String js = "window.onFeed&&window.onFeed(" + (json == null ? "null" : JSONObject.quote(json)) + ")";
                web.post(() -> web.evaluateJavascript(js, null));
            }).start();
        }

        /** Voice search through the TV's own assistant. */
        @JavascriptInterface
        public void voice() {
            runOnUiThread(() -> {
                String[] actions = {Intent.ACTION_VOICE_COMMAND, "android.intent.action.VOICE_ASSIST", Intent.ACTION_ASSIST, "android.intent.action.SEARCH_LONG_PRESS"};
                for (String a : actions) {
                    try { startActivity(new Intent(a).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (Exception ignored) { /* try the next one */ }
                }
            });
        }

        /** Plays the daily briefing from the lab feed (same address as the feed, fixed path), starting at startMs. */
        @JavascriptInterface
        public void playNews(int startMs) {
            runOnUiThread(() -> {
                String feedUrl = prefs.getString("feed", "http://10.20.40.137:8081/feed");
                String base = feedUrl.substring(0, feedUrl.lastIndexOf('/'));
                video.setVisibility(View.VISIBLE);
                video.setVideoURI(Uri.parse(base + "/news/latest.mp4"));
                video.setOnPreparedListener(m -> { if (startMs > 0) video.seekTo(startMs); video.start(); });
            });
        }

        @JavascriptInterface
        public boolean homeButton() { return HomeKeyService.running; }

        @JavascriptInterface
        public String state() { return prefs.getString("state", ""); }

        @JavascriptInterface
        public void setState(String json) { prefs.edit().putString("state", json).apply(); }

        /** HDMI and other pass-through inputs: [{id, l}] */
        @JavascriptInterface
        public String inputs() {
            JSONArray out = new JSONArray();
            try {
                TvInputManager m = (TvInputManager) getSystemService(Context.TV_INPUT_SERVICE);
                for (TvInputInfo i : m.getTvInputList()) {
                    if (!i.isPassthroughInput()) continue;
                    CharSequence c = i.loadCustomLabel(MainActivity.this);
                    if (c == null || c.length() == 0) c = i.loadLabel(MainActivity.this);
                    JSONObject o = new JSONObject();
                    o.put("id", i.getId());
                    o.put("l", String.valueOf(c));
                    out.put(o);
                }
            } catch (Exception ignored) { /* no inputs available */ }
            return out.toString();
        }

        @JavascriptInterface
        public void input(String id) {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(id))); } catch (Exception ignored) { /* input gone */ }
            });
        }

        /** Opens the TV's own home screen (Google TV) - the way back once Home is sent to Prxy TV. */
        @JavascriptInterface
        public void googleHome() {
            runOnUiThread(() -> {
                Intent h = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
                for (ResolveInfo r : getPackageManager().queryIntentActivities(h, 0)) {
                    if (r.activityInfo.packageName.equals(getPackageName())) continue;
                    startActivity(new Intent(h).setClassName(r.activityInfo.packageName, r.activityInfo.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return;
                }
            });
        }

        @JavascriptInterface
        public void accessibility() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); } catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
            });
        }

        @JavascriptInterface
        public String pins() { return prefs.getString("pins", ""); }

        @JavascriptInterface
        public void setPins(String json) { prefs.edit().putString("pins", json).apply(); }

        @JavascriptInterface
        public void exit() { runOnUiThread(MainActivity.this::finish); }
    }
}
