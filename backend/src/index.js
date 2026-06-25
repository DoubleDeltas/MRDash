import 'dotenv/config';
import http from 'node:http';
import { prisma } from './config/prisma.js';
import { sessionRedis } from './config/session-redis.js';
import { createApp } from './app.js';
import { attachConsoleHub } from './ws/consoleHub.js';

const PORT = process.env.PORT;

const app = createApp();
const server = http.createServer(app);
attachConsoleHub(server);

// 서버 시작
const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Database connection established');

    await sessionRedis.connect();
    console.log('✅ Redis connection established');

    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await sessionRedis.quit();
  process.exit(0);
});

export default app;
