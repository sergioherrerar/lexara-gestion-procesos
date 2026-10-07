import { useState, useEffect } from 'react';
import { normalizarBorradorTutela } from '../lib/borradorTutela';
import { aplicarVencimientoHabil, fechaLocalISO } from '../lib/vencimientoTutela';
import { leerCorreosTutelas, primerCorreoDeConversacion, extraerTutelaConLexIA, numeroTutelaDeAsunto, normalize, mensajeError, buscarLecturaLexIAGuardada, guardarLecturaLexIAEnOneDrive, listarTutelasAnalizadasEnOneDrive, asegurarCarpetaTutelaDesdeMensaje } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import { EntrenarIAPanel } from './EntrenarIAModal';
import { useDraggable } from '../hooks/useDraggable';
import lexiaAvatar from '../assets/LexIA avatar.png';
// Dos poses nuevas del avatar (2026-09-29, pedido explícito del usuario:
// "darle más protagonismo... y que se vieran diferentes movimientos en
// diferentes etapas de la búsqueda") — antes solo había UNA pose (brazos
// cruzados), así que "distinto movimiento por etapa" solo podía variar la
// animación CSS sobre la misma imagen. Con estas 2 poses reales del
// usuario sí cambia también la postura, no solo el movimiento.
import lexiaAvatarEscuchando from '../assets/LexIA avatar - escuchando.webp';
import lexiaAvatarHablando from '../assets/LexIA avatar - hablando.webp';
import lexiaAvatarSaludo from '../assets/LexIA avatar - saludo.webp';

