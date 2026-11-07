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

const datasourceFor = (server) => {
  const uid = serverDatasourceUid(server.id);
  return {
    uid,
    name: uid,
    type: 'prometheus',
    access: 'proxy',
    url: server.prometheusUrl,
    // 토큰이 있으면 Grafana가 Prometheus에 Authorization 헤더로 붙인다 (토큰은 Grafana가 암호화해서 보관)
    jsonData: {
      timeInterval: '15s',
      ...(server.prometheusToken && { httpHeaderName1: 'Authorization' }),
    },
    secureJsonData: server.prometheusToken ? { httpHeaderValue1: `Bearer ${server.prometheusToken}` } : {},
  };
};

const upsert = async (server) => {
  const body = datasourceFor(server);
  const existing = await grafanaApi('GET', `/api/datasources/uid/${body.uid}`);
  if (existing) {
    await grafanaApi('PUT', `/api/datasources/uid/${body.uid}`, body);
  } else {
    await grafanaApi('POST', '/api/datasources', body);
  }
};

const remove = (serverId) => grafanaApi('DELETE', `/api/datasources/uid/${serverDatasourceUid(serverId)}`);

const needsDatasource = (server) => server.monitoringDataSource === 'PROMETHEUS' && Boolean(server.prometheusUrl);

// 서버 하나의 설정을 Grafana에 반영 (저장·해제·삭제 직후). 실패해도 MRDash 저장은 그대로 두고, 주기적 재동기화가 다시 맞춘다.
export const syncServerDatasource = async (serverId) => {
  if (!isConfigured()) return;
  try {
    const server = await prisma.minecraftServer.findUnique({
      where: { id: serverId },
      select: { id: true, monitoringDataSource: true, prometheusUrl: true, prometheusToken: true },
    });
    if (server && needsDatasource(server)) {
      await upsert(server);
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
    const servers = await prisma.minecraftServer.findMany({
      select: { id: true, monitoringDataSource: true, prometheusUrl: true, prometheusToken: true },
    });
    const wanted = servers.filter(needsDatasource);
    for (const server of wanted) await upsert(server);

    const wantedUids = new Set(wanted.map((s) => serverDatasourceUid(s.id)));
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
