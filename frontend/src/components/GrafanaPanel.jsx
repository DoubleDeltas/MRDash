// Grafana 패널 하나를 MRDash 카드 안에 보여준다 (제목·범례·툴팁은 Grafana 패널이 그린다).
// 스타일은 pages/Monitoring.css의 .monitoring-chart-card / .grafana-panel
function GrafanaPanel({ src, title }) {
  return (
    <div className="monitoring-chart-card grafana-panel-card">
      <iframe className="grafana-panel" src={src} title={title} loading="lazy" />
    </div>
  )
}

export default GrafanaPanel
