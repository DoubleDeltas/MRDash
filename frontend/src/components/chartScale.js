// 4칸 눈금이 깔끔하게 떨어지는 간격 (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ)
const STEP_MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

// 관측 범위의 최댓값을 기준으로 한 y축 최댓값 (최솟값은 0).
// 최댓값보다 10% 여유를 두고, 4칸 눈금 간격이 깔끔한 값으로 올린다. cap이 있으면 그 이상으로 키우지 않는다.
// 개수처럼 정수인 값은 minStep: 1을 줘서 눈금이 0.3명 같은 소수가 되지 않게 한다.
export const maxScale = (values, { fallback = 1, cap = Infinity, minStep = 0 } = {}) => {
  const observed = Math.max(...values.filter(v => v != null))
  if (!Number.isFinite(observed) || observed <= 0) return Math.min(fallback, cap)

  const rawStep = (observed * 1.1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  let step = Math.max(minStep, STEP_MULTIPLIERS.map(m => m * magnitude).find(s => s >= rawStep))
  // 정수 눈금이면 1.5, 2.5 같은 간격도 올림 (0, 1.5, 3, 4.5명 방지)
  if (minStep >= 1) step = Math.ceil(step)
  // 0.15 × 4 = 0.6000000000000001 같은 부동소수점 오차 제거
  return Math.min(+(step * 4).toPrecision(12), cap)
}

// y축 눈금 라벨 — 범위가 작으면 소수 첫째 자리까지
export const formatTick = (value, range) =>
  (Number.isInteger(value) || range >= 20 ? Math.round(value) : +value.toFixed(1))
