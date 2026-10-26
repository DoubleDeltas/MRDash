import { useState, useMemo, useRef } from 'react'

// 꺾은선 그래프 (모니터링 페이지 공용) — 스타일은 pages/Monitoring.css
function LineChart({ data, dataKey, unit, maxVal, title, color }) {
  const svgRef = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  const width = 560
  const height = 220
  const padLeft = 46
  const padRight = 16
  const padTop = 20
  const padBottom = 32

  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  const points = useMemo(() => {
    if (!data.length) return []
    return data.map((d, i) => {
      const x = padLeft + (i / (data.length - 1)) * plotW
      const val = d[dataKey]
      // 값이 없는 시점(null)은 선을 끊는다
      if (val == null) return { x, y: null, val: null, time: d.time }
      const yVal = Math.min(maxVal, Math.max(0, val))
      const y = padTop + plotH - (yVal / maxVal) * plotH
      return { x, y, val, time: d.time }
    })
  }, [data, dataKey, maxVal, plotW, plotH])

  // null로 끊긴 구간별로 선/면을 그린다
  const segments = useMemo(() => {
    const result = []
    let current = []
    for (const p of points) {
      if (p.y == null) {
        if (current.length) result.push(current)
        current = []
      } else {
        current.push(p)
      }
    }
    if (current.length) result.push(current)
    return result
  }, [points])

  const pathD = useMemo(() => segments
    .map(seg => seg.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '))
    .join(' '), [segments])

  const areaD = useMemo(() => {
    const baseLine = padTop + plotH
    return segments.map(seg => {
      const line = seg.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
      return `${line} L ${seg.at(-1).x.toFixed(1)} ${baseLine} L ${seg[0].x.toFixed(1)} ${baseLine} Z`
    }).join(' ')
  }, [segments, padTop, plotH])

  // Y축 눈금선 (4단계) — 범위가 작으면(예: 메모리 6GB) 소수 첫째 자리까지 표시
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(ratio => {
    const raw = maxVal * ratio
    return {
      ratio,
      val: Number.isInteger(raw) || maxVal >= 20 ? Math.round(raw) : +raw.toFixed(1),
      y: padTop + plotH - ratio * plotH,
    }
  })

  const handlePointerMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mouseX = ((e.clientX - rect.left) / rect.width) * width
    if (mouseX < padLeft - 10 || mouseX > width - padRight + 10) {
      setHoverIdx(null)
      return
    }

    let nearest = 0
    let minDist = Infinity
    points.forEach((p, idx) => {
      if (p.y == null) return
      const dist = Math.abs(p.x - mouseX)
      if (dist < minDist) {
        minDist = dist
        nearest = idx
      }
    })
    setHoverIdx(minDist === Infinity ? null : nearest)
  }

  const activePoint = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div className="monitoring-chart-card">
      <div className="chart-header">
        <h3 className="chart-title">{title}</h3>
        {activePoint && (
          <div className="chart-active-stat">
            <span className="stat-time">{activePoint.time}</span>
            <span className="stat-val" style={{ color }}>
              {activePoint.val} {unit}
            </span>
          </div>
        )}
      </div>

      <div className="chart-svg-container">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="monitoring-svg"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* Y축 그리드선 및 라벨 */}
          {yTicks.map(t => (
            <g key={t.ratio}>
              <line
                x1={padLeft}
                y1={t.y}
                x2={width - padRight}
                y2={t.y}
                stroke="#383835"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={t.y + 4}
                textAnchor="end"
                className="chart-axis-text"
              >
                {t.val}{unit === '%' ? '%' : ''}
              </text>
            </g>
          ))}

          {/* X축 시간 라벨 */}
          {points.map((p, i) => {
            // 라벨 겹침 방지: 약 3~4개 간격으로만 표시
            const shouldShow = i % Math.ceil(points.length / 5) === 0 || i === points.length - 1
            if (!shouldShow) return null
            return (
              <text
                key={i}
                x={p.x}
                y={height - 10}
                textAnchor="middle"
                className="chart-axis-text"
              >
                {p.time}
              </text>
            )
          })}

          {/* 데이터 영역 면 워시 (10% 투명도) */}
          <path d={areaD} fill={color} fillOpacity="0.12" />

          {/* 꺾은선 (2px) */}
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 호버 시 수직 crosshair 및 포인트 */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={padTop + plotH}
                stroke="#898781"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="5"
                fill={color}
                stroke="#2F3136"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

export default LineChart
