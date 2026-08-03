package com.doubledeltas.mrdbridge.gui;

import com.doubledeltas.mrdbridge.model.BridgeStore;

import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JDialog;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextField;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;

public class SettingsDialog extends JDialog {

    public static void show(JFrame owner, BridgeStore store) {
        new SettingsDialog(owner, store).setVisible(true);
    }

    private SettingsDialog(JFrame owner, BridgeStore store) {
        super(owner, "설정", true);

        JTextField wsUrlField = new JTextField(store.getBackendWsUrl(), 36);

        JPanel form = new JPanel();
        form.setLayout(new BoxLayout(form, BoxLayout.Y_AXIS));
        form.setBorder(BorderFactory.createEmptyBorder(12, 12, 8, 12));

        JLabel label = new JLabel("백엔드 URL");
        label.setAlignmentX(LEFT_ALIGNMENT);
        wsUrlField.setAlignmentX(LEFT_ALIGNMENT);
        wsUrlField.setMaximumSize(new Dimension(Integer.MAX_VALUE, wsUrlField.getPreferredSize().height));

        form.add(label);
        form.add(Box.createVerticalStrut(4));
        form.add(wsUrlField);

        JButton saveButton = new JButton("저장");
        JButton cancelButton = new JButton("취소");

        saveButton.addActionListener(e -> {
            String url = wsUrlField.getText().trim();
            if (!url.isEmpty()) {
                store.setBackendWsUrl(url);
            }
            dispose();
        });
        cancelButton.addActionListener(e -> dispose());

        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT, 6, 6));
        buttons.add(saveButton);
        buttons.add(cancelButton);

        setLayout(new BorderLayout());
        add(form, BorderLayout.CENTER);
        add(buttons, BorderLayout.SOUTH);

        getRootPane().setDefaultButton(saveButton);
        pack();
        setResizable(false);
        setLocationRelativeTo(owner);
    }
}
