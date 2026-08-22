import { ICON_SVG } from '../config';

// Paleta institucional reusada para las porciones — mismos colores que ya
// usa el resto de la app (verde oscuro/claro, naranja, semáforo rojo, azul
// de correo) en vez de inventar colores nuevos.
const PALETA = ['#004941', '#ef7d00', '#52bbb5', '#a3281c', '#1d5fa3', '#8a6410', '#6b5115', '#5c6b68'];

function puntoEnCirculo(cx, cy, r, anguloDeg){
  const rad = (anguloDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describirArco(cx, cy, r, anguloInicio, anguloFin){
  const inicio = puntoEnCirculo(cx, cy, r, anguloInicio);
  const fin = puntoEnCirculo(cx, cy, r, anguloFin);
  const arcoGrande = anguloFin - anguloInicio <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${inicio.x} ${inicio.y} A ${r} ${r} 0 ${arcoGrande} 1 ${fin.x} ${fin.y} Z`;
}

// Gráfico de torta/dona con leyenda — pensado para campos categóricos cortos
// (Sí/No, 3-5 estados). `data`: [{label, value}] (mismo formato que ya
// produce groupCount() en graph.js). Si solo queda UNA porción con valor
// (100%), se dibuja un círculo completo en vez de un arco — un arco de
// 0°→360° con el mismo punto de inicio y fin no se puede describir con un
// solo "A" de SVG (queda invisible), es un caso especial real de este tipo
// de gráfico, no un descuido.
export default function PieChart({ data, emptyMsg, size = 150 }){
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
  const r = size/2, cx = r, cy = r;
  let anguloActual = -90; // empieza arriba (12 en punto), igual que la mayoría de gráficos de torta
  const porciones = conValor.map((d, i) => {
    const barrido = (d.value/total) * 360;
    const inicio = anguloActual;
    const fin = anguloActual + barrido;
    anguloActual = fin;
    return { ...d, color: PALETA[i % PALETA.length], path: barrido >= 359.99 ? null : describirArco(cx, cy, r, inicio, fin) };
  });
  return (
    <div className="pie-chart">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {porciones.map(p => p.path
          ? <path key={p.label} d={p.path} fill={p.color} />
          : <circle key={p.label} cx={cx} cy={cy} r={r} fill={p.color} />
        )}
        <circle cx={cx} cy={cy} r={r * 0.58} fill="#fff" />
      </svg>
      <div className="pie-legend">
        {porciones.map(p => (
          <div className="pie-legend-row" key={p.label}>
            <span className="pie-legend-dot" style={{background: p.color}}></span>
            <span className="pie-legend-label" title={p.label}>{p.label}</span>
            <span className="pie-legend-value">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Anillo decorativo con 1-2 líneas de texto en el centro — para un solo
// valor destacado (ej. una suma en pesos), no una categoría con porciones.
export function StatRing({ color = 'var(--verde-oscuro)', lines, size = 150 }){
  const r = size/2;
  return (
    <div className="stat-ring" style={{width:size, height:size}}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={r} cy={r} r={r-6} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" />
      </svg>
      <div className="stat-ring-text">
        {lines.map((l, i) => (
          <div key={i} className={l.big ? "stat-ring-big" : "stat-ring-small"}>{l.text}</div>
        ))}
      </div>
    </div>
  );
}
