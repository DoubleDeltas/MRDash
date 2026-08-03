package com.doubledeltas.mrdbridge.cli;

import com.doubledeltas.mrdbridge.bridge.HeadlessServerRunner;
import com.doubledeltas.mrdbridge.model.BridgeStore;
import com.doubledeltas.mrdbridge.model.ServerEntry;

import java.util.ArrayList;
import java.util.List;

public final class RunCommand {

    private RunCommand() {}

    public static void execute(BridgeStore store) {
        List<ServerEntry> servers = store.getServers().stream()
                .filter(ServerEntry::isEnabled)
                .toList();

        if (servers.isEmpty()) {
            System.err.println("오류: 활성화된 서버가 없습니다.");
            System.err.println("  GUI 또는 'mrd-bridge server add' 명령으로 서버를 추가하고 활성화한 뒤,");
            System.err.println("  mrd-bridge.dat 파일을 컨테이너의 /app/mrd-bridge.dat 경로에 마운트하세요.");
            System.exit(2);
        }

        String backendUrl = store.getBackendWsUrl();
        System.out.println("MRDash Bridge 헤드리스 모드 시작 (" + servers.size() + "개 서버)");
        System.out.println("백엔드: " + backendUrl);
        System.out.println("종료하려면 Ctrl+C를 누르세요.");
        System.out.println();

        List<HeadlessServerRunner> runners = new ArrayList<>();
        for (ServerEntry entry : servers) {
            HeadlessServerRunner runner = new HeadlessServerRunner(backendUrl, entry);
            runners.add(runner);
            runner.start();
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\n종료 중...");
            for (HeadlessServerRunner r : runners) r.stop();
        }, "shutdown-cleanup"));

        try {
            Thread.currentThread().join();
        } catch (InterruptedException ignored) {}
    }
}
