import { useState, useEffect, useMemo, useRef } from 'react'
import './Monitoring.css'

// CLAUDE.md 기반 실제 MRDash 인프라 컨테이너 및 다크 테마 팔레트 (dataviz/palette.md)
const CONTAINERS = [
  { id: 'mc-survival', name: 'mc-survival', baseCpu: 26, baseMem: 3.8, color: '#3987e5' },     // Blue
  { id: 'mc-creative', name: 'mc-creative', baseCpu: 14, baseMem: 2.2, color: '#d95926' },     // Orange
  { id: 'mrdash-backend', name: 'mrdash-backend', baseCpu: 5, baseMem: 0.8, color: '#199e70' }, // Aqua
  { id: 'mrdash-frontend', name: 'mrdash-frontend', baseCpu: 2, baseMem: 0.3, color: '#c98500' },// Yellow
  { id: 'mysql', name: 'mysql', baseCpu: 7, baseMem: 1.4, color: '#d55181' },                  // Magenta
  { id: 'redis', name: 'redis', baseCpu: 2, baseMem: 0.4, color: '#9085e9' },                  // Violet
]

const TOTAL_MEMORY_GB = 16.0

// 시계열 랜덤 데이터 생성기 (나중에 Prometheus API 연동으로 교체 예정)
function generateMockTimeSeries(count = 12) {
  const now = Date.now()
  const intervalMs = 2 * 60 * 1000 // 2분 간격

  return Array.from({ length: count }, (_, i) => {
    const time = new Date(now - (count - 1 - i) * intervalMs)
    const timeLabel = time.toTimeString().slice(0, 5)

    let totalCpu = 0
    let totalMemory = 0

    const containerValues = CONTAINERS.map(c => {
      // 현실적인 자연스러운 변동폭 (CPU: ±40%, Memory: ±15%)
      const cpuJitter = (Math.random() - 0.5) * (c.baseCpu * 0.5)
      const memJitter = (Math.random() - 0.5) * (c.baseMem * 0.2)

      const cpu = Math.max(0.5, +(c.baseCpu + cpuJitter).toFixed(1))
      const memory = Math.max(0.1, +(c.baseMem + memJitter).toFixed(2))

      totalCpu += cpu
      totalMemory += memory

      return {
        id: c.id,
        name: c.name,
        color: c.color,
        cpu,
        memory,
      }
    })

    return {
      timestamp: time.getTime(),
      time: timeLabel,
      totalCpu: +Math.min(100, totalCpu).toFixed(1),
      totalMemory: +Math.min(TOTAL_MEMORY_GB, totalMemory).toFixed(2),
      containers: containerValues,
    }
  })
}

// 꺾은선 그래프 (전체 뷰용)
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
      const yVal = Math.min(maxVal, Math.max(0, d[dataKey]))
      const y = padTop + plotH - (yVal / maxVal) * plotH
      return { x, y, val: d[dataKey], time: d.time }
    })
  }, [data, dataKey, maxVal, plotW, plotH])

  const pathD = useMemo(() => {
    if (!points.length) return ''
    return points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '')
  }, [points])

  const areaD = useMemo(() => {
    if (!points.length) return ''
    const baseLine = padTop + plotH
    const firstX = points[0].x.toFixed(1)
    const lastX = points[points.length - 1].x.toFixed(1)
    return `${pathD} L ${lastX} ${baseLine} L ${firstX} ${baseLine} Z`
  }, [pathD, points, padTop, plotH])

  // Y축 눈금선 (4단계)
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(ratio => ({
    val: Math.round(maxVal * ratio),
    y: padTop + plotH - ratio * plotH,
  }))

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
      const dist = Math.abs(p.x - mouseX)
      if (dist < minDist) {
        minDist = dist
        nearest = idx
      }
    })
    setHoverIdx(nearest)
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
            <g key={t.val}>
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

