package org.j2me.test;

import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;
import javax.microedition.rms.RecordStore;

/** A playable counter whose Fire action saves through the real RMS API. */
public final class NativeSaveFixtureMidlet extends MIDlet {
    private int saved;
    protected void startApp() {
        try {
            RecordStore store = RecordStore.openRecordStore("native-counter", true);
            if (store.getNumRecords() > 0) saved = store.getRecord(1)[0] & 255;
            store.closeRecordStore();
            System.out.println("NATIVE_SAVE_FIXTURE_LOAD " + saved);
        } catch (Exception error) {throw new RuntimeException(error.toString());}
        Display.getDisplay(this).setCurrent(new Canvas() {
            protected void paint(Graphics graphics) {
                graphics.setColor(0x102030 + saved * 0x010300);
                graphics.fillRect(0, 0, getWidth(), getHeight());
                graphics.setColor(0xffffff);
                graphics.drawString("Saved: " + saved, 10, 30, Graphics.TOP | Graphics.LEFT);
                graphics.drawString("Fire to save", 10, 55, Graphics.TOP | Graphics.LEFT);
            }
            protected void keyPressed(int key) {
                if (getGameAction(key) != FIRE) return;
                try {
                    RecordStore store = RecordStore.openRecordStore("native-counter", true);
                    byte[] bytes = {(byte) ++saved};
                    if (store.getNumRecords() == 0) store.addRecord(bytes, 0, 1);
                    else store.setRecord(1, bytes, 0, 1);
                    store.closeRecordStore();
                    System.out.println("NATIVE_SAVE_FIXTURE_SAVED " + saved);
                    repaint();
                } catch (Exception error) {throw new RuntimeException(error.toString());}
            }
        });
    }
    protected void pauseApp() { }
    protected void destroyApp(boolean unconditional) { }
}
