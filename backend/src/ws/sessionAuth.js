import { createHmac } from 'node:crypto';
import { sessionRedis } from '../config/session-redis.js';

const parseCookies = (header) => {
  const cookies = {};
  (header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[key] = value;
  });
  return cookies;
};

// express-session이 서명한 connect.sid 쿠키(`s:<sid>.<sig>`)를 검증해서 sid만 꺼낸다
const unsignSessionId = (signedValue, secret) => {
  if (!signedValue?.startsWith('s:')) return null;
  const value = signedValue.slice(2);
  const lastDot = value.lastIndexOf('.');
  if (lastDot === -1) return null;
  const sid = value.slice(0, lastDot);
  const expectedSig = value.slice(lastDot + 1);
  const actualSig = createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
  return actualSig === expectedSig ? sid : null;
};

// WebSocket upgrade 요청의 쿠키에서 로그인된 유저 정보를 꺼낸다 (express-session/passport와 동일한 저장 포맷 재사용)
export const getSessionUserFromRequest = async (req) => {
  const cookies = parseCookies(req.headers.cookie);
  const signedSid = cookies['connect.sid'];
  if (!signedSid) return null;

  const sid = unsignSessionId(signedSid, process.env.SESSION_SECRET);
  if (!sid) return null;

  const raw = await sessionRedis.get(`sess:${sid}`);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    return session.passport?.user || null;
  } catch {
    return null;
  }
};