// "API Claude" Tarea 1 (2026-09-23, pedido explícito del usuario, con
// aprobación interna — ver [[project_api_claude_tutelas]]) — leer un correo
// del buzón de Tutelas, mandarlo al robot (PHP en el mismo cPanel que ya
// aloja www.lexaraabogados.com/app, ver robot-tutelas/extraer-tutela.php) y
// devolver los campos que Claude extrajo para prellenar "Nueva tutela". El
// usuario SIEMPRE revisa y confirma en el formulario antes de guardar — acá
// nunca se toca SharePoint, solo se arma el objeto de campos iniciales.
export default function LeerCorreoTutelaModal({ correoBuzon, remitentesPermitidos, robotUrl, onedriveCarpetaUrl, tutelas, temas, onAgregarCorreccionIA, robotPreguntasUrl, onExtraido, onClose, notify, lexiaHablando }){
  const [cargando, setCargando] = useState(true);
  // "Un botón para actualizar la lista de los correos que estén
  // ingresando" (2026-09-29, pedido explícito del usuario) — separado de
  // `cargando` (que reemplaza toda la lista por "Cargando correos…") para
  // que al actualizar a mano la lista de abajo NO desaparezca, solo gira
  // el ícono mientras llega la respuesta.
  const [actualizando, setActualizando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [mensajes, setMensajes] = useState([]);
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [procesando, setProcesando] = useState(false);
  // Etapa visible en el botón "Extraer con LexIA" (2026-10-05): primero lee
  // con LexIA y luego deja el correo, los adjuntos y la lectura en la carpeta
  // de la tutela en OneDrive.
  const [guardandoOneDrive, setGuardandoOneDrive] = useState(false);
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
  // "Si ya creó la carpeta, colócale Ya leído" (2026-09-29, pedido
  // explícito del usuario viendo en OneDrive una carpeta "Tutela 27918"
  // que la lista de correos no marcaba, porque esa tutela no se había
  // precargado ni extraído EN ESTA SESIÓN) — set con los números de
  // tutela que YA tienen un análisis guardado de una sesión anterior;
  // se lista una sola vez al abrir esta ventana (no un GET por correo).
  const [analizadasOneDrive, setAnalizadasOneDrive] = useState(new Set());
  // "Le pedí algo de esta tutela y ya está leída y no encuentra
  // información" (2026-09-29, pedido explícito del usuario con captura:
  // preguntó por la 27918, que SÍ estaba marcada "Ya leído por LexIA",
  // pero "Pregúntame" no la conocía porque nunca había hecho clic en ese
  // correo para cargarla en casoActual) — en vez de depender de un clic
  // por tutela, se trae el contenido completo de TODAS las ya analizadas
  // en OneDrive de una vez (en paralelo) y se manda como contexto extra a
  // "Pregúntame", para que cualquiera de ellas se pueda consultar por
  // número sin tener que seleccionarla primero en la lista.
  const [casosGuardadosOneDrive, setCasosGuardadosOneDrive] = useState([]);
  useEffect(() => {
    if(!onedriveCarpetaUrl) return;
    let cancelado = false;
    listarTutelasAnalizadasEnOneDrive(onedriveCarpetaUrl)
      .then(async set => {
        if(cancelado) return;
        setAnalizadasOneDrive(set);
        const casos = await Promise.all(
          Array.from(set).map(n => buscarLecturaLexIAGuardada(onedriveCarpetaUrl, n))
        );
        if(!cancelado) setCasosGuardadosOneDrive(casos.filter(Boolean));
      })
      .catch(err => console.error('No se pudo listar las tutelas ya analizadas en OneDrive:', err));
    return () => { cancelado = true; };
  }, [onedriveCarpetaUrl]);
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

  async function handleActualizarCorreos(){
    setActualizando(true);
    setErrorCarga('');
    try{
      const r = await leerCorreosTutelas(correoBuzon, remitentesPermitidos, 200, desde || undefined, hasta || undefined);
      setMensajes(r);
    }catch(err){
      console.error(err);
      setErrorCarga(mensajeError(err));
    }finally{
      setActualizando(false);
    }
  }

  // Instante del PRIMER correo de la conversación enviado por los remitentes permitidos — es la
  // fecha/hora de notificación de la tutela (ver primerCorreoDeConversacion en graph.js). Por mensaje.
  const [primerCorreoPorMensaje, setPrimerCorreoPorMensaje] = useState({});
  async function instantePrimerCorreo(mensaje){
    try{
      const primero = await primerCorreoDeConversacion(correoBuzon, mensaje.conversacionId, remitentesPermitidos);
      return primero && primero < mensaje.fecha ? primero : mensaje.fecha;
    }catch(err){
      console.error('No se pudo buscar el primer correo de la conversación:', err);
      return mensaje.fecha;
    }
  }

  async function handleExtraer(mensaje){
    if(!robotUrl){
      notify?.('Falta terminar de instalar LexIA (ROBOT_CLAUDE_URL en config.js) antes de poder usar esto.', 'error');
      return;
    }
    const numeroTutela = numeroTutelaDeAsunto(mensaje.asunto);
    setProcesando(true);
    const instanteNotificacion = await instantePrimerCorreo(mensaje);
    setPrimerCorreoPorMensaje(prev => ({ ...prev, [mensaje.id]: instanteNotificacion }));
    // "Si se vuelve a consultar esa tutela, que diga que ya fue analizada
    // por LexIA y pregunte qué se necesita de ella" (2026-09-29, pedido
    // explícito del usuario) — memoria PERSISTENTE (sobrevive a cerrar el
    // navegador, a diferencia de la precarga de arriba, que es de la
    // sesión actual): revisa en OneDrive si esta tutela ya tiene una
    // lectura guardada de una vez anterior antes de gastar Claude de
    // nuevo.
    if(onedriveCarpetaUrl && numeroTutela){
      try{
        const guardada = await buscarLecturaLexIAGuardada(onedriveCarpetaUrl, numeroTutela);
        if(guardada){
          setResultado({ mensajeId: mensaje.id, registros: guardada.registros });
          setCorreoActual({ asunto: guardada.asunto, cuerpo: guardada.cuerpo });
          // Igual deja en la carpeta el correo y los adjuntos si todavía no estaban.
          setGuardandoOneDrive(true);
          const carpeta = await asegurarCarpetaTutelaDesdeMensaje(correoBuzon, mensaje.id, onedriveCarpetaUrl, numeroTutela).catch(err => ({ error: err }));
          setGuardandoOneDrive(false);
          let extra = '';
          if(carpeta?.error){
            notify?.('No se pudieron guardar los adjuntos en la carpeta de la tutela: ' + mensajeError(carpeta.error) + ' — vuelve a darle "Extraer con LexIA".', 'error');
          } else if(!carpeta?.yaEstaban){
            extra = ` Además guardé el correo y ${carpeta.cantidad} adjunto${carpeta.cantidad === 1 ? '' : 's'} en su carpeta de OneDrive.`;
          }
          notify?.(`La tutela ${numeroTutela} ya había sido analizada por LexIA — pregúntale lo que necesites al lado, sin gastar otra lectura.${extra}`, 'success');
          setProcesando(false);
          return;
        }
      }catch(err){
        console.error('No se pudo revisar OneDrive antes de extraer:', err);
        // Sigue con la extracción normal — que falle guardar/consultar en
        // OneDrive nunca debe bloquear la extracción con Claude.
      }
    }
    try{
      const extraido = await extraerTutelaConLexIA(correoBuzon, mensaje.id, tutelas, robotUrl, onedriveCarpetaUrl, fechaLocalISO(instanteNotificacion));
      // Vencimiento en días HÁBILES (sin sábados, domingos ni festivos de
      // Colombia), calculado por el portal con los días que otorga el juez —
      // no con la fecha que haya escrito Claude (ver lib/vencimientoTutela.js).
      // Se corrige ANTES de mostrar/guardar, para que lo que se ve, lo que
      // queda en OneDrive y lo que usa "Pregúntame" sea siempre lo mismo.
      const avisosVencimiento = [];
      extraido.registros = extraido.registros.map(r => {
        const { registro, avisos } = aplicarVencimientoHabil(r, fechaLocalISO(instanteNotificacion), instanteNotificacion, { forzarFechaCorreo: true });
        avisos.forEach(a => { if(!avisosVencimiento.includes(a)) avisosVencimiento.push(a); });
        return registro;
      });
      // Los avisos se juntan en UN solo mensaje al final (el aviso flotante
      // muestra uno a la vez: si cada paso avisara por separado, el último
      // taparía al anterior — p. ej. el del vencimiento).
      const avisosFinales = [];
      if(avisosVencimiento.length) avisosFinales.push('Vencimiento: ' + avisosVencimiento.join(' · '));
      setResultado({ mensajeId: mensaje.id, registros: extraido.registros });
      setCorreoActual({ asunto: extraido.asunto, cuerpo: extraido.cuerpo });
      if(extraido.omitidos?.length){
        avisosFinales.push(`LexIA no leyó ${extraido.omitidos.length} adjunto${extraido.omitidos.length === 1 ? '' : 's'} por ser demasiado largo${extraido.omitidos.length === 1 ? '' : 's'}: ${extraido.omitidos.map(o => `${o.nombre} (${o.motivo})`).join(', ')}. Revisa los datos con cuidado — los adjuntos completos quedan guardados en la carpeta de la tutela en OneDrive.`);
      }
      const conAvisos = base => [base, ...avisosFinales].filter(Boolean).join(' — ');
      if(onedriveCarpetaUrl && numeroTutela){
        // Pedido explícito del usuario 2026-10-05: este mismo botón deja en la
        // carpeta de la tutela (N Tutela) los adjuntos originales, el correo
        // y lo que leyó LexIA — y avisa qué quedó guardado. Los datos ya se
        // ven en pantalla; el botón sigue girando hasta terminar de guardar.
        setGuardandoOneDrive(true);
        const [lectura, adjuntos] = await Promise.all([
          guardarLecturaLexIAEnOneDrive(onedriveCarpetaUrl, numeroTutela, mensaje, extraido.asunto, extraido.cuerpo, extraido.registros).then(() => ({ ok: true }), err => ({ error: err })),
          extraido.guardadoAdjuntos,
        ]);
        setGuardandoOneDrive(false);
        if(lectura.error){
          console.error(lectura.error);
          notify?.(conAvisos('Se extrajeron los datos, pero no se pudo guardar la lectura en OneDrive: ' + mensajeError(lectura.error)), 'error');
        }
        if(adjuntos?.error){
          notify?.(conAvisos('Se extrajeron los datos, pero no se pudieron guardar los adjuntos en OneDrive: ' + mensajeError(adjuntos.error) + ' — vuelve a darle "Extraer con LexIA".'), 'error');
        }
        if(!lectura.error && !adjuntos?.error){
          const n = adjuntos?.cantidad || 0;
          notify?.(conAvisos(`Quedó guardado en la carpeta "${numeroTutela} Tutela" de OneDrive: la lectura de LexIA${adjuntos?.yaEstaban ? ' (el correo y los adjuntos ya estaban allí)' : `, el correo y ${n} adjunto${n === 1 ? '' : 's'}`}.`), 'success');
        }
      } else {
        const mensajeFinal = conAvisos(onedriveCarpetaUrl ? 'No se guardó la carpeta en OneDrive: no se encontró un número de tutela en el asunto del correo.' : '');
        if(mensajeFinal) notify?.(mensajeFinal, 'info');
      }
    }catch(err){
      console.error(err);
      notify?.('No se pudo extraer los datos con IA: ' + (err.message || mensajeError(err)), 'error');
    }finally{
      setProcesando(false);
      setGuardandoOneDrive(false);
    }
  }

  // Revisión 2026-10-05 (pedido del usuario: "que cuando se guarda no cree
  // conflictos por formatos/errores de listas"): antes el registro de
  // LexIA pasaba tal cual al formulario — un "Si" sin tilde se guardaba como
  // "No", una fecha o lista fuera de formato rompía el guardado, y un
  // Cliente mal escrito CREABA un cliente nuevo en SharePoint (es una
  // columna de Búsqueda). Ahora se limpia primero (ver lib/borradorTutela.js)
  // y se avisa qué quedó vacío/corregido. Además, antes se llamaba a
  // onExtraido DENTRO de la función de setResultado (efecto secundario
  // dentro de un updater de React, que puede ejecutarse dos veces).
  function handleCrearBorrador(indice){
    const registro = resultado?.registros?.[indice];
    if(!registro) return;
    const mensajeOrigen = mensajes.find(m => m.id === resultado.mensajeId);
    // Idempotente: cubre también lecturas viejas guardadas en OneDrive, que se
    // hicieron antes de que el vencimiento se calculara con días hábiles.
    const instanteBase = primerCorreoPorMensaje[resultado.mensajeId] || mensajeOrigen?.fecha;
    const vencimiento = aplicarVencimientoHabil(registro, instanteBase ? fechaLocalISO(instanteBase) : '', instanteBase, { forzarFechaCorreo: true });
    const { campos, avisos } = normalizarBorradorTutela(vencimiento.registro, {
      temas,
      numeroAsunto: mensajeOrigen ? numeroTutelaDeAsunto(mensajeOrigen.asunto) : null,
    });
    const yaExiste = campos.NoTutela && campos.Cliente && (tutelas || []).some(t =>
      String(t.NoTutela) === String(campos.NoTutela) && normalize(t.Cliente || '') === normalize(campos.Cliente));
    avisos.push(...vencimiento.avisos);
    if(yaExiste) avisos.unshift(`Ya existe en la lista una tutela ${campos.NoTutela} con ese Cliente — revisa que no la estés duplicando.`);
    onExtraido?.(campos);
    setResultado(prev => prev && { ...prev, registros: prev.registros.map((r,i) => i===indice ? {...r, _creado:true} : r) });
    if(avisos.length) notify?.('Revisa antes de guardar: ' + avisos.join(' · '), 'info');
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
    // También acepta el número suelto en el asunto ("…28217…") aunque no diga
    // "TUTELA" justo antes — antes esos correos no salían al buscar.
    : mensajes.filter(m => numeroTutelaDeAsunto(m.asunto) === numeroBuscado || new RegExp(`(^|\\D)${numeroBuscado}(\\D|$)`).test(m.asunto || ''));
  const tutelaBuscadaExistente = numeroBuscado === null
    ? null
    : (tutelas || []).find(t => Number(t.NoTutela) === numeroBuscado) || null;
  // Orden de la lista visible: por fecha y hora de recibido, el correo más
  // NUEVO arriba y el más viejo abajo (2026-10-05, pedido explícito del
  // usuario). El 2026-09-29 se había cambiado a orden por número de tutela
  // ("ya no veo tan factible que se ordene por la fecha"); ahora el usuario
  // pidió volver al orden por fecha.
  const mensajesOrdenados = [...mensajesFiltrados].sort((a, b) => (new Date(b.fecha).getTime() || 0) - (new Date(a.fecha).getTime() || 0));

  // Avatar grande con pose distinta según la etapa (2026-09-29, pedido
  // explícito del usuario) — "escuchando" mientras LexIA está leyendo/
  // extrayendo el correo, "hablando" mientras lee la respuesta en voz
  // alta, y la pose de siempre (brazos cruzados) el resto del tiempo.
  const estadoAvatar = procesando ? 'escuchando' : (lexiaHablando ? 'hablando' : (mostrarSaludo ? 'saludo' : 'reposo'));
  const AVATAR_POR_ESTADO = { reposo: lexiaAvatar, escuchando: lexiaAvatarEscuchando, hablando: lexiaAvatarHablando, saludo: lexiaAvatarSaludo };
  // "Los mensajes de lo que esté haciendo LexIA, déjalo debajo de la
  // imagen" (2026-09-29, pedido explícito del usuario con un boceto) —
  // antes estaban repartidos en 2 lugares (la burbuja de saludo arriba de
  // la lista, y el "Estoy trabajando para ti" junto al botón de extraer);
  // ahora es un solo mensaje, debajo del marco del avatar grande, que
  // sigue la misma prioridad que estadoAvatar de arriba.
  const mensajeAvatar = procesando
    ? 'Estoy trabajando para ti…'
    : mostrarSaludo
      ? '¡Hola! Soy LexIA. Elige un correo y dale "Extraer con LexIA", o pregúntame lo que necesites al lado.'
      : '';

  return (
    <div className="confirm-overlay leer-correo-overlay">
      <div className="confirm-box leer-correo-box leer-correo-box-ancha" style={{transform: `translate(${offset.x}px, ${offset.y}px)`}}>
        <div className="leer-correo-head" {...dragHandleProps}>
          <div className="leer-correo-head-principal">
            <h3>Leer correo de Tutelas (LexIA)</h3>
          </div>
          {/* "Entrenar LexIA" alineado arriba de SU columna, no pegado al
              borde derecho del todo (2026-09-29, pedido explícito del
              usuario con un boceto: quitar el avatar chiquito de acá —
              queda duplicado con el grande de la ventana — y correr el
              título hacia la izquierda, al espacio vacío de arriba). El
              ancho de esta franja imita el de .leer-correo-col-lateral de
              abajo para que quede alineada de verdad, no solo "más a la
              izquierda" a ojo. */}
          <div className="leer-correo-head-lateral">
            <h4 className="leer-correo-col-lateral-titulo">Entrenar LexIA</h4>
            {/* 2026-10-05, pedido explícito del usuario: LexIA ya no lee en
                voz alta nada más que el saludo al entrar — se quitaron los
                botones de volumen/pausar/continuar. */}
          </div>
          <div className="leer-correo-head-avatar-col">
            <button className="drawer-close" onClick={onClose} aria-label="Cerrar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
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
          <div style={{alignSelf:'flex-end'}}>
            <IconButton icon="refresh" variant="refresh" label="Actualizar lista de correos" spinning={actualizando} onClick={handleActualizarCorreos} />
          </div>
        </div>
        {/* Buscador por No. Tutela (2026-09-25, pedido explícito del
            usuario) — filtra la lista de abajo y avisa si esa tutela ya
            está guardada en SharePoint o no. */}
        <div style={{display:'flex', alignItems:'flex-end', gap:10, marginBottom:10}}>
          <div className="field" style={{margin:0, maxWidth:220, flex:'0 1 220px'}}>
            <label>Buscar por No. Tutela</label>
            <input type="text" inputMode="numeric" value={busquedaNumero} onChange={e => setBusquedaNumero(e.target.value)} placeholder="Ej. 28159" />
          </div>
          {/* Pedido explícito del usuario 2026-10-05: un botón pequeño para ir
              a ver todas las carpetas de tutelas creadas en OneDrive (cada
              "N Tutela" con su lectura de LexIA y sus adjuntos originales). */}
          {onedriveCarpetaUrl && (
            <IconButton icon="folder" variant="open" label="Abrir en OneDrive las carpetas de las tutelas (adjuntos y lectura de LexIA)" href={onedriveCarpetaUrl} />
          )}
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
            No hay ningún correo con la tutela {numeroBuscado} entre los que están cargados (revisa el rango de fechas de arriba). Si el correo sí está en el buzón, puede que venga de una dirección que no está en la lista de remitentes permitidos — avísame quién lo envió.
          </p>
        )}
        <ul className="leer-correo-lista">
          {mensajesOrdenados.map(m => {
            const numeroDeEsteMensaje = numeroTutelaDeAsunto(m.asunto);
            const yaAnalizadaEnOneDrive = numeroDeEsteMensaje && analizadasOneDrive.has(String(numeroDeEsteMensaje));
            return (
            <li key={m.id} className={"leer-correo-item" + (seleccionadoId===m.id ? ' activo' : '')}>
              <button type="button" className="leer-correo-item-btn" onClick={async () => {
                setSeleccionadoId(m.id);
                // "Ya leído por LexIA" para una tutela ya analizada en
                // OneDrive (de esta sesión o de una anterior, ya no hay
                // precarga automática — 2026-09-29, pedido explícito del
                // usuario: "quitemos el leer automático, todo de forma
                // manual") — se carga de una vez al seleccionarla (mismo
                // dato, instantáneo, sin gastar Claude otra vez) en vez de
                // dejar el panel de Preguntas vacío.
                if(yaAnalizadaEnOneDrive && resultado?.mensajeId !== m.id){
                  const guardada = await buscarLecturaLexIAGuardada(onedriveCarpetaUrl, numeroDeEsteMensaje);
                  if(guardada){
                    setResultado({ mensajeId: m.id, registros: guardada.registros });
                    setCorreoActual({ asunto: guardada.asunto, cuerpo: guardada.cuerpo });
                  }
                } else if(resultado?.mensajeId !== m.id){
                  setResultado(null);
                  setCorreoActual(null);
                }
              }}>
                <strong>{m.remitenteNombre || m.remitente || 'Remitente desconocido'}</strong>
                <span>{m.asunto}</span>
                <span className="save-hint">
                  {m.fecha ? new Date(m.fecha).toLocaleString('es-CO') : '—'}{m.tieneAdjuntos ? ' · con adjuntos' : ''}
                  {/* 2026-09-25, pedido explícito del usuario ("aparte de
                      Creado también colócale Ya leído por LexIA") — sale en
                      cualquier correo que YA se haya extraído en esta
                      sesión (botón manual) o que ya tenga un análisis
                      guardado en OneDrive de cualquier sesión. */}
                  {(resultado?.mensajeId === m.id || yaAnalizadaEnOneDrive) && ' · '}
                  {(resultado?.mensajeId === m.id || yaAnalizadaEnOneDrive) && (
                    <span className="badge badge-verde" style={{marginLeft:2}}>Ya leído por LexIA</span>
                  )}
                </span>
              </button>
              {seleccionadoId === m.id && (
                <div className="leer-correo-item-accion">
                  {!(resultado && resultado.mensajeId === m.id) && (
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <IconTextButton icon="add" variant="primary" disabled={procesando} onClick={() => handleExtraer(m)}>
                        {procesando ? (guardandoOneDrive ? 'Guardando en OneDrive…' : 'Extrayendo…') : '+ Extraer con LexIA'}
                      </IconTextButton>
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
            );
          })}
        </ul>
        </div>
        <div className="leer-correo-col-lateral">
          <EntrenarIAPanel
            tutelas={tutelas || []}
            onAgregarCorreccion={onAgregarCorreccionIA}
            robotPreguntasUrl={robotPreguntasUrl}
            notify={notify}
            casoActual={resultado ? { asunto: correoActual?.asunto, cuerpo: correoActual?.cuerpo, registros: resultado.registros } : null}
            casosGuardados={casosGuardadosOneDrive}
            onedriveCarpetaUrl={onedriveCarpetaUrl}
          />
        </div>
        {/* Avatar grande al costado derecho (2026-09-29, pedido explícito
            del usuario: "más protagonismo", luego "un marco, como si se
            asomara por una ventana" — mandó un boceto). La key fuerza a
            React a remontar la imagen cuando cambia de pose, para que la
            animación de entrada se dispare de nuevo en cada cambio de
            etapa. */}
        <div className="leer-correo-col-avatar">
          <div className="avatar-ventana">
            <img
              key={estadoAvatar}
              src={AVATAR_POR_ESTADO[estadoAvatar]}
              alt="LexIA"
              className={`avatar-grande avatar-grande-${estadoAvatar}`}
            />
          </div>
          {mensajeAvatar && (
            <p key={mensajeAvatar} className="avatar-mensaje">{mensajeAvatar}</p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
