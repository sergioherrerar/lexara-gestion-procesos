import { useState, useRef, useEffect } from 'react';

// «Balanza de la Rama Judicial» de la cabecera (2026-11-13, pedido del usuario: «una campana de rama judicial como una balanza que pesa más por cada notificación»).
// Aparte de la campana de pendientes: cada actuación nueva en la Rama de los procesos de la persona inclina un poco más la balanza (hasta 6 se nota; más solo suma al número).
// Al hacer clic se despliega la lista; abrir una novedad lleva al proceso, a su pestaña «Rama Judicial». Revisa una vez al día al abrir la app.
const GRADOS_POR_NOVEDAD = 4;     // inclinación por novedad
const MAX_NOVEDADES_VISIBLES = 6; // desde ahí la balanza ya está en su máxima inclinación (24°)

function fechaCorta(iso){ const [y, m, d] = String(iso || '').split('-'); return y && m && d ? `${d}/${m}/${y}` : 'Sin fecha'; }

function IconoBalanza({ cantidad }){
  const grados = Math.min(cantidad, MAX_NOVEDADES_VISIBLES) * GRADOS_POR_NOVEDAD;
  const rad = grados * Math.PI / 180;
  const L = 11, px = 16, py = 8;                      // brazo de 11 a cada lado, pivote arriba
  const lx = px - L * Math.cos(rad), ly = py - L * Math.sin(rad);   // el plato izquierdo sube…
  const rx = px + L * Math.cos(rad), ry = py + L * Math.sin(rad);   // …y el derecho (donde «pesan» las novedades) baja
  const plato = (x, y, color) => ({ x, y, color });
  const platos = [plato(lx, ly, 'none'), plato(rx, ry, cantidad > 0 ? '#ef7d00' : 'none')];
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 8v18M11 27h10" />
      <circle cx={px} cy={py} r="1.6" fill="currentColor" />
      <line className="balanza-brazo" x1={lx} y1={ly} x2={rx} y2={ry} strokeWidth="2" />
      {platos.map((p, i) => (
        <g key={i} className="balanza-plato">
          <path d={`M${p.x} ${p.y}L${p.x - 5} ${p.y + 8}M${p.x} ${p.y}L${p.x + 5} ${p.y + 8}`} strokeWidth="1" />
          <path d={`M${p.x - 6} ${p.y + 8}H${p.x + 6}Q${p.x + 5} ${p.y + 13} ${p.x} ${p.y + 13}Q${p.x - 5} ${p.y + 13} ${p.x - 6} ${p.y + 8}Z`} fill={p.color} strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  );
}

export default function BalanzaRama({ novedades, revisando, onAbrir, onRevisar, disponible }){
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if(!abierto) return undefined;
    const fuera = e => { if(ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const tecla = e => { if(e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);
  if(!disponible) return null;
  const n = (novedades || []).length;
  const lista = [...(novedades || [])].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return (
    <div className="topbar-campana-wrap balanza-rama-wrap" ref={ref}>
      <button type="button" className={"topbar-campana-btn balanza-rama-btn" + (abierto ? " abierto" : "") + (revisando ? " revisando" : "")} onClick={() => setAbierto(v => !v)}
        aria-label={n ? `Rama Judicial: ${n} ${n === 1 ? 'actuación nueva' : 'actuaciones nuevas'}` : 'Rama Judicial: sin actuaciones nuevas'} aria-expanded={abierto} title="Rama Judicial — actuaciones nuevas">
        <IconoBalanza cantidad={n} />
        {n > 0 && <span className="topbar-campana-badge">{n > 99 ? '99+' : n}</span>}
      </button>
      {abierto && (
        <div className="topbar-campana-popover" role="dialog" aria-label="Novedades de la Rama Judicial">
          <div className="campana-cab">
            <strong>Rama Judicial</strong>
            <span>{n ? `${n} ${n === 1 ? 'proceso con actuación nueva' : 'procesos con actuaciones nuevas'}` : 'La balanza está equilibrada'}</span>
          </div>
          <div className="campana-lista">
            {lista.length === 0 && <p className="campana-vacia">{revisando ? 'Revisando la Rama Judicial…' : 'Sin actuaciones nuevas en sus procesos vigentes desde la última vez que los revisó.'}</p>}
            {lista.map(x => (
              <button key={x.radicado} type="button" className="campana-item balanza-item" onClick={() => { setAbierto(false); onAbrir(x.procesoId); }}>
                <div className="campana-item-fila">
                  <span className="badge badge-naranja">Nueva actuación</span>
                  <span className="badge badge-gris">{fechaCorta(x.fecha)}</span>
                </div>
                <div className="campana-item-texto">{x.cliente || '—'}</div>
                <div className="campana-item-meta">{x.numeroCorto || x.radicado}</div>
              </button>
            ))}
          </div>
          <div className="balanza-pie">
            <span>Se revisa una vez al día al abrir la app. Al abrir el proceso y su pestaña «Rama Judicial», la novedad se da por vista.</span>
            <button type="button" className="btn-secondary rama-btn" onClick={onRevisar} disabled={revisando}>{revisando ? 'Revisando…' : 'Revisar ahora'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
