package lab.prxy.tv;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

/**
 * Experiment: send the remote's Home button to Prxy TV. Off until the owner enables it in TV Settings > Accessibility.
 * It only ever reacts to KEYCODE_HOME; every other key is passed through untouched and nothing is stored or sent.
 */
public class HomeKeyService extends AccessibilityService {
    /** True while Android actually has the service running (the Settings toggle can say On while it is not). */
    static volatile boolean running;

    @Override protected void onServiceConnected() { running = true; }
    @Override public boolean onUnbind(Intent i) { running = false; return super.onUnbind(i); }
    @Override public void onDestroy() { running = false; super.onDestroy(); }

    @Override public void onAccessibilityEvent(AccessibilityEvent e) { /* not used */ }
    @Override public void onInterrupt() { /* not used */ }

    @Override
    protected boolean onKeyEvent(KeyEvent e) {
        if (e.getKeyCode() != KeyEvent.KEYCODE_HOME) return false;
        if (e.getAction() == KeyEvent.ACTION_UP) {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        }
        return true;
    }
}
