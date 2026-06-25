package com.doubledeltas.mrdbridge.gui;

import com.doubledeltas.mrdbridge.model.ServerType;

import javax.swing.JButton;
import javax.swing.JDialog;
import javax.swing.JFileChooser;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.FlowLayout;
import java.awt.Window;
import java.io.File;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 콘솔 backlog용 로그 파일 경로(logs/latest.log)를 입력받는 작은 대화상자.
 * LOCAL은 호스트의 절대경로(파일 탐색기로 직접 선택 가능), DOCKER는 컨테이너 안의 경로(직접 입력)를 받는다.
 */
public final class LogPathDialog {

    private static final String DOCKER_DEFAULT_PATH = "/data/logs/latest.log";

    private LogPathDialog() {
    }

    /** 저장하면 새 값을, 취소하면 null을 반환한다. */
    public static String show(Component parent, String currentValue, ServerType type) {
        Window owner = (parent instanceof Window) ? (Window) parent : SwingUtilities.getWindowAncestor(parent);
        JDialog dialog = new JDialog(owner, "로그 파일 경로", JDialog.ModalityType.APPLICATION_MODAL);
        dialog.setSize(520, 160);
        dialog.setLocationRelativeTo(parent);
        dialog.setLayout(new BorderLayout());

        String initial = (currentValue == null || currentValue.isBlank())
                ? (type == ServerType.DOCKER ? DOCKER_DEFAULT_PATH : "")
                : currentValue;

        JPanel content = new JPanel(new BorderLayout(4, 4));
        content.add(new JLabel(type == ServerType.DOCKER
                ? "컨테이너 안의 latest.log 경로 (비워두면 이전 로그를 안 보여줌)"
                : "이 PC에 있는 latest.log 경로 (비워두면 이전 로그를 안 보여줌)"), BorderLayout.NORTH);

        JTextField pathField = new JTextField(initial);
        content.add(pathField, BorderLayout.CENTER);

        if (type == ServerType.LOCAL) {
            JButton browseButton = new JButton("찾아보기");
            browseButton.addActionListener(e -> {
                JFileChooser chooser = new JFileChooser();
                chooser.setDialogTitle("latest.log 선택");
                String currentText = pathField.getText().trim();
                if (!currentText.isBlank()) {
                    File existing = new File(currentText);
                    File dir = existing.getParentFile();
                    if (dir != null && dir.isDirectory()) {
                        chooser.setCurrentDirectory(dir);
                    }
                    chooser.setSelectedFile(existing);
                } else {
                    chooser.setSelectedFile(new File("latest.log"));
                }
                int result = chooser.showOpenDialog(dialog);
                if (result == JFileChooser.APPROVE_OPTION) {
                    pathField.setText(chooser.getSelectedFile().getAbsolutePath());
                }
            });
            content.add(browseButton, BorderLayout.EAST);
        }

        AtomicReference<String> result = new AtomicReference<>();

        JButton saveButton = new JButton("저장");
        JButton cancelButton = new JButton("취소");
        saveButton.addActionListener(e -> {
            result.set(pathField.getText().trim());
            dialog.dispose();
        });
        cancelButton.addActionListener(e -> dialog.dispose());

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        buttons.add(saveButton);
        buttons.add(cancelButton);

        dialog.add(content, BorderLayout.CENTER);
        dialog.add(buttons, BorderLayout.SOUTH);
        dialog.setVisible(true);

        return result.get();
    }
}
