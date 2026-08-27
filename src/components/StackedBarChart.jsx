import { ICON_SVG } from '../config';
import { fmtMonto } from '../lib/graph';

// Barra apilada horizontal — una fila por Abogado, cada barra dividida por
// Tipo Respuesta (mismo dato que la hoja "Por Abogado" del Excel, ver
// informeAbogadosTutelas.js). Mismo lenguaje visual que BarChart.jsx
// (`.bar-row`/`.bar-label`/`.bar-track`), solo que el track se divide en
// segmentos de colores en vez de un único relleno.
const PALETA = ['#004941', '#ef7d00', '#52bbb5', '#a3281c', '#1d5fa3', '#8a6410', '#6b5115', '#5c6b68'];

export default function StackedBarChart({ grupos, emptyMsg }){
  if(!grupos || !grupos.length){
    return (
      <div className="empty-state empty-state-compact">
        <div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
        {emptyMsg}
      </div>
    );
  }
  // Un color fijo por Tipo Respuesta, consistente entre abogados —
  // asignado en el orden en que aparece cada uno la primera vez.
  const tiposVistos = [];
  grupos.forEach(g => g.filas.forEach(f => { if(!tiposVistos.includes(f.tipoRespuesta)) tiposVistos.push(f.tipoRespuesta); }));
  const colorPorTipo = Object.fromEntries(tiposVistos.map((t,i) => [t, PALETA[i % PALETA.length]]));

  const max = Math.max(...grupos.map(g => g.totalAbogado), 1);

  return (
    <div className="bar-chart">
      {grupos.map(g => (
        <div className="bar-row" key={g.abogado}>
          <div className="bar-label" title={g.abogado}>{g.abogado}</div>
          <div className="bar-track bar-track-stacked">
            {g.filas.map(f => (
              <div
                key={f.tipoRespuesta}
                className="bar-segment"
                title={`${f.tipoRespuesta}: $ ${fmtMonto(f.total)}`}
                style={{ width: Math.max(2, (f.total / max) * 100) + '%', background: colorPorTipo[f.tipoRespuesta] }}
              />
            ))}
          </div>
          <div className="bar-value bar-value-monto">$ {fmtMonto(g.totalAbogado)}</div>
        </div>
      ))}
      <div className="pie-legend stacked-legend">
        {tiposVistos.map(t => (
          <div className="pie-legend-row" key={t}>
            <span className="pie-legend-dot" style={{background: colorPorTipo[t]}}></span>
            <span className="pie-legend-label">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
