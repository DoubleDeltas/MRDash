# Grafana (MRDash 모니터링 그래프·경보 엔진)

MRDash의 모니터링 그래프(`/monitoring`, `/monitoring/:serverId`)는 MRDash 전용 Grafana 컨테이너의 패널을 iframe으로 보여주고,
서버별 모니터링 알림(`/settings/alert/:serverId`)도 Grafana Alerting으로 동작한다. 인증은 MRDash 로그인 하나만 쓴다.

```
브라우저 ──(MRDash 세션 쿠키)──▶ 공용 nginx /api/ ──▶ mrdash-backend /api/grafana/*
                                                      │ 로그인 확인 후 X-WEBAUTH-USER: mrdash-<userId>
                                                      ▼ (mrd-grafana-net, 출발 IP 172.30.50.10)
                                              mrdash-grafana:3000 (auth.proxy)
```

- 공용 nginx는 이미 `/api/`를 백엔드로 넘기므로 nginx 설정은 바꿀 필요가 없다.
- Grafana 포트는 호스트에 공개하지 않는다. 백엔드 외의 경로로 Grafana에 닿으면 누구든 `X-WEBAUTH-USER` 헤더를 꾸며 로그인할 수 있다.

## 1. Grafana 컨테이너 (MRDash docker-compose의 `grafana` 서비스)

- 이미지 `grafana/grafana:13.3.0`, 컨테이너 이름 `grafana`.
- **네트워크**
  - `mrd-grafana-net`(외부 네트워크, 고정 IP): Grafana `172.30.50.2` + 별칭 `mrdash-grafana`, backend `172.30.50.10`.
  - `ddeltas-net`: 외부 compose의 Prometheus에 닿기 위해.
  - backend는 반드시 **`mrdash-grafana`** 로 접속한다 (`GRAFANA_URL=http://mrdash-grafana:3000`, 코드 기본값도 같음).
    컨테이너 이름 `grafana`는 `ddeltas-net`에서도 잡혀 다른 IP로 나갈 수 있어 auth.proxy가 거부한다.
    같은 이유로 container_name을 `mrdash-grafana`로 두지 않는다.
- **주요 환경변수**: `GF_SERVER_ROOT_URL=https://dash.ddeltas.kro.kr/api/grafana/`, `GF_SERVER_SERVE_FROM_SUB_PATH=true`,
  `GF_SECURITY_ALLOW_EMBEDDING=true`, `GF_AUTH_PROXY_*`(헤더 `X-WEBAUTH-USER`, `WHITELIST=172.30.50.10`, 자동 가입 Viewer),
  로그인 폼·기본 인증·익명 비활성, `GF_LIVE_MAX_CONNECTIONS=0`. 관리자 비밀번호는 `grafana/.env`로 분리.
- **볼륨**: `./grafana/data`(DB·경보 상태), 그리고 이 저장소 `grafana/`와 버전을 맞추는 폴더들 —
  `provisioning/dashboards` → `/etc/grafana/provisioning/dashboards`, `provisioning/datasources` → `/etc/grafana/provisioning/datasources`,
  `dashboards` → `/var/lib/grafana/dashboards/mrdash` (폴더 단위로 마운트해야 파일 교체가 컨테이너에 반영된다).
- MRDash 사용자는 처음 접속할 때 `mrdash-<사용자 id>` 이름의 Viewer 계정으로 자동 생성된다.
- Grafana 컨테이너는 `discord.com`으로 나갈 수 있어야 한다 (웹후크 알림).

## 2. Prometheus 데이터 소스

- **MRDash Prometheus (기본)**: `provisioning/datasources/`에 기본 Prometheus 데이터 소스를 **uid `mrdash-host`** 로 등록한다
  (예시: `provisioning/datasources/mrdash-host.yaml.example` — 라이브 서버에서 `.yaml`로 복사해 url을 맞춘다).
  대시보드는 `datasource` 변수가 기본 데이터 소스를 고른다. 경보 규칙은 데이터 소스를 uid로 직접 지정하는데,
  backend가 Grafana에 **실제로 있는** 것 중에서 `GRAFANA_DEFAULT_DATASOURCE_UID` → `mrdash-host` → 기본(isDefault) Prometheus 순으로 고른다.
  셋 다 없으면 MRDash Prometheus 서버의 규칙은 만들지 않고 로그를 남긴다 (없는 uid로 만들면 "data source not found" 평가 오류로 경보가 울린다).
- **외부 Prometheus**: 서버 설정에서 외부 Prometheus를 고른 서버는 MRDash 백엔드가 Grafana API로
  `mrdash-server-<서버 id>` 데이터 소스를 자동으로 만들고/고치고/지운다 (`backend/src/util/grafanaDatasources.js`).
  - 저장·연결 해제·서버 삭제 직후 반영되고, 백엔드 시작 시와 10분마다 전체를 다시 맞춘다 (Grafana가 꺼져 있던 동안의 변경도 이때 반영).
  - 인증 토큰은 데이터 소스의 `Authorization: Bearer <토큰>` 헤더로 들어가고 Grafana가 암호화해서 보관한다.
  - Grafana가 Prometheus에 직접 접속하므로, 외부 Prometheus URL은 **Grafana 컨테이너에서** 닿을 수 있어야 한다.
  - 서버 모니터링 페이지는 대시보드 주소에 `var-datasource=mrdash-server-<id>`를 붙여 그 데이터 소스로 그린다.

