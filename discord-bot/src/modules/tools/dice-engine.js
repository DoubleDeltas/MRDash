import bcdice from 'bcdice';

// CoC 7판 한국어판을 먼저 시도하고, 해당 시스템에서 인식하지 못하면 범용 DiceBot으로 넘긴다.
// 범용 문법: https://docs.bcdice.org/command/
// CoC 7판: CC(보너스/페널티)<=기능치, CC<=기능치h/e/r/c, CBR(x,y), FAR(...), 광기/공포증/집착증 표 등.
// DiceBot: 가산 다이스, 바라바라, 추가/무한 굴림, 집계, D66, 계산, 선택, 반복, 시크릿, BCDiceVersion 등.

const { DynamicLoader } = bcdice;

export class DiceError extends Error {}

let gameSystemsPromise = null;
const loadGameSystems = () => {
  gameSystemsPromise ??= (async () => {
    const loader = new DynamicLoader();
    const [coc7, diceBot] = await Promise.all([
      loader.dynamicLoad('Cthulhu7th:Korean'),
      loader.dynamicLoad('DiceBot'),
    ]);
    return [coc7, diceBot];
  })();
  return gameSystemsPromise;
};

const evaluate = (systems, expression) => {
  for (const system of systems) {
    const result = system.eval(expression);
    if (result) return result;
  }
  return null;
};

// CoC 7판의 BMR/BMS/FCL/FCM/PH/MA 표는 BCDice 원본 데이터가 일본어로만 제공된다.
const JAPANESE_TABLE_COMMAND = /^(?:S)?(?:BMR|BMS|FCL|FCM|PH|MA)\b/i;

// 범용 명령의 결과 문구는 일본어(ja_jp)만 있어서, 고정 문구를 한국어로 바꾼다.
// 긴 문구부터 바꿔야 '成功数'가 '成功'으로 먼저 바뀌지 않는다.
const TRANSLATIONS = [
  ['条件が間違っています。2R6>=5 あるいは 2R6[5] のように振り足し目標値を指定してください。',
    '조건이 잘못되었습니다. 2R6>=5 또는 2R6[5]처럼 추가 굴림 목표값을 지정하세요.'],
  ['無限ロールの条件がまちがっています', '무한 굴림 조건이 잘못되었습니다'],
  ['ゼロ除算が発生したため計算できませんでした', '0으로 나눌 수 없어 계산하지 못했습니다'],
  ['項目数は100以下としてください', '항목 수는 100개 이하여야 합니다'],
  ['Repeatコマンドの重複はできません', '반복 명령은 중첩할 수 없습니다'],
  ['繰り返し対象のコマンドが実行できませんでした', '반복할 명령을 실행하지 못했습니다'],
  [/繰り返し回数は1以上、(\d+)以下としてください/g, '반복 횟수는 1 이상 $1 이하여야 합니다'],
  [/面数は1以上、(\d+)以下としてください/g, '면 수는 1 이상 $1 이하여야 합니다'],
  ['(最大/合計)', '(최대/합계)'],
  ['クリティカル', '크리티컬'],
  ['ファンブル', '펌블'],
  ['成功数', '성공 수 '],
  ['成功', '성공'],
  ['失敗', '실패'],
];

const translate = (text) => TRANSLATIONS.reduce(
  (result, [from, to]) => (typeof from === 'string' ? result.replaceAll(from, to) : result.replace(from, to)),
  text,
);

/**
 * 주사위 식을 굴린다.
 * @returns {{ text: string, secret: boolean, success: boolean, failure: boolean, critical: boolean, fumble: boolean }}
 * @throws {DiceError} 인식할 수 없거나 처리할 수 없는 식
 */
export async function rollDice(expression) {
  const systems = await loadGameSystems();
  let result;
  try {
    result = evaluate(systems, expression);
  } catch {
    // 주사위 개수가 너무 많은 식 등은 엔진이 메시지 없이 예외를 던진다.
    throw new DiceError('주사위 식을 처리할 수 없습니다. 주사위 개수나 값이 너무 크지 않은지 확인하세요.');
  }
  if (!result) throw new DiceError('인식할 수 없는 주사위 식입니다.');

  let text = translate(result.text);
  if (JAPANESE_TABLE_COMMAND.test(expression)) {
    text = `※ 이 표의 결과는 BCDice에 한국어 번역이 없어 일본어로 표시됩니다.\n${text}`;
  }
  return {
    text,
    secret: result.secret,
    success: result.success,
    failure: result.failure,
    critical: result.critical,
    fumble: result.fumble,
  };
}

export const warmUp = () => loadGameSystems();
