# MRDash

마랜디 프로젝트 Discord 인증 Minecraft 서버 대시보드.  
GitHub 저장소: `https://github.com/DoubleDeltas/MRD`

## 구조

```
Mrdash/
├── frontend/   # React + Vite SPA
├── backend/    # Node.js + Express + Prisma API 서버
└── bridge/     # Java Swing 데스크톱 앱 (Minecraft 서버 ↔ 백엔드 브리지)
```

---

## Frontend / Backend 배포

### 흐름

`master` 브랜치에 push → GitHub Actions(`.github/workflows/docker-publish.yml`) 자동 실행 → GHCR에 이미지 push → 서버에서 pull & 재시작

### 코드 수정 후 배포

```bash
git add <파일>
git commit -m "..."
git push origin master
# CI 완료 후 서버에서:
docker compose pull && docker compose up -d
```

### 빌드 인자 (frontend)

워크플로우에 하드코딩돼 있음 (`.github/workflows/docker-publish.yml`):

| 인자 | 값 |
|---|----|
| `VITE_API_BASE_URL` | `https://dash.ddeltas.kro.kr/api` |
| `VITE_BASE_PATH` | `/` |

`VITE_URL_MZPEDIA`는 **런타임** 환경변수 — 서버 `docker-compose.yml`의 `environment`에서 주입, 이미지 재빌드 불필요.

### 런타임 환경변수 (frontend)

컨테이너 시작 시 `docker-entrypoint.sh`가 `envsubst`로 `/env.js`를 생성.  
`docker-compose.yml`의 `environment` 섹션에서 설정:

```yaml
frontend:
  environment:
    VITE_URL_MZPEDIA: "https://wiki.ddeltas.kro.kr/index.php/%EB%8C%80%EB%AC%B8"
```

### 환경변수 (backend)

서버의 `.env` 파일로 주입 (`env_file: .env`). `.env.example` 참고.  
주요 항목: `DATABASE_URL`, `SESSION_REDIS_URL`, `DISCORD_CLIENT_ID/SECRET/CALLBACK`, `FRONTEND_URL`, `SESSION_SECRET`

### 서버 인프라

- 도메인: `dash.ddeltas.kro.kr`
- 공용 nginx(외부)가 `mrdash-frontend:80`으로 직접 프록시
- 공용 nginx에 `/api/` → `mrdash-backend:3000/api/`, `/ws/` → `mrdash-backend:3000/ws/` 라우팅 필요
- DB: 외부 MySQL (`192.168.55.80`), 스키마 `mrd_prod`
- Redis: 외부 Redis (`192.168.55.80`), logical DB 1
- 컨테이너명: `mrdash-frontend`, `mrdash-backend` (공용 nginx가 이 이름으로 참조)

---

## Bridge 빌드

`bridge/`는 독립적인 Java 17 Gradle 프로젝트.

### 요구사항

- Java 17+
- 인터넷 연결 (첫 빌드 시 Gradle 8.8 및 의존성 자동 다운로드)

### 빌드 명령

```bat
cd bridge

# fat JAR만
gradlew shadowJar
# 출력: build/libs/mrd-bridge.jar

# Windows EXE (두 종류)
gradlew createExe      # GUI 더블클릭용 → build/launch4j/MRDash-Bridge.exe
gradlew createCliExe   # CLI 터미널용  → build/launch4j/mrd-bridge.exe
```

### CLI 모드

JAR 또는 `mrd-bridge.exe`(콘솔 헤더)에서 사용:

```bat
mrd-bridge help
mrd-bridge run                              # 헤드리스 (활성 서버 모두 연결)
mrd-bridge config url <url>                 # 백엔드 URL 변경
mrd-bridge server list
mrd-bridge server add local <포트> <key>
mrd-bridge server add docker <id> <key>
mrd-bridge server remove/enable/disable <번호>
mrd-bridge server log-path <번호> [경로]
```

### Bridge Docker 실행

Linux 서버에서 `run` 명령을 Docker 컨테이너로 실행할 수 있다 (DOCKER 타입 서버만 지원).  
설정은 `mrd-bridge.dat` 파일을 볼륨 마운트로 주입한다 — GUI나 CLI로 미리 구성한 파일을 그대로 재사용.

#### 1. .dat 파일 준비

Windows GUI 또는 CLI로 서버를 추가·저장하면 `mrd-bridge.dat`이 생성된다.  
CLI로 준비하는 경우:

```bat
mrd-bridge server add docker mc-server-1 <api-key-1>
mrd-bridge server add docker mc-server-2 <api-key-2>
mrd-bridge server list   # 확인
```

#### 2. 이미지 빌드 및 실행

```bash
# bridge/ 디렉터리에서 이미지 빌드
docker build -t mrd-bridge ./bridge

# 실행 (.dat 마운트 + Docker 소켓 마운트)
docker run -d \
  -v /host/path/mrd-bridge.dat:/app/mrd-bridge.dat:ro \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --restart unless-stopped \
  mrd-bridge
```

`docker-compose.yml`에 추가할 경우:

```yaml
mrd-bridge:
  build: ./bridge
  volumes:
    - ./mrd-bridge.dat:/app/mrd-bridge.dat:ro
    - /var/run/docker.sock:/var/run/docker.sock
  restart: unless-stopped
```

`.dat`의 모든 enabled 서버에 동시 연결한다. 서버를 추가/변경하려면 `.dat`을 수정 후 컨테이너를 재시작.

### 설정 파일

브리지 실행 시 `mrd-bridge.dat` (JAR/EXE와 같은 폴더)를 자동 생성.  
`backend.wsUrl` 등 설정값 저장. GUI의 [설정] 버튼 또는 CLI `config`/`server` 명령으로 수정 가능.
