import { useMemo, useState } from 'react'

const WIDTH = 720
const HEIGHT = 250
const PAD = { top: 18, right: 18, bottom: 30, left: 58 }
const X_TICKS = 4
const Y_TICKS = 4

const formatValue = (value, kind) => {
  if (!Number.isFinite(value)) return '—'
  if (kind === 'percent') return `${Math.round(value)}%`
  if (kind === 'memory') return `${value.toFixed(1)} GB`
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} G`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} K`
  return `${Math.round(value)}`
}

const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString([], {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

const buildLinePath = (values, x, y) => {
  let drawing = false
  return values.map((item) => {
    if (!Number.isFinite(item.value)) {
      drawing = false
      return ''
    }
    const command = drawing ? 'L' : 'M'
    drawing = true
    return `${command} ${x(item.timestamp).toFixed(1)} ${y(item.value).toFixed(1)}`
  }).filter(Boolean).join(' ')
}

function HostMetricChart({ title, series, unit, kind, description }) {
  const [activeTimestamp, setActiveTimestamp] = useState(null)
  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const allValues = series.flatMap((line) => line.values.filter((item) => Number.isFinite(item.value)))
  const minTime = allValues.length ? Math.min(...allValues.map((item) => item.timestamp)) : 0
  const maxTime = allValues.length ? Math.max(...allValues.map((item) => item.timestamp)) : 0
  const maxValue = kind === 'percent' ? 100 : Math.max(1, ...allValues.map((item) => item.value))
  const points = useMemo(() => {
    if (!allValues.length) return []
    const x = (timestamp) => PAD.left + ((timestamp - minTime) / Math.max(1, maxTime - minTime)) * plotWidth
    const y = (value) => PAD.top + (1 - value / maxValue) * plotHeight
    const samples = new Map()
    for (const line of series) {
      for (const item of line.values) {
        if (!samples.has(item.timestamp)) samples.set(item.timestamp, new Map())
        samples.get(item.timestamp).set(line.label, item.value)
      }
    }
    return [...samples.entries()].sort(([left], [right]) => left - right).map(([timestamp, values]) => ({
      timestamp,
      x: x(timestamp),
      lines: series.map((line) => {
        const value = values.get(line.label)
        return { label: line.label, color: line.color, value, y: Number.isFinite(value) ? y(value) : null }
      }),
    }))
  }, [series, allValues.length, minTime, maxTime, maxValue, plotWidth, plotHeight])
  const x = (timestamp) => PAD.left + ((timestamp - minTime) / Math.max(1, maxTime - minTime)) * plotWidth
  const y = (value) => PAD.top + (1 - value / maxValue) * plotHeight
  const paths = series.map((line) => ({ ...line, d: buildLinePath(line.values, x, y) }))
  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, index) => {
    const value = (maxValue * (Y_TICKS - index)) / Y_TICKS
    return { value, y: y(value) }
  })
  const activeIndex = activeTimestamp === null ? points.length - 1 : points.findIndex((point) => point.timestamp === activeTimestamp)
  const current = points[activeIndex < 0 ? points.length - 1 : activeIndex]
  const displayValues = current?.lines.map((line) => `${line.label}: ${formatValue(line.value, kind)}${kind === 'network' ? 'bps' : ''}`).join(', ')

  const selectPoint = (svgX) => {
    if (!points.length) return
    const index = points.reduce((best, point, i) => Math.abs(point.x - svgX) < Math.abs(points[best].x - svgX) ? i : best, 0)
    setActiveTimestamp(points[index].timestamp)
  }
  const onPointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    selectPoint(((event.clientX - rect.left) / rect.width) * WIDTH)
  }
  const onKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !points.length) return
    event.preventDefault()
    const from = activeIndex < 0 ? points.length - 1 : activeIndex
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1
      : Math.max(0, Math.min(points.length - 1, from + (event.key === 'ArrowLeft' ? -1 : 1)))
    setActiveTimestamp(points[next].timestamp)
  }

  return (
    <section className="host-metric-card" aria-label={title}>
      <header className="host-metric-header">
        <div><h3>{title}</h3><p>{description}</p></div>
        {current && <span className="host-metric-current">{formatValue(current.lines[0]?.value, kind)}{kind === 'network' ? 'bps' : ''}</span>}
      </header>
      {points.length === 0 ? <div className="host-metric-empty">데이터를 수집하는 중입니다…</div> : (
        <div className="host-metric-plot-wrap">
          <svg
            className="host-metric-plot"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`${title}, 최근 10분. 현재 시각 ${formatTime(current.timestamp)}. ${displayValues ?? ''}`}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setActiveTimestamp(null)}
            onKeyDown={onKeyDown}
            tabIndex={0}
          >
            {yTicks.map((tick) => <g key={tick.value}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={tick.y} y2={tick.y} className="host-metric-gridline" />
              <text x={PAD.left - 9} y={tick.y + 4} textAnchor="end" className="host-metric-axis-label">{formatValue(tick.value, kind)}</text>
            </g>)}
            {Array.from({ length: X_TICKS + 1 }, (_, index) => {
              const timestamp = minTime + ((maxTime - minTime) * index) / X_TICKS
              const tickX = PAD.left + (plotWidth * index) / X_TICKS
              return <text key={index} x={tickX} y={HEIGHT - 7} textAnchor={index === 0 ? 'start' : index === X_TICKS ? 'end' : 'middle'} className="host-metric-axis-label">{formatTime(timestamp)}</text>
            })}
            {paths.map((line) => <path key={line.label} d={line.d} fill="none" stroke={line.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />)}
            {current && <line x1={current.x} x2={current.x} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="host-metric-crosshair" />}
            {current?.lines.map((line) => line.y !== null && <circle key={line.label} cx={current.x} cy={line.y} r="4" fill={line.color} stroke="var(--host-chart-surface, #2f3136)" strokeWidth="2" pointerEvents="none" />)}
            <rect x={PAD.left} y={PAD.top} width={plotWidth} height={plotHeight} fill="transparent" />
          </svg>
          {current && <div className="host-metric-tooltip" aria-hidden="true"><strong>{formatTime(current.timestamp)}</strong>{current.lines.map((line) => <span key={line.label}><i style={{ background: line.color }} />{line.label}: {formatValue(line.value, kind)}{kind === 'network' ? 'bps' : ''}</span>)}</div>}
        </div>
      )}
      {series.length > 1 && <div className="host-metric-legend">{series.map((line) => <span key={line.label}><i style={{ background: line.color }} />{line.label}</span>)}</div>}
      <details className="host-metric-table-wrap">
        <summary>표로 데이터 보기</summary>
        <div className="host-metric-table-scroll"><table><caption>{title} — 최근 10분 중 최근 20개 샘플</caption><thead><tr><th scope="col">시각</th>{series.map((line) => <th scope="col" key={line.label}>{line.label} ({unit})</th>)}</tr></thead><tbody>{points.slice(-20).map((point) => <tr key={point.timestamp}><th scope="row">{formatTime(point.timestamp)}</th>{point.lines.map((line) => <td key={line.label}>{formatValue(line.value, kind)}</td>)}</tr>)}</tbody></table></div>
      </details>
    </section>
  )
}

export default HostMetricChart
