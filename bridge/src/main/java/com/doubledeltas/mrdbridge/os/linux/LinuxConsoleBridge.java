package com.doubledeltas.mrdbridge.os.linux;

import com.doubledeltas.mrdbridge.os.ConsoleBridge;

import java.util.List;

/**
 * Linux에서 LOCAL 타입 서버를 연결하려 할 때 호출된다.
 * Linux용 콘솔 attach 구현이 없으므로 명확한 오류를 돌려준다.
 */
public class LinuxConsoleBridge implements ConsoleBridge {

    @Override
    public void attach(long pid) throws Exception {
        throw new UnsupportedOperationException(
                "Linux에서는 LOCAL 타입 서버를 지원하지 않습니다. DOCKER 타입을 사용하세요.");
    }

    @Override
    public List<String> pollNewOutput() {
        return List.of();
    }

    @Override
    public void writeInput(String command) {}

    @Override
    public void close() {}
}
