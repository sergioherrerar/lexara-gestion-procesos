import { useState } from 'react';
import { proximoCumpleanos, etiquetaDiasCumple } from '../lib/cumpleanos';
import FelicitacionCumpleanosModal from './FelicitacionCumpleanosModal';
import FelicitacionesAutomaticasPanel from './FelicitacionesAutomaticasPanel';

// Banda «Próximos cumpleaños» sobre la tabla de Colaboradores MD: solo los colaboradores ACTIVOS con fecha de nacimiento, el más próximo primero.
// Cada uno trae el botón «Vista previa»: abre el correo de felicitación tal como saldrá, y desde ahí se programa su envío automático o se crea el borrador.
export default function CumpleanosBanda({ colaboradores, canWrite, listas, config, liveMode, notify }){
  const [felicitando, setFelicitando] = useState(null);
  const hoy = new Date();
  const lista = (colaboradores || [])
    .filter(c => c.Activo)
    .map(c => ({ c, p: proximoCumpleanos(c.FechaNacimiento, hoy) }))
    .filter(x => x.p)
    .sort((a, b) => a.p.dias - b.p.dias || String(a.c.Nombre || '').localeCompare(String(b.c.Nombre || '')));

  if(!lista.length){
    return canWrite ? (
      <p className="save-hint" style={{margin:'0 0 12px'}}>
        Para ver aquí la cuenta regresiva de los cumpleaños, agrega la <strong>Fecha de nacimiento</strong> en la ficha de cada colaborador activo
        (si la columna no aparece, confirma su mapeo en Configuración).
      </p>
    ) : null;
  }
  return (
    <section className="cumple-band" aria-labelledby="cumple-titulo">
      <h2 id="cumple-titulo">Próximos cumpleaños</h2>
      <div className="cumple-grid">
        {lista.map(({ c, p }) => (
          <div key={c.id} className={'cumple-item' + (p.dias === 0 ? ' cumple-hoy' : '')}>
            <span className="cumple-icono" aria-hidden="true">{p.dias === 0 ? '🎂' : '🎈'}</span>
            <span className="cumple-texto">
              <strong title={c.Nombre}>{c.Nombre || '—'}</strong>
              <small>{p.texto} · cumple {p.edad}</small>
            </span>
            <span className="cumple-dias">{etiquetaDiasCumple(p.dias)}</span>
            <button type="button" className="cumple-felicitar" onClick={() => setFelicitando(c)} aria-label={'Vista previa de la felicitación de ' + (c.Nombre || '')} title="Ver cómo queda el correo de felicitación y programar su envío">👁 Vista previa</button>
          </div>
        ))}
      </div>
      <FelicitacionesAutomaticasPanel colaboradores={colaboradores} listas={listas} config={config} liveMode={liveMode} notify={notify} onVistaPrevia={setFelicitando} />
      {felicitando && <FelicitacionCumpleanosModal colaborador={felicitando} colaboradores={colaboradores} listas={listas} config={config} liveMode={liveMode} notify={notify} onClose={() => setFelicitando(null)} />}
    </section>
  );
}
