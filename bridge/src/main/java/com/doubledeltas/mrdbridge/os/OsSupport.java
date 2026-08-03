package com.doubledeltas.mrdbridge.os;

import com.doubledeltas.mrdbridge.os.linux.LinuxConsoleBridge;
import com.doubledeltas.mrdbridge.os.linux.LinuxPortProcessFinder;
import com.doubledeltas.mrdbridge.os.win.WindowsConsoleBridge;
import com.doubledeltas.mrdbridge.os.win.WindowsPortProcessFinder;

import java.util.function.Supplier;

/** 현재 OS에 맞는 {@link PortProcessFinder}/{@link ConsoleBridge} 구현을 묶어서 제공한다. */
public final class OsSupport {

    private static final OsSupport CURRENT = detect();

    private final Supplier<PortProcessFinder> portProcessFinderFactory;
    private final Supplier<ConsoleBridge> consoleBridgeFactory;

    private OsSupport(Supplier<PortProcessFinder> portProcessFinderFactory, Supplier<ConsoleBridge> consoleBridgeFactory) {
        this.portProcessFinderFactory = portProcessFinderFactory;
        this.consoleBridgeFactory = consoleBridgeFactory;
    }

    public static OsSupport current() {
        return CURRENT;
    }

    public PortProcessFinder portProcessFinder() {
        return portProcessFinderFactory.get();
    }

    public ConsoleBridge newConsoleBridge() {
        return consoleBridgeFactory.get();
    }

    private static OsSupport detect() {
        String osName = System.getProperty("os.name", "").toLowerCase();
        if (osName.contains("win")) {
            return new OsSupport(WindowsPortProcessFinder::new, WindowsConsoleBridge::new);
        }
        // Linux/Mac: DOCKER 타입은 정상 동작, LOCAL 타입은 LinuxConsoleBridge에서 명확한 오류를 냄
        return new OsSupport(LinuxPortProcessFinder::new, LinuxConsoleBridge::new);
    }
}
