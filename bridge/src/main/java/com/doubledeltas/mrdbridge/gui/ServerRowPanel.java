package com.doubledeltas.mrdbridge.gui;

import com.doubledeltas.mrdbridge.docker.DockerSupport;
import com.doubledeltas.mrdbridge.model.BridgeStore;
import com.doubledeltas.mrdbridge.model.ServerEntry;
import com.doubledeltas.mrdbridge.model.ServerType;
import com.doubledeltas.mrdbridge.net.BackendWsClient;
import com.doubledeltas.mrdbridge.net.LogHistoryReader;
import com.doubledeltas.mrdbridge.net.MinecraftPinger;
import com.doubledeltas.mrdbridge.net.WatcherProcessManager;
import com.doubledeltas.mrdbridge.os.OsSupport;

import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import java.awt.Dimension;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** 서버 한 대를 나타내는 한 행: 활성화 스위치, 타깃(포트/컨테이너 ID)/API key 입력, 연결/수정, 삭제, 상태 표시. */
public class ServerRowPanel extends JPanel {

    public interface RowListener {
        void onError(String message);
        void onClearError();
        void onDeleteRequested(ServerRowPanel panel);
    }

    private static final long MIN_RECONNECT_DELAY_MS = 1000;
    private static final long MAX_RECONNECT_DELAY_MS = 30_000;
    private static final int LOG_HISTORY_MAX_LINES = 300;

    // 행마다 타입(LOCAL/DOCKER)이 달라도 칸이 항상 같은 위치에 오도록, 칼럼 폭을 고정한다
    // (각 행은 독립된 GridBagLayout이라, 폭을 고정하지 않으면 행마다 컬럼이 따로 정렬된다).
    private static final int ENABLED_CHECKBOX_WIDTH = 24;
    private static final int LABEL_WIDTH = 78;
    private static final int TARGET_FIELD_WIDTH = 90;
    private static final int BROWSE_WIDTH = 88;
    private static final int APIKEY_LABEL_WIDTH = 55;
    private static final int APIKEY_FIELD_WIDTH = 100;
    private static final int CONNECT_BUTTON_WIDTH = 96;
    private static final int LOG_PATH_BUTTON_WIDTH = 62;
    private static final int DELETE_BUTTON_WIDTH = 64;
    private static final int COLUMN_GAP = 6;

    private final ServerType type;
    private final JCheckBox enabledCheckBox = new JCheckBox();
    private final JTextField targetField = new JTextField();
    private final JButton browseButton = new JButton("찾아보기");
    private final JTextField apiKeyField = new JTextField();
    private final JButton connectButton = new JButton("서버 연결");
    private final JButton logPathButton = new JButton("로그");
    private final JButton deleteButton = new JButton("삭제");
    private final StatusDot statusDot = new StatusDot();

