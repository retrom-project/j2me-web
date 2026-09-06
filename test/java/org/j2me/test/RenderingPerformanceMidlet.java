package org.j2me.test;

import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;
import javax.microedition.lcdui.game.GameCanvas;

/** Project-authored workload measuring game drawing, not browser presentation FPS. */
public final class RenderingPerformanceMidlet extends MIDlet implements Runnable {
    private static final class Screen extends GameCanvas {
        Screen() { super(false); }
        Graphics graphics() { return getGraphics(); }
    }
    private final Screen canvas = new Screen();
    protected void startApp() {
        canvas.setFullScreenMode(true);
        Display.getDisplay(this).setCurrent(canvas);
        new Thread(this).start();
    }
    protected void pauseApp() {}
    protected void destroyApp(boolean unconditional) {}
    public void run() {
        try {
            Thread.sleep(500);
            int width = 240, height = 320;
            java.awt.image.BufferedImage source = new java.awt.image.BufferedImage(width, height, 2);
            java.awt.image.BufferedImage destination = new java.awt.image.BufferedImage(width, height, 2);
            int[] pixels = new int[width * height];
            for (int i = 0; i < pixels.length; i++) pixels[i] = 0xff000000 | ((i * 79) & 0xffffff);
            source.setRGB(0, 0, width, height, pixels, 0, width);
            java.awt.Graphics g = destination.getGraphics();
            long start = System.currentTimeMillis();
            for (int i = 0; i < 20; i++) g.drawImage(source, 0, 0, width, height, null);
            System.out.println("RENDER_PERF blit " + (System.currentTimeMillis() - start) + " 20");
            int[] actual = destination.getRGB(0, 0, width, height, null, 0, width);
            for (int i = 0; i < pixels.length; i++) if (actual[i] != pixels[i]) throw new RuntimeException("blit pixels " + i);
            Image sprite = Image.createImage(16, 16);
            Graphics spriteGraphics = sprite.getGraphics();
            spriteGraphics.setColor(0xf08b35); spriteGraphics.fillRect(0, 0, 16, 16);
            Graphics game = canvas.graphics();
            start = System.currentTimeMillis();
            for (int frame = 0; frame < 20; frame++) {
                game.setColor(0x102030); game.fillRect(0, 0, canvas.getWidth(), canvas.getHeight());
                for (int i = 0; i < 64; i++) game.drawImage(sprite, (i * 29 + frame) % 224, (i * 47) % 304, Graphics.TOP | Graphics.LEFT);
                canvas.flushGraphics();
            }
            System.out.println("RENDER_PERF game " + (System.currentTimeMillis() - start) + " 20");
            System.out.println("RENDER_PERF_DONE");
        } catch (Throwable error) { System.out.println("RENDER_PERF_FAIL " + error); }
    }
}
