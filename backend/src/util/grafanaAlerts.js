import { prisma } from '../config/prisma.js';
import { EXPORTER_METRICS } from './exporterMetrics.js';
import { grafanaApi, isGrafanaApiConfigured } from './grafanaApi.js';
import { buildSelector } from './prometheus.js';
import { serverDatasourceUid, syncAllServerDatasources } from './grafanaDatasources.js';

// MRDash 서버별 모니터링 알림 설정(MonitoringAlert)을 Grafana Alerting으로 옮긴다.
//
//   폴더 "MRDash 알림"
//   └─ 규칙 그룹 server-<id> (기본 30초마다 평가, GRAFANA_ALERT_EVALUATION_INTERVAL)
//        └─ 규칙: <지표> <연산> <기준값>이 기본 1분 이상 계속되면 경보 (GRAFANA_ALERT_PENDING_PERIOD, label mrdash_server_id=<id>)
//   알림 대상(contact point) mrdash-server-<id>
//        ├─ Discord 연동 × 웹후크 개수 (디스코드 웹후크로 바로)
//        └─ Webhook 연동 → MRDash backend /internal/grafana/alerts → "테트라" 봇 이름으로 선택한 채널에
//   알림 경로(notification policy): mrdash_server_id=<id> → mrdash-server-<id>, 기본 4시간마다 반복 (GRAFANA_ALERT_REPEAT_INTERVAL)
//
// 기존 /api/v1/provisioning API를 쓴다 (Grafana 13에서 지원 중단 예정이지만 계속 동작 — util/grafanaApi.js).
// UI 수정 잠금(provenance)은 그대로 둔다: 원본은 MRDash다.

const FOLDER_UID = 'mrdash-alerts';
const FOLDER_TITLE = 'MRDash 알림';
const RULE_GROUP_PREFIX = 'server-';

// 평가 주기·지속 시간·반복 간격은 환경변수로 바꿀 수 있다 (Grafana 기간 형식: 30s, 1m, 4h, 1d …).
// 형식이 틀리면 기본값을 쓰고 로그를 남긴다 — 잘못된 값으로 Grafana 동기화 전체가 실패하지 않게.
const DURATION = /^(\d+)(s|m|h|d|w)$/;
const UNIT_SEC = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

const durationEnv = (name, fallback) => {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (DURATION.test(value)) return value;
  console.warn(`[grafana] ${name}="${value}" is not a duration like 30s/1m/4h — using ${fallback}`);
  return fallback;
};
const toSeconds = (duration) => {
  const [, amount, unit] = duration.match(DURATION);
  return Number(amount) * UNIT_SEC[unit];
};

// 규칙 그룹 평가 주기 (기본 30초) — Grafana는 10초 단위만 받는다
const evaluationIntervalSec = () => {
  const sec = toSeconds(durationEnv('GRAFANA_ALERT_EVALUATION_INTERVAL', '30s'));
  return Math.max(10, Math.round(sec / 10) * 10);
};
// 조건이 이만큼 계속돼야 경보 (기본 1분)
const pendingPeriod = () => durationEnv('GRAFANA_ALERT_PENDING_PERIOD', '1m');
// 경보가 계속되는 동안 같은 알림을 다시 보내는 간격 (기본 4시간)
const repeatInterval = () => durationEnv('GRAFANA_ALERT_REPEAT_INTERVAL', '4h');
const RESYNC_INTERVAL_MS = 10 * 60 * 1000;

export const ALERT_LABELS = { serverId: 'mrdash_server_id' };

// MRDash Prometheus를 쓰는 서버가 쓰는 Grafana 기본 데이터 소스 (grafana/provisioning/datasources)
const defaultDatasourceUid = () => process.env.GRAFANA_DEFAULT_DATASOURCE_UID || 'mrdash-host';

const receiverName = (serverId) => `mrdash-server-${serverId}`;
const contactPointUidPrefix = (serverId) => `mrdash-s${serverId}-`;

const OP_SYMBOLS = { GT: '>', LT: '<', GTE: '>=', LTE: '<=', NEQ: '!=', EQ: '==' };

// 지표 → 월드·종류별 시계열을 하나로 합치는 방법 (exporterMetrics 표 + 공통 지표 up)
const AGGREGATES = Object.fromEntries([
  ...Object.values(EXPORTER_METRICS).flatMap((e) => Object.values(e.metrics).map((m) => [m.metric, m.aggregate])),
  ['up', 'max'],
]);
const METRIC_LABELS = Object.fromEntries([
  ...Object.values(EXPORTER_METRICS).flatMap((e) => Object.values(e.metrics).map((m) => [m.metric, m.label])),
  ['up', '서버 상태'],
]);

const ruleSummary = (rule) => `${METRIC_LABELS[rule.key] ?? rule.key} ${OP_SYMBOLS[rule.op]} ${rule.threshold}`;

