import { Events } from 'discord.js';
import { api } from '../../api.js';
import { config } from '../../config.js';

// "마랜디" 서버 멤버 = MRDash 인증 유저.
// 입장/퇴장 이벤트를 즉시 반영하고, 주기적인 전체 동기화로 누락분과 프로필 변경을 보정한다.

const RETRY_DELAY_MS = 30_000;

// backend의 웹 로그인(discord-strategy)과 같은 아바타 URL 형식을 쓴다
const toMember = (user) => ({
  id: user.id,
  username: user.username,
  globalName: user.globalName,
  avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}` : null,
});

const isTargetGuild = (member) => member.guild.id === config.guildId && !member.user.bot;

const syncAll = async (client) => {
  const guild = await client.guilds.fetch(config.guildId);
  const members = await guild.members.fetch();
  const payload = members.filter((m) => !m.user.bot).map((m) => toMember(m.user));
  const result = await api.syncMembers(payload);
  console.log(`✅ 멤버 전체 동기화 완료: 인증 ${result.authorized}명, 해제 ${result.revoked}명`);
};

const scheduleSync = (client, delay) => {
  setTimeout(async () => {
    try {
      await syncAll(client);
      scheduleSync(client, config.memberSyncIntervalMs);
    } catch (error) {
      console.error('❌ 멤버 전체 동기화 실패, 잠시 후 재시도:', error.message);
      scheduleSync(client, RETRY_DELAY_MS);
    }
  }, delay);
};

export default {
  name: 'membership',
  register(client) {
    client.once(Events.ClientReady, () => scheduleSync(client, 0));

    client.on(Events.GuildMemberAdd, async (member) => {
      if (!isTargetGuild(member)) return;
      try {
        await api.upsertMember(toMember(member.user));
        console.log(`➕ 멤버 인증: ${member.user.username}`);
      } catch (error) {
        console.error(`❌ 멤버 인증 실패 (${member.user.username}):`, error.message);
      }
    });

    client.on(Events.GuildMemberRemove, async (member) => {
      if (!isTargetGuild(member)) return;
      try {
        await api.removeMember(member.user.id);
        console.log(`➖ 멤버 인증 해제: ${member.user.username}`);
      } catch (error) {
        console.error(`❌ 멤버 인증 해제 실패 (${member.user.username}):`, error.message);
      }
    });
  },
};
