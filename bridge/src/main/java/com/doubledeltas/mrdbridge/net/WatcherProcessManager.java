package com.doubledeltas.mrdbridge.net;

import com.doubledeltas.mrdbridge.util.JarLocator;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * stdio가 파이프로 연결된 자식 프로세스를 하나 띄우고, 그 stdin/stdout/stderr로 통신한다.
 * 로컬 서버는 같은 jar를 {@code --watch <pid>}로 재실행하는 자식이고, Docker 서버는
 * {@code docker attach <containerId>} 자체가 그 자식이다 — 둘 다 "stdio가 그대로
 * 연결된 프로세스를 띄운다"는 같은 모양이라 파이핑 로직을 그대로 공유한다.
 */
public class WatcherProcessManager implements AutoCloseable {

    public interface OutputHandler {
        void onLine(String line);
    }

    public interface ExitHandler {
        void onExit();
    }

    private Process process;
    private PrintWriter stdin;

    /**
     * exitHandler는 이 watcher의 자식 프로세스가 "스스로" 끝났을 때만 불러야 한다 (예: docker 컨테이너가
     * 삭제돼서 docker attach가 끊긴 경우). close()로 우리가 일부러 죽인 경우에도 같은 콜백이 불리므로,
     * 호출하는 쪽(ServerRowPanel)에서 "지금 이 watcher가 여전히 현재 활성 watcher인지"를 직접 확인해야 한다.
     */
    public void start(long pid, OutputHandler outputHandler, ExitHandler exitHandler) throws IOException {
        String javaBin = System.getProperty("java.home") + File.separator + "bin" + File.separator + "java";
        String jarPath = JarLocator.currentJarFile().getAbsolutePath();
        startCommand(List.of(javaBin, "-jar", jarPath, "--watch", String.valueOf(pid)), outputHandler, exitHandler);
    }

    public void startDockerAttach(String containerId, OutputHandler outputHandler, ExitHandler exitHandler) throws IOException {
        startCommand(List.of("docker", "attach", containerId), outputHandler, exitHandler);
    }

    private void startCommand(List<String> command, OutputHandler outputHandler, ExitHandler exitHandler) throws IOException {
        ProcessBuilder builder = new ProcessBuilder(command);
        process = builder.start();

        stdin = new PrintWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8), true);

        startReaderThread(process.getInputStream(), outputHandler::onLine, "watcher-stdout-reader");
        startReaderThread(process.getErrorStream(), line -> System.err.println("[watcher] " + line), "watcher-stderr-reader");

        Process watchedProcess = process;
        Thread exitWatcherThread = new Thread(() -> {
            try {
                watchedProcess.waitFor();
            } catch (InterruptedException ignored) {
                return;
            }
            exitHandler.onExit();
        }, "watcher-exit-watch");
        exitWatcherThread.setDaemon(true);
        exitWatcherThread.start();
    }

    private void startReaderThread(java.io.InputStream stream, OutputHandler handler, String name) {
        Thread thread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    handler.onLine(line);
                }
            } catch (IOException ignored) {
                // 프로세스가 종료되면서 스트림이 닫힘 -> 정상 종료
            }
        }, name);
        thread.setDaemon(true);
        thread.start();
    }

    public void sendCommand(String command) {
        if (stdin != null) {
            stdin.println(command);
        }
    }

    public boolean isAlive() {
        return process != null && process.isAlive();
    }

    @Override
    public void close() {
        if (process != null) {
            process.destroy();
        }
    }
}
