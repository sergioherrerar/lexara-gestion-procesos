import { useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';

// "Entrenar IA" (2026-09-23, pedido explícito del usuario) — panel con 2
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
//
// 2026-09-24, pedido explícito del usuario viendo "Leer correo (IA)" en
// vivo ("mejor colocarlo al lado... mira qué datos trajo y corrige y
// pregunta", y luego "quitemos el botón [standalone], al lado derecho
// coloquemos Entrenar IA") — este panel ya NO tiene ventana propia, vive
// SOLO embebido al lado de "Leer correo (IA)" (ver LeerCorreoTutelaModal.jsx).
// `casoActual` (pedido explícito del usuario: "de la tutela [recién
// extraída] dime quién es el usuario, qué están solicitando, quiénes están
// vinculados, las pretensiones...") — trae el asunto/cuerpo del correo
// recién leído + los registros que Claude ya extrajo de él, AUNQUE esa
// tutela todavía no se haya guardado en SharePoint. Se manda como contexto
// con prioridad en la pestaña "Preguntas".
export function EntrenarIAPanel({ tutelas, onAgregarCorreccion, robotPreguntasUrl, notify, casoActual, casosGuardados }){
  // "Pregúntame" primero, tanto en el orden de los botones como la pestaña
  // que abre por defecto (2026-09-25, pedido explícito del usuario:
  // "coloca primero Pregúntame que Enséñame").
  const [tab, setTab] = useState('preguntas'); // 'correccion' | 'preguntas'
  return (
    <div className="entrenar-ia-panel">
      <div className="entrenar-ia-tabs">
        <button type="button" className={tab==='preguntas' ? 'activo' : ''} onClick={() => setTab('preguntas')}>Pregúntame</button>
        <button type="button" className={tab==='correccion' ? 'activo' : ''} onClick={() => setTab('correccion')}>Enséñame</button>
      </div>
      {tab === 'correccion'
        ? <TabCorreccion tutelas={tutelas} onAgregarCorreccion={onAgregarCorreccion} notify={notify} />
        : <TabPreguntas robotPreguntasUrl={robotPreguntasUrl} notify={notify} casoActual={casoActual} casosGuardados={casosGuardados} />}
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
            Escribe el número de una tutela ya guardada para dejarle una corrección sobre el campo Tema — esto ayuda a que LexIA categorice mejor los casos parecidos.
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
          {/* "Mientras guardas la información, algo como 'tienes razón, lo
              tendré en cuenta para no equivocarme de nuevo'" (2026-09-24,
              pedido explícito del usuario). */}
          {enviando && (
            <p className="save-hint" style={{marginTop:8, fontStyle:'italic'}}>
              Tienes razón, lo tendré en cuenta para no equivocarme de nuevo.
            </p>
          )}
        </>
      )}
    </>
  );
}

