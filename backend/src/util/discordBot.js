// "테트라" 봇 이름으로 디스코드 채널에 메시지를 보낸다.
// 봇 프로세스(discord-bot)를 거치지 않고, 같은 .env의 DISCORD_BOT_TOKEN으로 디스코드 REST API를 직접 부른다
// (봇이 게이트웨이에 접속해 있는 것과 상관없이 REST 호출은 따로 할 수 있다).
const DISCORD_API_URL = (process.env.DISCORD_API_URL || 'https://discord.com/api/v10').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10000;

export const isDiscordBotConfigured = () => Boolean(process.env.DISCORD_BOT_TOKEN);

const post = (path, body) => fetch(`${DISCORD_API_URL}${path}`, {
  method: 'POST',
  headers: {
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

// message: 디스코드 메시지 본문 ({ content, embeds, ... })
export const sendChannelMessage = async (channelId, message) => {
  let res = await post(`/channels/${channelId}/messages`, message);
  // 요청 제한(429)이면 디스코드가 알려준 시간만큼 기다렸다가 한 번 더 보낸다
  if (res.status === 429) {
    const { retry_after: retryAfter = 1 } = await res.json().catch(() => ({}));
    await new Promise((resolve) => setTimeout(resolve, Math.ceil(retryAfter * 1000)));
    res = await post(`/channels/${channelId}/messages`, message);
  }
  if (!res.ok) {
    throw new Error(`Discord POST /channels/${channelId}/messages → HTTP ${res.status}: ${await res.text()}`);
  }
};
