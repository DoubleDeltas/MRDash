package com.doubledeltas.mrdbridge.gui;

import com.doubledeltas.mrdbridge.docker.DockerContainer;
import com.doubledeltas.mrdbridge.docker.DockerSupport;

import javax.swing.JButton;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.SwingUtilities;
import javax.swing.table.DefaultTableModel;
import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.FlowLayout;
import java.awt.Window;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/** 실행 중인 docker 컨테이너 목록에서 하나를 고르는 모달 대화상자. */
public final class DockerContainerPickerDialog {

    private DockerContainerPickerDialog() {
    }

    /** 선택된 컨테이너 ID를 반환한다. 취소했거나 목록을 못 가져오면 null. */
    public static String showAndPick(Component parent) {
        List<DockerContainer> containers;
        try {
            containers = DockerSupport.listRunningContainers();
        } catch (Exception e) {
            JOptionPane.showMessageDialog(parent, "컨테이너 목록을 가져오지 못했습니다: " + e.getMessage(),
                    "오류", JOptionPane.ERROR_MESSAGE);
            return null;
        }

        Window owner = (parent instanceof Window) ? (Window) parent : SwingUtilities.getWindowAncestor(parent);
        JDialog dialog = new JDialog(owner, "Docker 컨테이너 선택", JDialog.ModalityType.APPLICATION_MODAL);
        dialog.setSize(560, 320);
        dialog.setLocationRelativeTo(parent);
        dialog.setLayout(new BorderLayout());

        DefaultTableModel model = new DefaultTableModel(new Object[]{"ID", "이름", "이미지", "상태"}, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };
        for (DockerContainer c : containers) {
            model.addRow(new Object[]{c.getId(), c.getName(), c.getImage(), c.getStatus()});
        }
        JTable table = new JTable(model);
        table.setSelectionMode(javax.swing.ListSelectionModel.SINGLE_SELECTION);

        AtomicReference<String> picked = new AtomicReference<>();

        JButton selectButton = new JButton("선택");
        JButton cancelButton = new JButton("취소");
        selectButton.setEnabled(false);

        table.getSelectionModel().addListSelectionListener(e ->
                selectButton.setEnabled(table.getSelectedRow() >= 0));

        Runnable confirmSelection = () -> {
            int row = table.getSelectedRow();
            if (row >= 0) {
                picked.set((String) model.getValueAt(row, 0));
                dialog.dispose();
            }
        };

        table.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent e) {
                if (e.getClickCount() == 2) {
                    confirmSelection.run();
                }
            }
        });

        selectButton.addActionListener(e -> confirmSelection.run());
        cancelButton.addActionListener(e -> dialog.dispose());

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        buttons.add(selectButton);
        buttons.add(cancelButton);

        if (containers.isEmpty()) {
            dialog.add(new JLabel("  실행 중인 컨테이너가 없습니다.", JLabel.LEFT), BorderLayout.NORTH);
        }
        dialog.add(new JScrollPane(table), BorderLayout.CENTER);
        dialog.add(buttons, BorderLayout.SOUTH);

        dialog.setVisible(true);
        return picked.get();
    }
}
