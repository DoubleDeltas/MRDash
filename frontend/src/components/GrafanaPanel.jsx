// Grafana 패널 하나를 MRDash 카드 안에 보여준다 (제목·범례·툴팁은 Grafana 패널이 그린다).
// 스타일은 pages/Monitoring.css의 .monitoring-chart-card / .grafana-panel
// wide: 차트 그리드에서 한 줄 전체를 차지한다
function GrafanaPanel({ src, title, wide = false }) {
  return (
    <div className={`monitoring-chart-card grafana-panel-card${wide ? ' monitoring-chart-card-wide' : ''}`}>
      <iframe className="grafana-panel" src={src} title={title} loading="lazy" />
    </div>
  )
}

export default GrafanaPanel
