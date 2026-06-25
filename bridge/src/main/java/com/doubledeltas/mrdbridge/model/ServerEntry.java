package com.doubledeltas.mrdbridge.model;

/** target은 타입에 따라 의미가 다르다: LOCAL이면 포트 숫자의 문자열, DOCKER면 컨테이너 ID. */
public class ServerEntry {
    private ServerType type;
    private String target;
    private String apiKey;
    private boolean enabled;
    private String logPath;

    public ServerEntry(ServerType type, String target, String apiKey) {
        this(type, target, apiKey, true);
    }

    public ServerEntry(ServerType type, String target, String apiKey, boolean enabled) {
        this.type = type;
        this.target = target;
        this.apiKey = apiKey;
        this.enabled = enabled;
    }

    public ServerType getType() {
        return type;
    }

    public void setType(ServerType type) {
        this.type = type;
    }

    public String getTarget() {
        return target;
    }

    public void setTarget(String target) {
        this.target = target;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    /** 콘솔 backlog용 로그 파일 경로 (LOCAL이면 호스트 절대경로, DOCKER면 컨테이너 안의 경로). 없으면 null. */
    public String getLogPath() {
        return logPath;
    }

    public void setLogPath(String logPath) {
        this.logPath = logPath;
    }
}
