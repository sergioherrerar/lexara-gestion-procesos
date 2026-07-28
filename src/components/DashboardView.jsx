import BarChart from './BarChart';
import { stripHtml, groupCount } from '../lib/graph';

function IconFolder(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>;
}
function IconAlert(){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.3 3.9L2.5 18a1.5 1.5 0 001.3 2.2h16.4a1.5 1.5 0 001.3-2.2L13.7 3.9a1.5 1.5 0 00-2.6 0z"/></svg>;
}

export default function DashboardView({ procesos }){
  const activos = procesos.filter(p => !(p.Estado||"").toLowerCase().includes('termin'));
  const tiposDistintos = new Set(procesos.map(p => stripHtml(p.TipoAccion) || "Sin dato"));

  const stats = [
    {label:"Procesos Lexara", value:activos.length, icon:<IconFolder/>, cls:'icon-teal', delta:`${procesos.length} en total`},
    {label:"Tipo de Acción", value:tiposDistintos.size, icon:<IconAlert/>, cls:'icon-green', delta:"Categorías distintas"},
  ];

  const estadoData = groupCount(activos, p => p.EstadoVT);
  const tipoAccionData = groupCount(procesos, p => p.TipoAccion);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Panorama general</h1>
          <p>Resumen en vivo de los procesos a cargo del despacho.</p>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map(s => (
          <div className="stat-card" key={s.label}>
            <div className="top"><span className="label">{s.label}</span><span className={"icon " + s.cls}>{s.icon}</span></div>
            <div className="value">{s.value}</div>
            <div className="delta">{s.delta}</div>
          </div>
        ))}
      </div>

      <div className="panel-grid panel-grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Procesos activos por Estado</h3></div>
          <div className="panel-body">
            <BarChart data={estadoData} color="var(--verde-oscuro)" emptyMsg="No hay datos de Estado V/T para los procesos activos." />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Tipo de Acción</h3></div>
          <div className="panel-body">
            <BarChart data={tipoAccionData} color="var(--naranja)" emptyMsg="No hay datos de Tipo de Acción." />
          </div>
        </div>
      </div>
    </div>
  );
}
