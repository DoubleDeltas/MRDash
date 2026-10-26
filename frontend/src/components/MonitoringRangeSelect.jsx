// 모니터링 그래프 조회 기간 — 백엔드 util/monitoringRange.js의 선택지와 맞춘다
export const RANGE_OPTIONS = [
  { minutes: 1, label: '1분' },
  { minutes: 5, label: '5분' },
  { minutes: 10, label: '10분' },
  { minutes: 30, label: '30분' },
  { minutes: 60, label: '1시간' },
  { minutes: 120, label: '2시간' },
  { minutes: 360, label: '6시간' },
  { minutes: 720, label: '12시간' },
  { minutes: 1440, label: '24시간' },
]

export const DEFAULT_RANGE_MINUTES = 10

// 백엔드가 알려주는 조회 간격(초)을 "15초", "24분" 같은 글자로
export const formatStep = (sec) => (sec < 60 ? `${sec}초` : `${Math.round(sec / 60)}분`)

function MonitoringRangeSelect({ value, onChange }) {
  return (
    <div className="control-group">
      <label htmlFor="monitoring-range-select" className="control-label">기간</label>
      <select
        id="monitoring-range-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="monitoring-select"
      >
        {RANGE_OPTIONS.map(option => (
          <option key={option.minutes} value={option.minutes}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

export default MonitoringRangeSelect
