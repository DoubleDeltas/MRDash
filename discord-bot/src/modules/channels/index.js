import { ChannelType, Events, PermissionFlagsBits } from 'discord.js';
import { api } from '../../api.js';
import { config } from '../../config.js';

// 봇이 볼 수 있고 메시지를 보낼 수 있는 "마랜디" 서버 채널 목록을 backend에 알려준다
// (MRDash 모니터링 알림 설정에서 알림 받을 채널을 고를 때 쓴다).
// 시작할 때·채널/역할이 바뀔 때·주기적으로 전체 목록을 다시 보낸다.

const RESYNC_INTERVAL_MS = 10 * 60 * 1000;
// 채널을 여러 개 한꺼번에 고칠 때 이벤트마다 보내지 않도록 잠깐 모았다가 한 번만 보낸다
const DEBOUNCE_MS = 5_000;
const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const REQUIRED_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];

const collectChannels = async (client) => {
  const guild = await client.guilds.fetch(config.guildId);
  const me = guild.members.me ?? await guild.members.fetchMe();
  const channels = await guild.channels.fetch();

  return [...channels.values()]
    .filter((channel) => channel && TEXT_CHANNEL_TYPES.includes(channel.type))
    .filter((channel) => channel.permissionsFor(me)?.has(REQUIRED_PERMISSIONS))
    // 디스코드 화면과 같은 순서: 카테고리 순서 → 카테고리 안 채널 순서
    .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)
    .map((channel) => ({ id: channel.id, name: channel.name, category: channel.parent?.name ?? null }));
};

const sync = async (client) => {
  try {
    const channels = await collectChannels(client);
    await api.replaceChannels(channels);
    console.log(`✅ 알림용 채널 목록 동기화: ${channels.length}개`);
  } catch (error) {
    console.error('❌ 알림용 채널 목록 동기화 실패:', error.message);
  }
};

export default {
  name: 'channels',
  register(client) {
    let timer = null;
    const scheduleSync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => sync(client), DEBOUNCE_MS);
    };

    const isTargetGuild = (guild) => guild?.id === config.guildId;

    client.once(Events.ClientReady, () => {
      sync(client);
      setInterval(() => sync(client), RESYNC_INTERVAL_MS);
    });

    // 채널 생성·삭제·이름/권한 변경, 역할 권한 변경, 봇 자신의 역할 변경
    for (const event of [Events.ChannelCreate, Events.ChannelDelete, Events.ChannelUpdate]) {
      client.on(event, (channel) => isTargetGuild(channel.guild) && scheduleSync());
    }
    for (const event of [Events.GuildRoleCreate, Events.GuildRoleDelete, Events.GuildRoleUpdate]) {
      client.on(event, (role) => isTargetGuild(role.guild) && scheduleSync());
    }
    client.on(Events.GuildMemberUpdate, (_, member) => {
      if (isTargetGuild(member.guild) && member.id === client.user.id) scheduleSync();
    });
  },
};
