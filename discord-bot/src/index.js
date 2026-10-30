import './env.js';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import membership from './modules/membership/index.js';

// 기능 모듈 목록. 새 기능(자동응답, 미니게임 등)은 modules/에 만들고 여기에 추가한다.
const modules = [membership];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // 특권 intent: Developer Portal에서 "Server Members Intent"를 켜야 한다
    GatewayIntentBits.GuildMembers,
  ],
});

for (const module of modules) {
  module.register(client);
  console.log(`🧩 모듈 로드: ${module.name}`);
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ 디스코드 로그인: ${c.user.tag}`);
});

client.login(config.botToken).catch((error) => {
  console.error('❌ 디스코드 로그인 실패:', error);
  process.exit(1);
});

const shutdown = async () => {
  await client.destroy();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
