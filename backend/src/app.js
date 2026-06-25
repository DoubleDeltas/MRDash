import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { initializePassport } from './passport/index.js';
import routes from './routes/index.js';
import { RedisStore } from 'connect-redis';
import { sessionRedis } from './config/session-redis.js';

export const createApp = () => {
  const app = express();

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
      maxAge: Number(process.env.SESSION_COOKIE_MAX_AGE)
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