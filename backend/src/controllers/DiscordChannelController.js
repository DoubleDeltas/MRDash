import { sessionRedis } from '../config/session-redis.js';

// "테트라" 디스코드 봇이 보내는, 봇이 볼 수 있고 메시지를 보낼 수 있는 "마랜디" 서버 채널 목록.
// 봇이 시작할 때·채널/역할이 바뀔 때·주기적으로 통째로 보내고, 백엔드는 Redis에 보관한다 (재시작해도 유지).
// 채널 형식: { id, name, category }
const REDIS_KEY = 'mrdash:discord-channels';

const isValidChannel = (channel) =>
  channel
  && typeof channel.id === 'string' && /^\d+$/.test(channel.id)
  && typeof channel.name === 'string'
  && (channel.category == null || typeof channel.category === 'string');

// PUT /internal/discord-channels — 봇이 전체 목록을 보낸다
export const replaceChannels = async (req, res) => {
  try {
    const { channels } = req.body;
    if (!Array.isArray(channels) || !channels.every(isValidChannel)) {
      return res.status(400).json({ success: false, error: 'channels must be an array of { id, name, category }' });
    }

    const payload = {
      channels: channels.map(({ id, name, category }) => ({ id, name, category: category ?? null })),
      updatedAt: new Date().toISOString(),
    };
    await sessionRedis.set(REDIS_KEY, JSON.stringify(payload));
    res.json({ success: true, data: { count: payload.channels.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 알림 설정 화면에서 쓰는 마지막 목록 — 봇이 아직 한 번도 보내지 않았으면 빈 목록
export const getStoredChannels = async () => {
  const raw = await sessionRedis.get(REDIS_KEY);
  if (!raw) return { channels: [], updatedAt: null };
  try {
    return JSON.parse(raw);
  } catch {
    return { channels: [], updatedAt: null };
  }
};
