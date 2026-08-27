import { ICON_SVG } from '../config';
import { fmtMonto } from '../lib/graph';
import { colorDeTipoRespuesta } from '../lib/informeAbogadosTutelas';

// Barra apilada horizontal — una fila por Abogado, cada barra dividida por
// Tipo Respuesta (mismo dato que la hoja "Por Abogado" del Excel, ver
// informeAbogadosTutelas.js). Mismo lenguaje visual que BarChart.jsx
// (`.bar-row`/`.bar-label`/`.bar-track`), solo que el track se divide en
// segmentos de colores en vez de un único relleno. El detalle con montos
// por Tipo Respuesta va aparte, en tarjetas por abogado (ver
// AbogadosDetalle en InformesView.jsx) — este gráfico es solo el
// comparativo visual rápido entre abogados.
export default function StackedBarChart({ grupos, emptyMsg }){
  if(!grupos || !grupos.length){
    return (
      <div className="empty-state empty-state-compact">
        <div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
        {emptyMsg}
      </div>
    );
  }
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
                style={{ width: Math.max(2, (f.total / max) * 100) + '%', background: colorDeTipoRespuesta(f.tipoRespuesta) }}
              />
            ))}
          </div>
          <div className="bar-value bar-value-monto">$ {fmtMonto(g.totalAbogado)}</div>
        </div>
      ))}
    </div>
  );
}
