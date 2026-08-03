package com.doubledeltas.mrdbridge.model;

import com.doubledeltas.mrdbridge.util.JarLocator;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * {@code mrd-bridge.dat}을 jar와 같은 폴더에서 읽고 쓴다. (Properties 포맷)
 * backend WS 주소는 GUI에는 절대 노출하지 않지만 이 파일에는 항상 저장되어 있다 —
 * 처음 만들어질 때는 소스에 고정된 기본값을 쓰고, 이후로는 파일에서 읽은 값을 쓴다
 * (필요하면 파일을 직접 고쳐서 바꿀 수 있게).
 */
public class BridgeStore {

    private static final String DEFAULT_BACKEND_WS_URL = "wss://dash.ddeltas.kro.kr";
    private static final String FILE_NAME = "mrd-bridge.dat";

    private final File file;
    private String backendWsUrl;
    private final List<ServerEntry> servers = new ArrayList<>();

    private BridgeStore(File file) {
        this.file = file;
    }

    public static BridgeStore load() {
        File file = new File(JarLocator.currentDirectory(), FILE_NAME);
        BridgeStore store = new BridgeStore(file);
        if (file.exists()) {
            store.readFromDisk();
        } else {
            store.backendWsUrl = DEFAULT_BACKEND_WS_URL;
            store.save();
        }
        return store;
    }

    public String getBackendWsUrl() {
        return backendWsUrl;
    }

    public void setBackendWsUrl(String url) {
        this.backendWsUrl = url;
        save();
    }

    public List<ServerEntry> getServers() {
        return servers;
    }

    public void addServer(ServerEntry entry) {
        servers.add(entry);
        save();
    }

    public void removeServer(ServerEntry entry) {
        servers.remove(entry);
        save();
    }

    public void save() {
        Properties props = new Properties();
        props.setProperty("backend.wsUrl", backendWsUrl);
        props.setProperty("server.count", String.valueOf(servers.size()));
        for (int i = 0; i < servers.size(); i++) {
            ServerEntry entry = servers.get(i);
            props.setProperty("server." + i + ".type", entry.getType().name());
            props.setProperty("server." + i + ".target", entry.getTarget());
            props.setProperty("server." + i + ".apiKey", entry.getApiKey());
            props.setProperty("server." + i + ".enabled", String.valueOf(entry.isEnabled()));
            if (entry.getLogPath() != null) {
                props.setProperty("server." + i + ".logPath", entry.getLogPath());
            }
        }

        try (var writer = new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
            props.store(writer, "MRD bridge data file - do not edit while the app is running");
        } catch (IOException e) {
            throw new IllegalStateException("mrd-bridge.dat 저장 실패", e);
        }
    }

    private void readFromDisk() {
        Properties props = new Properties();
        try (var reader = new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8)) {
            props.load(reader);
        } catch (IOException e) {
            throw new IllegalStateException("mrd-bridge.dat 읽기 실패", e);
        }

        backendWsUrl = props.getProperty("backend.wsUrl", DEFAULT_BACKEND_WS_URL);
        int count = Integer.parseInt(props.getProperty("server.count", "0"));
        for (int i = 0; i < count; i++) {
            // 옛 포맷(server.{i}.port)으로 저장된 파일과의 하위호환: type/target이 없으면
            // LOCAL + port 키로 간주한다. save()는 항상 새 포맷으로 쓰므로 다음 저장 때 자연히 이전된다.
            ServerType type = ServerType.valueOf(props.getProperty("server." + i + ".type", "LOCAL"));
            String target = props.getProperty("server." + i + ".target",
                    props.getProperty("server." + i + ".port", "0"));
            String apiKey = props.getProperty("server." + i + ".apiKey", "");
            boolean enabled = Boolean.parseBoolean(props.getProperty("server." + i + ".enabled", "true"));
            ServerEntry entry = new ServerEntry(type, target, apiKey, enabled);
            entry.setLogPath(props.getProperty("server." + i + ".logPath", null));
            servers.add(entry);
        }
    }
}
