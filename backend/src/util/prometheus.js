// 호스트 Prometheus HTTP API 클라이언트 (PROMETHEUS_URL 예: http://prometheus:9090)
const REQUEST_TIMEOUT_MS = 5000;

export const isPrometheusConfigured = () => Boolean(process.env.PROMETHEUS_URL);

// /api/v1/query_range 호출 → [{ metric, values: [[unixSec, "value"], ...] }]
export const queryRange = async (query, { start, end, step }) => {
  const baseUrl = process.env.PROMETHEUS_URL;
  if (!baseUrl) throw new Error('PROMETHEUS_URL is not set');

  const url = new URL('/api/v1/query_range', baseUrl);
  url.searchParams.set('query', query);
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  url.searchParams.set('step', String(step));

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Prometheus responded ${res.status}`);

  const body = await res.json();
  if (body.status !== 'success') throw new Error(`Prometheus query failed: ${body.error}`);
  return body.data.result;
};