    private final BridgeStore store;
    private final RowListener listener;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "row-reconnect");
        t.setDaemon(true);
        return t;
    });

    private ServerEntry entry;
    private boolean committed = false;
    private volatile boolean running = false;
    private long reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
    private boolean online = false;
    private boolean duplicateKeyError = false;
    private String logPath = "";

    private WatcherProcessManager watcher;
    private BackendWsClient wsClient;

    public ServerRowPanel(BridgeStore store, RowListener listener, ServerType type) {
        this.store = store;
        this.listener = listener;
        this.type = type;

        setLayout(new GridBagLayout());
        setBorder(BorderFactory.createEmptyBorder(2, 2, 2, 2));

        GridBagConstraints gbc = new GridBagConstraints();
        gbc.gridy = 0;
        gbc.anchor = GridBagConstraints.WEST;
        gbc.insets = new Insets(0, 0, 0, COLUMN_GAP);

        addCell(new ServerTypeIcon(type), gbc, 0);

        enabledCheckBox.setSelected(true);
        enabledCheckBox.setToolTipText("비활성화하면 이 서버는 연결을 시도하지 않습니다.");
        fixWidth(enabledCheckBox, ENABLED_CHECKBOX_WIDTH);
        addCell(enabledCheckBox, gbc, 1);
        enabledCheckBox.addActionListener(e -> onEnabledToggled());

        JLabel targetLabel = new JLabel(type == ServerType.DOCKER ? "컨테이너 ID" : "포트");
        fixWidth(targetLabel, LABEL_WIDTH);
        addCell(targetLabel, gbc, 2);

        fixWidth(targetField, TARGET_FIELD_WIDTH);
        addCell(targetField, gbc, 3);

        // LOCAL 행은 찾아보기 버튼이 없지만, 그 다음 칼럼들이 행 타입과 무관하게 항상 같은
        // 위치에 오도록 같은 폭의 빈 칸을 채워둔다.
        if (type == ServerType.DOCKER) {
            fixWidth(browseButton, BROWSE_WIDTH);
            addCell(browseButton, gbc, 4);
            browseButton.addActionListener(e -> onBrowseButtonClicked());
        } else {
            addCell(Box.createHorizontalStrut(BROWSE_WIDTH), gbc, 4);
        }

        JLabel apiKeyLabel = new JLabel("API Key");
        fixWidth(apiKeyLabel, APIKEY_LABEL_WIDTH);
        addCell(apiKeyLabel, gbc, 5);

        fixWidth(apiKeyField, APIKEY_FIELD_WIDTH);
        addCell(apiKeyField, gbc, 6);

        fixWidth(connectButton, CONNECT_BUTTON_WIDTH);
        addCell(connectButton, gbc, 7);

        fixWidth(logPathButton, LOG_PATH_BUTTON_WIDTH);
        logPathButton.setToolTipText("콘솔을 열 때 보여줄 이전 로그 파일(logs/latest.log) 경로를 설정합니다.");
        addCell(logPathButton, gbc, 8);

        fixWidth(deleteButton, DELETE_BUTTON_WIDTH);
        addCell(deleteButton, gbc, 9);

        gbc.insets = new Insets(0, 0, 0, 0);
        addCell(statusDot, gbc, 10);

        connectButton.addActionListener(e -> onConnectButtonClicked());
        logPathButton.addActionListener(e -> onLogPathButtonClicked());
        deleteButton.addActionListener(e -> onDeleteButtonClicked());
    }

    private void addCell(java.awt.Component component, GridBagConstraints template, int gridx) {
        GridBagConstraints gbc = (GridBagConstraints) template.clone();
        gbc.gridx = gridx;
        add(component, gbc);
    }

    /** 컬럼 폭을 고정한다 (행마다 독립된 GridBagLayout이라, 폭을 안 고정하면 행끼리 칼럼이 안 맞는다). */
    private static void fixWidth(JComponent component, int width) {
        int height = component.getPreferredSize().height;
        Dimension size = new Dimension(width, height);
        component.setPreferredSize(size);
        component.setMinimumSize(size);
        component.setMaximumSize(size);
    }

    /** BoxLayout이 행 높이를 제멋대로 늘리지 못하게, 최대 높이를 선호 높이로 고정한다 (안 그러면 행 사이 간격이 들쭉날쭉해진다). */
    @Override
    public java.awt.Dimension getMaximumSize() {
        return new java.awt.Dimension(Integer.MAX_VALUE, getPreferredSize().height);
    }

    /** 새로 만든(아직 committed 안 된) 행의 타깃 입력칸에 초기값을 채운다 (Docker 컨테이너 선택 직후 등). */
    public void prefillTarget(String value) {
        targetField.setText(value);
    }

    public boolean isRowEnabled() {
        return enabledCheckBox.isSelected();
    }

    public boolean isRowCommitted() {
        return committed;
    }

    /** committed 상태일 때만 의미 있다 (그 전엔 null). MainFrame이 API key 중복 검사에 쓴다. */
    public String getCommittedApiKey() {
        return entry != null ? entry.getApiKey() : null;
    }

    /** 같은 API key를 쓰는 다른 활성 서버가 있을 때, MainFrame이 이 행에 오류 표시등을 켜라고 알려준다. */
    public void setDuplicateApiKeyError(boolean duplicateKeyError) {
        this.duplicateKeyError = duplicateKeyError;
        refreshDotDisplay();
    }

    /**
     * 상단 "새로고침" 버튼에서 호출 — committed 상태인 행만, 백오프 대기 없이 지금 바로
     * 한 번 더 연결을 시도한다. 재연결 스케줄러와 같은(단일 스레드) executor에 올려서
     * 자동 재연결 시도와 동시에 겹쳐 실행되지 않게 한다.
     */
    public void refreshNow() {
        if (!committed || entry == null || !enabledCheckBox.isSelected()) {
            return;
        }
        scheduler.execute(() -> {
            boolean ok = attemptBridge(entry.getTarget(), entry.getApiKey(), false);
            if (ok) {
                reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
            }
        });
    }

    /** 저장된 데이터로 행을 복원할 때 (앱 시작 시) 호출한다. */
    public void loadExisting(ServerEntry existing) {
        this.entry = existing;
        targetField.setText(existing.getTarget());
        apiKeyField.setText(existing.getApiKey());
        enabledCheckBox.setSelected(existing.isEnabled());
        logPath = existing.getLogPath() != null ? existing.getLogPath() : "";
        setCommitted(true);
        if (existing.isEnabled()) {
            running = true;
            reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
            new Thread(() -> attemptBridge(existing.getTarget(), existing.getApiKey(), false), "row-initial-bridge").start();
        } else {
            refreshDotDisplay();
        }
    }

    private void onEnabledToggled() {
        boolean isEnabled = enabledCheckBox.isSelected();
        if (entry != null) {
            entry.setEnabled(isEnabled);
            store.save();
        }
        if (!isEnabled) {
            running = false;
            stopBridge();
        } else if (committed && entry != null) {
            running = true;
            reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
            scheduler.execute(() -> attemptBridge(entry.getTarget(), entry.getApiKey(), false));
        }
        refreshDotDisplay();
    }

    private void onBrowseButtonClicked() {
        String picked = DockerContainerPickerDialog.showAndPick(this);
        if (picked != null) {
            targetField.setText(picked);
        }
    }

    private void onLogPathButtonClicked() {
        String newPath = LogPathDialog.show(this, logPath, type);
        if (newPath == null) {
            return;
        }
        logPath = newPath;
        if (entry != null) {
            entry.setLogPath(logPath);
            store.save();
        }
    }

    private void onConnectButtonClicked() {
        if (committed) {
            running = false;
            stopBridge();
            setCommitted(false);
            return;
        }

        String target = targetField.getText().trim();
        if (type == ServerType.LOCAL) {
            try {
                Integer.parseInt(target);
            } catch (NumberFormatException ex) {
                listener.onError("포트는 숫자로 입력하세요.");
                return;
            }
        } else if (target.isEmpty()) {
            listener.onError("컨테이너 ID를 입력하거나 찾아보기로 선택하세요.");
            return;
        }

        String apiKey = apiKeyField.getText().trim();
        if (apiKey.isEmpty()) {
            listener.onError("API 키를 입력하세요.");
            return;
        }

        connectButton.setEnabled(false);
        new Thread(() -> {
            boolean ok = attemptBridge(target, apiKey, true);
            SwingUtilities.invokeLater(() -> {
                connectButton.setEnabled(true);
                if (ok) {
                    if (entry != null) {
                        // 이미 커밋됐던 행을 "서버 수정"으로 고쳐서 다시 연결한 경우 ->
                        // 같은 entry를 그대로 갱신해야 한다. 새 entry를 만들어 addServer로
                        // 추가해버리면 옛 entry가 .dat에 그대로 남아 중복 행이 쌓인다.
                        entry.setType(type);
                        entry.setTarget(target);
                        entry.setApiKey(apiKey);
                        entry.setEnabled(true);
                        store.save();
                    } else {
                        entry = new ServerEntry(type, target, apiKey, true);
                        entry.setLogPath(logPath);
                        store.addServer(entry);
                    }
                    setCommitted(true);
                    running = true;
                    reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
                }
            });
        }, "row-connect-attempt").start();
    }

    private void onDeleteButtonClicked() {
        running = false;
        stopBridge();
        scheduler.shutdownNow();
        if (entry != null) {
            store.removeServer(entry);
        }
        listener.onDeleteRequested(this);
    }

    /**
     * 타깃 검증(포트 또는 컨테이너) -> 백엔드 WS 연결 -> watcher 시작까지 한 번 시도한다.
     * 백그라운드 스레드에서 호출해야 한다 (블로킹 I/O).
     */
    private boolean attemptBridge(String target, String apiKey, boolean reportErrors) {
        if (!enabledCheckBox.isSelected()) {
            // 비활성화된 사이에 이미 예약돼 있던 재연결 작업이 뒤늦게 실행되는 경우를 막는다.
            return false;
        }

        closeExistingConnection();

        Long pid = null;
        if (type == ServerType.LOCAL) {
            int port = Integer.parseInt(target);
            Optional<Long> found = OsSupport.current().portProcessFinder().findPidListeningOn(port);
            if (found.isEmpty()) {
                reportError(reportErrors, "포트 " + port + "에서 서버를 찾을 수 없습니다 (오프라인).");
                return false;
            }
            if (!MinecraftPinger.isMinecraftServer("127.0.0.1", port, 3000)) {
                reportError(reportErrors, "포트 " + port + "의 프로세스가 마인크래프트 서버로 확인되지 않습니다.");
                return false;
            }
            pid = found.get();
        } else {
            if (!DockerSupport.isContainerRunning(target)) {
                reportError(reportErrors, "컨테이너 " + target + "를 찾을 수 없거나 실행 중이 아닙니다.");
                return false;
            }
        }

        BackendWsClient client = new BackendWsClient(store.getBackendWsUrl(), apiKey);
        CompletableFuture<Boolean> firstResult = new CompletableFuture<>();

        client.connect(command -> {
            WatcherProcessManager w = this.watcher;
            if (w != null) {
                w.sendCommand(command);
            }
        }, () -> {
            List<String> lines = LogHistoryReader.readLastLines(type, target, logPath, LOG_HISTORY_MAX_LINES);
            for (String line : lines) {
                client.sendLog(line);
            }
        }, connected -> {
            if (!firstResult.isDone()) {
                firstResult.complete(connected);
            } else if (!connected && client == wsClient) {
                // wsClient가 이미 null이거나 다른 연결로 교체됐으면 이 이벤트는 오래된 것 — 무시
                online = false;
                SwingUtilities.invokeLater(this::refreshDotDisplay);
                scheduleReconnect();
            }
        });

        boolean connected;
        try {
            connected = firstResult.get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            connected = false;
        }

        if (!connected) {
            if (client.wasTokenRejected()) {
                reportError(reportErrors, "API 키가 유효하지 않습니다.");
            } else {
                reportError(reportErrors, "백엔드에 연결할 수 없습니다.");
            }
            return false;
        }

        WatcherProcessManager newWatcher = new WatcherProcessManager();
        try {
            if (type == ServerType.LOCAL) {
                newWatcher.start(pid, client::sendLog, () -> onWatcherDied(newWatcher));
            } else {
                newWatcher.startDockerAttach(target, client::sendLog, () -> onWatcherDied(newWatcher));
            }
        } catch (Exception e) {
            client.close();
            reportError(reportErrors, "콘솔 watcher 시작에 실패했습니다: " + e.getMessage());
            return false;
        }

        this.wsClient = client;
        this.watcher = newWatcher;
        online = true;
        SwingUtilities.invokeLater(() -> {
            refreshDotDisplay();
            listener.onClearError();
        });
        return true;
    }

    /**
     * watcher 자식 프로세스가 (백엔드 WS 연결은 그대로인 채) 스스로 끝났을 때 호출된다 — 예를 들어
     * docker 컨테이너가 삭제/재생성되면 docker attach가 끊기는데, WS는 멀쩡히 열려 있어서 backend는
     * 여전히 "연결됨"으로 보고, 그래서 명령을 보내도 아무 반응이 없는 좀비 상태가 됐었다.
     * close()로 우리가 일부러 끊은 경우에도 같은 콜백이 불리므로, 이 watcher가 여전히 "지금" 활성
     * watcher인지 확인해서 의도적인 종료/이미 교체된 watcher는 무시한다.
     */
    private void onWatcherDied(WatcherProcessManager diedWatcher) {
        if (!running || this.watcher != diedWatcher) {
            return;
        }
        BackendWsClient c = wsClient;
        wsClient = null;
        if (c != null) { c.close(); }
        this.watcher = null;
        online = false;
        SwingUtilities.invokeLater(this::refreshDotDisplay);
        scheduleReconnect();
    }

    private void scheduleReconnect() {
        if (!running) {
            return;
        }
        scheduler.schedule(() -> {
            if (!running || !enabledCheckBox.isSelected()) {
                return;
            }
            boolean ok = attemptBridge(entry.getTarget(), entry.getApiKey(), false);
            if (ok) {
                reconnectDelayMs = MIN_RECONNECT_DELAY_MS;
            } else {
                reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
                scheduleReconnect();
            }
        }, reconnectDelayMs, TimeUnit.MILLISECONDS);
    }

    private void stopBridge() {
        closeExistingConnection();
        online = false;
        refreshDotDisplay();
    }

    /** 앱 종료 시 떠 있는 watcher 자식 프로세스를 고아로 남기지 않기 위해 MainFrame의 shutdown hook에서 부른다. */
    public void shutdownConnection() {
        closeExistingConnection();
    }

    /** 재시도 직전에 남아있을 수 있는 이전 연결/와처를 정리한다 (안 그러면 재연결마다 watcher 프로세스가 쌓인다). */
    private void closeExistingConnection() {
        BackendWsClient c = wsClient;
        wsClient = null;
        if (c != null) { c.close(); }
        WatcherProcessManager w = watcher;
        watcher = null;
        if (w != null) { w.close(); }
    }

    private void setCommitted(boolean committed) {
        this.committed = committed;
        targetField.setEditable(!committed);
        browseButton.setEnabled(!committed);
        apiKeyField.setEditable(!committed);
        connectButton.setText(committed ? "서버 수정" : "서버 연결");
        if (!committed) {
            online = false;
        }
        refreshDotDisplay();
    }

    private void refreshDotDisplay() {
        StatusDot.State state;
        if (!enabledCheckBox.isSelected()) {
            state = StatusDot.State.DISABLED;
        } else if (duplicateKeyError) {
            state = StatusDot.State.ERROR;
        } else if (online) {
            state = StatusDot.State.ONLINE;
        } else {
            state = StatusDot.State.OFFLINE;
        }
        statusDot.setState(state);
    }

    private void reportError(boolean reportErrors, String message) {
        if (reportErrors) {
            SwingUtilities.invokeLater(() -> listener.onError(message));
        }
    }
}
