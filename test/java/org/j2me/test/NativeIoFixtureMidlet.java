package org.j2me.test;

import java.io.InputStream;
import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;
import javax.microedition.rms.RecordStore;

/** Exercises filesystem proxies while the Host requests VM safepoints. */
public final class NativeIoFixtureMidlet extends MIDlet {
    private volatile boolean stopped;
    private volatile int cycles;
    protected void startApp() {
        final Canvas canvas = new Canvas() {
            protected void paint(Graphics graphics) {
                graphics.setColor(0x103040);
                graphics.fillRect(0, 0, getWidth(), getHeight());
                graphics.setColor(0xffffff);
                graphics.drawString("Native I/O: " + cycles, 8, 24, Graphics.TOP | Graphics.LEFT);
                graphics.drawString("Fire stops I/O", 8, 48, Graphics.TOP | Graphics.LEFT);
            }
            public void keyPressed(int key) { if (getGameAction(key) == FIRE) stopped = true; }
        };
        Display.getDisplay(this).setCurrent(canvas);
        new Thread(new Runnable() {public void run() {
            try {
                while (!stopped) {
                    InputStream input = getClass().getResourceAsStream("/io-payload.bin");
                    if (input == null) throw new IllegalStateException("Payload unavailable");
                    int sum = 0, total = 0, count;
                    byte[] bytes = new byte[4096];
                    try {
                        while ((count = input.read(bytes)) != -1) {
                            total += count;
                            for (int i = 0; i < count; i++) sum += bytes[i] & 255;
                        }
                    } finally {input.close();}
                    if (total != 65536 || sum != 8189175) throw new IllegalStateException("Payload changed across GC");
                    RecordStore store = RecordStore.openRecordStore("native-io-counter", true);
                    byte[] value = {(byte) ++cycles};
                    if (store.getNumRecords() == 0) store.addRecord(value, 0, 1);
                    else store.setRecord(1, value, 0, 1);
                    store.closeRecordStore();
                    canvas.repaint();
                    if (cycles % 4 == 0) {
                        System.out.println("NATIVE_IO_PROGRESS " + cycles);
                        System.gc();
                    }
                    Thread.sleep(1);
                }
                System.out.println("NATIVE_IO_STOPPED " + cycles);
            } catch (Throwable error) {
                System.out.println("NATIVE_IO_FAIL " + error);
                notifyDestroyed();
            }
        }}, "Native-I/O-fixture").start();
    }
    protected void pauseApp() { }
    protected void destroyApp(boolean unconditional) {stopped = true;}
}
