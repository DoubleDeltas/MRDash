package com.doubledeltas.mrdbridge.bridge;

import com.doubledeltas.mrdbridge.docker.DockerSupport;
import com.doubledeltas.mrdbridge.model.ServerEntry;
import com.doubledeltas.mrdbridge.model.ServerType;
import com.doubledeltas.mrdbridge.net.BackendWsClient;
import com.doubledeltas.mrdbridge.net.LogHistoryReader;
import com.doubledeltas.mrdbridge.net.MinecraftPinger;
import com.doubledeltas.mrdbridge.net.WatcherProcessManager;
import com.doubledeltas.mrdbridge.os.OsSupport;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * ServerRowPanel의 연결 로직을 Swing 없이 추출한 헤드리스 연결 엔진.
 * run 명령에서 활성 서버마다 하나씩 생성해 사용한다.
 */
public class HeadlessServerRunner {

    private static final long MIN_RECONNECT_DELAY_MS = 1000;
    private static final long MAX_RECONNECT_DELAY_MS = 30_000;
    private static final int LOG_HISTORY_MAX_LINES = 300;
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final String backendUrl;
    private final ServerEntry entry;
    private final String label;

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "headless-reconnect");
        t.setDaemon(true);
        return t;
    });

    private volatile boolean running = false;
    private volatile BackendWsClient wsClient;
    private volatile WatcherProcessManager watcher;
    private long reconnectDelayMs = MIN_RECONNECT_DELAY_MS;

    public HeadlessServerRunner(String backendUrl, ServerEntry entry) {
        this.backendUrl = backendUrl;
        this.entry = entry;
        this.label = "[" + entry.getType() + ":" + entry.getTarget() + "]";
    }

    public void start() {
        running = true;
        reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
        scheduler.execute(this::attemptOnce);
    }

    public void stop() {
        running = false;
        closeExistingConnection("bridge stopping");
        scheduler.shutdownNow();
    }

    private void attemptOnce() {
        if (!running) return;

        closeExistingConnection("reconnect attempt started");

        Long pid = null;
        if (entry.getType() == ServerType.LOCAL) {
            int port = Integer.parseInt(entry.getTarget());
            Optional<Long> found = OsSupport.current().portProcessFinder().findPidListeningOn(port);
            if (found.isEmpty()) {
                log("포트 " + port + "에서 서버를 찾을 수 없습니다. 재시도 중...");
                scheduleReconnect();
                return;
            }
            if (!MinecraftPinger.isMinecraftServer("127.0.0.1", port, 3000)) {
                log("포트 " + port + "의 프로세스가 마인크래프트 서버로 확인되지 않습니다. 재시도 중...");
                scheduleReconnect();
                return;
            }
            pid = found.get();
        } else {
            if (!DockerSupport.isContainerRunning(entry.getTarget())) {
                log("컨테이너 " + entry.getTarget() + "를 찾을 수 없거나 실행 중이 아닙니다. 재시도 중...");
                scheduleReconnect();
                return;
            }
        }

        BackendWsClient client = new BackendWsClient(backendUrl, entry.getApiKey());
        CompletableFuture<Boolean> firstResult = new CompletableFuture<>();

        final Long finalPid = pid;
        client.connect(
                command -> {
                    WatcherProcessManager w = this.watcher;
                    if (w != null) w.sendCommand(command);
                },
                () -> {
                    List<String> lines = LogHistoryReader.readLastLines(
                            entry.getType(), entry.getTarget(), entry.getLogPath(), LOG_HISTORY_MAX_LINES);
                    for (String line : lines) client.sendLog(line);
                },
                connected -> {
                    if (!firstResult.isDone()) {
                        firstResult.complete(connected);
                    } else if (!connected) {
                        log("백엔드 연결이 끊어졌습니다. 재시도 중...");
                        scheduleReconnect();
                    }
                }
        );

        boolean connected;
        try {
            connected = firstResult.get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            connected = false;
        }

        if (!connected) {
            if (client.wasTokenRejected()) {
                log("API 키가 유효하지 않습니다. 이 서버의 재시도를 중단합니다.");
                running = false;
            } else {
                log("백엔드에 연결할 수 없습니다. 재시도 중...");
                scheduleReconnect();
            }
            return;
        }

        WatcherProcessManager newWatcher = new WatcherProcessManager();
        try {
            if (entry.getType() == ServerType.LOCAL) {
                newWatcher.start(finalPid, client::sendLog, () -> onWatcherDied(newWatcher));
            } else {
                newWatcher.startDockerAttach(entry.getTarget(), client::sendLog, () -> onWatcherDied(newWatcher));
            }
        } catch (Exception e) {
            client.close("watcher start failed: " + e.getMessage());
            log("콘솔 watcher 시작 실패: " + e.getMessage() + ". 재시도 중...");
            scheduleReconnect();
            return;
        }

        this.wsClient = client;
        this.watcher = newWatcher;
        reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
        log("연결되었습니다.");
    }

    private void onWatcherDied(WatcherProcessManager diedWatcher) {
        if (!running || this.watcher != diedWatcher) return;
        closeExistingConnection("console watcher died");
        log("콘솔 watcher가 종료되었습니다. 재시도 중...");
        scheduleReconnect();
    }

    private void scheduleReconnect() {
        if (!running) return;
        long delay = reconnectDelayMs;
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
        scheduler.schedule(this::attemptOnce, delay, TimeUnit.MILLISECONDS);
    }

    private void closeExistingConnection(String reason) {
        BackendWsClient c = wsClient;
        if (c != null) { c.close(reason); wsClient = null; }
        WatcherProcessManager w = watcher;
        if (w != null) { w.close(); watcher = null; }
    }

    private void log(String message) {
        System.out.println("[" + LocalTime.now().format(TIME_FMT) + "] " + label + " " + message);
    }
}
