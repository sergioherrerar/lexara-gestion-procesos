import { useId } from 'react';
import { ICON_SVG } from '../config';

// Aclara un color hex mezclándolo hacia blanco (2026-09-22, pedido explícito
// del usuario: "diseña los gráficos... con realce" — un degradado sutil de
// cada color hacia una versión más clara del mismo, no un color inventado,
// para dar sensación de volumen sin dejar de ser el mismo tono de la
// leyenda/paleta.
function aclararColor(hex, cantidad){
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mezclar = c => Math.round(c + (255 - c) * cantidad);
  return `rgb(${mezclar(r)}, ${mezclar(g)}, ${mezclar(b)})`;
}

// Paleta categórica (2026-09-22, rediseño del Dashboard) — validada con el
// verificador de la skill de dataviz (contraste CVD, piso de croma, banda
// de luminosidad) en vez de reusar a ojo los colores institucionales de la
// UI. Los 2 primeros colores institucionales (verde/naranja de marca) SÍ se
// conservan, pero varios de los que seguían (un verde azulado y 2 cafés casi
// idénticos entre sí) fallaban las pruebas — un daltónico no podía
// distinguirlos. El orden importa: el naranja y el verde quedan separados
// (no van seguidos) porque esa pareja específica sí se confunde en
// protanopía si quedan adyacentes.
// Verde cambiado a #52bbb5 (2026-09-22, pedido explícito del usuario,
// señalando la dona real) — es el mismo "verde claro" que ya usa el resto
// del portal (íconos, puntos del mini calendario), en vez del verde más
// saturado que se había elegido antes solo por pasar la validación de
// contraste. Se mantiene igual: cada color ya va siempre acompañado de su
// nombre en la leyenda (nunca "solo color"), así que no depende de que este
// tono se distinga solo por el ojo.
export const PALETA_CATEGORICA = ['#52bbb5', '#d0d0d0', '#ef7d00', '#7d4fb0', '#a3281c', '#c9971f'];
const PALETA = PALETA_CATEGORICA;

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
// `centerLabel` (2026-09-22, rediseño del Dashboard) — texto chico arriba
// del total, dentro de la dona (ej. "procesos") — opcional, sin romper los
// llamados existentes que no lo mandan.
export default function PieChart({ data, emptyMsg, size = 150, centerLabel }){
  // Prefijo único por instancia (2026-09-22) — si algún día hay 2 donas en
  // la misma pantalla, los id de <linearGradient>/<filter> del "realce" no
  // se pueden repetir en el mismo documento HTML o una dona termina
  // pintándose con el degradado de la otra.
  const idBase = useId();
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
  const coloresUnicos = Array.from(new Set(porciones.map(p => p.color)));
  return (
    <div className="pie-chart">
      <div className="pie-chart-svg-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <defs>
            {/* Degradado propio por color (2026-09-22, pedido explícito del
                usuario: "con realce") — más claro arriba-izquierda, el tono
                real de la leyenda abajo-derecha; da sensación de volumen sin
                inventar un color nuevo ni distorsionar el tamaño real de
                cada porción (evita el error clásico de una torta "3D" de
                verdad, que sí engaña el ojo sobre el tamaño). */}
            {coloresUnicos.map(c => (
              <linearGradient key={c} id={`${idBase}-g-${c}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={aclararColor(c, .32)} />
                <stop offset="100%" stopColor={c} />
              </linearGradient>
            ))}
            <filter id={`${idBase}-sombra`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#00291f" floodOpacity=".22" />
            </filter>
          </defs>
          {/* stroke blanco entre porciones (2026-09-22) — separador visual
              real entre segmentos, en vez de que queden pegados unos con
              otros sin ningún espacio. */}
          <g filter={`url(#${idBase}-sombra)`}>
            {porciones.map(p => p.path
              ? <path key={p.label} d={p.path} fill={`url(#${idBase}-g-${p.color})`} stroke="#fff" strokeWidth="2" />
              : <circle key={p.label} cx={cx} cy={cy} r={r} fill={`url(#${idBase}-g-${p.color})`} />
            )}
          </g>
          <circle cx={cx} cy={cy} r={r * 0.58} fill="#fff" />
        </svg>
        {/* Total al centro de la dona (2026-09-22, pedido explícito del
            usuario: gráficas "más vistosas") — el hueco blanco del centro
            antes quedaba vacío; ahora muestra la suma real de las porciones. */}
        <div className="pie-chart-center">
          <div className="pie-chart-center-value">{total}</div>
          {centerLabel && <div className="pie-chart-center-label">{centerLabel}</div>}
        </div>
      </div>
      <div className="pie-legend">
        {porciones.map(p => (
          <div className="pie-legend-row" key={p.label}>
            <span className="pie-legend-dot" style={{background: p.color}}></span>
            <span className="pie-legend-label" title={p.label}>{p.label}</span>
            {/* % y cantidad juntos en una sola columna (2026-09-22) — bug
                real encontrado al probar: con las 2 como columnas propias
                (cada una con su min-width), en un panel angosto el label
                se quedaba sin espacio y se veía prácticamente en blanco
                (1.5px de ancho real). Un solo texto compacto arregla eso. */}
            <span className="pie-legend-pct">{Math.round(p.value/total*100)}% <span className="pie-legend-value">({p.value})</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Anillo decorativo con 1-2 líneas de texto — para un solo valor destacado
// (ej. una suma en pesos), no una categoría con porciones. Dos formatos:
// - "centro" (por defecto): el texto va DENTRO del anillo — solo sirve para
//   números cortos, un valor largo (ej. "$ 152.041.453.358,50") se ve
//   apretado y se corta feo.
// - "lado": el anillo queda chico y decorativo, y el texto va AL LADO,
//   sin límite de ancho — pedido explícito del usuario 2026-08-22 para que
//   el valor completo de la cartera/desistimientos se vea entero.
export function StatRing({ color = 'var(--verde-oscuro)', lines, size = 150, layout = 'centro' }){
  const r = size/2;
  const anillo = (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{flexShrink:0}}>
      <circle cx={r} cy={r} r={r-6} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" />
    </svg>
  );
  if(layout === 'lado'){
    return (
      <div className="stat-ring-lado">
        {anillo}
        <div className="stat-ring-lado-text">
          {lines.map((l, i) => <div key={i} className={l.big ? "stat-ring-lado-big" : "stat-ring-lado-small"}>{l.text}</div>)}
        </div>
      </div>
    );
  }
  return (
    <div className="stat-ring" style={{width:size, height:size}}>
      {anillo}
      <div className="stat-ring-text">
        {lines.map((l, i) => (
          <div key={i} className={l.big ? "stat-ring-big" : "stat-ring-small"}>{l.text}</div>
        ))}
      </div>
    </div>
  );
}
