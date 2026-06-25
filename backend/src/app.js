import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initializePassport } from './passport/index.js';
import routes from './routes/index.js';
import { RedisStore } from 'connect-redis';
import { sessionRedis } from './config/session-redis.js';

export const createApp = () => {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  // nginx 리버스 프록시 뒤에서 돌 때, req.secure/X-Forwarded-* 헤더를 신뢰해야
  // 세션 쿠키의 secure 옵션이 제대로 동작한다.
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }));
  // base64로 인코딩된 서버 이미지(128x128 PNG)를 받을 수 있도록 기본 100kb보다 넉넉하게 잡음
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  app.use(session({
    store: new RedisStore({
      client: sessionRedis
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: Number(process.env.SESSION_COOKIE_MAX_AGE),
      secure: isProduction,
      sameSite: 'lax'
    }
  }));
  
  initializePassport(app);
  
  // Routes
  app.use('/api', routes);
  
  // 헬스 체크
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  })

  // 에러 핸들러
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}