const EXPR_DATASOURCE = { type: '__expr__', uid: '__expr__' };

// A: Prometheus 조회 → B: 마지막 값 → C: 비교식 (참이면 1 = 경보)
const toGrafanaRule = (server, rule, index) => {
  const prometheus = server.monitoringDataSource.prometheus;
  const selector = buildSelector(prometheus.job, prometheus.instance);
  const datasourceUid = prometheus.url ? serverDatasourceUid(server.id) : defaultDatasourceUid();
  return {
    uid: `${contactPointUidPrefix(server.id)}r${index}`,
    title: `서버 ${server.id} · ${ruleSummary(rule)} (#${index + 1})`,
    folderUID: FOLDER_UID,
    ruleGroup: `${RULE_GROUP_PREFIX}${server.id}`,
    condition: 'C',
    data: [
      {
        refId: 'A',
        datasourceUid,
        relativeTimeRange: { from: 600, to: 0 },
        model: { refId: 'A', expr: `${AGGREGATES[rule.key] ?? 'max'}(${rule.key}{${selector}})`, instant: true, range: false },
      },
      {
        refId: 'B',
        datasourceUid: EXPR_DATASOURCE.uid,
        relativeTimeRange: { from: 0, to: 0 },
        model: { refId: 'B', type: 'reduce', expression: 'A', reducer: 'last', datasource: EXPR_DATASOURCE },
      },
      {
        refId: 'C',
        datasourceUid: EXPR_DATASOURCE.uid,
        relativeTimeRange: { from: 0, to: 0 },
        model: { refId: 'C', type: 'math', expression: `$B ${OP_SYMBOLS[rule.op]} ${rule.threshold}`, datasource: EXPR_DATASOURCE },
      },
    ],
    for: pendingPeriod(),
    // 서버가 꺼지면 mc_* 지표는 사라진다 — 그건 up 규칙이 잡으므로 다른 규칙은 "데이터 없음"을 정상으로 본다.
    // up 자체가 없으면(수집 대상을 못 찾음) 꺼진 것과 같게 본다.
    noDataState: rule.key === 'up' ? 'Alerting' : 'OK',
    execErrState: 'Error',
    labels: { [ALERT_LABELS.serverId]: String(server.id) },
    annotations: { summary: ruleSummary(rule), server: server.name },
    isPaused: false,
  };
};

const DISCORD_TITLE = '{{ if eq .Status "firing" }}🚨 MRDash 경보{{ else }}✅ MRDash 경보 해제{{ end }}';
const DISCORD_MESSAGE = '{{ range .Alerts }}{{ if eq .Status "firing" }}🚨{{ else }}✅{{ end }} **{{ .Annotations.server }}** — {{ .Annotations.summary }}{{ if eq .Status "firing" }} (현재 값 {{ index .Values "B" }}){{ end }}\n{{ end }}';

const webhookUrl = () => process.env.GRAFANA_ALERT_WEBHOOK_URL || 'http://mrdash-backend:3000/internal/grafana/alerts';

// 서버 하나의 알림 대상 연동 목록 (같은 name = 한 contact point)
const contactPointsFor = (server) => {
  const name = receiverName(server.id);
  const prefix = contactPointUidPrefix(server.id);
  const alert = server.monitoringAlert;
  const points = alert.webhooks.map((webhook, i) => ({
    uid: `${prefix}w${i}`,
    name,
    type: 'discord',
    settings: { url: webhook.url, title: DISCORD_TITLE, message: DISCORD_MESSAGE },
    disableResolveMessage: false,
  }));
  if (alert.channels.length > 0 && process.env.GRAFANA_ALERT_WEBHOOK_SECRET) {
    points.push({
      uid: `${prefix}bot`,
      name,
      type: 'webhook',
      settings: {
        url: webhookUrl(),
        httpMethod: 'POST',
        authorization_scheme: 'Bearer',
        authorization_credentials: process.env.GRAFANA_ALERT_WEBHOOK_SECRET,
      },
      disableResolveMessage: false,
    });
  }
  return points;
};

const isOurRoute = (route) => (route.object_matchers ?? []).some(([label]) => label === ALERT_LABELS.serverId);

const ensureFolder = async () => {
  if (!(await grafanaApi('GET', `/api/folders/${FOLDER_UID}`))) {
    await grafanaApi('POST', '/api/folders', { uid: FOLDER_UID, title: FOLDER_TITLE });
  }
};

const loadServers = () => prisma.minecraftServer.findMany({
  select: {
    id: true,
    name: true,
    monitoringDataSource: { select: { type: true, prometheus: { select: { url: true, job: true, instance: true } } } },
    monitoringAlert: {
      select: {
        rules: { orderBy: { id: 'asc' } },
        channels: { orderBy: { id: 'asc' } },
        webhooks: { orderBy: { id: 'asc' } },
      },
    },
  },
});

