package com.doubledeltas.mrdbridge.gui;

import javax.swing.JComponent;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;

/** 서버 상태(온라인/오프라인/비활성화/오류)를 색깔로 보여주는 작은 원 컴포넌트. */
public class StatusDot extends JComponent {

    public enum State {
        ONLINE(new Color(0x43, 0xB5, 0x81)),
        OFFLINE(Color.BLACK),
        DISABLED(new Color(0x72, 0x76, 0x7D)),
        ERROR(new Color(0xF0, 0x47, 0x47));

        final Color color;

        State(Color color) {
            this.color = color;
        }
    }

    private static final int SIZE = 14;

    private State state = State.OFFLINE;

    public void setState(State state) {
        this.state = state;
        repaint();
    }

    @Override
    public Dimension getPreferredSize() {
        return new Dimension(SIZE, SIZE);
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setColor(state.color);
        g2.fillOval(0, 0, SIZE - 1, SIZE - 1);
        g2.setColor(Color.GRAY);
        g2.drawOval(0, 0, SIZE - 1, SIZE - 1);
        g2.dispose();
    }
}
