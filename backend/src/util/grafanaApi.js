// MRDash 전용 Grafana에 대한 모든 서버 측 호출을 여기로 모은다.
// Grafana 13부터 /api 경로(기존 HTTP API·/api/v1/provisioning)는 지원 중단 예정이고 /apis(app platform)로 옮겨 가는 중이다.
// 아직 "계속 쓸 수 있다"고 되어 있어 기존 API를 쓰되, 바꿔야 할 때 이 파일과 호출부만 고치면 되게 한다.

// backend는 mrd-grafana-net의 별칭(mrdash-grafana)으로만 접속해야 출발 IP가 auth.proxy whitelist(172.30.50.10)와 맞는다.
// 컨테이너 이름(grafana)은 ddeltas-net에서도 잡혀 다른 IP로 나갈 수 있다 — grafana/README.md
export const grafanaBaseUrl = () => (process.env.GRAFANA_URL || 'http://mrdash-grafana:3000').replace(/\/+$/, '');

// Admin 역할 서비스 계정 토큰 — 데이터 소스·경보 설정 관리용
export const isGrafanaApiConfigured = () => Boolean(process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN);

const REQUEST_TIMEOUT_MS = 10000;

// 404는 null로 돌려준다 (있는지 확인하는 GET·이미 지워진 DELETE에서 쓴다)
export const grafanaApi = async (method, path, body) => {
  const res = await fetch(`${grafanaBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`,
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Grafana ${method} ${path} → HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
};
