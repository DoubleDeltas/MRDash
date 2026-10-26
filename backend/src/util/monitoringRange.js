// 모니터링 그래프의 조회 기간 (?range=<분>) — 프론트의 선택지(components/MonitoringRangeSelect.jsx)와 맞춘다
export const RANGE_OPTIONS_MINUTES = [1, 5, 10, 30, 60, 120, 360, 720, 1440];
export const DEFAULT_RANGE_MINUTES = 10;

// Prometheus scrape_interval보다 촘촘하게 조회해 봐야 같은 값만 나온다
const SCRAPE_INTERVAL_SEC = 15;
// 기간이 길어도 그래프 한 개에 점이 이 정도만 찍히게 조회 간격(step)을 늘린다
const TARGET_POINTS = 60;

export const parseRangeMinutes = (value) => {
  const minutes = Number(value);
  return RANGE_OPTIONS_MINUTES.includes(minutes) ? minutes : DEFAULT_RANGE_MINUTES;
};

// 조회 간격: 15초 단위로 올림 (10분 → 15초 × 40개, 1시간 → 60초 × 60개, 24시간 → 24분 × 60개)
export const rangeStepSec = (minutes) =>
  Math.max(SCRAPE_INTERVAL_SEC, Math.ceil((minutes * 60) / TARGET_POINTS / SCRAPE_INTERVAL_SEC) * SCRAPE_INTERVAL_SEC);

// query_range에 넘길 { start, end, step } — end를 step 단위로 맞춰 매번 같은 시각에 점이 찍히게 한다
export const rangeWindow = (minutes) => {
  const step = rangeStepSec(minutes);
  const end = Math.floor(Date.now() / 1000 / step) * step;
  return { start: end - minutes * 60 + step, end, step };
};

// 다시 조회하는 주기 — 조회 간격(step)마다면 충분하지만, 타이머가 step 경계와 어긋나 있으면
// 새 점이 최대 step만큼 늦게 보이므로 긴 기간에서도 1분마다는 확인한다
export const pollIntervalMs = (minutes) => Math.min(rangeStepSec(minutes), 60) * 1000;
