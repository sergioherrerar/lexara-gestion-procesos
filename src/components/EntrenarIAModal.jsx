import { useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';

// "Entrenar IA" (2026-09-23, pedido explícito del usuario) — el abogado que
// maneja Tutelas día a día escribe el No. Tutela, ve el historial de
// correcciones que ya tenga esa tutela (columna "Corrección IA" en
// SharePoint, con "Anexar cambios al texto existente" activado — SharePoint
// arma el historial con fecha/autor solo) y agrega una nueva nota tipo
// chat. Estas correcciones alimentan a "Leer correo (IA)" como ejemplos
// reales de referencia para que el robot categorice el Tema con el mismo
// criterio del despacho, no solo genérico. Nunca toca ningún otro campo de
// la tutela — no hace falta abrir el formulario completo para dejar una nota.
export default function EntrenarIAModal({ tutelas, onAgregarCorreccion, onClose, notify }){
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadaId, setSeleccionadaId] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const query = busqueda.trim().toLowerCase();
  const coincidencias = useMemo(() => {
    if(!query) return [];
    return tutelas
      .filter(t => String(t.NoTutela || '').toLowerCase().includes(query))
      .slice(0, 8);
  }, [tutelas, query]);

  const seleccionada = tutelas.find(t => t.id === seleccionadaId) || null;

  async function handleEnviar(){
    if(!seleccionada || !texto.trim()) return;
    setEnviando(true);
    try{
      await onAgregarCorreccion(seleccionada.id, texto.trim());
      setTexto('');
    }catch(err){
      console.error(err);
      notify?.('No se pudo agregar la corrección.', 'error');
    }finally{
      setEnviando(false);
    }
  }

  return (
    <div className="confirm-overlay leer-correo-overlay" onClick={onClose}>
      <div className="confirm-box leer-correo-box" onClick={e => e.stopPropagation()}>
        <div className="leer-correo-head">
          <h3>Entrenar IA (Tutelas)</h3>
          <button className="drawer-close" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {!seleccionada && (
          <>
            <p className="save-hint" style={{margin:'0 0 14px'}}>
              Escribe el número de una tutela ya guardada para dejarle una corrección sobre el campo Tema — esto ayuda a que "Leer correo (IA)" categorice mejor los casos parecidos.
            </p>
            <div className="field" style={{marginBottom:12}}>
              <label>No. Tutela</label>
              <input type="text" autoFocus value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Ej. 28156" />
            </div>
            {query && (
              <ul className="leer-correo-lista">
                {coincidencias.map(t => (
                  <li key={t.id} className="leer-correo-item">
                    <button type="button" className="leer-correo-item-btn" onClick={() => { setSeleccionadaId(t.id); setBusqueda(''); }}>
                      <strong>{t.NoTutela}</strong>
                      <span>{t.Cliente || 'Cliente sin definir'} · {t.Tema || 'sin Tema'}</span>
                      <span className="save-hint">{t.Usuario || ''}</span>
                    </button>
                  </li>
                ))}
                {!coincidencias.length && (
                  <p className="empty-state empty-state-compact">No hay ninguna tutela guardada con ese número.</p>
                )}
              </ul>
            )}
          </>
        )}
        {seleccionada && (
          <>
            <div className="leer-correo-registro-item" style={{marginBottom:14}}>
              <div>
                <strong>Tutela {seleccionada.NoTutela}</strong>
                <span className="save-hint"> · {seleccionada.Cliente || '—'} · Tema actual: {seleccionada.Tema || '—'}</span>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setSeleccionadaId(null)}>Cambiar</button>
            </div>
            <div className="entrenar-ia-historial">
              {seleccionada.CorreccionIA
                ? <div dangerouslySetInnerHTML={{ __html: seleccionada.CorreccionIA }} />
                : <p className="empty-state empty-state-compact">Todavía no tiene correcciones guardadas.</p>}
            </div>
            <div className="field" style={{margin:'14px 0'}}>
              <label>Nueva corrección</label>
              <textarea rows={3} value={texto} onChange={e => setTexto(e.target.value)}
                placeholder='Ej. "Debió ser EXCLUSIÓN DE SERVICIO porque el medicamento no está cubierto por el plan, no por falta de entrega."' />
            </div>
            <IconTextButton icon="add" variant="primary" disabled={enviando || !texto.trim()} onClick={handleEnviar}>
              {enviando ? 'Guardando…' : 'Agregar corrección'}
            </IconTextButton>
          </>
        )}
      </div>
    </div>
  );
}
