package com.doubledeltas.mrdbridge.net;

import com.doubledeltas.mrdbridge.model.ServerType;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 콘솔을 처음 열 때 보여줄 backlog를 logs/latest.log에서 읽어온다. 실시간 중계(AttachConsole/docker
 * attach)와는 완전히 독립된, 한 번 읽고 끝나는 보조 기능이다 — 못 읽어도(경로 미설정/파일 없음/권한 등)
 * 그냥 빈 리스트를 반환해서 콘솔 자체에는 영향이 없게 한다.
 */
public final class LogHistoryReader {

    private LogHistoryReader() {
    }

    public static List<String> readLastLines(ServerType type, String target, String logPath, int maxLines) {
        if (logPath == null || logPath.isBlank()) {
            return List.of();
        }
        try {
            List<String> allLines = (type == ServerType.LOCAL)
                    ? Files.readAllLines(Path.of(logPath), StandardCharsets.UTF_8)
                    : readFromContainer(target, logPath);

            int from = Math.max(0, allLines.size() - maxLines);
            return allLines.subList(from, allLines.size());
        } catch (Exception e) {
            return List.of();
        }
    }

    private static List<String> readFromContainer(String containerId, String logPath) throws Exception {
        Process process = new ProcessBuilder("docker", "exec", containerId, "cat", logPath).start();
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                lines.add(line);
            }
        }
        process.waitFor(5, TimeUnit.SECONDS);
        return lines;
    }
}
