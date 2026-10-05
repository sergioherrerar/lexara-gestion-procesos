import { useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';
import { leerDocumentosTutelaOneDrive } from '../lib/graph';
import { seleccionarAdjuntosParaLexIA } from '../lib/adjuntosLexIA';

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
export function EntrenarIAPanel({ tutelas, onAgregarCorreccion, robotPreguntasUrl, notify, casoActual, casosGuardados, onedriveCarpetaUrl }){
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
        : <TabPreguntas robotPreguntasUrl={robotPreguntasUrl} notify={notify} casoActual={casoActual} casosGuardados={casosGuardados} onedriveCarpetaUrl={onedriveCarpetaUrl} />}
    </div>
  );
}

function TabCorreccion({ tutelas, onAgregarCorreccion, notify }){
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadaId, setSeleccionadaId] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Resultado del último intento, mostrado ahí mismo debajo del botón: los
  // avisos flotantes salen abajo a la derecha y es fácil no verlos (caso real
  // 2026-10-06: "le doy a Agregar corrección y no pasa nada").
  const [resultado, setResultado] = useState(null); // { ok, texto } | null

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
    setResultado(null);
    try{
      const r = await onAgregarCorreccion(seleccionada.id, texto.trim());
      if(r && r.ok === false){
        // No se guardó: el texto se conserva para no tener que reescribirlo.
        setResultado({ ok: false, texto: r.error || 'No se pudo guardar la corrección.' });
      } else {
        setTexto('');
        setResultado({ ok: true, texto: 'Corrección guardada. LexIA la tendrá en cuenta en las próximas lecturas.' });
      }
    }catch(err){
      console.error(err);
      setResultado({ ok: false, texto: 'No se pudo guardar la corrección: ' + (err?.message || 'error desconocido') });
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
            <button type="button" className="btn-secondary" onClick={() => { setSeleccionadaId(null); setResultado(null); }}>Cambiar</button>
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
          {!enviando && resultado && (
            <p className={resultado.ok ? 'save-hint' : 'field-warning'} role="status" style={{marginTop:10, fontWeight:600, color: resultado.ok ? 'var(--verde-oscuro)' : undefined}}>
              {resultado.texto}
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

// Tope de páginas de los documentos de la carpeta de la tutela que se le dan a
// Claude por pregunta (más bajo que el de "Extraer con LexIA", que es 80): se
// vuelven a mandar en cada pregunta (con caché de 5 min, de la 2ª en adelante
// salen a ~10% del precio), así que se cuida el costo.
const PAGINAS_MAX_PREGUNTA = 40;

// De qué tutela se pregunta: el primer número de 4+ dígitos de la pregunta
// que tenga carpeta en OneDrive; si no menciona ninguno, la del caso que
// está abierto en la lista.
function numerosCandidatos(pregunta, casoActual){
  const mencionados = pregunta.match(/\d{4,}/g) || [];
  const delCaso = (casoActual?.registros || []).map(r => String(r.NoTutela || '').trim()).filter(Boolean);
  return [...new Set([...mencionados, ...delCaso])].slice(0, 3);
}

function TabPreguntas({ robotPreguntasUrl, notify, casoActual, casosGuardados, onedriveCarpetaUrl }){
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
      // 2026-10-05, pedido explícito del usuario: LexIA va a la CARPETA de la
      // tutela en OneDrive ("N Tutela/Adjuntos originales") a buscar la
      // respuesta en los documentos reales (la tutela, el auto, los anexos),
      // no solo en el texto ya resumido. Si no se pueden leer, responde con
      // lo que ya tenía y lo avisa.
      let documentos = [];
      let numeroDocs = '';
      if(onedriveCarpetaUrl){
        try{
          for(const n of numerosCandidatos(texto, casoActual)){
            const bajados = await leerDocumentosTutelaOneDrive(onedriveCarpetaUrl, n);
            if(bajados.length){
              const { seleccionados, omitidos } = await seleccionarAdjuntosParaLexIA(bajados, { paginasMaxTotal: PAGINAS_MAX_PREGUNTA });
              documentos = seleccionados;
              numeroDocs = n;
              if(omitidos.length){
                setMensajes(prev => [...prev, { autor:'nota', texto: 'No incluí por tamaño o formato: ' + omitidos.map(o => o.nombre + ' (' + o.motivo + ')').join('; ') + '.' }]);
              }
              break;
            }
          }
        }catch(err){
          console.error('No se pudo leer la carpeta de la tutela en OneDrive:', err);
          setMensajes(prev => [...prev, { autor:'nota', texto: 'No pude abrir la carpeta de la tutela en OneDrive; respondo con lo que ya tenía guardado.' }]);
        }
      }
      async function preguntar(adjuntos){
        const res = await fetch(robotPreguntasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pregunta: texto, casoActual: casoActual || undefined, casosGuardados: (casosAMandar && casosAMandar.length) ? casosAMandar : undefined, tutelaDocumentos: numeroDocs || undefined, adjuntos: adjuntos.length ? adjuntos.map(a => ({ nombre:a.nombre, tipo:a.tipo, base64:a.base64 })) : undefined }),
        });
        let d;
        try{ d = await res.json(); }catch{ d = null; }
        if(!res.ok || !d || d.error){
          throw new Error((d && d.error) || `LexIA respondió con error (código ${res.status}).`);
        }
        return d;
      }
      let data;
      try{
        data = await preguntar(documentos);
        if(documentos.length){
          setMensajes(prev => [...prev, { autor:'nota', texto: 'Consulté ' + documentos.length + ' documento' + (documentos.length === 1 ? '' : 's') + ' de la carpeta de la tutela ' + numeroDocs + ' en OneDrive.' }]);
        }
      }catch(err){
        if(!documentos.length) throw err;
        // Un documento problemático (protegido, dañado…) no debe dejar la
        // pregunta sin respuesta: se reintenta sin los documentos.
        console.error('Falló la consulta con documentos, se reintenta sin ellos:', err);
        setMensajes(prev => [...prev, { autor:'nota', texto: 'No pude leer los documentos de la carpeta (' + (err.message || 'error') + '); respondo con lo que ya tenía guardado.' }]);
        data = await preguntar([]);
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
        {mensajes.map((m,i) => m.autor === 'nota' ? (
          <p key={i} className="save-hint" style={{margin:'4px 0', fontStyle:'italic'}}>{m.texto}</p>
        ) : (
          <div key={i} className={"entrenar-ia-burbuja " + (m.autor==='yo' ? 'entrenar-ia-burbuja-yo' : 'entrenar-ia-burbuja-ia')}>
            {m.texto}
          </div>
        ))}
        {/* "Mientras responde la pregunta, algo como 'estoy buscando lo que
            me pediste'" (2026-09-24, pedido explícito del usuario). */}
        {enviando && <div className="entrenar-ia-burbuja entrenar-ia-burbuja-ia">{onedriveCarpetaUrl ? 'Estoy buscando en la carpeta de la tutela lo que me pediste…' : 'Estoy buscando lo que me pediste…'}</div>}
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
