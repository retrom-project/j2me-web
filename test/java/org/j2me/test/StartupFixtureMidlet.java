package org.j2me.test;

import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;

/** Owned startup/selection fixture: entry identity changes only its visible color. */
public class StartupFixtureMidlet extends MIDlet {
    private final int color;
    private volatile boolean confirmed;
    private volatile int presses;
    public StartupFixtureMidlet() {this(0x22aa44);}
    protected StartupFixtureMidlet(int color) {
        this.color = color;
        if ("fail".equals(getAppProperty("Fixture-Start"))) throw new IllegalStateException("fixture constructor failure");
    }
    public static final class Second extends StartupFixtureMidlet {public Second() {super(0xcc4422);}}
    public static final class Third extends StartupFixtureMidlet {public Third() {super(0x2255cc);}}
    protected void startApp() {
        final Canvas canvas = new Canvas() {
            protected void paint(Graphics graphics) {
                graphics.setColor(color ^ (presses == 0 ? 0 : 0x333333));
                graphics.fillRect(0, 0, getWidth(), getHeight());
                graphics.setColor(0xffffff);
                graphics.drawString("Entry / input " + presses, 5, 20, Graphics.TOP | Graphics.LEFT);
            }
            public void keyPressed(int key) {
                confirmed = true;
                presses++;
                System.out.println("STARTUP_FIXTURE_INPUT " + presses);
                repaint();
            }
        };
        Display.getDisplay(this).setCurrent(canvas);
        String mode = getAppProperty("Fixture-Start");
        while ("loop".equals(mode) || "prompt".equals(mode) && !confirmed) {
            try {Thread.sleep(2);} catch (InterruptedException interrupted) {return;}
        }
    }
    protected void pauseApp() { }
    protected void destroyApp(boolean unconditional) { }
}
