// 모니터링 그래프 조회 기간.
// - 최근 N: 지금부터 N만큼 전까지 (Grafana from=now-N, to=now)
// - 달력 기간(오늘·이번 주…금년): 현재 주기의 첫날 0시부터 마지막 날 끝까지 (브라우저 시간대 기준, 주는 월요일 시작).
//   Grafana에는 "이번 반기" 같은 단위가 없어서 달력 기간은 모두 시작·끝 시각(ms)을 직접 계산해 넘긴다.
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

// Grafana는 상대 시간의 숫자를 5자리까지만 해석하고, 넘으면 대시보드 기본 기간(10분)으로 돌아간다
// (예: now-129600m). 나누어떨어지는 가장 큰 단위(일·시간·분)로 써서 숫자를 짧게 유지한다.
const relativeFor = (minutes) => {
  if (minutes % 1440 === 0) return `now-${minutes / 1440}d`
  if (minutes % 60 === 0) return `now-${minutes / 60}h`
  return `now-${minutes}m`
}

const recent = (id, label, minutes) => ({ id, label, group: '최근', relative: relativeFor(minutes), ms: minutes * MINUTE })

// 현재 주기의 [시작, 끝] (끝은 다음 주기 시작 1ms 전)
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const calendar = (id, label, periodOf) => ({ id, label, group: '달력 기간', periodOf })
const monthPeriod = (now, months) => {
  const startMonth = Math.floor(now.getMonth() / months) * months
  return [new Date(now.getFullYear(), startMonth, 1), new Date(now.getFullYear(), startMonth + months, 1) - 1]
}

export const RANGE_OPTIONS = [
  recent('1m', '1분', 1),
  recent('5m', '5분', 5),
  recent('10m', '10분', 10),
  recent('30m', '30분', 30),
  recent('1h', '1시간', 60),
  recent('2h', '2시간', 120),
  recent('6h', '6시간', 360),
  recent('12h', '12시간', 720),
  recent('24h', '24시간', 1440),
  recent('3d', '3일', 3 * 1440),
  recent('7d', '7일', 7 * 1440),
  recent('30d', '30일', 30 * 1440),
  recent('90d', '90일', 90 * 1440),
  recent('180d', '180일', 180 * 1440),
  recent('365d', '365일', 365 * 1440),
  calendar('today', '오늘', (now) => {
    const start = startOfDay(now)
    return [start, +start + DAY - 1]
  }),
  calendar('week', '이번 주', (now) => {
    const start = startOfDay(now)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // 월요일로
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return [start, end - 1]
  }),
  calendar('month', '이번 달', (now) => monthPeriod(now, 1)),
  calendar('quarter', '이번 분기', (now) => monthPeriod(now, 3)),
  calendar('half', '이번 반기', (now) => monthPeriod(now, 6)),
  calendar('year', '금년', (now) => monthPeriod(now, 12)),
]

export const DEFAULT_RANGE = '10m'

// 기간이 길수록 그래프를 덜 자주 새로 그린다 (Grafana refresh)
const refreshFor = (ms) => {
  if (ms <= 10 * MINUTE) return '15s'
  if (ms <= 30 * MINUTE) return '30s'
  if (ms <= DAY) return '1m'
  if (ms <= 31 * DAY) return '5m'
  return '15m'
}

// 선택한 기간 → Grafana 주소에 넣을 { from, to, refresh }
export const resolveRange = (id, now = new Date()) => {
  const option = RANGE_OPTIONS.find(o => o.id === id) ?? RANGE_OPTIONS.find(o => o.id === DEFAULT_RANGE)
  if (option.relative) {
    return { from: option.relative, to: 'now', refresh: refreshFor(option.ms) }
  }
  const [start, end] = option.periodOf(now)
  return { from: String(+start), to: String(+end), refresh: refreshFor(end - start) }
}

// Grafana refresh 값("15s", "5m")을 "15초", "5분"으로
export const formatRefresh = (refresh) => refresh.replace(/s$/, '초').replace(/m$/, '분')

function MonitoringRangeSelect({ value, onChange }) {
  const groups = [...new Set(RANGE_OPTIONS.map(o => o.group))]
  return (
    <div className="control-group">
      <label htmlFor="monitoring-range-select" className="control-label">기간</label>
      <select
        id="monitoring-range-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="monitoring-select"
      >
        {groups.map(group => (
          <optgroup key={group} label={group}>
            {RANGE_OPTIONS.filter(o => o.group === group).map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

export default MonitoringRangeSelect
