import { ICON_SVG } from '../config';

export default function BarChart({ data, color, emptyMsg, maxBars = 8 }){
  if(!data.length){
    return (
      <div className="empty-state empty-state-compact">
        <div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
        {emptyMsg}
      </div>
    );
  }
  const rows = data.slice(0, maxBars);
  const max = Math.max(...rows.map(r => r.value));
  const resto = data.length - rows.length;
  return (
    <div className="bar-chart">
      {rows.map(r => (
        <div className="bar-row" key={r.label}>
          <div className="bar-label" title={r.label}>{r.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{width: Math.max(4, Math.round(r.value/max*100)) + '%', background: color}}></div>
          </div>
          <div className="bar-value">{r.value}</div>
        </div>
      ))}
      {resto > 0 && <div className="bar-chart-more">+{resto} más</div>}
    </div>
  );
}
