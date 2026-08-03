package com.doubledeltas.mrdbridge.net;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * 백엔드의 {@code /ws/agent?token=...} 엔드포인트와 통신한다.
 * 기존 Node.js agent와 같은 메시지 프로토콜을 그대로 쓴다:
 *   - 보내는 것: {"type":"log","line":...}, {"type":"command-result","result":...}
 *   - 받는 것: {"type":"command","command":...}, {"type":"agent-status",...} (무시)
 */
public class BackendWsClient {

    public interface CommandHandler {
        void onCommand(String command);
    }

    public interface HistoryRequestHandler {
        void onHistoryRequested();
    }

    private final String backendWsUrl;
    private final String apiKey;
    private volatile WebSocket webSocket;
    private volatile boolean rejected = false;

    public BackendWsClient(String backendWsUrl, String apiKey) {
        this.backendWsUrl = backendWsUrl;
        this.apiKey = apiKey;
    }

    /** 토큰이 거부되면(4001) true. 연결 자체가 안 되면(오프라인 등) false와는 구분한다. */
    public boolean wasTokenRejected() {
        return rejected;
    }

    /**
     * 백엔드는 WS 업그레이드 자체는 토큰 검증 없이 받아준 뒤, 토큰이 잘못됐으면 곧바로(거의 즉시)
     * code 4001로 닫는다. 그래서 핸드셰이크가 성공했다는 것만으로 "연결 성공"을 알리면, 그 직후
     * 도착하는 4001 거부보다 먼저 success 신호가 나가버려 호출 쪽이 (틀린) 성공으로 착각하고
     * watcher를 띄운 뒤에야 거부당하는 경쟁 상태가 생긴다 — 이게 잘못된 API key를 넣었을 때
     * watcher 프로세스가 계속 새로 떠서 부하가 걸리던 원인이었다. 그래서 핸드셰이크 성공 후
     * 곧바로 success를 알리지 않고, 짧은 grace period 동안 4001이 안 오는지 먼저 기다린다.
     */
    private static final long TOKEN_REJECTION_GRACE_MS = 800;

    public CompletableFuture<Void> connect(CommandHandler commandHandler, HistoryRequestHandler historyRequestHandler,
                                            Consumer<Boolean> connectionListener) {
        String url = backendWsUrl.replaceAll("/+$", "") + "/ws/agent?token=" + encode(apiKey);
        HttpClient client = HttpClient.newHttpClient();

        StringBuilder textBuffer = new StringBuilder();
        AtomicBoolean firstDecisionMade = new AtomicBoolean(false);

        WebSocket.Listener listener = new WebSocket.Listener() {
            @Override
            public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
                textBuffer.append(data);
                ws.request(1);
                if (last) {
                    String message = textBuffer.toString();
                    textBuffer.setLength(0);
                    handleMessage(message, commandHandler, historyRequestHandler);
                }
                return null;
            }

            @Override
            public CompletionStage<?> onClose(WebSocket ws, int statusCode, String reason) {
                if (statusCode == 4001) {
                    rejected = true;
                }
                firstDecisionMade.set(true);
                connectionListener.accept(false);
                return null;
            }

            @Override
            public void onError(WebSocket ws, Throwable error) {
                firstDecisionMade.set(true);
                connectionListener.accept(false);
            }
        };

        return client.newWebSocketBuilder()
                .buildAsync(URI.create(url), listener)
                .thenAccept(ws -> {
                    this.webSocket = ws;
                    CompletableFuture.runAsync(() -> {
                        if (firstDecisionMade.compareAndSet(false, true)) {
                            connectionListener.accept(true);
                        }
                    }, CompletableFuture.delayedExecutor(TOKEN_REJECTION_GRACE_MS, TimeUnit.MILLISECONDS));
                })
                .exceptionally(ex -> {
                    if (firstDecisionMade.compareAndSet(false, true)) {
                        connectionListener.accept(false);
                    }
                    return null;
                });
    }

    private void handleMessage(String message, CommandHandler commandHandler, HistoryRequestHandler historyRequestHandler) {
        Map<String, String> fields = MiniJson.parseObject(message);
        String type = fields.get("type");
        if ("command".equals(type)) {
            String command = fields.get("command");
            if (command != null) {
                commandHandler.onCommand(command);
            }
        } else if ("request-history".equals(type)) {
            historyRequestHandler.onHistoryRequested();
        }
    }

    public void sendLog(String line) {
        send(MiniJson.object("type", "log", "line", line));
    }

    public void sendCommandResult(String result) {
        send(MiniJson.object("type", "command-result", "result", result));
    }

    private void send(String json) {
        WebSocket ws = this.webSocket;
        if (ws != null) {
            ws.sendText(json, true);
        }
    }

    public void close() {
        close("bridge closing");
    }

    /** reason은 그대로 close 프레임에 실려 백엔드 로그에 찍히므로, 호출부마다 구분되는 값을 넘겨야 한다. */
    public void close(String reason) {
        WebSocket ws = this.webSocket;
        if (ws != null) {
            ws.sendClose(WebSocket.NORMAL_CLOSURE, reason);
        }
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
