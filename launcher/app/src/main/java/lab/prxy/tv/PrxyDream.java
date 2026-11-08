package lab.prxy.tv;

import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.service.dreams.DreamService;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextClock;

import java.util.Random;

/** Screen saver: a dim clock that drifts to a new spot every minute so nothing burns in. */
public class PrxyDream extends DreamService {
    private final Handler h = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();
    private FrameLayout root;
    private LinearLayout box;
    private final Runnable drift = new Runnable() {
        @Override public void run() {
            int w = root.getWidth() - box.getWidth(), ht = root.getHeight() - box.getHeight();
            if (w > 0 && ht > 0) box.animate().translationX(rnd.nextInt(w)).translationY(rnd.nextInt(ht)).setDuration(2500).start();
            h.postDelayed(this, 60000);
        }
    };

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(false);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0D10"));
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(60, 40, 60, 40);
        TextClock time = new TextClock(this);
        time.setFormat12Hour("h:mm a"); time.setFormat24Hour("H:mm");
        time.setTextSize(96); time.setTypeface(Typeface.MONOSPACE, Typeface.BOLD); time.setTextColor(Color.parseColor("#B8BEC8"));
        TextClock date = new TextClock(this);
        date.setFormat12Hour("EEEE, MMMM d"); date.setFormat24Hour("EEEE, MMMM d");
        date.setTextSize(26); date.setTextColor(Color.parseColor("#D9720A"));
        box.addView(time); box.addView(date);
        root.addView(box, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        setContentView(root);
    }

    @Override public void onDreamingStarted() { super.onDreamingStarted(); h.postDelayed(drift, 60000); }
    @Override public void onDreamingStopped() { super.onDreamingStopped(); h.removeCallbacks(drift); }
}
