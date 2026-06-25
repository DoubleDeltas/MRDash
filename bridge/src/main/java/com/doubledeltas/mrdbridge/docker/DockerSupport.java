package com.doubledeltas.mrdbridge.docker;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** {@code docker} CLI를 shell-out으로 호출한다 (호스트 OS와 무관 — Windows/Linux/Mac 어디서든 docker CLI만 있으면 동작). */
public final class DockerSupport {

    private DockerSupport() {
    }

    public static boolean isAvailable() {
        try {
            Process process = new ProcessBuilder("docker", "version", "--format", "{{.Server.Version}}").start();
            boolean finished = process.waitFor(3, TimeUnit.SECONDS);
            return finished && process.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    public static List<DockerContainer> listRunningContainers() throws IOException, InterruptedException {
        Process process = new ProcessBuilder(
                "docker", "ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}")
                .start();

        List<DockerContainer> containers = new ArrayList<>();
        for (String line : readLines(process.getInputStream())) {
            String[] parts = line.split("\t", 4);
            if (parts.length == 4) {
                containers.add(new DockerContainer(parts[0], parts[1], parts[2], parts[3]));
            }
        }
        process.waitFor(5, TimeUnit.SECONDS);
        return containers;
    }

    public static boolean isContainerRunning(String containerId) {
        try {
            Process process = new ProcessBuilder(
                    "docker", "inspect", containerId, "--format", "{{.State.Running}}")
                    .start();
            List<String> lines = readLines(process.getInputStream());
            boolean finished = process.waitFor(3, TimeUnit.SECONDS);
            return finished && process.exitValue() == 0 && !lines.isEmpty() && "true".equals(lines.get(0).trim());
        } catch (Exception e) {
            return false;
        }
    }

    private static List<String> readLines(InputStream in) throws IOException {
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                lines.add(line);
            }
        }
        return lines;
    }
}
