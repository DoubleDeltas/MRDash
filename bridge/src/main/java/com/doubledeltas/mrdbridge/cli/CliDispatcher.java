package com.doubledeltas.mrdbridge.cli;

import com.doubledeltas.mrdbridge.model.BridgeStore;

public final class CliDispatcher {

    private CliDispatcher() {}

    public static void dispatch(String[] args) {
        BridgeStore store = BridgeStore.load();
        switch (args[0]) {
            case "run"              -> RunCommand.execute(store);
            case "config"           -> ConfigCommand.execute(args, store);
            case "server"           -> ServerCommand.execute(args, store);
            case "help", "--help", "-h" -> printHelp();
            default -> {
                System.err.println("알 수 없는 명령: " + args[0]);
                printHelp();
                System.exit(1);
            }
        }
    }

    static void printHelp() {
        System.out.println("""
                사용법: mrd-bridge [명령]

                  (명령 없음)                                      GUI 실행

                  run                                              헤드리스 모드 (활성 서버 모두 연결, Ctrl+C로 종료)

                  config                                           백엔드 URL 표시
                  config url                                       백엔드 URL 표시
                  config url <url>                                 백엔드 URL 변경

                  server list                                      서버 목록 표시
                  server add local <포트> <api-key>                로컬 서버 추가
                  server add docker <컨테이너ID> <api-key>         도커 서버 추가
                  server remove <번호>                             서버 삭제
                  server enable <번호>                             서버 활성화
                  server disable <번호>                            서버 비활성화
                  server log-path <번호> [경로]                   로그 경로 설정 (경로 생략 시 초기화)

                  help                                             이 도움말 표시
                """);
    }
}
