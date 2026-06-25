package com.doubledeltas.mrdbridge.gui;

import com.doubledeltas.mrdbridge.model.ServerType;

import javax.imageio.ImageIO;
import javax.swing.JComponent;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.InputStream;

/** 행 왼쪽에 서버 타입(로컬/Docker)을 나타내는 작은 아이콘. */
public class ServerTypeIcon extends JComponent {

    private static final int SIZE = 28;
    private static final BufferedImage DOCKER_LOGO = loadDockerLogo();

    private final ServerType type;

    public ServerTypeIcon(ServerType type) {
        this.type = type;
        setPreferredSize(new Dimension(SIZE, SIZE));
        setMinimumSize(new Dimension(SIZE, SIZE));
        setMaximumSize(new Dimension(SIZE, SIZE));
    }

    @Override
    protected void paintComponent(Graphics g) {
        Graphics2D g2 = (Graphics2D) g.create();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);

        if (type == ServerType.DOCKER && DOCKER_LOGO != null) {
            g2.drawImage(DOCKER_LOGO, 0, 0, SIZE, SIZE, this);
        } else {
            drawMonitor(g2);
        }

        g2.dispose();
    }

    private void drawMonitor(Graphics2D g2) {
        // 화면
        g2.setColor(new Color(0x36, 0x39, 0x3F));
        g2.fillRoundRect(2, 3, SIZE - 4, 15, 3, 3);
        g2.setColor(new Color(0x7A, 0xA7, 0xE0));
        g2.fillRoundRect(4, 5, SIZE - 8, 11, 2, 2);

        // 받침대
        g2.setColor(new Color(0x36, 0x39, 0x3F));
        g2.fillRect(SIZE / 2 - 2, 18, 4, 4);
        g2.fillRoundRect(SIZE / 2 - 7, 22, 14, 3, 2, 2);
    }

    private static BufferedImage loadDockerLogo() {
        try (InputStream in = ServerTypeIcon.class.getResourceAsStream("/icons/docker.png")) {
            if (in == null) {
                return null;
            }
            return ImageIO.read(in);
        } catch (Exception e) {
            return null;
        }
    }
}
