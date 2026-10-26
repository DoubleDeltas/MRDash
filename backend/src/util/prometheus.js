// Prometheus HTTP API 클라이언트.
// 기본은 호스트 Prometheus(PROMETHEUS_URL 예: http://prometheus:9090)이고,
// 서버별로 외부 Prometheus를 쓰면 baseUrl/token을 넘긴다.
const REQUEST_TIMEOUT_MS = 5000;

export const isPrometheusConfigured = () => Boolean(process.env.PROMETHEUS_URL);

// 연결 테스트에서 원인을 구분할 수 있게 HTTP 상태를 실어 던진다
export class PrometheusHttpError extends Error {
  constructor(status) {
    super(`Prometheus responded ${status}`);
    this.status = status;
  }
}

const request = async (path, params, { baseUrl = process.env.PROMETHEUS_URL, token } = {}) => {
  if (!baseUrl) throw new Error('PROMETHEUS_URL is not set');

  // new URL('/api/...', base)는 base의 경로(예: https://host/prometheus)를 버리므로 직접 이어 붙인다
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new PrometheusHttpError(res.status);

  const body = await res.json();
  if (body.status !== 'success') throw new Error(`Prometheus query failed: ${body.error}`);
  return body.data.result;
};

// /api/v1/query_range 호출 → [{ metric, values: [[unixSec, "value"], ...] }]
export const queryRange = (query, { start, end, step }, source) =>
  request('/api/v1/query_range', { query, start, end, step }, source);

// /api/v1/query 호출 → [{ metric, value: [unixSec, "value"] }]
export const queryInstant = (query, source) => request('/api/v1/query', { query }, source);

// PromQL 라벨 값 문자열 리터럴용 이스케이프
export const escapeLabelValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// job(필수)/instance(선택)로 PromQL 라벨 셀렉터 내용을 만든다 (중괄호 제외)
export const buildSelector = (job, instance) => [
  `job="${escapeLabelValue(job)}"`,
  instance && `instance="${escapeLabelValue(instance)}"`,
].filter(Boolean).join(',');
