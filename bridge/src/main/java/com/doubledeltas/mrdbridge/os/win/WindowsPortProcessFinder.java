package com.doubledeltas.mrdbridge.os.win;

import com.doubledeltas.mrdbridge.os.PortProcessFinder;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** {@code netstat -ano} 출력을 파싱해서 포트를 LISTEN 중인 PID를 찾는다. */
public class WindowsPortProcessFinder implements PortProcessFinder {

    private static final Pattern LISTEN_LINE = Pattern.compile(
            "^\\s*TCP\\s+\\S*:(\\d+)\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$",
            Pattern.CASE_INSENSITIVE);

    @Override
    public Optional<Long> findPidListeningOn(int port) {
        try {
            Process process = new ProcessBuilder("netstat", "-ano", "-p", "TCP")
                    .redirectErrorStream(true)
                    .start();

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    Matcher matcher = LISTEN_LINE.matcher(line);
                    if (matcher.matches() && Integer.parseInt(matcher.group(1)) == port) {
                        return Optional.of(Long.parseLong(matcher.group(2)));
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