// 규칙을 Grafana가 평가할 수 있는 서버: Prometheus 데이터 소스 + Job이 있고 규칙이 하나 이상
const hasAlertRules = (server) => server.monitoringDataSource?.type === 'PROMETHEUS'
  && Boolean(server.monitoringDataSource.prometheus?.job)
  && (server.monitoringAlert?.rules.length ?? 0) > 0;

const doSync = async () => {
  await ensureFolder();
  const servers = (await loadServers()).filter(hasAlertRules);

  // 1) 알림 대상: 만들거나 고친다 (지우는 건 알림 경로에서 빠진 뒤에)
  const desiredPoints = servers.flatMap(contactPointsFor);
  const existingPoints = (await grafanaApi('GET', '/api/v1/provisioning/contact-points')) ?? [];
  const existingUids = new Set(existingPoints.map((p) => p.uid));
  for (const point of desiredPoints) {
    if (existingUids.has(point.uid)) {
      await grafanaApi('PUT', `/api/v1/provisioning/contact-points/${point.uid}`, point);
    } else {
      await grafanaApi('POST', '/api/v1/provisioning/contact-points', point);
    }
  }

  // 2) 알림 경로: MRDash가 만든 경로만 바꾸고 나머지는 그대로 둔다
  const receivers = new Set(desiredPoints.map((p) => p.name));
  const tree = (await grafanaApi('GET', '/api/v1/provisioning/policies')) ?? {};
  await grafanaApi('PUT', '/api/v1/provisioning/policies', {
    ...tree,
    routes: [
      ...(tree.routes ?? []).filter((route) => !isOurRoute(route)),
      ...servers
        .filter((server) => receivers.has(receiverName(server.id)))
        .map((server) => ({
          receiver: receiverName(server.id),
          object_matchers: [[ALERT_LABELS.serverId, '=', String(server.id)]],
          group_by: ['alertname', ALERT_LABELS.serverId],
          group_wait: '30s',
          group_interval: '5m',
          repeat_interval: repeatInterval(),
        })),
    ],
  });

  // 3) 더 이상 쓰지 않는 MRDash 알림 대상 연동 삭제
  const desiredUids = new Set(desiredPoints.map((p) => p.uid));
  for (const point of existingPoints) {
    if (/^mrdash-s\d+-/.test(point.uid) && !desiredUids.has(point.uid)) {
      await grafanaApi('DELETE', `/api/v1/provisioning/contact-points/${point.uid}`);
    }
  }

  // 4) 규칙 그룹: 서버마다 통째로 바꾸고, 규칙이 없어진 서버의 그룹은 지운다
  for (const server of servers) {
    const group = `${RULE_GROUP_PREFIX}${server.id}`;
    await grafanaApi('PUT', `/api/v1/provisioning/folder/${FOLDER_UID}/rule-groups/${group}`, {
      title: group,
      folderUid: FOLDER_UID,
      interval: evaluationIntervalSec(),
      rules: server.monitoringAlert.rules.map((rule, i) => toGrafanaRule(server, rule, i)),
    });
  }
  const desiredGroups = new Set(servers.map((s) => `${RULE_GROUP_PREFIX}${s.id}`));
  const existingRules = (await grafanaApi('GET', '/api/v1/provisioning/alert-rules')) ?? [];
  const staleGroups = new Set(existingRules
    .filter((r) => r.folderUID === FOLDER_UID && !desiredGroups.has(r.ruleGroup))
    .map((r) => r.ruleGroup));
  for (const group of staleGroups) {
    await grafanaApi('DELETE', `/api/v1/provisioning/folder/${FOLDER_UID}/rule-groups/${group}`);
  }

  return { servers: servers.length, contactPoints: desiredPoints.length };
};

// 동기화는 한 번에 하나씩 (저장이 겹치거나 주기적 재동기화와 겹쳐도 순서대로)
let running = Promise.resolve();

// 전체 서버의 알림 설정을 Grafana에 맞춘다. 실패해도 MRDash 저장은 그대로 두고, 주기적 재동기화가 다시 맞춘다.
export const syncGrafanaAlerts = () => {
  if (!isGrafanaApiConfigured()) return Promise.resolve();
  running = running.then(async () => {
    try {
      await doSync();
    } catch (error) {
      console.error('[grafana] alert sync failed:', error.message);
    }
  });
  return running;
};

// 시작 시와 10분마다: 데이터 소스를 먼저 맞추고(규칙이 그 데이터 소스를 쓴다) 알림을 맞춘다
export const startGrafanaResync = () => {
  if (!isGrafanaApiConfigured()) {
    console.log('ℹ️ GRAFANA_SERVICE_ACCOUNT_TOKEN not set — Grafana datasources/alerts are not synced');
    return;
  }
  const resync = async () => {
    await syncAllServerDatasources();
    await syncGrafanaAlerts();
  };
  resync();
  setInterval(resync, RESYNC_INTERVAL_MS);
};
