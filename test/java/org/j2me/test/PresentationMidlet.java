package org.j2me.test;

import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.game.GameCanvas;

/** Owned fixture: isolated repaint requests must not multiply presentations. */
public final class PresentationMidlet extends MIDlet implements Runnable {
    private static final class Screen extends GameCanvas {
        Screen() { super(false); }
        Graphics graphics() { return getGraphics(); }
        public void keyPressed(int key) { System.out.println("PRESENT_KEY " + key); }
    }
    private final Screen screen = new Screen();
    protected void startApp() {
        screen.setFullScreenMode(true);
        Display.getDisplay(this).setCurrent(screen);
        new Thread(this).start();
    }
    protected void pauseApp() {}
    protected void destroyApp(boolean unconditional) {}
    public void run() {
        try {
            Thread.sleep(2500);
            System.out.println("PRESENT_START");
            Graphics g = screen.graphics();
            for (int i = 0; i < 12; i++) {
                g.setColor(i % 2 == 0 ? 0x123456 : 0xabcdef);
                g.fillRect(0, 0, screen.getWidth(), screen.getHeight());
                screen.flushGraphics();
                Thread.sleep(200);
            }
            System.out.println("PRESENT_DONE");
        } catch (Throwable error) { System.out.println("PRESENT_FAIL " + error); }
    }
}
