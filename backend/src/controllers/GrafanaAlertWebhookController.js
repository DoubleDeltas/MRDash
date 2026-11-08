import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { isDiscordBotConfigured, sendChannelMessage } from '../util/discordBot.js';
import { ALERT_LABELS } from '../util/grafanaAlerts.js';

// Grafana 경보의 Webhook 연동이 부르는 내부 주소 (POST /internal/grafana/alerts).
// 경보가 울리거나 해제되면, 그 서버의 알림 설정에서 고른 "마랜디 채널"들에 "테트라" 봇 이름으로 메시지를 보낸다.
// Grafana가 Authorization: Bearer <GRAFANA_ALERT_WEBHOOK_SECRET>을 붙여 보낸다 (contact point 설정, util/grafanaAlerts.js).

const COLOR_FIRING = 0xe34948;
const COLOR_RESOLVED = 0x1baf7a;

const matchesSecret = (header) => {
  const secret = process.env.GRAFANA_ALERT_WEBHOOK_SECRET;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const requireGrafanaWebhookSecret = (req, res, next) => {
  if (!process.env.GRAFANA_ALERT_WEBHOOK_SECRET) {
    return res.status(503).json({ success: false, error: 'Grafana alert webhook is disabled' });
  }
  if (!matchesSecret(req.get('authorization'))) {
    return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
  }
  next();
};

// Grafana가 계산한 현재 값 — 규칙의 C(math) 식 직전 단계인 B(reduce) 값
const currentValue = (alert) => {
  const value = alert.values?.B;
  if (typeof value !== 'number') return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const toEmbed = (alert, serverName) => {
  const firing = alert.status === 'firing';
  const value = currentValue(alert);
  return {
    title: `${firing ? '🚨' : '✅'} ${serverName} — ${alert.annotations?.summary ?? alert.labels?.alertname ?? '경보'}`,
    description: firing ? '경보가 울렸습니다.' : '정상으로 돌아왔습니다.',
    color: firing ? COLOR_FIRING : COLOR_RESOLVED,
    fields: value === null ? [] : [{ name: '현재 값', value, inline: true }],
    timestamp: firing ? alert.startsAt : (alert.endsAt ?? new Date().toISOString()),
  };
};

// POST /internal/grafana/alerts — Grafana webhook 본문: { status, alerts: [{ status, labels, annotations, values, startsAt, endsAt }] }
export const receiveGrafanaAlerts = async (req, res) => {
  try {
    if (!isDiscordBotConfigured()) {
      return res.status(503).json({ success: false, error: 'DISCORD_BOT_TOKEN is not set' });
    }

    // 서버별로 묶어서, 그 서버의 채널마다 한 메시지(경보 여러 개는 embed 여러 개)로 보낸다
    const byServer = new Map();
    for (const alert of req.body?.alerts ?? []) {
      const serverId = Number(alert.labels?.[ALERT_LABELS.serverId]);
      if (!Number.isInteger(serverId)) continue;
      if (!byServer.has(serverId)) byServer.set(serverId, []);
      byServer.get(serverId).push(alert);
    }

    let sent = 0;
    const failures = [];
    for (const [serverId, alerts] of byServer) {
      const server = await prisma.minecraftServer.findUnique({
        where: { id: serverId },
        select: { name: true, monitoringAlert: { select: { channels: { select: { channelId: true } } } } },
      });
      const channelIds = server?.monitoringAlert?.channels.map((c) => c.channelId) ?? [];
      // 디스코드 embed는 한 메시지에 10개까지
      const embeds = alerts.slice(0, 10).map((alert) => toEmbed(alert, server?.name ?? `서버 ${serverId}`));
      for (const channelId of channelIds) {
        try {
          await sendChannelMessage(channelId, { embeds });
          sent += 1;
        } catch (error) {
          console.error(`[grafana alert] server ${serverId} channel ${channelId}:`, error.message);
          failures.push(channelId);
        }
      }
    }

    // 일부 채널 실패는 로그로 남기고 200 — Grafana가 같은 알림을 다시 보내 다른 채널에 중복되지 않게 한다
    res.json({ success: true, data: { sent, failed: failures.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
