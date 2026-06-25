package com.doubledeltas.mrdbridge.os.win;

import com.sun.jna.Native;
import com.sun.jna.Structure;
import com.sun.jna.platform.win32.Kernel32;
import com.sun.jna.platform.win32.WinNT;
import com.sun.jna.platform.win32.Wincon;
import com.sun.jna.ptr.IntByReference;
import com.sun.jna.win32.StdCallLibrary;
import com.doubledeltas.mrdbridge.os.ConsoleBridge;

import java.util.ArrayList;
import java.util.List;

/**
 * Win32 콘솔 가로채기로 대상 프로세스의 콘솔에 붙어서 출력을 읽고 입력을 주입한다.
 *
 * 알려진 한계: 콘솔 화면 버퍼는 고정 높이라서, 버퍼가 다 차서 스크롤된 뒤에는
 * 화면에서 밀려난 옛 줄을 다시 가져올 수 없다. 또한 스크롤이 진행되는 동안
 * (커서가 맨 아래 줄에 고정된 채로 여러 줄이 출력되는 상황) 폴링 간격보다
 * 빠르게 찍히는 줄은 일부 놓칠 수 있다 — 이건 이 접근 방식 자체의 한계로 받아들이기로 했다.
 */
public class WindowsConsoleBridge implements ConsoleBridge {

    /** ReadConsoleOutputCharacterW는 COORD를 값으로(by value) 받는다 — jna-platform의 Wincon.COORD는 참조용이라 따로 ByValue 버전이 필요하다. */
    public static class CoordByValue extends Wincon.COORD implements Structure.ByValue {
    }

    /** Wincon에는 없는 콘솔 함수들을 직접 선언한다. */
    public interface ExtraKernel32 extends StdCallLibrary {
        ExtraKernel32 INSTANCE = Native.load("kernel32", ExtraKernel32.class);

        boolean ReadConsoleOutputCharacterW(WinNT.HANDLE hConsoleOutput, char[] lpCharacter, int nLength,
                                             CoordByValue dwReadCoord, IntByReference lpNumberOfCharsRead);

        boolean WriteConsoleInputW(WinNT.HANDLE hConsoleInput, Wincon.INPUT_RECORD[] lpBuffer, int nLength,
                                    IntByReference lpNumberOfEventsWritten);
    }

    private boolean attached = false;
    private int lastCursorRow = -1;
    private String lastBottomRowText = null;
    private WinNT.HANDLE consoleOut;
    private WinNT.HANDLE consoleIn;

    @Override
    public void attach(long pid) throws Exception {
        Kernel32.INSTANCE.FreeConsole();
        boolean ok = Kernel32.INSTANCE.AttachConsole((int) pid);
        if (!ok) {
            throw new IllegalStateException(
                    "AttachConsole 실패 (PID=" + pid + "), GetLastError=" + Kernel32.INSTANCE.GetLastError());
        }
        attached = true;

        // 이 프로세스 자신의 표준 입출력은 (watcher처럼 파이프로 리다이렉트된 경우) 콘솔과
        // 무관하므로, GetStdHandle 대신 CONOUT$/CONIN$로 "지금 attach한 콘솔"의 진짜 버퍼 핸들을 연다.
        consoleOut = Kernel32.INSTANCE.CreateFile("CONOUT$",
                WinNT.GENERIC_READ | WinNT.GENERIC_WRITE,
                WinNT.FILE_SHARE_READ | WinNT.FILE_SHARE_WRITE,
                null, WinNT.OPEN_EXISTING, 0, null);
        consoleIn = Kernel32.INSTANCE.CreateFile("CONIN$",
                WinNT.GENERIC_READ | WinNT.GENERIC_WRITE,
                WinNT.FILE_SHARE_READ | WinNT.FILE_SHARE_WRITE,
                null, WinNT.OPEN_EXISTING, 0, null);

        Wincon.CONSOLE_SCREEN_BUFFER_INFO info = readBufferInfo();
        // attach한 시점부터의 새 출력만 보고 싶으므로 현재 커서 위치를 기준점으로 삼는다.
        lastCursorRow = info.dwCursorPosition.Y;
        lastBottomRowText = readRow(info.dwSize.Y - 1, info.dwSize.X);
    }

