package com.doubledeltas.mrdbridge.os;

import java.util.List;

/**
 * 대상 프로세스의 콘솔에 붙어서 출력을 읽고 입력을 주입하는 인터페이스.
 * 지금은 Windows(AttachConsole 등) 구현만 있고, 나중에 Linux/Mac은 PTY 기반으로
 * 구현을 추가할 수 있도록 메서드는 OS 무관하게 유지한다.
 */
public interface ConsoleBridge extends AutoCloseable {
    /** 대상 프로세스의 콘솔에 붙는다. 실패하면 예외를 던진다. */
    void attach(long pid) throws Exception;

    /** 마지막 호출 이후 새로 출력된 줄들을 반환한다 (없으면 빈 리스트). */
    List<String> pollNewOutput() throws Exception;

    /** 콘솔에 한 줄을 입력한 것처럼 주입한다 (Enter 포함). */
    void writeInput(String command) throws Exception;

    /** 콘솔에서 떨어진다. */
    @Override
    void close();
}
