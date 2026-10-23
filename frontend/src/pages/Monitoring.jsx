import { useState, useEffect, useMemo, useRef } from 'react'
import { WS_BASE_URL } from '../api/client'
import './Monitoring.css'

// 다크 테마 categorical 팔레트 (dataviz/palette.md) — 컨테이너 이름순으로 배정
const CONTAINER_PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#1baf7a', '#e34948']

// 백엔드 /ws/monitoring 스트림의 point에 화면용 시간 라벨과 컨테이너 색을 붙인다.
function decoratePoints(points) {
  const names = [...new Set(points.flatMap(p => p.containers.map(c => c.name)))].sort()
  const colorOf = Object.fromEntries(names.map((name, i) => [name, CONTAINER_PALETTE[i % CONTAINER_PALETTE.length]]))
  const containers = names.map(name => ({ id: name, name, color: colorOf[name] }))

  const data = points.map(p => ({
    ...p,
    time: new Date(p.timestamp).toTimeString().slice(0, 5),
    containers: p.containers.map(c => ({ ...c, id: c.name, color: colorOf[c.name] })),
  }))
  return { data, containers }
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
  const barWidth = Math.min(24, Math.max(4, step - 4))

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
  // 'connecting': 백엔드 ws 연결 중 / 'ok': 데이터 수신 중 / 'unavailable': 백엔드가 Prometheus 조회에 실패
  const [status, setStatus] = useState('connecting')
  const [metrics, setMetrics] = useState({ data: [], containers: [], memTotal: 0 })

  // 화면을 보고 있는 동안 백엔드가 15초마다 Prometheus 조회 결과(최근 10분치)를 밀어준다.
  useEffect(() => {
    let reconnectTimer = null
    let cancelled = false
    let ws = null

    const connect = () => {
      ws = new WebSocket(`${WS_BASE_URL}/ws/monitoring`)

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        if (msg.type === 'metrics') {
          setMetrics({ ...decoratePoints(msg.points), memTotal: msg.memTotal })
          setStatus('ok')
        } else if (msg.type === 'unavailable') {
          setStatus('unavailable')
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        setStatus(prev => (prev === 'unavailable' ? prev : 'connecting'))
        reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  const { data, containers, memTotal } = metrics
  const currentPoint = data[data.length - 1] || {}
  const memRatio = memTotal ? (currentPoint.totalMemory || 0) / memTotal : 0

  if (status === 'unavailable') {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card monitoring-status-error">
          <span className="material-icons">cloud_off</span>
          Prometheus가 연결되지 않았습니다. 연결 상태와 환경변수를 확인해주세요!
        </div>
      </div>
    )
  }

  if (data.length < 2) {
    return (
      <div className="monitoring-page">
        <div className="monitoring-status-card">
          <span className="material-icons">hourglass_empty</span>
          모니터링 데이터를 불러오는 중입니다...
        </div>
      </div>
    )
  }

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
          <span className="kpi-label">사용 중인 메모리</span>
          <div className="kpi-value-row">
            <span className="kpi-value">
              {currentPoint.totalMemory ?? 0} <span className="kpi-unit">/ {memTotal} GB</span>
            </span>
            <span className="kpi-tag" style={{ color: '#1baf7a' }}>
              {Math.round(memRatio * 100)}%
            </span>
          </div>
          <div className="kpi-meter-bg">
            <div
              className="kpi-meter-fill"
              style={{
                width: `${Math.min(100, memRatio * 100)}%`,
                backgroundColor: '#199e70'
              }}
            />
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">실행 중인 컨테이너</span>
          <div className="kpi-value-row">
            <span className="kpi-value">{currentPoint.containers?.length ?? 0} <span className="kpi-unit">컨테이너</span></span>
          </div>
          <div className="kpi-subtext">cAdvisor 기준</div>
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
            <option value="total">전체</option>
            <option value="container">Docker 컨테이너별</option>
          </select>
        </div>

        <div className="control-actions">
          <span className={`live-indicator ${status === 'ok' ? '' : 'live-indicator-off'}`}>
            <span className="live-dot" />
            {status === 'ok' ? '실시간 (15초 주기)' : '재연결 중...'}
          </span>
        </div>
      </div>

      {/* 차트 그리드 (CPU 부하 & 사용 중인 메모리) */}
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
              maxVal={memTotal}
              title="사용 중인 메모리 (전체 GB)"
              color="#199e70"
            />
          </>
        ) : (
          <>
            <StackedBarChart
              data={data}
              containers={containers}
              metric="cpu"
              unit="%"
              maxVal={100}
              title="CPU 부하 (컨테이너별 누적 %)"
            />
            <StackedBarChart
              data={data}
              containers={containers}
              metric="memory"
              unit="GB"
              maxVal={memTotal}
              title="사용 중인 메모리 (컨테이너별 누적 GB)"
            />
          </>
        )}
      </div>

      {/* 컨테이너별 범례 (Docker 컨테이너별 모드 시 표시) */}
      {viewMode === 'container' && (
        <div className="container-legend-card">
          <span className="legend-title">컨테이너 범례:</span>
          <div className="legend-items">
            {containers.map(c => (
              <div key={c.id} className="legend-item">
                <span className="legend-color-box" style={{ backgroundColor: c.color }} />
                <span className="legend-name">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Monitoring
