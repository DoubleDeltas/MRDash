import { MonitoringAlertOp } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { alertMetricsFor } from '../util/exporterMetrics.js';
import { getStoredChannels } from './DiscordChannelController.js';
import { syncGrafanaAlerts } from '../util/grafanaAlerts.js';

// 서버별 모니터링 알림 설정 (/settings/alert/:serverId 화면).
// 규칙·채널·웹후크는 저장할 때마다 통째로 바꾼다.

const MAX_RULES = 50;
const MAX_WEBHOOKS = 20;
const MAX_CHANNELS = 50;

// 디스코드 웹후크 주소만 받는다 (https://discord.com/api/webhooks/<id>/<token>)
const DISCORD_WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

const loadAlert = (serverId) => prisma.monitoringAlert.findUnique({
  where: { serverId },
  include: {
    rules: { orderBy: { id: 'asc' } },
    channels: { orderBy: { id: 'asc' } },
    webhooks: { orderBy: { id: 'asc' } },
  },
});

const toResponse = (alert) => ({
  rules: (alert?.rules ?? []).map(({ key, op, threshold }) => ({ key, op, threshold })),
  channelIds: (alert?.channels ?? []).map((c) => c.channelId),
  // 이 API는 서버 관리자(admin·소유자)만 부르므로 수정할 수 있게 URL을 그대로 내려준다
  webhookUrls: (alert?.webhooks ?? []).map((w) => w.url),
});

// GET /servers/:id/monitoring-alert — 설정 + 화면에서 고를 수 있는 지표·채널 목록
export const getMonitoringAlert = async (req, res) => {
  try {
    const serverId = parseInt(req.params.id);
    const server = await prisma.minecraftServer.findUnique({
      where: { id: serverId },
      select: { monitoringDataSource: { select: { prometheus: { select: { exporter: true } } } } },
    });
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const [alert, discord] = await Promise.all([loadAlert(serverId), getStoredChannels()]);
    res.json({
      success: true,
      data: {
        ...toResponse(alert),
        metrics: alertMetricsFor(server.monitoringDataSource?.prometheus?.exporter),
        channels: discord.channels,
        channelsUpdatedAt: discord.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const parseRules = (rules) => {
  if (!Array.isArray(rules) || rules.length > MAX_RULES) return { error: `rules must be an array (max ${MAX_RULES})` };
  const parsed = [];
  for (const rule of rules) {
    const key = typeof rule?.key === 'string' ? rule.key.trim() : '';
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(key)) return { error: `invalid metric key: ${rule?.key}` };
    if (!Object.values(MonitoringAlertOp).includes(rule.op)) return { error: `op must be one of: ${Object.values(MonitoringAlertOp).join(', ')}` };
    const threshold = typeof rule.threshold === 'string' ? Number(rule.threshold) : rule.threshold;
    if (typeof threshold !== 'number' || !Number.isFinite(threshold)) return { error: `threshold must be a number: ${rule.threshold}` };
    parsed.push({ key, op: rule.op, threshold });
  }
  return { value: parsed };
};

const parseList = (list, name, max, isValid) => {
  if (!Array.isArray(list) || list.length > max) return { error: `${name} must be an array (max ${max})` };
  const values = [...new Set(list.map((v) => (typeof v === 'string' ? v.trim() : v)))];
  const invalid = values.find((v) => typeof v !== 'string' || !isValid(v));
  return invalid === undefined ? { value: values } : { error: `invalid ${name}: ${invalid}` };
};

// PUT /servers/:id/monitoring-alert — { rules: [{ key, op, threshold }], channelIds: [], webhookUrls: [] }
export const saveMonitoringAlert = async (req, res) => {
  try {
    const serverId = parseInt(req.params.id);
    if (!(await prisma.minecraftServer.findUnique({ where: { id: serverId }, select: { id: true } }))) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const rules = parseRules(req.body.rules);
    if (rules.error) return res.status(400).json({ success: false, error: rules.error });
    const channelIds = parseList(req.body.channelIds, 'channelIds', MAX_CHANNELS, (v) => /^\d{1,32}$/.test(v));
    if (channelIds.error) return res.status(400).json({ success: false, error: channelIds.error });
    const webhookUrls = parseList(req.body.webhookUrls, 'webhookUrls', MAX_WEBHOOKS, (v) => v.length <= 512 && DISCORD_WEBHOOK.test(v));
    if (webhookUrls.error) return res.status(400).json({ success: false, error: webhookUrls.error });

    const children = {
      rules: { create: rules.value },
      channels: { create: channelIds.value.map((channelId) => ({ channelId })) },
      webhooks: { create: webhookUrls.value.map((url) => ({ url })) },
    };
    await prisma.$transaction(async (tx) => {
      const existing = await tx.monitoringAlert.findUnique({ where: { serverId }, select: { id: true } });
      if (existing) {
        // 통째로 바꾼다: 기존 규칙·채널·웹후크를 지우고 새로 넣는다
        await tx.monitoringAlert.update({
          where: { id: existing.id },
          data: {
            rules: { deleteMany: {}, ...children.rules },
            channels: { deleteMany: {}, ...children.channels },
            webhooks: { deleteMany: {}, ...children.webhooks },
          },
        });
      } else {
        await tx.monitoringAlert.create({ data: { serverId, ...children } });
      }
    });

    // Grafana 경보 규칙·알림 대상에 반영 (실패해도 저장은 유지, 주기적 재동기화가 다시 맞춘다)
    await syncGrafanaAlerts();

    res.json({ success: true, data: toResponse(await loadAlert(serverId)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
