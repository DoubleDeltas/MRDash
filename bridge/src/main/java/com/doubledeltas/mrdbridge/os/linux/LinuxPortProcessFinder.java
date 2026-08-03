package com.doubledeltas.mrdbridge.os.linux;

import com.doubledeltas.mrdbridge.os.PortProcessFinder;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** {@code ss -tlnp} 출력을 파싱해서 포트를 LISTEN 중인 PID를 찾는다. */
public class LinuxPortProcessFinder implements PortProcessFinder {

    private static final Pattern PID_PATTERN = Pattern.compile("pid=(\\d+)");

    @Override
    public Optional<Long> findPidListeningOn(int port) {
        try {
            Process process = new ProcessBuilder("ss", "-tlnp", "sport", ":" + port)
                    .redirectErrorStream(true)
                    .start();

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!line.contains(":" + port)) continue;
                    Matcher m = PID_PATTERN.matcher(line);
                    if (m.find()) {
                        return Optional.of(Long.parseLong(m.group(1)));
                    }
                }
            }
            process.waitFor();
        } catch (Exception e) {
            return Optional.empty();
        }
        return Optional.empty();
    }
}