### 서비스 계정 토큰 (`GRAFANA_SERVICE_ACCOUNT_TOKEN`)

데이터 소스와 경보 설정을 관리하려면 **Admin** 역할의 서비스 계정 토큰이 필요하다. 로그인 화면과 기본 인증을 끈 상태라서,
처음 한 번만 기본 인증을 잠시 켜고 Grafana 관리자 계정으로 만든다.

```bash
# 1) GF_AUTH_BASIC_ENABLED=true 로 잠시 바꿔 Grafana 재시작
# 2) 같은 네트워크의 컨테이너 안에서 (예: docker exec -it mrdash-backend sh)
curl -s -u admin:<관리자 비밀번호> -H 'Content-Type: application/json'   -d '{"name":"mrdash-backend","role":"Admin"}' http://mrdash-grafana:3000/api/serviceaccounts
# → 응답의 id로 토큰 발급
curl -s -u admin:<관리자 비밀번호> -H 'Content-Type: application/json'   -d '{"name":"mrdash-backend"}' http://mrdash-grafana:3000/api/serviceaccounts/<id>/tokens
# 3) 응답의 key를 서버 .env의 GRAFANA_SERVICE_ACCOUNT_TOKEN에 넣고, GF_AUTH_BASIC_ENABLED=false 로 되돌린다
```

토큰이 없으면 외부 Prometheus 데이터 소스와 경보 설정을 만들지 않는다 (외부 Prometheus 서버 그래프는 "데이터 소스 없음", 알림은 동작하지 않음).

> **보안**: Grafana 무료 버전에는 데이터 소스별 열람 권한이 없다. MRDash에 로그인한 사용자는 Grafana를 통해
> 등록된 모든 데이터 소스(호스트 지표, 다른 서버의 외부 Prometheus 포함)를 조회할 수 있다.

## 3. 대시보드

| 파일 | UID | 쓰는 곳 | 변수 |
|---|---|---|---|
| `dashboards/mrdash-host.json` | `mrdash-host` | `/monitoring` | `datasource` |
| `dashboards/mrdash-minecraft.json` | `mrdash-minecraft` | `/monitoring/:serverId` | `datasource`, `job`, `instance` |

프로비저닝(`provisioning/dashboards/mrdash.yaml`)으로 불러오며 Grafana UI에서는 수정할 수 없다(`allowUiUpdates: false`).
패널을 바꾸려면 JSON을 고치고 컨테이너가 다시 읽게 둔다(60초마다 확인).
패널 id는 `frontend/src/components/grafana.js`의 값과 맞아야 한다.

## 4. 모니터링 알림 (Grafana Alerting)

서버별 알림 설정(`/settings/alert/:serverId`)을 저장하면 backend가 Grafana에 경보 설정을 맞춘다 (`backend/src/util/grafanaAlerts.js`).
저장·데이터 소스 연결/해제·서버 이름 변경·서버 삭제 직후, 그리고 backend 시작 시와 10분마다 전체를 다시 맞춘다.

| Grafana 리소스 | MRDash에서 만드는 것 |
|---|---|
| 폴더 | `mrdash-alerts` ("MRDash 알림") |
| 규칙 그룹 | 서버마다 `server-<id>`, 기본 30초마다 평가 (`GRAFANA_ALERT_EVALUATION_INTERVAL`) |
| 경보 규칙 | 규칙마다 `mrdash-s<id>-r<n>`: A(Prometheus 조회: `<합치기>(<지표>{job, instance})`) → B(마지막 값) → C(`$B <연산> <기준값>`), 기본 **1분 이상** 계속되면 경보 (`GRAFANA_ALERT_PENDING_PERIOD`). 라벨 `mrdash_server_id=<id>` |
| 알림 대상 | 서버마다 `mrdash-server-<id>`: Discord 연동(웹후크마다) + Webhook 연동(봇 채널이 있을 때) |
| 알림 경로 | `mrdash_server_id=<id>` → `mrdash-server-<id>`, 기본 **4시간마다** 반복 (`GRAFANA_ALERT_REPEAT_INTERVAL`). MRDash가 만든 경로만 바꾸고 나머지 경로·기본 수신자는 그대로 둔다 |

- **데이터 없음**: 서버가 꺼지면 `mc_*` 지표는 사라지므로 그 규칙들은 "데이터 없음"을 정상으로 보고, `up` 규칙만 데이터 없음을 경보로 본다.
- **"테트라" 봇 채널**: Grafana Webhook 연동 → `http://mrdash-backend:3000/internal/grafana/alerts`
  (`Authorization: Bearer <GRAFANA_ALERT_WEBHOOK_SECRET>`) → backend가 `DISCORD_BOT_TOKEN`으로 선택한 채널에 embed를 보낸다.
  `GRAFANA_ALERT_WEBHOOK_SECRET`이 비어 있으면 봇 채널 연동은 만들지 않는다.
- **API**: 기존 `/api/v1/provisioning` API를 쓴다 (Grafana 13에서 지원 중단 예정이지만 계속 동작). 호출은 `backend/src/util/grafanaApi.js`를 거친다.
- API로 만든 경보 설정은 Grafana UI에서 수정할 수 없다 (provenance). 원본은 MRDash다.
