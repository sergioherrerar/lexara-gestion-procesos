import { useState, useEffect } from 'react';
import { leerCorreosTutelas, extraerTutelaConLexIA, numeroTutelaDeAsunto, mensajeError } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import { EntrenarIAPanel } from './EntrenarIAModal';
import { useDraggable } from '../hooks/useDraggable';
import lexiaAvatar from '../assets/LexIA avatar.png';

// "API Claude" Tarea 1 (2026-09-23, pedido explícito del usuario, con
// aprobación interna — ver [[project_api_claude_tutelas]]) — leer un correo
// del buzón de Tutelas, mandarlo al robot (PHP en el mismo cPanel que ya
// aloja www.lexaraabogados.com/app, ver robot-tutelas/extraer-tutela.php) y
// devolver los campos que Claude extrajo para prellenar "Nueva tutela". El
// usuario SIEMPRE revisa y confirma en el formulario antes de guardar — acá
// nunca se toca SharePoint, solo se arma el objeto de campos iniciales.
export default function LeerCorreoTutelaModal({ correoBuzon, remitentesPermitidos, robotUrl, tutelas, onAgregarCorreccionIA, robotPreguntasUrl, onExtraido, onClose, notify, vozActivada, setVozActivada, decir, lexiaHablando, lexiaPausada, pausarLexia, continuarLexia, precargaLexIA }){
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
  // Buscador por No. Tutela (2026-09-25, pedido explícito del usuario:
  // "que me busque todos los correos con ese número y lo filtre y me dé un
  // mensaje si ya está en la lista de SharePoint Tutelas o no") — mismo
  // parseo de texto (sin IA) que ya usa la precarga automática.
  const [busquedaNumero, setBusquedaNumero] = useState('');
  // "Dar vida" a LexIA (2026-09-24, pedido explícito del usuario: "podemos
  // darle voz y que lea lo que envía... que salude con la voz al abrir") —
  // `vozActivada`/`setVozActivada`/`decir` vienen de TutelasView (no se
  // instancian acá): el saludo hablado se dispara ahí mismo, DENTRO del
  // clic que abre esta ventana — varios navegadores solo dejan sonar la
  // síntesis de voz pegada al gesto real del usuario, no un instante
  // después (que es lo que pasaba disparándolo en un useEffect al montar
  // este modal). Acá solo queda el temporizador visual del saludo.
  const [mostrarSaludo, setMostrarSaludo] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setMostrarSaludo(false), 6000);
    return () => clearTimeout(t);
  }, []);

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
      notify?.('Falta terminar de instalar LexIA (ROBOT_CLAUDE_URL en config.js) antes de poder usar esto.', 'error');
      return;
    }
    // Precarga de LexIA (2026-09-25, pedido explícito del usuario: "que
    // apenas ingresen al portal cargue la lectura" de la SIGUIENTE tutela
    // que todavía no esté guardada) — si este correo YA se extrajo de
    // fondo al iniciar sesión, se usa ese resultado directo, sin llamar de
    // nuevo al robot (instantáneo, y no se gasta Claude dos veces).
    if(precargaLexIA && precargaLexIA.mensajeId === mensaje.id){
      setResultado({ mensajeId: mensaje.id, registros: precargaLexIA.registros });
      setCorreoActual({ asunto: precargaLexIA.asunto, cuerpo: precargaLexIA.cuerpo });
      return;
    }
    setProcesando(true);
    decir('Estoy trabajando para ti.');
    try{
      const extraido = await extraerTutelaConLexIA(correoBuzon, mensaje.id, tutelas, robotUrl);
      setResultado({ mensajeId: mensaje.id, registros: extraido.registros });
      setCorreoActual({ asunto: extraido.asunto, cuerpo: extraido.cuerpo });
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

  // 2026-09-24, pedido explícito del usuario ("que se deje arrastrar la
  // ventana con el clic pulsado") — se toma desde el encabezado.
  const { offset, dragHandleProps } = useDraggable();

  // Buscador por No. Tutela — filtra la lista comparando el número del
  // asunto (texto plano, sin IA) contra lo escrito, y avisa si esa tutela
  // ya existe en la lista de SharePoint.
  const numeroBuscado = busquedaNumero.trim() ? Number(busquedaNumero.trim()) : null;
  const mensajesFiltrados = numeroBuscado === null
    ? mensajes
    : mensajes.filter(m => numeroTutelaDeAsunto(m.asunto) === numeroBuscado);
  const tutelaBuscadaExistente = numeroBuscado === null
    ? null
    : (tutelas || []).find(t => Number(t.NoTutela) === numeroBuscado) || null;
  // "Después de que sea leída su información, déjalo de primeras en la
  // lista" (2026-09-25, pedido explícito del usuario) — el correo ya
  // precargado por LexIA queda arriba de todo, sin importar su fecha, para
  // no tener que buscarlo entre los demás.
  const mensajesOrdenados = precargaLexIA
    ? [...mensajesFiltrados].sort((a,b) => {
        if(a.id === precargaLexIA.mensajeId) return -1;
        if(b.id === precargaLexIA.mensajeId) return 1;
        return 0;
      })
    : mensajesFiltrados;

  return (
    <div className="confirm-overlay leer-correo-overlay">
      <div className="confirm-box leer-correo-box leer-correo-box-ancha" style={{transform: `translate(${offset.x}px, ${offset.y}px)`}}>
        <div className="leer-correo-head" {...dragHandleProps}>
          <h3>Leer correo de Tutelas (LexIA)</h3>
          {/* "Entrenar LexIA" alineado con el título de la izquierda, y su
              avatar al lado del ícono de sonido, un poco más grande
              (2026-09-24, pedido explícito del usuario: "alinea los dos
              títulos", "LexIA colócala al lado del ícono del sonido y un
              poco más grande") — antes vivía más abajo, adentro de la
              columna derecha, sin alinearse con el título de acá. */}
          <div className="leer-correo-head-derecha">
            <h4 className="leer-correo-col-lateral-titulo">
              Entrenar LexIA
              <img src={lexiaAvatar} alt="" className="btn-lexia-avatar leer-correo-head-avatar" />
            </h4>
            <IconButton
              icon={vozActivada ? 'volumeOn' : 'volumeOff'}
              variant="secondary"
              label={vozActivada ? 'Silenciar a LexIA' : 'Activar la voz de LexIA'}
              onClick={() => setVozActivada(v => !v)}
            />
            {/* "Un botón de stop y uno play para parar o continuar con la
                lectura" (2026-09-25, pedido explícito del usuario) — solo
                aparecen mientras LexIA está hablando/en pausa, no ocupan
                espacio el resto del tiempo. */}
            {lexiaHablando && !lexiaPausada && (
              <IconButton icon="pause" variant="secondary" label="Pausar la lectura" onClick={pausarLexia} />
            )}
            {lexiaHablando && lexiaPausada && (
              <IconButton icon="play" variant="secondary" label="Continuar la lectura" onClick={continuarLexia} />
            )}
            <button className="drawer-close" onClick={onClose} aria-label="Cerrar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        {/* "Dar vida" a LexIA (2026-09-24, pedido explícito del usuario:
            "una animación saliendo y saludando") — aparece al abrir esta
            ventana y se retira sola a los pocos segundos (ver setTimeout
            arriba), para no quitarle espacio permanente a la lista de
            correos. */}
        {mostrarSaludo && (
          <div className="lexia-saludo">
            <img src={lexiaAvatar} alt="LexIA" className="lexia-avatar" />
            <div className="lexia-burbuja">¡Hola! Soy LexIA. Elige un correo y dale "Extraer con LexIA", o pregúntame lo que necesites al lado.</div>
          </div>
        )}
        {/* 2026-09-24, pedido explícito del usuario ("mejor colocarlo al
            lado... mira qué datos trajo y corrige y pregunta") — 2 columnas:
            a la izquierda la lectura de correos de siempre, a la derecha
            "Entrenar IA" (Corrección/Preguntas) SIEMPRE visible, para poder
            corregir un Tema o preguntar sin cerrar esta ventana. En
            pantallas angostas se apilan (ver .leer-correo-2col en CSS). */}
        <div className="leer-correo-2col">
        <div className="leer-correo-col-principal">
        <p className="save-hint" style={{margin:'0 0 14px'}}>
          Elige un correo, dale "Extraer con LexIA" y revisa los datos en el formulario de "Nueva tutela" antes de guardar.
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
        {/* Buscador por No. Tutela (2026-09-25, pedido explícito del
            usuario) — filtra la lista de abajo y avisa si esa tutela ya
            está guardada en SharePoint o no. */}
        <div className="field" style={{marginBottom:10, maxWidth:220}}>
          <label>Buscar por No. Tutela</label>
          <input type="text" inputMode="numeric" value={busquedaNumero} onChange={e => setBusquedaNumero(e.target.value)} placeholder="Ej. 28159" />
        </div>
        {numeroBuscado !== null && (
          tutelaBuscadaExistente ? (
            <p className="field-warning" style={{marginBottom:14}}>
              La tutela {numeroBuscado} YA está en la lista de SharePoint — {tutelaBuscadaExistente.Cliente || 'cliente sin definir'}, Tema: {tutelaBuscadaExistente.Tema || '—'}.
            </p>
          ) : (
            <p className="save-hint" style={{marginBottom:14, color:'var(--verde-oscuro)', fontWeight:600}}>
              La tutela {numeroBuscado} todavía NO está en la lista de SharePoint.
            </p>
          )
        )}
        {cargando && <p>Cargando correos…</p>}
        {!cargando && errorCarga && <div className="field-warning">{errorCarga}</div>}
        {!cargando && !errorCarga && mensajes.length === 0 && (
          <p className="empty-state empty-state-compact">
            No hay correos para mostrar. Revisa que esta cuenta tenga acceso ("Acceso completo") al buzón de Tutelas, y que la lista de remitentes permitidos esté configurada.
          </p>
        )}
        {!cargando && !errorCarga && mensajes.length > 0 && numeroBuscado !== null && mensajesFiltrados.length === 0 && (
          <p className="empty-state empty-state-compact">
            No hay ningún correo con la tutela {numeroBuscado} entre los que están cargados (revisa el rango de fechas de arriba).
          </p>
        )}
        <ul className="leer-correo-lista">
          {mensajesOrdenados.map(m => (
            <li key={m.id} className={"leer-correo-item" + (seleccionadoId===m.id ? ' activo' : '')}>
              <button type="button" className="leer-correo-item-btn" onClick={() => { setSeleccionadoId(m.id); setResultado(null); setCorreoActual(null); }}>
                <strong>{m.remitenteNombre || m.remitente || 'Remitente desconocido'}</strong>
                <span>{m.asunto}</span>
                <span className="save-hint">
                  {m.fecha ? new Date(m.fecha).toLocaleString('es-CO') : '—'}{m.tieneAdjuntos ? ' · con adjuntos' : ''}
                  {/* Precarga de LexIA (2026-09-25, pedido explícito del
                      usuario) — avisa cuál correo ya se leyó de fondo al
                      entrar, para que se entienda por qué ese sale al
                      instante y los demás no. 2026-09-25, pedido explícito
                      del usuario ("aparte de Creado también colócale Ya
                      leído por LexIA") — se generaliza: también sale en
                      cualquier correo que YA se haya extraído en esta
                      sesión (aunque haya sido con el botón manual, no solo
                      el precargado de fondo), para que quede claro que ese
                      correo ya fue leído por LexIA sin tener que volver a
                      abrirlo. */}
                  {(precargaLexIA?.mensajeId === m.id || resultado?.mensajeId === m.id) && ' · '}
                  {(precargaLexIA?.mensajeId === m.id || resultado?.mensajeId === m.id) && (
                    <span className="badge badge-verde" style={{marginLeft:2}}>Ya leído por LexIA</span>
                  )}
                </span>
              </button>
              {seleccionadoId === m.id && (
                <div className="leer-correo-item-accion">
                  {!(resultado && resultado.mensajeId === m.id) && (
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <IconTextButton icon="add" variant="primary" disabled={procesando} onClick={() => handleExtraer(m)}>
                        {procesando ? 'Extrayendo…' : '+ Extraer con LexIA'}
                      </IconTextButton>
                      {/* "Que la perrita esté como corriendo mientras lee la
                          información" (2026-09-24, pedido explícito del
                          usuario) — es una foto fija, no hay cuadros de una
                          carrera real, así que se simula con un rebote +
                          balanceo en bucle mientras dura la extracción. */}
                      {procesando && seleccionadoId === m.id && (
                        <>
                          <img src={lexiaAvatar} alt="LexIA corriendo" className="lexia-avatar lexia-avatar-corriendo" />
                          {/* "Y mensaje: estoy trabajando para ti" (2026-09-24,
                              pedido explícito del usuario). */}
                          <span className="save-hint" style={{fontStyle:'italic'}}>Estoy trabajando para ti…</span>
                        </>
                      )}
                    </div>
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
            decirLexia={decir}
          />
        </div>
        </div>
      </div>
    </div>
  );
}
