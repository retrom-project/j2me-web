package org.j2me.test;

import java.io.*;
import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.*;
import javax.microedition.rms.*;

/** Self-authored RMS contract regression, run inside the actual web VM. */
public final class RmsPersistenceMidlet extends MIDlet implements Runnable {
    private final Canvas canvas = new Canvas() {
        protected void paint(Graphics g) {
            g.setColor(0x102030); g.fillRect(0, 0, getWidth(), getHeight());
        }
    };
    protected void startApp() {
        Display.getDisplay(this).setCurrent(canvas);
        new Thread(this).start();
    }
    protected void pauseApp() {}
    protected void destroyApp(boolean unconditional) {}
    private static void require(boolean ok, String message) {
        if (!ok) throw new RuntimeException(message);
    }
    public void run() {
        try {
            // javac emits multianewarray with two dimensions for this rank-three type.
            byte[][][] partial = new byte[2][3][];
            require(partial.length == 2 && partial[0].length == 3, "allocated dimensions");
            for (int i = 0; i < 2; i++) for (int j = 0; j < 3; j++)
                require(partial[i][j] == null, "unallocated dimension was initialized");
            partial[0][1] = new byte[]{7};
            require(partial[1][1] == null && partial[0][1][0] == 7, "partial array independence");
            int[][] full = new int[2][3];
            full[0][1] = 9;
            require(full[1][1] == 0 && full[0][1] == 9, "full array independence");
            System.out.println("RMS_PASS arrays");
        } catch (Throwable e) { System.out.println("RMS_FAIL arrays " + e); }
        try {
            RecordStore a = RecordStore.openRecordStore("replace", true);
            require(a.addRecord(new byte[]{3}, 0, 1) == 1, "first id");
            a.closeRecordStore();
            RecordStore.deleteRecordStore("replace");
            a = RecordStore.openRecordStore("replace", true);
            require(a.getNumRecords() == 0, "delete left old records");
            require(a.addRecord(new byte[]{7}, 0, 1) == 1, "replacement id");
            a.closeRecordStore();
            System.out.println("RMS_PASS replace");
        } catch (Throwable e) { System.out.println("RMS_FAIL replace " + e); }
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            DataOutputStream out = new DataOutputStream(bytes);
            out.writeInt(123456); out.writeByte(9); out.writeShort(1234);
            out.writeBoolean(true); out.writeUTF("test");
            for (int i = 0; i < 4096; i++) out.writeByte((byte) i);
            out.close();
            DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()));
            require(in.readInt() == 123456 && in.readByte() == 9 && in.readShort() == 1234
                && in.readBoolean() && in.readUTF().equals("test"), "serialized values");
            for (int i = 0; i < 4096; i++) require(in.readUnsignedByte() == (i & 255), "buffer growth corrupted data");
            System.out.println("RMS_PASS streams");
        } catch (Throwable e) { System.out.println("RMS_FAIL streams " + e); }
        try {
            RecordStore a = RecordStore.openRecordStore("shared", true);
            RecordStore b = RecordStore.openRecordStore("shared", true);
            a.addRecord(new byte[]{5}, 0, 1);
            require(b.getNumRecords() == 1 && b.getRecord(1)[0] == 5, "handles diverged");
            a.closeRecordStore();
            require(b.getRecord(1)[0] == 5, "first close invalidated second handle");
            b.closeRecordStore();
            RecordStore.deleteRecordStore("shared");
            System.out.println("RMS_PASS shared");
        } catch (Throwable e) { System.out.println("RMS_FAIL shared " + e); }
        try {
            RecordStore a = RecordStore.openRecordStore("closed", true);
            RecordStore b = RecordStore.openRecordStore("other", true);
            a.addRecord(new byte[]{4}, 0, 1); a.closeRecordStore();
            boolean closed = false;
            try { a.getRecord(1); } catch (RecordStoreNotOpenException expected) { closed = true; }
            require(closed, "closed store remained usable while another was open");
            RecordStore.deleteRecordStore("closed");
            b.addRecord(new byte[]{8}, 0, 1); b.closeRecordStore();
            System.out.println("RMS_PASS independent");
        } catch (Throwable e) { System.out.println("RMS_FAIL independent " + e); }
        System.out.println("RMS_CONTRACT_DONE");
    }
}
