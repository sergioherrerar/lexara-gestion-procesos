export default function BarChart({ data, color, emptyMsg, maxBars = 8 }){
  if(!data.length){
    return <div className="mini-row" style={{color:'var(--texto-suave)', cursor:'default'}}>{emptyMsg}</div>;
  }
  const rows = data.slice(0, maxBars);
  const max = Math.max(...rows.map(r => r.value));
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
    </div>
  );
}
