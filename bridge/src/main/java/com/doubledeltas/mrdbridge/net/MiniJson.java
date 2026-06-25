package com.doubledeltas.mrdbridge.net;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 백엔드와 주고받는 메시지가 전부 "문자열 키 -> 문자열 값"으로 이루어진 평평한
 * JSON 객체라서, 별도 JSON 라이브러리 없이 이 정도만 직접 구현해서 쓴다.
 */
public final class MiniJson {

    private MiniJson() {
    }

    public static String object(String... keyValuePairs) {
        if (keyValuePairs.length % 2 != 0) {
            throw new IllegalArgumentException("키/값 쌍이 짝수여야 합니다");
        }
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < keyValuePairs.length; i += 2) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(escape(keyValuePairs[i])).append("\":\"")
              .append(escape(keyValuePairs[i + 1])).append('"');
        }
        return sb.append('}').toString();
    }

    public static String escape(String value) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.toString();
    }

    /** 평평한 {"key":"value", ...} 객체만 파싱한다 (중첩 객체/배열은 다루지 않음). */
    public static Map<String, String> parseObject(String json) {
        Map<String, String> result = new LinkedHashMap<>();
        int i = json.indexOf('{');
        int end = json.lastIndexOf('}');
        if (i < 0 || end < 0) {
            return result;
        }
        i++;
        while (i < end) {
            while (i < end && (json.charAt(i) == ',' || Character.isWhitespace(json.charAt(i)))) {
                i++;
            }
            if (i >= end) break;

            int[] keyRange = readString(json, i);
            String key = json.substring(keyRange[0], keyRange[1]);
            i = keyRange[1] + 1;

            while (i < end && (json.charAt(i) == ':' || Character.isWhitespace(json.charAt(i)))) {
                i++;
            }

            int[] valueRange = readString(json, i);
            String value = unescape(json.substring(valueRange[0], valueRange[1]));
            i = valueRange[1] + 1;

            result.put(unescape(key), value);
        }
        return result;
    }

    private static int[] readString(String json, int fromQuote) {
        int start = json.indexOf('"', fromQuote) + 1;
        int idx = start;
        while (idx < json.length()) {
            char c = json.charAt(idx);
            if (c == '\\') {
                idx += 2;
                continue;
            }
            if (c == '"') {
                return new int[]{start, idx};
            }
            idx++;
        }
        throw new IllegalArgumentException("JSON 문자열을 닫는 인용부호를 찾지 못함");
    }

    private static String unescape(String value) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\' && i + 1 < value.length()) {
                char next = value.charAt(++i);
                switch (next) {
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case '"' -> sb.append('"');
                    case '\\' -> sb.append('\\');
                    case 'u' -> {
                        sb.append((char) Integer.parseInt(value.substring(i + 1, i + 5), 16));
                        i += 4;
                    }
                    default -> sb.append(next);
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
