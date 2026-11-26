import { Events, MessageFlags } from 'discord.js';
import { config } from '../../config.js';
import math from './math.js';
import dice from './dice.js';
import { warmUp as warmUpTex } from './tex-renderer.js';
import { warmUp as warmUpDice } from './dice-engine.js';

// "테트라" 도구 모음 — 슬래시 명령 하나가 도구 하나.
// 새 도구는 이 폴더에 { data: SlashCommandBuilder, execute(interaction) } 형태로 만들고 아래 목록에 추가한다.
const tools = [math, dice];

const toolByName = new Map(tools.map((tool) => [tool.data.name, tool]));

// 전역 명령으로 등록해 봇이 들어간 모든 서버(와 봇 DM)에서 쓸 수 있게 한다.
// 봇을 새 서버에 초대해도 재등록할 필요가 없다.
// set()은 전역 명령 목록을 통째로 덮어쓰므로, 목록에서 뺀 도구는 자동으로 지워진다.
const registerCommands = async (client) => {
  try {
    await client.application.commands.set(tools.map((tool) => tool.data.toJSON()));
    console.log(`✅ 도구 명령 전역 등록: ${tools.map((tool) => `/${tool.data.name}`).join(', ')}`);
  } catch (error) {
    console.error('❌ 도구 명령 등록 실패:', error);
  }

  // 예전에는 "마랜디" 길드 명령으로 등록했다. 남아 있으면 그 서버에서 명령이 두 번씩 보이므로 지운다.
  try {
    const guild = await client.guilds.fetch(config.guildId);
    if ((await guild.commands.fetch()).size > 0) {
      await guild.commands.set([]);
      console.log('🧹 예전 길드 명령 삭제');
    }
  } catch (error) {
    console.error('❌ 예전 길드 명령 삭제 실패:', error.message);
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
    // 첫 명령이 디스코드 응답 제한(3초)을 넘지 않도록 무거운 엔진을 미리 준비한다
    warmUpTex().catch((error) => console.error('❌ 수식 렌더러 준비 실패:', error));
    warmUpDice().catch((error) => console.error('❌ 주사위 엔진 준비 실패:', error));

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
