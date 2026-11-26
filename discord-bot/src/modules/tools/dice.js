import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { DiceError, rollDice } from './dice-engine.js';

const MAX_INPUT_LENGTH = 200;
// 디스코드 메시지 최대 2000자 — 머리말 여유를 두고, 넘으면 전체 결과는 파일로 첨부한다
const MAX_RESULT_LENGTH = 1700;

const escapeCode = (text) => text.replaceAll('`', 'ˋ');

// 결과 문자열의 마지막 '＞' 뒤가 최종 결과 (예: "(3D6+1) ＞ 11[5,1,5]+1 ＞ 12" → "12")
const finalPart = (text) => text.split('＞').at(-1).trim();

// 반복 명령(x3 2D6)은 "#1\n...\n\n#2\n..." 형태 — 회차별 최종 결과만 모은다
const summarize = (text) => {
  const rounds = text.split(/\n\n(?=#\d+\n)/);
  if (rounds.length === 1) return `최종: **${escapeCode(finalPart(text)).slice(0, 200)}**`;
  return `최종: ${escapeCode(rounds.map((round) => finalPart(round)).join(', ')).slice(0, 1500)}`;
};

const formatResult = (expression, result) => {
  const header = `🎲 \`${escapeCode(expression)}\``;
  if (result.text.length <= MAX_RESULT_LENGTH) {
    return { content: `${header}\n\`\`\`\n${escapeCode(result.text)}\n\`\`\``, files: [] };
  }
  // 디스코드 메시지 길이 제한을 넘으면 전체 굴림 과정은 파일로 첨부한다
  return {
    content: `${header}\n결과가 길어서 파일로 첨부했습니다. ${summarize(result.text)}`,
    files: [new AttachmentBuilder(Buffer.from(result.text, 'utf8'), { name: 'dice.txt' })],
  };
};

// /주사위 <dice_expr> — BCDice 문법의 주사위 식을 굴려 결과를 채널에 올린다.
export default {
  data: new SlashCommandBuilder()
    .setName('주사위')
    .setDescription('주사위를 굴립니다. CoC 7판(CC<=50, CC(2)<=50) 및 BCDice 문법을 지원합니다.')
    .addStringOption((option) => option
      .setName('dice_expr')
      .setDescription('주사위 식 (예: CC<=50, CBR(50,20), 3d6+1, x3 2D6, S2D6은 비밀 굴림)')
      .setRequired(true)
      .setMaxLength(MAX_INPUT_LENGTH)),

  async execute(interaction) {
    const expression = interaction.options.getString('dice_expr', true).trim();

    let result;
    try {
      result = await rollDice(expression);
    } catch (error) {
      if (!(error instanceof DiceError)) throw error;
      await interaction.reply({ content: `🎲 \`${escapeCode(expression)}\`: ${error.message}`, flags: MessageFlags.Ephemeral });
      return;
    }

    const message = formatResult(expression, result);
    if (!result.secret) {
      await interaction.reply({ ...message, allowedMentions: { parse: [] } });
      return;
    }

    // 시크릿 롤(S로 시작): 결과는 굴린 사람에게만 보여주고, 채널에는 굴렸다는 사실만 알린다
    await interaction.reply({ ...message, flags: MessageFlags.Ephemeral });
    // followUp은 첫 응답이 비공개여도 따로 공개 메시지로 보낼 수 있다 (채널 전송 권한 불필요)
    await interaction.followUp({
      content: `🎲 ${interaction.user} 님이 비밀 주사위를 굴렸습니다.`,
      allowedMentions: { parse: [] },
    });
  },
};
