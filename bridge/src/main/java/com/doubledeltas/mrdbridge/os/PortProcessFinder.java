package com.doubledeltas.mrdbridge.os;

import java.util.Optional;

/** 특정 포트를 LISTEN 중인 프로세스의 PID를 찾는다. OS마다 다른 구현을 둔다. */
public interface PortProcessFinder {
    Optional<Long> findPidListeningOn(int port);
}
