package com.doubledeltas.mrdbridge.gui;

import com.doubledeltas.mrdbridge.docker.DockerSupport;
import com.doubledeltas.mrdbridge.model.BridgeStore;
import com.doubledeltas.mrdbridge.model.ServerEntry;
import com.doubledeltas.mrdbridge.model.ServerType;

import javax.swing.BorderFactory;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.Timer;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.FlowLayout;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MainFrame extends JFrame {

    private static final String DUPLICATE_KEY_MESSAGE =
            "같은 API key로 2개 이상의 서버가 활성화되어 있습니다! 연결하지 않을 서버를 비활성화해주세요!";

    private final BridgeStore store;
    private final JPanel rowsPanel = new JPanel();
    private final JLabel errorLabel = new JLabel(" ");
    private boolean showingDuplicateKeyMessage = false;

    public MainFrame(BridgeStore store) {
        super("MRDash Bridge");
        this.store = store;

        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(820, 420);
        setLocationRelativeTo(null);
        setLayout(new BorderLayout());

        rowsPanel.setLayout(new BoxLayout(rowsPanel, BoxLayout.Y_AXIS));

        JButton addLocalButton = new JButton("로컬 서버 추가");
        addLocalButton.addActionListener(e -> addRow(null, ServerType.LOCAL));

        JButton addDockerButton = new JButton("Docker 서버 추가");
        boolean dockerAvailable = DockerSupport.isAvailable();
        addDockerButton.setEnabled(dockerAvailable);
        addDockerButton.setToolTipText(dockerAvailable ? null : "Docker가 설치되어 있지 않습니다.");
        addDockerButton.addActionListener(e -> onAddDockerClicked());

        JButton refreshButton = new JButton("새로고침");
        refreshButton.addActionListener(e -> onRefreshClicked());

        JPanel top = new JPanel(new FlowLayout(FlowLayout.LEFT));
        top.add(addLocalButton);
        top.add(addDockerButton);
        top.add(refreshButton);

        errorLabel.setForeground(Color.RED);
        errorLabel.setBorder(BorderFactory.createEmptyBorder(6, 8, 6, 8));

        JScrollPane rowsScrollPane = new JScrollPane(rowsPanel);
        rowsScrollPane.setHorizontalScrollBarPolicy(JScrollPane.HORIZONTAL_SCROLLBAR_NEVER);

        add(top, BorderLayout.NORTH);
        add(rowsScrollPane, BorderLayout.CENTER);
        add(errorLabel, BorderLayout.SOUTH);

        for (ServerEntry entry : store.getServers()) {
            addRow(entry, null);
        }

        Timer duplicateKeyTimer = new Timer(2000, e -> checkDuplicateApiKeys());
        duplicateKeyTimer.start();

        // EXIT_ON_CLOSE는 JVM만 끝내고 watcher 자식 프로세스(docker attach / --watch)는 안 건드린다 —
        // Windows는 부모가 죽어도 자식을 자동으로 같이 죽이지 않으므로, 여기서 직접 정리해야 고아가 안 남는다.
        Runtime.getRuntime().addShutdownHook(new Thread(this::closeAllWatchers, "shutdown-watcher-cleanup"));
    }

    private void closeAllWatchers() {
        for (java.awt.Component c : rowsPanel.getComponents()) {
            if (c instanceof ServerRowPanel row) {
                row.shutdownConnection();
            }
        }
    }

    /**
     * 활성화된(체크박스 켜짐) + committed 행들을 API key로 묶어서, 같은 키를 쓰는 행이
     * 2개 이상이면 그 행들에 오류 표시등을 켜고 공용 안내 메시지를 띄운다. 2초마다 돈다 —
     * 즉각적일 필요는 없는 경고성 기능이라 가벼운 폴링으로 충분하다.
     */
    private void checkDuplicateApiKeys() {
        Map<String, List<ServerRowPanel>> rowsByApiKey = new HashMap<>();
        for (java.awt.Component c : rowsPanel.getComponents()) {
            if (c instanceof ServerRowPanel row && row.isRowEnabled() && row.isRowCommitted()) {
                String apiKey = row.getCommittedApiKey();
                if (apiKey != null) {
                    rowsByApiKey.computeIfAbsent(apiKey, k -> new ArrayList<>()).add(row);
                }
            }
        }

        boolean foundDuplicate = false;
        for (java.awt.Component c : rowsPanel.getComponents()) {
            if (!(c instanceof ServerRowPanel row)) {
                continue;
            }
            String apiKey = row.isRowEnabled() && row.isRowCommitted() ? row.getCommittedApiKey() : null;
            boolean isDuplicate = apiKey != null && rowsByApiKey.get(apiKey).size() >= 2;
            row.setDuplicateApiKeyError(isDuplicate);
            foundDuplicate = foundDuplicate || isDuplicate;
        }

        if (foundDuplicate) {
            errorLabel.setText(DUPLICATE_KEY_MESSAGE);
            showingDuplicateKeyMessage = true;
        } else if (showingDuplicateKeyMessage) {
            errorLabel.setText(" ");
            showingDuplicateKeyMessage = false;
        }
    }

    private void onRefreshClicked() {
        for (java.awt.Component c : rowsPanel.getComponents()) {
            if (c instanceof ServerRowPanel row) {
                row.refreshNow();
            }
        }
    }

    private void onAddDockerClicked() {
        String containerId = DockerContainerPickerDialog.showAndPick(this);
        if (containerId == null) {
            return;
        }
        ServerRowPanel row = addRow(null, ServerType.DOCKER);
        row.prefillTarget(containerId);
    }

    /**
     * 새 행을 추가한다. {@code existing}이 있으면 그 타입/데이터로 복원하고({@code typeForNew}는 무시),
     * 없으면 {@code typeForNew}로 빈 행을 만든다.
     */
    private ServerRowPanel addRow(ServerEntry existing, ServerType typeForNew) {
        ServerType type = (existing != null) ? existing.getType() : typeForNew;
        ServerRowPanel row = new ServerRowPanel(store, new ServerRowPanel.RowListener() {
            @Override
            public void onError(String message) {
                errorLabel.setText(message);
                // 행 하나가 자기 사정으로 에러를 띄운 직후라도, API key 중복처럼 더 우선적인
                // 경고가 여전히 살아있다면 그걸로 다시 덮어써야 한다 (그 반대로 두면, 중복인
                // 두 행이 서로 연결을 뺏고 빼앗기며 자주 onClearError를 부르는 통에 중복 경고가
                // 거의 안 보이게 됐었다).
                checkDuplicateApiKeys();
            }

            @Override
            public void onClearError() {
                errorLabel.setText(" ");
                checkDuplicateApiKeys();
            }

            @Override
            public void onDeleteRequested(ServerRowPanel panel) {
                rowsPanel.remove(panel);
                rowsPanel.revalidate();
                rowsPanel.repaint();
            }
        }, type);

        if (existing != null) {
            row.loadExisting(existing);
        }

        rowsPanel.add(row);
        rowsPanel.revalidate();
        rowsPanel.repaint();
        return row;
    }
}