    @Override
    public List<String> pollNewOutput() {
        if (!attached) {
            return List.of();
        }

        Wincon.CONSOLE_SCREEN_BUFFER_INFO info = readBufferInfo();
        int width = info.dwSize.X;
        int bottomRow = info.dwSize.Y - 1;
        int currentRow = info.dwCursorPosition.Y;

        List<String> lines = new ArrayList<>();

        if (currentRow > lastCursorRow) {
            for (int row = lastCursorRow; row < currentRow; row++) {
                lines.add(readRow(row, width));
            }
        } else if (currentRow < lastCursorRow) {
            // 화면이 클리어되었거나 예상치 못하게 줄어듦 -> 그 사이 내용은 포기하고 여기서부터 다시 추적
            lines.add(readRow(currentRow, width));
        } else if (currentRow == bottomRow) {
            // 버퍼가 꽉 차서 스크롤 중인 상태 -> 맨 아래 줄 내용 변화를 비교해서 새 줄인지 판단
            String bottomText = readRow(bottomRow, width);
            if (!bottomText.equals(lastBottomRowText)) {
                lines.add(bottomText);
            }
            lastBottomRowText = bottomText;
        }

        lastCursorRow = currentRow;
        return lines;
    }

    @Override
    public void writeInput(String command) {
        if (!attached) {
            return;
        }

        String withEnter = command + "\r";
        Wincon.INPUT_RECORD template = new Wincon.INPUT_RECORD();
        Wincon.INPUT_RECORD[] records = (Wincon.INPUT_RECORD[]) template.toArray(withEnter.length() * 2);

        int idx = 0;
        for (int i = 0; i < withEnter.length(); i++) {
            char c = withEnter.charAt(i);
            fillKeyEvent(records[idx++], c, true);
            fillKeyEvent(records[idx++], c, false);
        }

        IntByReference written = new IntByReference();
        ExtraKernel32.INSTANCE.WriteConsoleInputW(consoleIn, records, records.length, written);
    }

    @Override
    public void close() {
        if (consoleOut != null) {
            Kernel32.INSTANCE.CloseHandle(consoleOut);
            consoleOut = null;
        }
        if (consoleIn != null) {
            Kernel32.INSTANCE.CloseHandle(consoleIn);
            consoleIn = null;
        }
        if (attached) {
            Kernel32.INSTANCE.FreeConsole();
            attached = false;
        }
    }

    private void fillKeyEvent(Wincon.INPUT_RECORD record, char c, boolean down) {
        record.EventType = Wincon.INPUT_RECORD.KEY_EVENT;
        record.Event.setType("KeyEvent");
        record.Event.KeyEvent.bKeyDown = down;
        record.Event.KeyEvent.wRepeatCount = 1;
        record.Event.KeyEvent.wVirtualKeyCode = 0;
        record.Event.KeyEvent.wVirtualScanCode = 0;
        record.Event.KeyEvent.uChar = c;
        record.Event.KeyEvent.dwControlKeyState = 0;
    }

    private Wincon.CONSOLE_SCREEN_BUFFER_INFO readBufferInfo() {
        Wincon.CONSOLE_SCREEN_BUFFER_INFO info = new Wincon.CONSOLE_SCREEN_BUFFER_INFO();
        if (!Kernel32.INSTANCE.GetConsoleScreenBufferInfo(consoleOut, info)) {
            throw new IllegalStateException("GetConsoleScreenBufferInfo 실패");
        }
        return info;
    }

    private String readRow(int row, int width) {
        char[] buffer = new char[width];
        CoordByValue coord = new CoordByValue();
        coord.X = 0;
        coord.Y = (short) row;
        IntByReference read = new IntByReference();
        boolean ok = ExtraKernel32.INSTANCE.ReadConsoleOutputCharacterW(consoleOut, buffer, width, coord, read);
        if (!ok) {
            return "";
        }
        int n = Math.max(Math.min(read.getValue(), width), 0);
        return new String(buffer, 0, n).stripTrailing();
    }
}
