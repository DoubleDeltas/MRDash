import { existsSync } from 'node:fs';
import { renderAsync } from '@resvg/resvg-js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

// TeX(KaTeX 문법) → SVG(MathJax) → PNG(resvg). 브라우저·캔버스 없이 순수 Node로 렌더링한다.

const FOREGROUND = '#ffffff';
// 디스코드 기본(다크) 테마의 채팅 배경색. 투명으로 두면 라이트 테마에서 흰 글씨가 안 보여서 칠한다.
const BACKGROUND = '#313338';
const EX_PX = 20; // 1ex의 픽셀 크기 (본문 글자 크기 ≈ 40px)
const PADDING_PX = 24;
const MAX_SVG_LENGTH = 500_000;
const MAX_SIDE_PX = 4000;

export class TexError extends Error {}

// 수식 기호는 MathJax가 path로 그리므로 글꼴이 필요 없다. 글꼴은 \text{...} 안의 글자에만 쓰인다.
// 서버 이미지에는 fonts-nanum을 설치한다 (Dockerfile). 시스템 글꼴 전체를 읽으면 렌더링마다 느려서
// 나눔고딕 파일이 있으면 그것만 쓰고, 없을 때만(로컬 개발 등) 시스템 글꼴을 읽는다.
const TEXT_FONT = 'NanumGothic';
const TEXT_FONT_FILES = [
  '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
  'C:/Windows/Fonts/NanumGothic.ttf',
].filter((path) => existsSync(path));
const FONT_OPTIONS = {
  fontFiles: TEXT_FONT_FILES,
  loadSystemFonts: TEXT_FONT_FILES.length === 0,
  defaultFontFamily: TEXT_FONT,
  serifFamily: TEXT_FONT,
  sansSerifFamily: TEXT_FONT,
  monospaceFamily: TEXT_FONT,
};

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const EXCLUDED_PACKAGES = [
  // 확장 패키지를 동적으로 불러오는 기능 — 사용자 입력으로 쓰이지 않게 뺀다
  'require', 'autoload',
  // 정의되지 않은 명령을 빨간 글씨로 그리는 패키지 — 빼서 오류로 알린다
  'noundefined',
  // 전경·배경색을 바꾸는 명령(\color, \colorbox, \bbox, \style 등) — 색을 흰색/디스코드 배경으로 고정한다
  'color', 'colorv2', 'bbox', 'html',
];

const tex = new TeX({
  packages: AllPackages.filter((name) => !EXCLUDED_PACKAGES.includes(name)),
  // 기본 동작은 오류를 빨간 글씨로 렌더링하는 것 — 대신 예외로 바꿔 사용자에게 메시지로 알린다
  formatError(_jax, error) {
    throw new TexError(error.message);
  },
});
const svg = new SVG({ fontCache: 'local' });
const html = mathjax.document('', { InputJax: tex, OutputJax: svg });

const exToPx = (value) => {
  const match = /^([\d.]+)ex$/.exec(value ?? '');
  if (!match) throw new Error(`예상치 못한 SVG 크기: ${value}`);
  return Number(match[1]) * EX_PX;
};

const toSvg = (source) => {
  const container = html.convert(source, { display: true });
  const node = adaptor.firstChild(container);
  const width = exToPx(adaptor.getAttribute(node, 'width'));
  const height = exToPx(adaptor.getAttribute(node, 'height'));
  if (width > MAX_SIDE_PX || height > MAX_SIDE_PX) throw new TexError('수식이 너무 큽니다.');

  // ex 단위 크기를 px로 고정하고, 전경색을 지정한다 (MathJax는 currentColor로 그린다)
  adaptor.setAttribute(node, 'width', `${width}px`);
  adaptor.setAttribute(node, 'height', `${height}px`);
  adaptor.removeAttribute(node, 'style');
  const inner = adaptor.outerHTML(node).replaceAll('currentColor', FOREGROUND);
  if (inner.length > MAX_SVG_LENGTH) throw new TexError('수식이 너무 복잡합니다.');

  // 여백과 배경을 두른 바깥 SVG로 감싼다
  const outerWidth = Math.ceil(width + PADDING_PX * 2);
  const outerHeight = Math.ceil(height + PADDING_PX * 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outerWidth}" height="${outerHeight}">`
    + `<rect width="100%" height="100%" fill="${BACKGROUND}"/>`
    + `<g transform="translate(${PADDING_PX} ${PADDING_PX})">${inner}</g>`
    + '</svg>';
};

/** TeX 문자열을 PNG Buffer로 렌더링한다. 문법 오류·크기 초과는 TexError. */
export async function renderTex(source) {
  const image = await renderAsync(toSvg(source), { font: FONT_OPTIONS });
  return image.asPng();
}

// 첫 변환 때 MathJax가 패키지·글리프 데이터를 준비하느라 오래 걸리므로, 봇 시작 시 미리 한 번 돌려 둔다.
// (디스코드는 명령에 3초 안에 응답해야 한다)
export const warmUp = () => renderTex(String.raw`\int_0^1 \frac{x^2}{2}\,dx + \text{가}`);