// 누적 막대 그래프 (Docker 컨테이너별 뷰용)
function StackedBarChart({ data, containers, metric, unit, maxVal, title }) {
  const svgRef = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  const width = 560
  const height = 240
  const padLeft = 46
  const padRight = 16
  const padTop = 20
  const padBottom = 32

  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom

  // 막대 너비 및 간격
  const barCount = data.length
  const step = plotW / barCount
  const barWidth = Math.min(24, Math.max(12, step - 6))

  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(ratio => ({
    val: Math.round(maxVal * ratio),
    y: padTop + plotH - ratio * plotH,
  }))

  const handlePointerMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mouseX = ((e.clientX - rect.left) / rect.width) * width
    if (mouseX < padLeft || mouseX > width - padRight) {
      setHoverIdx(null)
      return
    }
    const idx = Math.floor((mouseX - padLeft) / step)
    if (idx >= 0 && idx < barCount) {
      setHoverIdx(idx)
    } else {
      setHoverIdx(null)
    }
  }

  const activeData = hoverIdx !== null ? data[hoverIdx] : null

  return (
    <div className="monitoring-chart-card">
      <div className="chart-header">
        <h3 className="chart-title">{title}</h3>
        {activeData && (
          <div className="chart-active-stat">
            <span className="stat-time">{activeData.time}</span>
            <span className="stat-val">
              합계 {metric === 'cpu' ? activeData.totalCpu : activeData.totalMemory} {unit}
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
            <g key={t.val}>
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

          {/* 누적 막대 렌더링 */}
          {data.map((d, colIdx) => {
            const barX = padLeft + colIdx * step + (step - barWidth) / 2
            let currentStackH = 0
            const isHovered = hoverIdx === colIdx

            return (
              <g key={colIdx} className={isHovered ? 'bar-group-active' : ''}>
                {/* 배경 호버 하이라이트 */}
                {isHovered && (
                  <rect
                    x={padLeft + colIdx * step}
                    y={padTop}
                    width={step}
                    height={plotH}
                    fill="rgba(255, 255, 255, 0.05)"
                  />
                )}

                {/* 각 컨테이너별 세그먼트 (누적) */}
                {d.containers.map((c, sIdx) => {
                  const val = c[metric]
                  const segH = (val / maxVal) * plotH
                  if (segH <= 0.5) return null

                  const y = padTop + plotH - currentStackH - segH
                  currentStackH += segH

                  // 표면 간격 (2px gap between stacked fills)
                  const gap = sIdx > 0 ? 1 : 0
                  const adjustedY = y + gap
                  const adjustedH = Math.max(1, segH - gap)

                  // 맨 위 세그먼트에는 3px 둥근 모서리 적용
                  const isTop = sIdx === d.containers.length - 1

                  return (
                    <rect
                      key={c.id}
                      x={barX}
                      y={adjustedY}
                      width={barWidth}
                      height={adjustedH}
                      fill={c.color}
                      rx={isTop ? 3 : 0}
                      ry={isTop ? 3 : 0}
                    />
                  )
                })}

                {/* X축 시간 라벨 */}
                {(colIdx % Math.ceil(barCount / 5) === 0 || colIdx === barCount - 1) && (
                  <text
                    x={barX + barWidth / 2}
                    y={height - 10}
                    textAnchor="middle"
                    className="chart-axis-text"
                  >
                    {d.time}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* 컨테이너별 상세 호버 툴팁 */}
      {activeData && (
        <div className="stacked-tooltip">
          <div className="tooltip-header">
            <strong>{activeData.time}</strong>
            <span>총 {metric === 'cpu' ? activeData.totalCpu : activeData.totalMemory} {unit}</span>
          </div>
          <div className="tooltip-items">
            {activeData.containers.map(c => (
              <div key={c.id} className="tooltip-item">
                <span className="tooltip-color-dot" style={{ backgroundColor: c.color }} />
                <span className="tooltip-name">{c.name}:</span>
                <span className="tooltip-val">{c[metric]} {unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Monitoring() {
  const [viewMode, setViewMode] = useState('total') // 'total' | 'container'
  const [data, setData] = useState(() => generateMockTimeSeries(12))
  const [autoRefresh, setAutoRefresh] = useState(true)

  // 5초 주기 시계열 업데이트 (시뮬레이션)
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      setData(prev => {
        const last = prev[prev.length - 1]
        const nextTime = new Date(last.timestamp + 2 * 60 * 1000)
        const timeLabel = nextTime.toTimeString().slice(0, 5)

        let totalCpu = 0
        let totalMemory = 0

        const containerValues = CONTAINERS.map(c => {
          const cpuJitter = (Math.random() - 0.5) * (c.baseCpu * 0.4)
          const memJitter = (Math.random() - 0.5) * (c.baseMem * 0.15)
          const cpu = Math.max(0.5, +(c.baseCpu + cpuJitter).toFixed(1))
          const memory = Math.max(0.1, +(c.baseMem + memJitter).toFixed(2))
          totalCpu += cpu
          totalMemory += memory
          return { id: c.id, name: c.name, color: c.color, cpu, memory }
        })

        const nextPoint = {
          timestamp: nextTime.getTime(),
          time: timeLabel,
          totalCpu: +Math.min(100, totalCpu).toFixed(1),
          totalMemory: +Math.min(TOTAL_MEMORY_GB, totalMemory).toFixed(2),
          containers: containerValues,
        }

        return [...prev.slice(1), nextPoint]
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  const currentPoint = data[data.length - 1] || {}

  return (
    <div className="monitoring-page">
      {/* KPI 요약 타일 */}
      <div className="monitoring-kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">전체 CPU 부하</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{currentPoint.totalCpu ?? 0}%</span>
            <span className="kpi-tag" style={{ color: currentPoint.totalCpu > 80 ? '#e34948' : '#1baf7a' }}>
              {currentPoint.totalCpu > 80 ? '주의' : '정상'}
            </span>
          </div>
          <div className="kpi-meter-bg">
            <div
              className="kpi-meter-fill"
              style={{
                width: `${Math.min(100, currentPoint.totalCpu || 0)}%`,
                backgroundColor: currentPoint.totalCpu > 80 ? '#e34948' : '#3987e5'
              }}
            />
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">할당된 메모리</span>
          <div className="kpi-value-row">
            <span className="kpi-value">
              {currentPoint.totalMemory ?? 0} <span className="kpi-unit">/ {TOTAL_MEMORY_GB} GB</span>
            </span>
            <span className="kpi-tag" style={{ color: '#1baf7a' }}>
              {Math.round(((currentPoint.totalMemory || 0) / TOTAL_MEMORY_GB) * 100)}%
            </span>
          </div>
          <div className="kpi-meter-bg">
            <div
              className="kpi-meter-fill"
              style={{
                width: `${Math.min(100, ((currentPoint.totalMemory || 0) / TOTAL_MEMORY_GB) * 100)}%`,
                backgroundColor: '#199e70'
              }}
            />
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">실행 중인 컨테이너</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{CONTAINERS.length} <span className="kpi-unit">컨테이너</span></span>
            <span className="kpi-tag" style={{ color: '#1baf7a' }}>정상 작동 중</span>
          </div>
          <div className="kpi-subtext">모든 서비스 인프라 활성화됨</div>
        </div>
      </div>

      {/* 상단 컨트롤 바 */}
      <div className="monitoring-controls-bar">
        <div className="control-group">
          <label htmlFor="view-mode-select" className="control-label">보기 모드</label>
          <select
            id="view-mode-select"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            className="monitoring-select"
          >
            <option value="total">전체 (꺾은선 그래프)</option>
            <option value="container">Docker 컨테이너별 (누적 막대 그래프)</option>
          </select>
        </div>

        <div className="control-actions">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            실시간 갱신 (5초)
          </label>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => setData(generateMockTimeSeries(12))}
            title="새 랜덤 데이터 생성"
          >
            <span className="material-icons">refresh</span>
            새로고침
          </button>
        </div>
      </div>

      {/* 컨테이너별 범례 (Docker 컨테이너별 모드 시 표시) */}
      {viewMode === 'container' && (
        <div className="container-legend-card">
          <span className="legend-title">컨테이너 범례:</span>
          <div className="legend-items">
            {CONTAINERS.map(c => (
              <div key={c.id} className="legend-item">
                <span className="legend-color-box" style={{ backgroundColor: c.color }} />
                <span className="legend-name">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 차트 그리드 (CPU 부하 & 할당된 메모리) */}
      <div className="monitoring-charts-grid">
        {viewMode === 'total' ? (
          <>
            <LineChart
              data={data}
              dataKey="totalCpu"
              unit="%"
              maxVal={100}
              title="CPU 부하 (전체 %)"
              color="#3987e5"
            />
            <LineChart
              data={data}
              dataKey="totalMemory"
              unit="GB"
              maxVal={TOTAL_MEMORY_GB}
              title="할당된 메모리 (전체 GB)"
              color="#199e70"
            />
          </>
        ) : (
          <>
            <StackedBarChart
              data={data}
              containers={CONTAINERS}
              metric="cpu"
              unit="%"
              maxVal={100}
              title="CPU 부하 (컨테이너별 누적 %)"
            />
            <StackedBarChart
              data={data}
              containers={CONTAINERS}
              metric="memory"
              unit="GB"
              maxVal={TOTAL_MEMORY_GB}
              title="할당된 메모리 (컨테이너별 누적 GB)"
            />
          </>
        )}
      </div>
    </div>
  )
}

export default Monitoring
