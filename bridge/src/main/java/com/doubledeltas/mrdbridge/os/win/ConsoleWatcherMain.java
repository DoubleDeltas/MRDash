package com.doubledeltas.mrdbridge.os.win;

import com.doubledeltas.mrdbridge.os.ConsoleBridge;
import com.doubledeltas.mrdbridge.os.OsSupport;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * {@code --watch <pid>} 모드의 진입점. 부모(bridge GUI) 프로세스가 같은 jar를
 * 이 모드로 띄우고, 표준 Java 파이프(stdin/stdout)로 통신한다:
 *   - 이 프로세스의 stdout으로 한 줄씩 = 타깃 콘솔에서 읽은 출력 한 줄
 *   - 이 프로세스의 stdin으로 한 줄씩 = 타깃 콘솔에 입력할 명령어 한 줄
 *   - 시작에 실패하면 stderr에 에러를 찍고 종료코드 1로 종료한다.
 */
public final class ConsoleWatcherMain {

    private static final long POLL_INTERVAL_MS = 300;

    private ConsoleWatcherMain() {
    }

    public static void run(long pid) {
        PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);

        ConsoleBridge bridge = OsSupport.current().newConsoleBridge();
        try {
            bridge.attach(pid);
        } catch (Exception e) {
            System.err.println("attach 실패: " + e.getMessage());
            System.exit(1);
            return;
        }

        Thread inputThread = new Thread(() -> readCommandsFromStdin(bridge), "watcher-stdin");
        inputThread.setDaemon(true);
        inputThread.start();

        try {
            while (true) {
                List<String> lines = bridge.pollNewOutput();
                for (String line : lines) {
                    out.println(line);
                }
                Thread.sleep(POLL_INTERVAL_MS);
            }
        } catch (InterruptedException ignored) {
            // 종료
        } catch (Exception e) {
            System.err.println("watcher 루프 오류: " + e.getMessage());
        } finally {
            bridge.close();
        }
    }

    private static void readCommandsFromStdin(ConsoleBridge bridge) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                bridge.writeInput(line);
            }
        } catch (Exception ignored) {
            // 부모 프로세스가 stdin을 닫으면 여기로 빠진다 -> 그냥 스레드 종료
        }
    }
}
