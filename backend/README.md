# MRDash Backend

REST API 백엔드 (Express + Prisma + MySQL)

## 프로젝트 구조

```
src/
├── index.js                   # 메인 서버 진입점
├── app.js                     # Express 앱 설정 (미들웨어, 세션, 라우트)
├── config/
│   ├── prisma.js              # Prisma 클라이언트 초기화
│   └── session-redis.js       # 세션 스토어용 Redis 클라이언트
├── controllers/
│   ├── MinecraftServerController.js
│   └── user.js
├── passport/
│   ├── index.js                       # Passport 초기화
│   └── strategies/
│       ├── local-strategy.js          # 로컬(ID/PW) 인증 전략
│       └── discord-strategy.js        # Discord OAuth2 인증 전략
├── routes/
│   ├── index.js              # 라우트 진입점
│   ├── minecraftServerRoutes.js
│   └── auth/
│       ├── index.js
│       ├── local.js
│       └── discord.js
└── util/
    └── bcrypt.js

prisma/
├── schema.prisma         # Prisma 데이터 모델 정의
└── migrations/           # 마이그레이션 히스토리
```

## 🚀 시작하기

### 1단계: 의존성 설치
```bash
pnpm install
# 또는
npm install
```

### 2단계: 환경 변수 설정
`.env` 파일에 `DATABASE_URL`(MySQL), `SESSION_REDIS_URL`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_CLIENT_CALLBACK` 등을 설정합니다.

### 3단계: 데이터베이스 마이그레이션
```bash
npx prisma migrate dev
```

### 4단계: 개발 서버 시작
```bash
pnpm run dev
# 또는
npm run dev
```

## 📚 API 엔드포인트

- `GET /health` - 헬스 체크
- `GET /api` - API 정보
- `GET /api/servers` - 전체 Minecraft 서버 목록
- `GET /api/servers/:id` - 단일 서버 조회
- `POST /api/servers` - 새 서버 생성
- `PUT /api/servers/:id` - 서버 정보 수정
- `DELETE /api/servers/:id` - 서버 삭제
- `POST /api/auth/local/register` - 로컬 회원가입 (`ALLOW_LOCAL_AUTH=true`일 때만 활성화)
- `POST /api/auth/local/` - 로컬 로그인
- `GET /api/auth/discord` - Discord OAuth2 인증 시작
- `GET /api/auth/discord/redirect` - Discord OAuth2 콜백

## 🗄️ 데이터베이스 모델

### User
```prisma
enum AuthProvider {
  LOCAL
  DISCORD
}

model User {
  id              String        @id @default(uuid())
  provider        AuthProvider
  providerId      String
  localPwHash     String?
  avatarUrl       String?
  isMrdAuthorized Boolean       @default(false)

  @@unique([provider, providerId], name: "provider_user_unique")
}
```

### MinecraftServer
```prisma
enum MinecraftPlatform {
  VANILLA
  FORGE
  NEOFORGE
  FABRIC
  QUILT
}

model MinecraftServer {
  id          Int               @id @default(autoincrement())
  name        String
  description String?
  mcVersion   String
  mcPlatform  MinecraftPlatform
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
}
```

`MinecraftPlatform`은 별도 테이블이 아니라 `MinecraftServer`에 속한 enum 필드입니다.

## 🔧 주요 명령어

- `pnpm install` - 의존성 설치
- `pnpm run dev` - 개발 서버 시작
- `pnpm start` - 프로덕션 서버 시작
- `pnpm prisma:generate` - Prisma 클라이언트 생성
- `pnpm prisma:migrate` - 마이그레이션 실행
- `pnpm prisma:studio` - Prisma Studio (GUI) 실행

## 📦 기술 스택

- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: MySQL
- **Session Store**: Redis
- **Auth**: Passport (Local, Discord OAuth2)
- **Package Manager**: pnpm
