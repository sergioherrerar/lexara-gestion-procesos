import { useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';

// "Entrenar IA" (2026-09-23, pedido explícito del usuario) — ventana con 2
// pestañas para el abogado que maneja Tutelas día a día:
// - "Corrección": escribe el No. Tutela, ve el historial de correcciones
//   que ya tenga esa tutela (columna "Corrección IA" en SharePoint, con
//   "Anexar cambios al texto existente" activado — SharePoint arma el
//   historial con fecha/autor solo) y agrega una nueva nota. Estas
//   correcciones alimentan a "Leer correo (IA)" como ejemplos reales de
//   referencia para categorizar el Tema con el criterio del despacho.
// - "Preguntas": chat de solo lectura — le pregunta a Claude sobre las
//   tutelas YA CARGADAS en el portal (ej. "¿cuántas de Colmédica por
//   Tema?"). No guarda nada ni toca SharePoint, es puramente informativo.
export default function EntrenarIAModal({ tutelas, onAgregarCorreccion, robotPreguntasUrl, onClose, notify }){
  const [tab, setTab] = useState('correccion'); // 'correccion' | 'preguntas'

  return (
    <div className="confirm-overlay leer-correo-overlay" onClick={onClose}>
      <div className="confirm-box leer-correo-box" onClick={e => e.stopPropagation()}>
        <div className="leer-correo-head">
          <h3>Entrenar IA (Tutelas)</h3>
          <button className="drawer-close" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="entrenar-ia-tabs">
          <button type="button" className={tab==='correccion' ? 'activo' : ''} onClick={() => setTab('correccion')}>Corrección</button>
          <button type="button" className={tab==='preguntas' ? 'activo' : ''} onClick={() => setTab('preguntas')}>Preguntas</button>
        </div>
        {tab === 'correccion'
          ? <TabCorreccion tutelas={tutelas} onAgregarCorreccion={onAgregarCorreccion} notify={notify} />
          : <TabPreguntas tutelas={tutelas} robotPreguntasUrl={robotPreguntasUrl} notify={notify} />}
      </div>
    </div>
  );
}

function TabCorreccion({ tutelas, onAgregarCorreccion, notify }){
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
    <>
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
    </>
  );
}

function TabPreguntas({ tutelas, robotPreguntasUrl, notify }){
  const [pregunta, setPregunta] = useState('');
  const [mensajes, setMensajes] = useState([]); // [{autor:'yo'|'ia', texto}]
  const [enviando, setEnviando] = useState(false);

  async function handleEnviar(){
    const texto = pregunta.trim();
    if(!texto || enviando) return;
    if(!robotPreguntasUrl){
      notify?.('Falta terminar de instalar el robot de preguntas (ROBOT_PREGUNTAS_URL en config.js).', 'error');
      return;
    }
    setMensajes(prev => [...prev, { autor:'yo', texto }]);
    setPregunta('');
    setEnviando(true);
    try{
      const camposUtiles = ['NoTutela','Cliente','Entidad','Prestacion','TipoRespuesta','Tema','FechaNotificacion','FechaVencimiento','Usuario','Solicita'];
      const tutelasCompactas = tutelas.map(t => {
        const o = {};
        camposUtiles.forEach(c => { o[c] = t[c] ?? ''; });
        return o;
      });
      const res = await fetch(robotPreguntasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: texto, tutelas: tutelasCompactas }),
      });
      let data;
      try{ data = await res.json(); }catch{ data = null; }
      if(!res.ok || !data || data.error){
        throw new Error((data && data.error) || `El robot respondió con error (código ${res.status}).`);
      }
      setMensajes(prev => [...prev, { autor:'ia', texto: data.respuesta || '(sin respuesta)' }]);
    }catch(err){
      console.error(err);
      setMensajes(prev => [...prev, { autor:'ia', texto: 'No pude responder: ' + (err.message || '') }]);
    }finally{
      setEnviando(false);
    }
  }

  return (
    <>
      <p className="save-hint" style={{margin:'0 0 14px'}}>
        Pregúntale sobre las tutelas que ya están cargadas en el portal (ej. "¿cuántas de Colmédica por Tema?"). Esto no guarda nada, solo responde.
      </p>
      <div className="entrenar-ia-historial entrenar-ia-chat">
        {!mensajes.length && <p className="empty-state empty-state-compact">Escribe tu primera pregunta abajo.</p>}
        {mensajes.map((m,i) => (
          <div key={i} className={"entrenar-ia-burbuja " + (m.autor==='yo' ? 'entrenar-ia-burbuja-yo' : 'entrenar-ia-burbuja-ia')}>
            {m.texto}
          </div>
        ))}
        {enviando && <div className="entrenar-ia-burbuja entrenar-ia-burbuja-ia">Pensando…</div>}
      </div>
      <div className="field" style={{margin:'14px 0'}}>
        <label>Tu pregunta</label>
        <textarea rows={2} value={pregunta} onChange={e => setPregunta(e.target.value)}
          onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleEnviar(); } }}
          placeholder='Ej. "¿Cuál es el Tema más frecuente este mes?"' />
      </div>
      <IconTextButton icon="add" variant="primary" disabled={enviando || !pregunta.trim()} onClick={handleEnviar}>
        {enviando ? 'Enviando…' : 'Preguntar'}
      </IconTextButton>
    </>
  );
}
