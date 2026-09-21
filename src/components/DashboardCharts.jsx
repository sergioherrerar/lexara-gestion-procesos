import { ICON_SVG } from '../config';
import { fmtMonto } from '../lib/graph';
import { PALETA_CATEGORICA } from './PieChart';

// Dos gráficos nuevos para el Dashboard (2026-09-22, pedido explícito del
// usuario: "diseña la página, las gráficas que sean totalmente
// profesionales... con diferentes tipos de gráficas") — pensados para los 2
// casos que ni la barra ni la dona representan bien:
//
// - ProportionBar: un campo de Sí/No (2 categorías) — una dona con solo 2
//   porciones es difícil de leer con precisión ("¿es 60% o 65%?"); una
//   barra de 100% apilada con el % escrito de una vez es más directa.
// - RankedProgressList: varias categorías con un $ asociado (ej.
//   desistimientos por estado) — reemplaza el combo suelto de anillo +
//   lista de texto plano por un solo bloque rankeado, de mayor a menor,
//   con su barra de progreso y su % — mismo lenguaje visual que un panel
//   ejecutivo de verdad, y usa mejor el espacio vertical.

export function ProportionBar({ data, emptyMsg }){
  const conValor = (data||[]).filter(d => d.value > 0);
  const total = conValor.reduce((s,d) => s + d.value, 0);
  if(!total){
    return (
      <div className="empty-state empty-state-compact">
        <div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
        {emptyMsg}
      </div>
    );
  }
  const porciones = conValor.map((d, i) => ({ ...d, pct: d.value/total*100, color: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length] }));
  return (
    <div className="proportion-bar">
      <div className="proportion-bar-track">
        {porciones.map(p => (
          <div key={p.label} className="proportion-bar-segment" style={{width: p.pct + '%', background: p.color}} title={`${p.label}: ${Math.round(p.pct)}%`} />
        ))}
      </div>
      <div className="proportion-bar-legend">
        {porciones.map(p => (
          <div key={p.label} className="proportion-bar-legend-item">
            <span className="proportion-bar-dot" style={{background: p.color}} />
            <span className="proportion-bar-label">{p.label}</span>
            <strong className="proportion-bar-pct">{Math.round(p.pct)}%</strong>
            <span className="proportion-bar-count">({p.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// `items`: [{label, count, value}] — se ordenan acá mismo de mayor a menor
// `value` (2026-09-22, bug real visto al probar: si el llamador los traía
// ordenados por `count`, una categoría como "Sin desistimiento" —muchos
// registros pero SIEMPRE $0, no tiene ningún desistimiento real detrás—
// salía primera con un 0% enorme arriba de todo, mientras la de más peso en
// pesos quedaba abajo). El % de cada barra es sobre `value` (el $ total),
// no sobre `count`, porque lo que más le importa al usuario acá es cuánto
// dinero representa cada categoría.
export function RankedProgressList({ items, emptyMsg, formatValue = v => `$ ${fmtMonto(v)}` }){
  if(!items || !items.length){
    return (
      <div className="empty-state empty-state-compact">
        <div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
        {emptyMsg}
      </div>
    );
  }
  const ordenados = [...items].sort((a,b) => b.value - a.value);
  const total = ordenados.reduce((s,i) => s + i.value, 0);
  return (
    <div className="ranked-list">
      {ordenados.map((it, i) => {
        const pct = total ? (it.value/total*100) : 0;
        const color = PALETA_CATEGORICA[i % PALETA_CATEGORICA.length];
        return (
          <div className="ranked-row" key={it.label}>
            <div className="ranked-row-top">
              <span className="ranked-row-label">{it.label}</span>
              <span className="ranked-row-pct">{Math.round(pct)}%</span>
            </div>
            <div className="ranked-row-track"><div className="ranked-row-fill" style={{width: Math.max(2,pct) + '%', background: color}} /></div>
            <div className="ranked-row-meta">{it.count} {it.count===1 ? 'registro' : 'registros'} · {formatValue(it.value)}</div>
          </div>
        );
      })}
    </div>
  );
}
