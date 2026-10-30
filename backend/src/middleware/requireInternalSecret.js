import { timingSafeEqual } from 'node:crypto';

// 내부 서비스(디스코드 봇 등) 전용 API 보호.
// Authorization: Bearer <INTERNAL_API_SECRET> 헤더가 일치해야 통과한다.
export const requireInternalSecret = (req, res, next) => {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return res.status(503).json({ success: false, error: 'Internal API is disabled' });
  }

  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, error: 'Invalid internal secret' });
  }
  next();
};
