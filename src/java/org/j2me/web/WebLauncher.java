package org.j2me.web;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.io.File;
import java.io.FileInputStream;

import org.mini.apploader.AppLoader;
import org.mini.apploader.GApplication;
import org.mini.glfw.Glfw;
import org.mini.gui.callback.GCallBack;

public final class WebLauncher {
    private static final String APP_NAME = "freej2meonminijvm.jar";
    private static final String APP_PATH = "/lib/freej2meonminijvm.jar";

    private WebLauncher() {
    }

    public static void main(String[] args) {
        GCallBack callback = GCallBack.getInstance();
        callback.init(960, 540);
        System.out.println("[j2me-web] GLFW_READY");

        if (!AppLoader.addApp(APP_NAME, APP_PATH)) {
            throw new RuntimeException("Unable to install " + APP_PATH);
        }

        Thread appLoader = new Thread(new Runnable() {
            public void run() {
                try {
                    System.out.println("[j2me-web] APP_LOADER_STARTING");
                    GApplication app = AppLoader.runApp(APP_NAME);
                    if (app == null) {
                        throw new RuntimeException("Unable to start " + APP_NAME);
                    }
                    startHostBridge(app);
                } catch (Throwable error) {
                    System.out.println("[j2me-web] HOST_BRIDGE_FAILED " + error);
                }
            }
        }, "j2me-web-app-loader");
        appLoader.setDaemon(true);
        appLoader.start();
        System.out.println("[j2me-web] GLFW_LOOP_STARTING");
        Glfw.executeMainLoop();
    }

    private static void startHostBridge(final GApplication app) {
        Thread bridge = new Thread(new Runnable() {
            public void run() {
                try {
                    System.out.println("[j2me-web] HOST_BRIDGE_STARTING");
                    // AppLoader returns before the GUI invokes onInit. Observe
                    // the GUI application's public lifecycle before resolving its
                    // classes, so the bridge cannot steal their initialization.
                    while (app.getState() != GApplication.AppState.STATE_RUNNING) {
                        if (app.getState() == GApplication.AppState.STATE_CLOSED) return;
                        Thread.sleep(10L);
                    }
                    ClassLoader loader = app.getClass().getClassLoader();
                    Class<?> platformClass = Class.forName("org.recompile.mobile.MobilePlatform", true, loader);
                    Field terminated = platformClass.getField("appTerminated");
                    Field firstFrame = platformClass.getField("firstFramePresented");
                    Field inputQueue = platformClass.getField("inputQueueReady");
                    Class<?> mobileClass = Class.forName("org.recompile.mobile.Mobile", true, loader);
                    Object platform = mobileClass.getMethod("getPlatform").invoke(null);
                    Object midletLoader = platformClass.getField("loader").get(platform);
                    Method choicesMethod = midletLoader.getClass().getMethod("getStartupChoices");
                    Method selectMethod = midletLoader.getClass().getMethod("selectMidlet", int.class);
                    boolean choicesPublished = false;
                    File choiceFile = new File("/appdata/freej2meonminijvm.jar/j2me-web-startup-choice");
                    while (!firstFrame.getBoolean(null) || !inputQueue.getBoolean(null)) {
                        String[] choices = (String[]) choicesMethod.invoke(midletLoader);
                        if (choices.length > 0 && !choicesPublished) {
                            StringBuilder message = new StringBuilder("[j2me-web] HOST_STARTUP_CHOICES ");
                            for (int i = 0; i < choices.length; i += 2) {
                                if (i > 0) message.append(',');
                                message.append(choices[i]).append('=');
                                byte[] label = choices[i + 1].getBytes("UTF-8");
                                for (byte value : label) {
                                    message.append("0123456789abcdef".charAt((value & 255) >> 4));
                                    message.append("0123456789abcdef".charAt(value & 15));
                                }
                            }
                            System.out.println(message.toString());
                            choicesPublished = true;
                        }
                        if (choicesPublished && choices.length > 0 && choiceFile.isFile()) {
                            FileInputStream input = new FileInputStream(choiceFile);
                            byte[] bytes = new byte[16];
                            int length;
                            try { length = input.read(bytes); } finally { input.close(); }
                            choiceFile.delete();
                            selectMethod.invoke(midletLoader, Integer.parseInt(new String(bytes, 0, length, "UTF-8")));
                        }
                        if (terminated.getBoolean(null)) {
                            System.out.println("[j2me-web] MIDLET_EXIT_REQUESTED");
                            return;
                        }
                        Thread.sleep(10L);
                    }
                    System.out.println("[j2me-web] HOST_BRIDGE_READY");

                    while (true) {
                        if (terminated.getBoolean(null)) {
                            System.out.println("[j2me-web] MIDLET_EXIT_REQUESTED");
                            return;
                        }
                        Thread.sleep(25L);
                    }
                } catch (Throwable error) {
                    System.out.println("[j2me-web] HOST_BRIDGE_FAILED " + error);
                }
            }
        }, "j2me-web-host-bridge");
        bridge.setDaemon(true);
        bridge.start();
    }
}
