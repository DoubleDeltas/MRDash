package com.doubledeltas.mrdbridge.net;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Minecraft Server List Ping(SLP) 핸드셰이크로 해당 포트가 진짜 마인크래프트
 * 서버인지 확인한다. RCON/로그 파일은 전혀 쓰지 않는다.
 */
public final class MinecraftPinger {

    private MinecraftPinger() {
    }

    public static boolean isMinecraftServer(String host, int port, int timeoutMs) {
        try (Socket socket = new Socket()) {
            socket.connect(new java.net.InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);

            OutputStream out = socket.getOutputStream();
            out.write(handshakePacket(host, port));
            out.write(statusRequestPacket());
            out.flush();

            DataInputStream in = new DataInputStream(socket.getInputStream());
            int length = readVarInt(in);
            byte[] body = new byte[length];
            in.readFully(body);

            ByteArrayInputStreamWithVarInt bodyIn = new ByteArrayInputStreamWithVarInt(body);
            int packetId = bodyIn.readVarInt();
            if (packetId != 0x00) {
                return false;
            }
            String json = bodyIn.readVarIntString();
            return json.contains("\"version\"") && json.contains("\"players\"");
        } catch (Exception e) {
            return false;
        }
    }

    private static byte[] handshakePacket(String host, int port) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        writeVarInt(body, 0x00);
        writeVarInt(body, 763); // 프로토콜 버전 (확인용이라 정확한 값은 중요하지 않음)
        writeVarIntString(body, host);
        body.write((port >> 8) & 0xFF);
        body.write(port & 0xFF);
        writeVarInt(body, 1); // next state = status
        return withLengthPrefix(body.toByteArray());
    }

    private static byte[] statusRequestPacket() throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        writeVarInt(body, 0x00);
        return withLengthPrefix(body.toByteArray());
    }

    private static byte[] withLengthPrefix(byte[] body) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeVarInt(out, body.length);
        out.write(body);
        return out.toByteArray();
    }

    private static void writeVarInt(OutputStream out, int value) throws IOException {
        while (true) {
            int temp = value & 0x7F;
            value >>>= 7;
            if (value != 0) {
                out.write(temp | 0x80);
            } else {
                out.write(temp);
                break;
            }
        }
    }

    private static void writeVarIntString(OutputStream out, String value) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        writeVarInt(out, bytes.length);
        out.write(bytes);
    }

    private static int readVarInt(InputStream in) throws IOException {
        int value = 0;
        int position = 0;
        int currentByte;
        do {
            currentByte = in.read();
            if (currentByte < 0) {
                throw new IOException("스트림이 예상보다 일찍 끝남");
            }
            value |= (currentByte & 0x7F) << position;
            position += 7;
        } while ((currentByte & 0x80) != 0);
        return value;
    }

    /** 이미 읽어온 바이트 배열(패킷 본문)에서 VarInt/문자열을 순서대로 꺼내기 위한 보조 클래스. */
    private static final class ByteArrayInputStreamWithVarInt {
        private final byte[] data;
        private int pos = 0;

        ByteArrayInputStreamWithVarInt(byte[] data) {
            this.data = data;
        }

        int readVarInt() {
            int value = 0;
            int position = 0;
            int currentByte;
            do {
                currentByte = data[pos++] & 0xFF;
                value |= (currentByte & 0x7F) << position;
                position += 7;
            } while ((currentByte & 0x80) != 0);
            return value;
        }

        String readVarIntString() {
            int length = readVarInt();
            String s = new String(data, pos, length, StandardCharsets.UTF_8);
            pos += length;
            return s;
        }
    }
}
