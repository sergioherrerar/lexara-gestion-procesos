import { useState, useEffect } from 'react';
import { leerCorreosTutelas, leerCorreoCompleto, mensajeError, stripHtml } from '../lib/graph';
import { IconTextButton } from './IconButton';
import { EntrenarIAPanel } from './EntrenarIAModal';

// "API Claude" Tarea 1 (2026-09-23, pedido explícito del usuario, con
// aprobación interna — ver [[project_api_claude_tutelas]]) — leer un correo
// del buzón de Tutelas, mandarlo al robot (PHP en el mismo cPanel que ya
// aloja www.lexaraabogados.com/app, ver robot-tutelas/extraer-tutela.php) y
// devolver los campos que Claude extrajo para prellenar "Nueva tutela". El
// usuario SIEMPRE revisa y confirma en el formulario antes de guardar — acá
// nunca se toca SharePoint, solo se arma el objeto de campos iniciales.
export default function LeerCorreoTutelaModal({ correoBuzon, remitentesPermitidos, robotUrl, tutelas, onAgregarCorreccionIA, robotPreguntasUrl, onExtraido, onClose, notify }){
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [mensajes, setMensajes] = useState([]);
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [procesando, setProcesando] = useState(false);
  // Un correo puede señalar a más de un cliente real a la vez (2026-09-23,
  // pedido explícito del usuario: "si vinculan colmedica y aliansalud se
  // debe hacer un registro por cada uno") — el robot devuelve un arreglo de
  // "registros" (uno por cliente detectado). Se guardan acá con un flag
  // `_creado` propio para poder ir creando uno por uno sin perder de vista
  // los demás ni tener que volver a leer el correo/llamar a Claude de nuevo.
  const [resultado, setResultado] = useState(null); // { mensajeId, registros:[{...,_creado}] } | null
  // 2026-09-24, pedido explícito del usuario ("que le pueda preguntar sobre
  // la tutela que acaba de analizar la IA") — guarda el asunto/cuerpo del
  // correo recién extraído para poder mandárselo también a la pestaña
  // "Preguntas" de "Entrenar IA" (ver casoActual más abajo), además de los
  // campos ya estructurados en `resultado`.
  const [correoActual, setCorreoActual] = useState(null); // { asunto, cuerpo } | null
  // Rango de fechas (2026-09-23, pedido explícito del usuario: "que pueda
  // colocarle leer los correos del día tal a día tal") — opcional; vacío,
  // leerCorreosTutelas igual acota sola a los últimos 90 días por defecto.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargando(true);
      setErrorCarga('');
      try{
        const r = await leerCorreosTutelas(correoBuzon, remitentesPermitidos, 200, desde || undefined, hasta || undefined);
        if(!cancelado) setMensajes(r);
      }catch(err){
        console.error(err);
        if(!cancelado) setErrorCarga(mensajeError(err));
      }finally{
        if(!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [correoBuzon, remitentesPermitidos, desde, hasta]);

  async function handleExtraer(mensaje){
    if(!robotUrl){
      notify?.('Falta terminar de instalar el robot (ROBOT_CLAUDE_URL en config.js) antes de poder usar esto.', 'error');
      return;
    }
    setProcesando(true);
    try{
      const completo = await leerCorreoCompleto(correoBuzon, mensaje.id);
      // "Entrenar IA" (2026-09-23) — correcciones reales que el abogado ya
      // dejó sobre el campo Tema de tutelas guardadas (columna "Corrección
      // IA" en SharePoint) — se mandan SIEMPRE como ejemplo de referencia
      // para TODOS los correos futuros, no solo una vez para esa tutela
      // puntual (pedido explícito del usuario 2026-09-24: "que las
      // correcciones también las tome para casos en general"). Antes se
      // cortaba a las primeras 30 SIN ordenar (orden arbitrario de
      // SharePoint) — si había más de 30 tutelas con corrección, algunas
      // quedaban descartadas al azar y dejaban de usarse sin avisar. Ahora
      // se ordenan por No. Tutela descendente (las más recientes primero,
      // más relevantes para el criterio actual del despacho) antes de
      // cortar, y se sube el límite a 150 (es solo texto corto, no
      // adjuntos — no pesa nada comparado con los documentos).
      const correcciones = (tutelas || [])
        .filter(t => t.CorreccionIA)
        .sort((a,b) => (Number(b.NoTutela)||0) - (Number(a.NoTutela)||0))
        .slice(0, 150)
        .map(t => ({ noTutela: t.NoTutela, temaActual: t.Tema, correccion: stripHtml(t.CorreccionIA) }));
      const res = await fetch(robotUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asunto: completo.asunto,
          cuerpo: completo.cuerpo,
          adjuntos: completo.adjuntos.map(a => ({ nombre: a.nombre, tipo: a.tipo, base64: a.base64 })),
          correcciones,
        }),
      });
      let data;
      try{ data = await res.json(); }catch{ data = null; }
      if(!res.ok || !data || data.error){
        throw new Error((data && data.error) || `El robot respondió con error (código ${res.status}).`);
      }
      const registros = Array.isArray(data.registros) ? data.registros : [data.campos || {}];
      setResultado({ mensajeId: mensaje.id, registros: registros.map(r => ({ ...r, _creado: false })) });
      setCorreoActual({ asunto: completo.asunto, cuerpo: completo.cuerpo });
    }catch(err){
      console.error(err);
      notify?.('No se pudo extraer los datos con IA: ' + (err.message || mensajeError(err)), 'error');
    }finally{
      setProcesando(false);
    }
  }

  function handleCrearBorrador(indice){
    setResultado(prev => {
      const registro = prev.registros[indice];
      onExtraido?.(registro);
      const registros = prev.registros.map((r,i) => i===indice ? {...r, _creado:true} : r);
      return { ...prev, registros };
    });
  }

  return (
    <div className="confirm-overlay leer-correo-overlay">
      <div className="confirm-box leer-correo-box leer-correo-box-ancha">
        <div className="leer-correo-head">
          <h3>Leer correo de Tutelas (IA)</h3>
          <button className="drawer-close" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {/* 2026-09-24, pedido explícito del usuario ("mejor colocarlo al
            lado... mira qué datos trajo y corrige y pregunta") — 2 columnas:
            a la izquierda la lectura de correos de siempre, a la derecha
            "Entrenar IA" (Corrección/Preguntas) SIEMPRE visible, para poder
            corregir un Tema o preguntar sin cerrar esta ventana. En
            pantallas angostas se apilan (ver .leer-correo-2col en CSS). */}
        <div className="leer-correo-2col">
        <div className="leer-correo-col-principal">
        <p className="save-hint" style={{margin:'0 0 14px'}}>
          Elige un correo, dale "Extraer con IA" y revisa los datos en el formulario de "Nueva tutela" antes de guardar.
        </p>
        {/* Rango de fechas (2026-09-23, pedido explícito del usuario) — filtra
            los correos por "Desde"/"Hasta"; con los dos vacíos, trae los
            últimos 20 sin acotar por fecha (comportamiento de siempre). */}
        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:14}}>
          <div className="field" style={{minWidth:140}}>
            <label>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="field" style={{minWidth:140}}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          {(desde || hasta) && (
            <button type="button" className="btn-secondary" style={{alignSelf:'flex-end'}} onClick={() => { setDesde(''); setHasta(''); }}>
              Quitar filtro de fecha
            </button>
          )}
        </div>
        {cargando && <p>Cargando correos…</p>}
        {!cargando && errorCarga && <div className="field-warning">{errorCarga}</div>}
        {!cargando && !errorCarga && mensajes.length === 0 && (
          <p className="empty-state empty-state-compact">
            No hay correos para mostrar. Revisa que esta cuenta tenga acceso ("Acceso completo") al buzón de Tutelas, y que la lista de remitentes permitidos esté configurada.
          </p>
        )}
        <ul className="leer-correo-lista">
          {mensajes.map(m => (
            <li key={m.id} className={"leer-correo-item" + (seleccionadoId===m.id ? ' activo' : '')}>
              <button type="button" className="leer-correo-item-btn" onClick={() => { setSeleccionadoId(m.id); setResultado(null); setCorreoActual(null); }}>
                <strong>{m.remitenteNombre || m.remitente || 'Remitente desconocido'}</strong>
                <span>{m.asunto}</span>
                <span className="save-hint">
                  {m.fecha ? new Date(m.fecha).toLocaleString('es-CO') : '—'}{m.tieneAdjuntos ? ' · con adjuntos' : ''}
                </span>
              </button>
              {seleccionadoId === m.id && (
                <div className="leer-correo-item-accion">
                  {!(resultado && resultado.mensajeId === m.id) && (
                    <IconTextButton icon="add" variant="primary" disabled={procesando} onClick={() => handleExtraer(m)}>
                      {procesando ? 'Extrayendo…' : '+ Extraer con IA'}
                    </IconTextButton>
                  )}
                  {/* Uno o varios registros detectados (2026-09-23, ver nota
                      arriba sobre clientes vinculados) — cada uno con su
                      propio botón, para poder crear varios borradores del
                      mismo correo sin tener que volver a extraer. */}
                  {resultado && resultado.mensajeId === m.id && (
                    <div className="leer-correo-registros">
                      {resultado.registros.length > 1 && (
                        <p className="save-hint" style={{margin:'0 0 8px'}}>
                          Este correo señala a {resultado.registros.length} clientes distintos — crea un borrador por cada uno.
                        </p>
                      )}
                      {resultado.registros.map((r, i) => (
                        <div key={i} className="leer-correo-registro-item">
                          <div>
                            <strong>{r.Cliente || 'Cliente sin definir'}</strong>
                            {/* Cliente, No. Tutela, Tipo Respuesta, Número
                                corto (Proceso) y Usuario — pedido explícito
                                del usuario 2026-09-23, viéndolo en vivo. */}
                            <span className="save-hint"> · {r.NoTutela || 'sin número'} · {r.TipoRespuesta || '—'}{r.Proceso ? ` · ${r.Proceso}` : ''}{r.Usuario ? ` · ${r.Usuario}` : ''}</span>
                          </div>
                          {r._creado ? (
                            <span className="badge badge-verde">Creado</span>
                          ) : (
                            <IconTextButton icon="add" variant="primary" onClick={() => handleCrearBorrador(i)}>
                              Crear borrador
                            </IconTextButton>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        </div>
        <div className="leer-correo-col-lateral">
          <EntrenarIAPanel
            tutelas={tutelas || []}
            onAgregarCorreccion={onAgregarCorreccionIA}
            robotPreguntasUrl={robotPreguntasUrl}
            notify={notify}
            casoActual={resultado ? { asunto: correoActual?.asunto, cuerpo: correoActual?.cuerpo, registros: resultado.registros } : null}
          />
        </div>
        </div>
      </div>
    </div>
  );
}
