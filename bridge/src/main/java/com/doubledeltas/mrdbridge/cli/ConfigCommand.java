package com.doubledeltas.mrdbridge.cli;

import com.doubledeltas.mrdbridge.model.BridgeStore;

public final class ConfigCommand {

    private ConfigCommand() {}

    public static void execute(String[] args, BridgeStore store) {
        if (args.length == 1) {
            System.out.println("백엔드 URL: " + store.getBackendWsUrl());
            return;
        }

        if (!"url".equals(args[1])) {
            System.err.println("알 수 없는 config 하위 명령: " + args[1]);
            System.err.println("사용법: config [url [<url>]]");
            System.exit(1);
        }

        if (args.length == 2) {
            System.out.println(store.getBackendWsUrl());
        } else {
            String newUrl = args[2];
            store.setBackendWsUrl(newUrl);
            System.out.println("백엔드 URL이 변경되었습니다: " + newUrl);
        }
    }
}