// 2026-09-25, pedido explícito del usuario: "quítale que no coloque
// asteriscos... la voz dice asterisco, asterisco y se corta mucho la
// idea" — la instrucción del robot ya le pide no usar markdown, pero esto
// es un respaldo por si el modelo igual se cuela con **negrita**/listas/
// encabezados en alguna respuesta — se limpia también acá antes de
// mostrar/leer, nunca debe llegar un asterisco a pantalla ni a la voz.
function limpiarMarkdown(texto){
  return String(texto || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/[*_`]/g, '');
}

// Cuántas tutelas guardadas se mandan "a ciegas" (sin filtrar por número)
// cuando la pregunta no menciona ninguno en concreto — ver casosRelevantes.
const LIMITE_CASOS_SIN_FILTRAR = 10;

// (2026-09-29, por costo de la API, esta_misma tarea de "mira por todos
// lados cómo ahorrar costos") — `casosGuardados` viene de TODAS las
// tutelas que LexIA ya analizó y quedaron guardadas en OneDrive, una
// carpeta que solo va a seguir creciendo con los meses (recién está
// empezando este feature). Sin este filtro, cada pregunta mandaría a
// Claude el texto completo de CADA tutela ya analizada alguna vez, sin
// límite — el costo de "Pregúntame" crecería solo, para siempre. Como el
// propio robot (responder-pregunta.php) solo sabe buscar por número
// ("si la pregunta menciona el número de alguna de ellas..."), acá se
// manda solo la(s) que de verdad se están preguntando. Con la lista
// todavía chica (<= 10) se manda completa igual, sin filtrar nada.
function casosRelevantes(casosGuardados, pregunta){
  if(!casosGuardados || casosGuardados.length <= LIMITE_CASOS_SIN_FILTRAR) return casosGuardados;
  const numerosMencionados = pregunta.match(/\d{4,}/g) || [];
  if(!numerosMencionados.length) return casosGuardados.slice(0, LIMITE_CASOS_SIN_FILTRAR);
  const filtrados = casosGuardados.filter(c =>
    (c.registros || []).some(r => numerosMencionados.includes(String(r.NoTutela || '').trim()))
  );
  return filtrados.length ? filtrados : casosGuardados.slice(0, LIMITE_CASOS_SIN_FILTRAR);
}

function TabPreguntas({ robotPreguntasUrl, notify, casoActual, casosGuardados }){
  const [pregunta, setPregunta] = useState('');
  const [mensajes, setMensajes] = useState([]); // [{autor:'yo'|'ia', texto}]
  const [enviando, setEnviando] = useState(false);

  async function handleEnviar(){
    const texto = pregunta.trim();
    if(!texto || enviando) return;
    if(!robotPreguntasUrl){
      notify?.('Falta terminar de instalar LexIA (ROBOT_PREGUNTAS_URL en config.js).', 'error');
      return;
    }
    setMensajes(prev => [...prev, { autor:'yo', texto }]);
    setPregunta('');
    setEnviando(true);
    try{
      // "Para preguntar, solo vamos a dejar que se haga desde el archivo de
      // texto que ya se guardó" (2026-09-29, pedido explícito del usuario,
      // por costo de la API) — ya no se manda la tabla general de tutelas
      // del portal (podía ser miles de filas, el gasto más grande de este
      // endpoint); "Pregúntame" ahora SOLO responde sobre lo que ya está en
      // casoActual/casosGuardados (los .txt guardados en OneDrive).
      const casosAMandar = casosRelevantes(casosGuardados, texto);
      const res = await fetch(robotPreguntasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: texto, casoActual: casoActual || undefined, casosGuardados: (casosAMandar && casosAMandar.length) ? casosAMandar : undefined }),
      });
      let data;
      try{ data = await res.json(); }catch{ data = null; }
      if(!res.ok || !data || data.error){
        throw new Error((data && data.error) || `LexIA respondió con error (código ${res.status}).`);
      }
      const respuesta = limpiarMarkdown(data.respuesta || '(sin respuesta)');
      setMensajes(prev => [...prev, { autor:'ia', texto: respuesta }]);
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
        Pregúntale a LexIA sobre una tutela que ya haya sido leída/extraída (marcada "Ya leído por LexIA" en la lista). Esto no guarda nada, solo responde.
      </p>
      {casoActual && (
        <p className="save-hint" style={{margin:'0 0 14px', color:'var(--verde-oscuro)', fontWeight:600}}>
          También puedes preguntar sobre el correo que acabas de leer (ej. "¿quién es el usuario?", "¿qué están solicitando?", "¿quiénes están vinculados?", "dime las pretensiones") — aunque esa tutela todavía no esté guardada.
        </p>
      )}
      {!casoActual && casosGuardados && casosGuardados.length > 0 && (
        <p className="save-hint" style={{margin:'0 0 14px', color:'var(--verde-oscuro)', fontWeight:600}}>
          También puedes preguntar por cualquiera de las {casosGuardados.length} tutelas marcadas "Ya leído por LexIA" en la lista, aunque no hayas hecho clic en ese correo todavía.
        </p>
      )}
      <div className="entrenar-ia-historial entrenar-ia-chat">
        {!mensajes.length && <p className="empty-state empty-state-compact">Escribe tu primera pregunta abajo.</p>}
        {mensajes.map((m,i) => (
          <div key={i} className={"entrenar-ia-burbuja " + (m.autor==='yo' ? 'entrenar-ia-burbuja-yo' : 'entrenar-ia-burbuja-ia')}>
            {m.texto}
          </div>
        ))}
        {/* "Mientras responde la pregunta, algo como 'estoy buscando lo que
            me pediste'" (2026-09-24, pedido explícito del usuario). */}
        {enviando && <div className="entrenar-ia-burbuja entrenar-ia-burbuja-ia">Estoy buscando lo que me pediste…</div>}
      </div>
      <div className="field" style={{margin:'14px 0'}}>
        <label>Tu pregunta</label>
        <textarea rows={2} value={pregunta} onChange={e => setPregunta(e.target.value)}
          onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleEnviar(); } }}
          placeholder='Ej. "¿Quién es el usuario de la tutela 27918?"' />
      </div>
      <IconTextButton icon="add" variant="primary" disabled={enviando || !pregunta.trim()} onClick={handleEnviar}>
        {enviando ? 'Enviando…' : 'Preguntar'}
      </IconTextButton>
    </>
  );
}
