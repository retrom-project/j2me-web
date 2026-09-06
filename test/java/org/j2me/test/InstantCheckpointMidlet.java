package org.j2me.test;

import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;
import javax.microedition.rms.RecordStore;

/** Project-owned admission fixture. Position deliberately never enters RMS. */
public final class InstantCheckpointMidlet extends MIDlet {
    private int position;
    private final Canvas canvas = new Canvas() {
        protected void paint(Graphics graphics) {
            graphics.setColor(0x102030);
            graphics.fillRect(0, 0, getWidth(), getHeight());
            graphics.setColor(0xffffff);
            graphics.fillRect(20 + position * 10, 40, 10, 10);
        }
        public void keyPressed(int key) {
            if (key == -5 || key == -4) {
                position++;
                System.out.println("INSTANT_POSITION " + position);
                repaint();
            }
            if (key == -7) {
                destroyApp(true);
                notifyDestroyed();
            }
        }
    };

    protected void startApp() {
        try {
            // This constant only makes the old RMS checkpoint API available;
            // it contains no execution or gameplay state and is never read.
            RecordStore store = RecordStore.openRecordStore("sentinel", true);
            if (store.getNumRecords() == 0) store.addRecord(new byte[] { 42 }, 0, 1);
            store.closeRecordStore();
        } catch (Exception error) { throw new RuntimeException(error.toString()); }
        Display.getDisplay(this).setCurrent(canvas);
        System.out.println("INSTANT_STARTED " + position);
    }
    protected void pauseApp() {}
    protected void destroyApp(boolean unconditional) {}
}
