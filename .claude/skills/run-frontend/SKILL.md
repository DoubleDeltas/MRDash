---
name: run-frontend
description: Launch the MRD backend + frontend dev servers and drive the frontend in a real headless browser (Playwright) to screenshot pages and check console errors. Use whenever asked to run, start, screenshot, or verify the MRD frontend works in an actual browser instead of just reading the code.
---

# Running and verifying the MRD frontend

This project is a Vite + React SPA (`frontend/`) backed by an Express API
(`backend/`). To actually see a change working you need both processes up,
then a headless browser driven against the frontend — `frontend/package.json`
already has `playwright` as a devDependency with Chromium pre-installed, so
no per-run `npm install`/browser download is needed.

## 1. Start the backend (port 3000)

```bash
cd backend && pnpm run dev &
timeout 30 bash -c 'until curl -sf http://localhost:3000/health >/dev/null; do sleep 1; done'
```

Requires the real MySQL (`DATABASE_URL`) and Redis (`SESSION_REDIS_URL`) in
`backend/.env` to be reachable — check with
`Test-NetConnection -ComputerName <host> -Port <port>` first. If they're not
reachable, ask the user to turn them on; there's no local/mocked substitute
configured for this project.

## 2. Start the frontend (port 5173)

```bash
cd frontend && pnpm run dev &
timeout 30 bash -c 'until curl -sf http://localhost:5173/ >/dev/null; do sleep 1; done'
```

CORS is already configured backend-side (`FRONTEND_URL` in `backend/.env`,
`cors()` in `backend/src/app.js`) for `http://localhost:5173` with
credentials, so cookie-based session auth works cross-port out of the box.

## 3. Drive it and screenshot

```bash
cd frontend && node scripts/verify-app.mjs [path1] [path2] ...
```

- No args → defaults to `/ /login /minecraft`.
- Screenshots land in `frontend/scripts/screenshots/<path>.png` (gitignored).
- Prints a JSON summary of `{ results, consoleErrors }` and exits 1 if any
  console error was captured.
- **Git Bash mangles a bare `/` argument** into a Windows path (e.g. turns
  it into `D:/Git/`) before Node ever sees it — that breaks the URL and
  produces unrelated `pageerror`s. Don't pass `/` explicitly; just run with
  no args (it defaults to `/` anyway), or quote/prefix paths that start with
  `/` if you must pass them from this shell.
- Read the screenshot files with the Read tool afterward — **look at them**,
  don't just trust that the script exited 0.

To check a specific new interaction (a click, a form submit, a different
route) rather than just navigation, copy `scripts/verify-app.mjs` and extend
it — it's a plain Playwright script (`chromium.launch()` → `page.goto` →
`page.screenshot`), not a black box. The pattern: `goto` → `waitForTimeout` or
`waitFor` the element you need → act (`click`/`fill`) → `screenshot` →
read `consoleErrors`.

## Known gotchas (all hit during initial setup)

- **Expected console noise**: every page fires `GET /api/auth/me`, which
  401s when nobody's logged in (React 18 StrictMode double-invokes the
  effect in dev, so you'll see it twice per page). That's normal, not a
  bug — only worry about *other* console errors.
- **Leftover dev-server processes across turns**: background `pnpm run dev`
  processes from a previous turn can outlive the harness's task-tracking, so
  a fresh `pnpm run dev` may fail with `EADDRINUSE` — and they can pile up
  silently across *many* turns since killing the port's current child only
  removes the newest layer. Find the real owner before killing anything:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
  Get-CimInstance Win32_Process -Filter "ProcessId = <pid>" | Select-Object ProcessId, ParentProcessId, CommandLine
  ```
  `pnpm run dev` for this backend is a 4-deep chain (`sh.exe` → `node
  pnpm.cjs` → `cmd.exe /c nodemon` → `node src/index.js`). Killing just the
  leaf (`Stop-Process -Id <pid>`) is **not enough** — nodemon (the surviving
  parent) will itself respawn a brand-new child within ~1s and re-grab the
  port, so a `Stop-Process` on the leaf followed immediately by a new
  `pnpm run dev` can still race into `EADDRINUSE`. Walk up via
  `ParentProcessId` to the root shell, confirm its `CommandLine` is actually
  this project's `pnpm run dev` (not frontend's), then
  `taskkill /F /T /PID <root_pid>` to take out the whole tree at once. Never
  kill by name (`Stop-Process -Name node`) — that hits unrelated Node
  processes on the machine and gets blocked by the safety classifier
  anyway. After clearing, confirm with `Get-NetTCPConnection -LocalPort 3000`
  (should error/empty) before starting a fresh one.
- **Prisma + Windows file lock**: `npx prisma migrate dev` / `generate`
  fails with `EPERM: ... rename ... query_engine-windows.dll.node` if a
  running backend process still has the engine binary loaded. Stop the
  backend's `node src/index.js` (find via the port-owner steps above)
  before migrating, then restart it afterward — nodemon won't reload a
  natively-locked binary on its own.
- **PowerShell mangles Korean (UTF-8) request bodies** sent via
  `Invoke-WebRequest`/`curl` in this shell. If a test needs Korean text,
  send it from Node instead: `node -e "fetch(url, {method:'POST', body: JSON.stringify({name:'한글'})})"`.
- **Test data**: `/api/servers` POST/DELETE hit the real shared MySQL DB
  (no test DB). Clean up anything you create with a narrowly-scoped
  `deleteMany({ where: { id: ... } })` — never an unscoped `deleteMany({})`.

## When this skill goes stale

If a future change moves the dev ports, removes `scripts/verify-app.mjs`, or
the CORS/env setup changes, update this file rather than rediscovering the
setup from scratch.
