package com.doubledeltas.mrdbridge.util;

import java.io.File;
import java.net.URISyntaxException;

/** 지금 실행 중인 jar 파일 자신의 경로/디렉터리를 구한다. */
public final class JarLocator {

    private JarLocator() {
    }

    public static File currentJarFile() {
        try {
            return new File(JarLocator.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException("실행 중인 jar 경로를 찾을 수 없습니다", e);
        }
    }

    public static File currentDirectory() {
        return currentJarFile().getParentFile();
    }
}
