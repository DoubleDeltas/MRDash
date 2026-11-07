# Grafana (MRDash 모니터링 그래프 엔진)

MRDash의 모니터링 그래프(`/monitoring`, `/monitoring/:serverId`)는 같은 Docker 네트워크에 있는
외부 Grafana 컨테이너의 패널을 iframe으로 보여준다. Grafana는 **MRDash 전용**이며, 인증은 MRDash 로그인 하나만 쓴다.

```
브라우저 ──(MRDash 세션 쿠키)──▶ 공용 nginx /api/ ──▶ mrdash-backend /api/grafana/*
                                                      │ 로그인 확인 후 X-WEBAUTH-USER: mrdash-<userId>
                                                      ▼
                                              grafana:3000 (auth.proxy)
```

- 공용 nginx는 이미 `/api/`를 백엔드로 넘기므로 nginx 설정은 바꿀 필요가 없다.
- Grafana 포트는 호스트에 공개하지 않는다. 백엔드 외의 경로로 Grafana에 닿으면 누구든 `X-WEBAUTH-USER` 헤더를 꾸며 로그인할 수 있다.

## 1. Grafana 컨테이너 설정

백엔드(`mrdash-backend`)와 같은 Docker 네트워크에 붙이고, 아래 환경변수를 준다.

```yaml
grafana:
  image: grafana/grafana:<버전>
  container_name: grafana
  environment:
    # MRDash 백엔드의 /api/grafana/ 아래에서 서비스
    GF_SERVER_ROOT_URL: "https://dash.ddeltas.kro.kr/api/grafana/"
    GF_SERVER_SERVE_FROM_SUB_PATH: "true"
    # MRDash 페이지의 iframe 안에 들어가도록 허용
    GF_SECURITY_ALLOW_EMBEDDING: "true"
    # 인증: MRDash 백엔드가 붙인 X-WEBAUTH-USER 헤더만 믿는다
    GF_AUTH_PROXY_ENABLED: "true"
    GF_AUTH_PROXY_HEADER_NAME: "X-WEBAUTH-USER"
    GF_AUTH_PROXY_HEADER_PROPERTY: "username"
    GF_AUTH_PROXY_AUTO_SIGN_UP: "true"
    GF_AUTH_PROXY_WHITELIST: "<mrdash-backend 컨테이너 IP 또는 대역>"
    GF_USERS_AUTO_ASSIGN_ORG_ROLE: "Viewer"
    # Grafana 자체 로그인은 쓰지 않는다
    GF_AUTH_DISABLE_LOGIN_FORM: "true"
    GF_AUTH_BASIC_ENABLED: "false"
    GF_AUTH_ANONYMOUS_ENABLED: "false"
    # Grafana Live(WebSocket)는 쓰지 않는다 — 패널은 refresh 주기로 다시 조회한다
    GF_LIVE_MAX_CONNECTIONS: "0"
  volumes:
    - ./mrdash/grafana/provisioning/dashboards/mrdash.yaml:/etc/grafana/provisioning/dashboards/mrdash.yaml:ro
    - ./mrdash/grafana/dashboards:/var/lib/grafana/dashboards/mrdash:ro
  networks:
    - mrd-net   # 또는 mrdash-backend와 같이 붙어 있는 네트워크
```

- `GF_AUTH_PROXY_WHITELIST`: 백엔드 컨테이너에서만 오는 요청을 믿도록 IP를 지정한다. Docker IP는 재시작 시 바뀔 수 있어서,
  고정하려면 네트워크에 `ipam` 서브넷을 주고 백엔드에 `ipv4_address`를 지정한다.
- MRDash 사용자는 처음 접속할 때 `mrdash-<사용자 id>` 이름의 Viewer 계정으로 자동 생성된다.

## 2. Prometheus 데이터 소스

- **MRDash Prometheus**: Grafana에 기본 Prometheus 데이터 소스를 하나 만들어 둔다 (예: `http://prometheus:9090`).
  MRDash Prometheus를 쓰는 서버와 `/monitoring`은 대시보드의 `datasource` 변수가 이 기본 데이터 소스를 고른다.
- **외부 Prometheus**: 서버 설정에서 외부 Prometheus를 고른 서버는 MRDash 백엔드가 Grafana API로
  `mrdash-server-<서버 id>` 데이터 소스를 자동으로 만들고/고치고/지운다 (`backend/src/util/grafanaDatasources.js`).
  - 저장·연결 해제·서버 삭제 직후 반영되고, 백엔드 시작 시와 10분마다 전체를 다시 맞춘다 (Grafana가 꺼져 있던 동안의 변경도 이때 반영).
  - 인증 토큰은 데이터 소스의 `Authorization: Bearer <토큰>` 헤더로 들어가고 Grafana가 암호화해서 보관한다.
  - Grafana가 Prometheus에 직접 접속하므로, 외부 Prometheus URL은 **Grafana 컨테이너에서** 닿을 수 있어야 한다.
  - 서버 모니터링 페이지는 대시보드 주소에 `var-datasource=mrdash-server-<id>`를 붙여 그 데이터 소스로 그린다.

### 서비스 계정 토큰 (`GRAFANA_SERVICE_ACCOUNT_TOKEN`)

데이터 소스를 관리하려면 **Admin** 역할의 서비스 계정 토큰이 필요하다. 로그인 화면과 기본 인증을 끈 상태라서,
처음 한 번만 기본 인증을 잠시 켜고 Grafana 관리자 계정으로 만든다.

```bash
# 1) GF_AUTH_BASIC_ENABLED=true 로 잠시 바꿔 Grafana 재시작
# 2) 같은 네트워크의 컨테이너 안에서 (예: docker exec -it mrdash-backend sh)
curl -s -u admin:<관리자 비밀번호> -H 'Content-Type: application/json'   -d '{"name":"mrdash-backend","role":"Admin"}' http://grafana:3000/api/serviceaccounts
# → 응답의 id로 토큰 발급
curl -s -u admin:<관리자 비밀번호> -H 'Content-Type: application/json'   -d '{"name":"mrdash-backend"}' http://grafana:3000/api/serviceaccounts/<id>/tokens
# 3) 응답의 key를 서버 .env의 GRAFANA_SERVICE_ACCOUNT_TOKEN에 넣고, GF_AUTH_BASIC_ENABLED=false 로 되돌린다
```

토큰이 없으면 외부 Prometheus 데이터 소스를 만들지 않으므로, 외부 Prometheus 서버의 그래프는 "데이터 소스 없음"으로 나온다.

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
