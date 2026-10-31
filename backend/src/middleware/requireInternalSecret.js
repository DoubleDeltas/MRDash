import { timingSafeEqual } from 'node:crypto';

const READ_METHODS = ['GET', 'HEAD'];

const matches = (token, secret) => {
  if (!secret) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

// 내부 서비스 전용 API 보호. Authorization: Bearer <시크릿> 헤더로 인증한다.
// - INTERNAL_API_SECRET: 모든 요청 허용 (디스코드 봇)
// - READONLY_API_SECRET: 조회(GET)만 허용 (마랜디위키 등)
export const requireInternalSecret = (req, res, next) => {
  const fullSecret = process.env.INTERNAL_API_SECRET;
  const readonlySecret = process.env.READONLY_API_SECRET;
  if (!fullSecret && !readonlySecret) {
    return res.status(503).json({ success: false, error: 'Internal API is disabled' });
  }

  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (matches(token, fullSecret)) {
    return next();
  }
  if (matches(token, readonlySecret)) {
    if (READ_METHODS.includes(req.method)) {
      return next();
    }
    return res.status(403).json({ success: false, error: 'Read-only secret cannot modify data' });
  }
  return res.status(401).json({ success: false, error: 'Invalid internal secret' });
};
