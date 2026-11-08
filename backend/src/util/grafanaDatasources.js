import { prisma } from '../config/prisma.js';

// 외부 Prometheus를 쓰는 서버마다 Grafana에 Prometheus 데이터 소스를 하나씩 만들어 둔다.
// 서버 모니터링 페이지는 대시보드 주소에 var-datasource=<uid>를 붙여 그 데이터 소스로 그린다.
// (MRDash Prometheus를 쓰는 서버는 Grafana의 기본 Prometheus 데이터 소스를 같이 쓰므로 만들지 않는다)
//
// Grafana API는 GRAFANA_SERVICE_ACCOUNT_TOKEN(Admin 역할 서비스 계정)으로 호출한다 — grafana/README.md
const UID_PREFIX = 'mrdash-server-';
const REQUEST_TIMEOUT_MS = 5000;
const RESYNC_INTERVAL_MS = 10 * 60 * 1000;

// 이름도 uid와 같게 둔다 — 대시보드 datasource 변수는 버전에 따라 주소의 값을 이름으로도 uid로도 읽는다
export const serverDatasourceUid = (serverId) => `${UID_PREFIX}${serverId}`;

const isConfigured = () => Boolean(process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN);

const grafanaApi = async (method, path, body) => {
  const res = await fetch(`${(process.env.GRAFANA_URL || 'http://grafana:3000').replace(/\/+$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN}`,
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Grafana ${method} ${path} → HTTP ${res.status}: ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
};

// source: { serverId, url, token } — PrometheusDataSource의 외부 Prometheus 설정
const datasourceFor = ({ serverId, url, token }) => {
  const uid = serverDatasourceUid(serverId);
  return {
    uid,
    name: uid,
    type: 'prometheus',
    access: 'proxy',
    url,
    // 토큰이 있으면 Grafana가 Prometheus에 Authorization 헤더로 붙인다 (토큰은 Grafana가 암호화해서 보관)
    jsonData: {
      timeInterval: '15s',
      ...(token && { httpHeaderName1: 'Authorization' }),
    },
    secureJsonData: token ? { httpHeaderValue1: `Bearer ${token}` } : {},
  };
};

const upsert = async (source) => {
  const body = datasourceFor(source);
  const existing = await grafanaApi('GET', `/api/datasources/uid/${body.uid}`);
  if (existing) {
    await grafanaApi('PUT', `/api/datasources/uid/${body.uid}`, body);
  } else {
    await grafanaApi('POST', '/api/datasources', body);
  }
};

const remove = (serverId) => grafanaApi('DELETE', `/api/datasources/uid/${serverDatasourceUid(serverId)}`);

// 외부 Prometheus(url 있음)를 쓰는 Prometheus 데이터 소스만 Grafana 데이터 소스가 필요하다
const EXTERNAL_PROMETHEUS_SELECT = { serverId: true, prometheus: { select: { url: true, token: true } } };

const toSource = (dataSource) => (dataSource?.prometheus?.url
  ? { serverId: dataSource.serverId, url: dataSource.prometheus.url, token: dataSource.prometheus.token }
  : null);

// 서버 하나의 설정을 Grafana에 반영 (저장·해제·삭제 직후). 실패해도 MRDash 저장은 그대로 두고, 주기적 재동기화가 다시 맞춘다.
export const syncServerDatasource = async (serverId) => {
  if (!isConfigured()) return;
  try {
    const source = toSource(await prisma.monitoringDataSource.findFirst({
      where: { serverId, type: 'PROMETHEUS' },
      select: EXTERNAL_PROMETHEUS_SELECT,
    }));
    if (source) {
      await upsert(source);
    } else {
      await remove(serverId);
    }
  } catch (error) {
    console.error(`[grafana] server ${serverId} datasource sync failed:`, error.message);
  }
};

// 전체 동기화 — 필요한 데이터 소스는 만들고/고치고, 더 이상 필요 없는 mrdash-server-* 는 지운다
export const syncAllServerDatasources = async () => {
  if (!isConfigured()) return;
  try {
    const dataSources = await prisma.monitoringDataSource.findMany({
      where: { type: 'PROMETHEUS' },
      select: EXTERNAL_PROMETHEUS_SELECT,
    });
    const wanted = dataSources.map(toSource).filter(Boolean);
    for (const source of wanted) await upsert(source);

    const wantedUids = new Set(wanted.map((s) => serverDatasourceUid(s.serverId)));
    const existing = (await grafanaApi('GET', '/api/datasources')) ?? [];
    for (const ds of existing) {
      if (ds.uid?.startsWith(UID_PREFIX) && !wantedUids.has(ds.uid)) {
        await grafanaApi('DELETE', `/api/datasources/uid/${ds.uid}`);
      }
    }
  } catch (error) {
    console.error('[grafana] datasource resync failed:', error.message);
  }
};

export const startDatasourceResync = () => {
  if (!isConfigured()) {
    console.log('ℹ️ GRAFANA_SERVICE_ACCOUNT_TOKEN not set — external Prometheus datasources are not synced to Grafana');
    return;
  }
  syncAllServerDatasources();
  setInterval(syncAllServerDatasources, RESYNC_INTERVAL_MS);
};
