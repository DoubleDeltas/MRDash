package com.doubledeltas.mrdbridge.cli;

import com.doubledeltas.mrdbridge.model.BridgeStore;
import com.doubledeltas.mrdbridge.model.ServerEntry;
import com.doubledeltas.mrdbridge.model.ServerType;

import java.util.List;

public final class ServerCommand {

    private ServerCommand() {}

    public static void execute(String[] args, BridgeStore store) {
        if (args.length < 2) {
            System.err.println("하위 명령이 필요합니다: list | add | remove | enable | disable | log-path");
            System.exit(1);
        }

        switch (args[1]) {
            case "list"     -> list(store);
            case "add"      -> add(args, store);
            case "remove"   -> remove(args, store);
            case "enable"   -> setEnabled(args, store, true);
            case "disable"  -> setEnabled(args, store, false);
            case "log-path" -> logPath(args, store);
            default -> {
                System.err.println("알 수 없는 server 하위 명령: " + args[1]);
                System.exit(1);
            }
        }
    }

    private static void list(BridgeStore store) {
        List<ServerEntry> servers = store.getServers();
        if (servers.isEmpty()) {
            System.out.println("등록된 서버가 없습니다.");
            return;
        }
        System.out.printf("%-4s  %-6s  %-20s  %-16s  %-4s  %s%n",
                "번호", "타입", "대상", "API Key", "활성", "로그 경로");
        System.out.println("-".repeat(75));
        for (int i = 0; i < servers.size(); i++) {
            ServerEntry e = servers.get(i);
            String apiKeyDisplay = e.getApiKey().length() > 14
                    ? e.getApiKey().substring(0, 14) + "..."
                    : e.getApiKey();
            String logDisplay = (e.getLogPath() != null && !e.getLogPath().isEmpty())
                    ? e.getLogPath() : "-";
            System.out.printf("%-4d  %-6s  %-20s  %-16s  %-4s  %s%n",
                    i + 1,
                    e.getType(),
                    e.getTarget(),
                    apiKeyDisplay,
                    e.isEnabled() ? "O" : "X",
                    logDisplay);
        }
    }

    private static void add(String[] args, BridgeStore store) {
        if (args.length < 5) {
            System.err.println("사용법: server add local <포트> <api-key>");
            System.err.println("       server add docker <컨테이너ID> <api-key>");
            System.exit(1);
        }

        ServerType type = switch (args[2].toLowerCase()) {
            case "local"  -> ServerType.LOCAL;
            case "docker" -> ServerType.DOCKER;
            default -> {
                System.err.println("서버 타입은 'local' 또는 'docker'이어야 합니다.");
                System.exit(1);
                yield null;
            }
        };

        String target = args[3];
        String apiKey = args[4];

        if (type == ServerType.LOCAL) {
            try {
                Integer.parseInt(target);
            } catch (NumberFormatException e) {
                System.err.println("LOCAL 서버의 대상은 포트 번호(숫자)여야 합니다.");
                System.exit(1);
            }
        }

        ServerEntry entry = new ServerEntry(type, target, apiKey);
        store.addServer(entry);
        System.out.println("서버가 추가되었습니다. (번호: " + store.getServers().size() + ")");
    }

    private static void remove(String[] args, BridgeStore store) {
        int index = parseIndex(args, store);
        ServerEntry removed = store.getServers().get(index);
        store.removeServer(removed);
        System.out.println("서버가 삭제되었습니다: [" + removed.getType() + ":" + removed.getTarget() + "]");
    }

    private static void setEnabled(String[] args, BridgeStore store, boolean enabled) {
        int index = parseIndex(args, store);
        ServerEntry entry = store.getServers().get(index);
        entry.setEnabled(enabled);
        store.save();
        System.out.println((index + 1) + "번 서버가 " + (enabled ? "활성화" : "비활성화") + "되었습니다.");
    }

    private static void logPath(String[] args, BridgeStore store) {
        if (args.length < 3) {
            System.err.println("사용법: server log-path <번호> [경로]");
            System.exit(1);
        }
        int index = parseIndex(args, store);
        ServerEntry entry = store.getServers().get(index);
        String path = (args.length >= 4) ? args[3] : null;
        entry.setLogPath(path);
        store.save();
        if (path != null) {
            System.out.println((index + 1) + "번 서버 로그 경로가 설정되었습니다: " + path);
        } else {
            System.out.println((index + 1) + "번 서버 로그 경로가 초기화되었습니다.");
        }
    }

    private static int parseIndex(String[] args, BridgeStore store) {
        if (args.length < 3) {
            System.err.println("서버 번호를 입력하세요.");
            System.exit(1);
        }
        int n;
        try {
            n = Integer.parseInt(args[2]) - 1;
        } catch (NumberFormatException e) {
            System.err.println("서버 번호는 숫자여야 합니다.");
            System.exit(1);
            return -1;
        }
        List<ServerEntry> servers = store.getServers();
        if (n < 0 || n >= servers.size()) {
            System.err.println("서버 번호가 범위를 벗어났습니다. (1~" + servers.size() + ")");
            System.exit(2);
        }
        return n;
    }
}
