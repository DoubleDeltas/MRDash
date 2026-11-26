import { Events, MessageFlags } from 'discord.js';
import { config } from '../../config.js';
import math from './math.js';
import { warmUp } from './tex-renderer.js';

// "테트라" 도구 모음 — 슬래시 명령 하나가 도구 하나.
// 새 도구는 이 폴더에 { data: SlashCommandBuilder, execute(interaction) } 형태로 만들고 아래 목록에 추가한다.
const tools = [math];

const toolByName = new Map(tools.map((tool) => [tool.data.name, tool]));

// 길드 명령으로 등록해 변경이 즉시 반영되게 한다 (전역 명령은 전파에 시간이 걸린다).
// set()은 길드의 명령 목록을 통째로 덮어쓰므로, 목록에서 뺀 도구는 자동으로 지워진다.
const registerCommands = async (client) => {
  try {
    const guild = await client.guilds.fetch(config.guildId);
    await guild.commands.set(tools.map((tool) => tool.data.toJSON()));
    console.log(`✅ 도구 명령 등록: ${tools.map((tool) => `/${tool.data.name}`).join(', ')}`);
  } catch (error) {
    console.error('❌ 도구 명령 등록 실패:', error);
  }
};

const replyError = async (interaction, content) => {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    console.error('❌ 오류 응답 전송 실패:', error.message);
  }
};

export default {
  name: 'tools',
  register(client) {
    client.once(Events.ClientReady, registerCommands);
    warmUp().catch((error) => console.error('❌ 수식 렌더러 준비 실패:', error));

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      const tool = toolByName.get(interaction.commandName);
      if (!tool) return;

      try {
        await tool.execute(interaction);
      } catch (error) {
        console.error(`❌ /${interaction.commandName} 실행 실패:`, error);
        await replyError(interaction, '명령을 처리하는 중 오류가 발생했습니다.');
      }
    });
  },
};
