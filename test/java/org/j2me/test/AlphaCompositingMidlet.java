package org.j2me.test;

import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;
import java.awt.image.BufferedImage;

/** Project-authored checks for translucent panels and stale text between frames. */
public final class AlphaCompositingMidlet extends MIDlet implements Runnable {
    private final Canvas canvas = new Canvas() {
        protected void paint(Graphics g) { g.setColor(0x102030); g.fillRect(0, 0, getWidth(), getHeight()); }
    };
    protected void startApp() { Display.getDisplay(this).setCurrent(canvas); new Thread(this).start(); }
    protected void pauseApp() {}
    protected void destroyApp(boolean unconditional) {}
    public void run() {
        try {
            Image image = Image.createImage(1, 1);
            Graphics g = image.getGraphics(); g.setColor(0x0000ff); g.fillRect(0, 0, 1, 1);
            g.drawRGB(new int[]{0x80ff0000}, 0, 1, 0, 0, 1, 1, true);
            equal(0xff80007f, image.getDataBuffer()[0], "MIDP source-over");
            System.out.println("ALPHA_PASS midp");
        } catch (Throwable e) { System.out.println("ALPHA_FAIL midp " + e); }
        for (int scale = 1; scale <= 2; scale++) try {
            BufferedImage source = new BufferedImage(1, 1, 2), target = new BufferedImage(2, 2, 2);
            source.setRGB(0, 0, 0x8040a0f0);
            target.getGraphics().drawImage(source, 0, 0, scale, scale, null);
            equal(0x8040a0f0, target.getRGB(0, 0), "AWT straight ARGB scale " + scale);
            System.out.println("ALPHA_PASS awt" + scale);
        } catch (Throwable e) { System.out.println("ALPHA_FAIL awt" + scale + " " + e); }
        try {
            int w = 40, h = 20;
            Image frame = Image.createImage(w, h);
            Graphics game = frame.getGraphics();
            BufferedImage presentation = new BufferedImage(w, h, 2);
            int[] panel = new int[w * h];
            for (int i = 0; i < panel.length; i++) panel[i] = 0xbfc0d080;
            for (int tick = 0; tick < 12; tick++) {
                game.setColor(0x204060); game.fillRect(0, 0, w, h);
                game.drawRGB(panel, 0, w, 0, 0, w, h, true);
                game.setColor(0); game.fillRect(0, tick, 8, 1);
                // The frontend reuses its presentation buffer, just as during dialog scrolling.
                presentation.getGraphics().drawImage(frame.getCanvas(), 0, 0, w, h, null);
                if (tick > 0) equal(0xff98ac78, presentation.getRGB(1, tick - 1), "old text row at frame " + tick);
                equal(0xff000000, presentation.getRGB(1, tick), "new text row");
            }
            System.out.println("ALPHA_PASS scrolling");
        } catch (Throwable e) { System.out.println("ALPHA_FAIL scrolling " + e); }
        System.out.println("ALPHA_DONE");
    }
    private static void equal(int expected, int actual, String name) {
        if (expected != actual) throw new RuntimeException(name + ": expected " + Integer.toHexString(expected) + ", got " + Integer.toHexString(actual));
    }
}
