package com.doubledeltas.mrdbridge;

import com.doubledeltas.mrdbridge.gui.MainFrame;
import com.doubledeltas.mrdbridge.model.BridgeStore;
import com.doubledeltas.mrdbridge.os.win.ConsoleWatcherMain;

import javax.swing.SwingUtilities;

public final class Main {

    private Main() {
    }

    public static void main(String[] args) {
        if (args.length >= 2 && "--watch".equals(args[0])) {
            long pid = Long.parseLong(args[1]);
            ConsoleWatcherMain.run(pid);
            return;
        }

        SwingUtilities.invokeLater(() -> {
            BridgeStore store = BridgeStore.load();
            MainFrame frame = new MainFrame(store);
            frame.setVisible(true);
        });
    }
}
