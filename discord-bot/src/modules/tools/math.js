import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { renderTex, TexError } from './tex-renderer.js';

const MAX_INPUT_LENGTH = 1000;

// /수식 <katex> — TeX 수식을 이미지로 렌더링해 채널에 올린다.
export default {
  data: new SlashCommandBuilder()
    .setName('수식')
    .setDescription('KaTeX(TeX) 수식을 이미지로 렌더링합니다.')
    .addStringOption((option) => option
      .setName('katex')
      .setDescription('렌더링할 수식 (예: \\frac{a}{b} + \\sqrt{x^2})')
      .setRequired(true)
      .setMaxLength(MAX_INPUT_LENGTH)),

  async execute(interaction) {
    const tex = interaction.options.getString('katex', true).trim();

    let png;
    try {
      png = await renderTex(tex);
    } catch (error) {
      if (!(error instanceof TexError)) throw error;
      // 문법 오류는 입력한 사람에게만 보여준다
      await interaction.reply({
        content: `수식을 렌더링할 수 없습니다: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const attachment = new AttachmentBuilder(png, { name: 'math.png' })
      .setDescription(tex.slice(0, 1024)); // 대체 텍스트로 원본 수식을 남긴다
    await interaction.reply({ files: [attachment] });
  },
};
