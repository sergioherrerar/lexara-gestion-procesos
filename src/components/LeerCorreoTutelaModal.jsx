import { useState, useEffect, useRef } from 'react';
import { normalizarBorradorTutela } from '../lib/borradorTutela';
import { aplicarVencimientoHabil, fechaLocalISO } from '../lib/vencimientoTutela';
import { envioDelJuzgadoSegunTraza } from '../lib/trazaCorreo';
import { leerCorreosTutelas, primerCorreoDeConversacion, crearSolicitudPruebasBorrador, buscarSolicitudPruebasExistente, revisarRespuestasAreas, uriLecturaLexIAParaArtefacto, leerTodosLosCorreosDeTutela, correosRecibidosParaSolicitud, claseDeCorreoParaRobot, estadoSeguimientoTutela, extraerTutelaConLexIA, numeroTutelaDeAsunto, normalize, mensajeError, buscarLecturaLexIAGuardada, guardarLecturaLexIAEnOneDrive, listarTutelasAnalizadasEnOneDrive, asegurarCarpetaTutelaDesdeMensaje, hayActuacionPrevia, registrarActuacion, buscarActuacionRegistrada, leerFormatoSolicitudPruebas } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import EscritoRobotPanel from './EscritoRobotPanel';
import { redactarEscritoConRobot, sexoPorNombre } from '../lib/escritoRobot';
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
// Otras tutelas que ya tiene registradas en el portal el MISMO usuario (misma cédula, o mismo nombre si no hay cédula),
// agrupadas por número de tutela (una tutela con 3 clientes son 3 filas). Sirve de comentario para evaluar temeridad o cosa juzgada.
function otrasTutelasDelUsuario(tutelas, registro){
  if(!registro) return [];
  const soloDigitos = v => String(v || '').replace(/[^0-9]/g, '');
  const cedula = soloDigitos(registro.NoIdentificacion);
  const nombre = normalize(String(registro.Usuario || '').trim());
  const propia = String(registro.NoTutela || '');
  const porNumero = new Map();
  (tutelas || []).forEach(t => {
    const numero = String(t.NoTutela ?? '');
    if(!numero || numero === propia) return;
    const mismaCedula = cedula.length >= 6 && soloDigitos(t.NoIdentificacion) === cedula;
    const mismoNombre = !cedula && nombre.length > 5 && normalize(String(t.Usuario || '').trim()) === nombre;
    if(!mismaCedula && !mismoNombre) return;
    const actual = porNumero.get(numero) || { numero, filas: [] };
    actual.filas.push(t);
    porNumero.set(numero, actual);
  });
  return Array.from(porNumero.values()).sort((a, b) => Number(b.numero) - Number(a.numero));
}
const fechaCorta = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };

// ¿Ya existe en el portal esta tutela para este cliente? (2026-10-13, pedido del usuario: en una tutela con varios clientes, el cliente que ya
// se creó no debe ofrecer «Crear borrador»; solo el que falta.) Se compara por número y por marca (Aliansalud / Colmédica / UMD), porque el
// nombre del cliente puede venir escrito distinto.
// «Maria Gabriela Charris Conde <correo@dominio>» → solo el nombre (si no hay nombre, el correo).
function nombreDeRemitente(de){
  const texto = String(de || '');
  const nombre = texto.replace(/<[^>]*>/g, '').trim();
  return nombre || texto.replace(/[<>]/g, '').trim();
}
function claveMarcaCliente(c){
  const x = normalize(c || '');
  if(x.includes('aliansalud')) return 'aliansalud';
  if(x.includes('colm')) return 'colmedica';
  if(x.includes('unidad') || x.includes('umd')) return 'umd';
  return x;
}

// Lista de seguimiento de la tutela (2026-10-13, pedido del usuario): debajo de la foto de LexIA, qué pasos ya se hicieron y cuándo.
// Colores como los correos del portal: verde = hecho, naranja = a medias (borrador), gris = pendiente.
function ultimaActuacion(d, tipo){ return ((d && d.actuaciones) || []).filter(a => a.tipo === tipo).pop() || null; }
function SeguimientoTutela({ numero, estado, onActualizar }){
  const d = estado?.datos;
  const cargando = !estado || estado.estado === 'cargando';
  const paso = (texto, hecho, fecha, pendiente, extra) => ({ texto, fecha, extra, pendiente, nivel: hecho ? 'ok' : 'pendiente' });
  const pasos = [];
  if(d){
    pasos.push(paso('Leído por LexIA', !!d.leido, d.leido, 'Aún sin leer'));
    pasos.push(paso('Correos nuevos verificados hasta', !!d.correosVerificadoHasta, d.correosVerificadoHasta, 'Aún no se han verificado'));
    const p = d.pruebas;
    pasos.push(p
      ? { texto: p.enviado ? 'Correo de pruebas enviado' : 'Borrador de pruebas creado', fecha: p.fecha, extra: p.enviado ? '' : 'Todavía sin enviar', nivel: p.enviado ? 'ok' : 'parcial' }
      : (ultimaActuacion(d, 'pruebas') ? { texto: 'Borrador de pruebas redactado', nivel: 'parcial', fecha: ultimaActuacion(d, 'pruebas').fecha, extra: 'Por ' + (ultimaActuacion(d, 'pruebas').por === 'artefacto' ? 'el artefacto' : 'el portal') + ' · sin enviar todavía' } : paso('Correo de pruebas', false, '', 'Aún no se crea el borrador')));
    const r = d.respuestas;
    pasos.push(r
      ? paso('Llegaron correos de pruebas', true, r.fecha, '', (r.cantidad + ' correo' + (r.cantidad === 1 ? '' : 's')) + (r.areasTotal ? ' · ' + r.areasRespondieron + ' de ' + r.areasTotal + ' áreas' : ''))
      : paso('Llegaron correos de pruebas', false, '', 'Aún no llegan (se actualiza al revisar respuestas)'));
    const a = d.aplazamiento;
    pasos.push(a
      ? { texto: a.enviado ? 'Aplazamiento enviado' : 'Borrador de aplazamiento creado', fecha: a.fecha, extra: a.enviado ? '' : 'Todavía sin enviar', nivel: a.enviado ? 'ok' : 'parcial' }
      : (ultimaActuacion(d, 'aplazamiento') ? { texto: 'Aplazamiento redactado', nivel: 'parcial', fecha: ultimaActuacion(d, 'aplazamiento').fecha, extra: 'Por ' + (ultimaActuacion(d, 'aplazamiento').por === 'artefacto' ? 'el artefacto' : 'el portal') + ' · sin correo todavía' } : paso('Aplazamiento', false, '', 'Aún no se envía')));
    const e = d.escrito;
    pasos.push(e
      ? paso('Escrito de contestación enviado', true, e.fecha, '')
      : (ultimaActuacion(d, 'escrito') ? { texto: 'Escrito redactado', nivel: 'parcial', fecha: ultimaActuacion(d, 'escrito').fecha, extra: 'Por ' + (ultimaActuacion(d, 'escrito').por === 'artefacto' ? 'el artefacto' : 'el portal') + ' · sin enviar todavía' } : paso('Escrito de contestación', false, '', 'Aún no se envía')));
  }
  const hechos = pasos.filter(x => x.nivel === 'ok').length;
  return (
    <div className="seguimiento-panel">
      <div className="seguimiento-head">
        <h4>Seguimiento · tutela {numero}</h4>
        <IconButton icon="refresh" label="Actualizar el seguimiento" onClick={onActualizar} spinning={cargando} />
      </div>
      {cargando && !d && <p className="seguimiento-nota">Revisando…</p>}
      {estado?.estado === 'error' && <p className="seguimiento-nota seguimiento-error">No se pudo revisar: {estado.error}</p>}
      {d && (
        <>
          <p className="seguimiento-avance"><strong>{hechos}</strong> de {pasos.length} pasos listos</p>
          <ul className="seguimiento-lista">
            {pasos.map((x, i) => (
              <li key={i} className={'seguimiento-item seguimiento-' + x.nivel}>
                <span className="seguimiento-marca" aria-hidden="true">
                  {x.nivel === 'ok' ? (
                    <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : x.nivel === 'parcial' ? (
                    <svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 8h8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                  ) : null}
                </span>
                <span className="seguimiento-texto">
                  <span className="seguimiento-titulo">{x.texto}</span>
                  <span className="seguimiento-fecha">{x.fecha || x.pendiente}{x.fecha && x.extra ? ' · ' + x.extra : (!x.fecha && x.extra ? ' · ' + x.extra : '')}</span>
                </span>
                <span className="sr-only">{x.nivel === 'ok' ? 'Hecho' : x.nivel === 'parcial' ? 'A medias' : 'Pendiente'}</span>
              </li>
            ))}
          </ul>
          {d.errores?.length > 0 && <p className="seguimiento-nota seguimiento-error">{d.errores.join(' · ')}</p>}
        </>
      )}
    </div>
  );
}

function tutelaYaEnPortal(tutelas, noTutela, cliente){
  if(!noTutela || !cliente) return null;
  const k = claveMarcaCliente(cliente);
  return (tutelas || []).find(t => String(t.NoTutela) === String(noTutela) && claveMarcaCliente(t.Cliente) === k) || null;
}

export default function LeerCorreoTutelaModal({ correoBuzon, remitentesPermitidos, robotUrl, robotEscritoUrl, onedriveCarpetaUrl, tutelas, temas, onAgregarCorreccionIA, robotPreguntasUrl, config, robotSolicitudUrl, onExtraido, onClose, notify, lexiaHablando }){
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
        numerosCargadosRef.current = new Set(Array.from(set).map(String));
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

  // Vuelve a consultar qué tutelas ya tienen su carpeta «N Tutela» (leídas por LexIA) y marca las nuevas; carga solo las lecturas que faltan.
  async function refrescarAnalizadas(){
    if(!onedriveCarpetaUrl) return;
    try{
      const set = await listarTutelasAnalizadasEnOneDrive(onedriveCarpetaUrl);
      setAnalizadasOneDrive(set);
      const nuevas = Array.from(set).filter(n => !numerosCargadosRef.current.has(String(n)));
      nuevas.forEach(n => numerosCargadosRef.current.add(String(n)));
      if(nuevas.length){
        const casos = (await Promise.all(nuevas.map(n => buscarLecturaLexIAGuardada(onedriveCarpetaUrl, n)))).filter(Boolean);
        if(casos.length) setCasosGuardadosOneDrive(prev => [...prev, ...casos]);
      }
    }catch(err){ console.error('No se pudo actualizar la lista de tutelas ya leídas:', err); }
  }
  const numerosCargadosRef = useRef(new Set());   // tutelas cuya lectura ya se cargó (para no volver a pedirlas en cada revisión)
  useEffect(() => {
    if(!onedriveCarpetaUrl) return;
    const alVolver = () => { if(document.visibilityState === 'visible') refrescarAnalizadas(); };
    document.addEventListener('visibilitychange', alVolver);
    const id = setInterval(alVolver, 60000);
    return () => { document.removeEventListener('visibilitychange', alVolver); clearInterval(id); };
  }, [onedriveCarpetaUrl]);

  async function handleActualizarCorreos(){
    refrescarAnalizadas();
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
  // Borrador de la solicitud de pruebas AUTOMÁTICO al terminar una lectura nueva (2026-10-15, pedido del usuario): activado por defecto, se puede apagar; el botón manual de la
  // Sección 4 sigue estando. Siempre revisa antes que no haya uno en Borradores o Enviados (ni hecho por el artefacto) y lee los demás correos de la tutela.
  const [autoPruebas, setAutoPruebas] = useState(() => { try{ return localStorage.getItem('lexia_auto_pruebas') !== 'no'; }catch(e){ return true; } });
  function cambiarAutoPruebas(valor){ setAutoPruebas(valor); try{ localStorage.setItem('lexia_auto_pruebas', valor ? 'si' : 'no'); }catch(e){ /* sin almacenamiento: queda solo en esta sesión */ } }
  const [autoPruebasPendiente, setAutoPruebasPendiente] = useState(null);   // id del mensaje cuya lectura acaba de terminar
  async function instantePrimerCorreo(mensaje){
    try{
      const primero = await primerCorreoDeConversacion(correoBuzon, mensaje.conversacionId, remitentesPermitidos);
      return primero && primero.fecha < mensaje.fecha ? primero : { fecha: mensaje.fecha, id: mensaje.id };
    }catch(err){
      console.error('No se pudo buscar el primer correo de la conversación:', err);
      return { fecha: mensaje.fecha, id: mensaje.id };
    }
  }

  // Solicitud de pruebas (paso 2, 2026-10-07): por cada registro extraído se arma un BORRADOR de
  // correo a las áreas de la entidad con el formato del despacho que vive en SharePoint. Nunca se
  // envía solo: queda en Borradores para que el abogado lo revise. El estado de cada intento se
  // guarda en el propio registro (_solicitud) para mostrarlo en la lista.
  function marcarSolicitud(mensajeId, indice, solicitud){
    setResultado(prev => prev && prev.mensajeId === mensajeId
      ? { ...prev, registros: prev.registros.map((r, i) => i === indice ? { ...r, _solicitud: solicitud } : r) }
      : prev);
  }
  async function generarSolicitudPruebas(mensaje, registro, indice, primerCorreo, forzar = false, adjuntosExtra = [], etiquetaEnvio = ''){
    const instante = primerCorreo.fecha;
    marcarSolicitud(mensaje.id, indice, { estado: 'creando' });
    try{
      const { registro: reg } = aplicarVencimientoHabil(registro, fechaLocalISO(instante), instante, { forzarFechaCorreo: true });
      const { _creado, _solicitud, ...limpio } = reg;
      const { campos } = normalizarBorradorTutela(limpio, { temas, numeroAsunto: numeroTutelaDeAsunto(mensaje.asunto) });
      // Una tutela que señala a varios clientes lleva UN solo correo con todos (un registro por cliente).
      const todosLosRegistros = (resultado?.registros || [registro]).map(x => { const { _creado: _c, _solicitud: _s, ...l } = aplicarVencimientoHabil(x, fechaLocalISO(instante), instante, { forzarFechaCorreo: true }).registro; return l; });
      const camposTodos = todosLosRegistros.map(x => normalizarBorradorTutela(x, { temas, numeroAsunto: numeroTutelaDeAsunto(mensaje.asunto) }).campos);
      const indicesAfectados = todosLosRegistros.length > 1 ? todosLosRegistros.map((_, k) => k) : [indice];
      // Antes de gastar la lectura de LexIA, revisa si ya hay una solicitud de esta tutela y este
      // cliente en Borradores o Enviados (pedido del usuario: que no se cree una y otra vez).
      if(!forzar){
        const existente = await buscarSolicitudPruebasExistente(correoBuzon, limpio.NoTutela || numeroTutelaDeAsunto(mensaje.asunto), campos.Cliente || limpio.Cliente);
        if(existente){
          indicesAfectados.forEach(k => marcarSolicitud(mensaje.id, k, { estado: 'existente', ...existente }));
          return;
        }
        // Si el artefacto (Plan B) ya la redactó, queda en el Outlook de quien lo usó y el portal no la ve en el buzón: se sabe por la lectura.
        const anotada = await buscarActuacionRegistrada(onedriveCarpetaUrl, limpio.NoTutela || numeroTutelaDeAsunto(mensaje.asunto), 'pruebas').catch(() => null);
        if(anotada){
          indicesAfectados.forEach(k => marcarSolicitud(mensaje.id, k, { estado: 'existente', enviado: false, fecha: '', fechaTexto: anotada.fecha, por: anotada.por, enlace: '' }));
          return;
        }
      }
      // Todo lo que ya llegó al buzón sobre esta tutela (de cualquier remitente): el robot no debe pedir lo que ya está.
      // Antes de crear el borrador se LEEN todos los correos de la tutela (si aún no se habían leído en esta sesión; si ya se leyeron, solo se
      // revisa si llegó algo nuevo, sin gastar IA).
      const numeroSolicitud = limpio.NoTutela || numeroTutelaDeAsunto(mensaje.asunto);
      let correosRecibidos = [];
      try{
        if(todosCorreos[mensaje.id]?.estado === 'listo' || Date.now() - (correosLeidosEn.current[mensaje.id] || 0) < 180000){
          correosRecibidos = await correosRecibidosParaSolicitud(correoBuzon, numeroSolicitud, config);
        }else{
          const d = await asegurarCorreosLeidos(mensaje, numeroSolicitud, true);
          correosRecibidos = d.correos.map(c => ({ fecha: c.fecha, de: c.de, asunto: c.asunto, clase: claseDeCorreoParaRobot(c), area: c.area ? c.area.area + ' (' + c.area.entidad + ')' : '', adjuntos: c.adjuntos || [], extracto: String(c.resumen || '').slice(0, 700) }));
        }
      }catch(err){
        console.error('No se pudieron leer todos los correos de la tutela antes del borrador:', err);
        correosRecibidos = await correosRecibidosParaSolicitud(correoBuzon, numeroSolicitud, config);
      }
      // Antes de armar el correo: qué áreas YA respondieron sin que se les hubiera pedido (se reconocen por la dirección del remitente, con la agenda de áreas).
      const yaRespondieron = [...new Set(correosRecibidos.filter(c => c.area).map(c => c.area))];
      if(yaRespondieron.length) notify?.('Antes de armar la solicitud: ya respondieron sin que se les pidiera — ' + yaRespondieron.join(', ') + '. LexIA no les pedirá lo que ya enviaron.', 'info');
      const r = await crearSolicitudPruebasBorrador({
        correosRecibidos, config, robotSolicitudUrl, registro: limpio, registros: todosLosRegistros, campos, camposTodos, asuntoCorreo: mensaje.asunto,
        noTutela: limpio.NoTutela || numeroTutelaDeAsunto(mensaje.asunto), fechaVencimiento: limpio.FechaVencimiento,
        correoBuzon, mensajeIdReenviar: primerCorreo.id || mensaje.id,
        // Todos los clientes que señala esta tutela (un registro por cliente): el robot solo pide a esas entidades.
        clientesSenalados: (resultado?.registros || []).map(x => x.Cliente).filter(Boolean),
        adjuntos: adjuntosExtra,
        etiquetaEnvio,
      });
      indicesAfectados.forEach(k => marcarSolicitud(mensaje.id, k, { estado: 'listo', para: r.para, cc: r.cc, notas: r.notas, formato: r.formato, reenviado: r.reenviado }));
      // Se anota en la lectura para que el artefacto no la repita (solo la solicitud de pruebas; el correo con aplazamiento se anota aparte).
      if(!etiquetaEnvio) registrarActuacion(onedriveCarpetaUrl, numeroSolicitud, { tipo: 'pruebas', cliente: '', por: 'portal' }).catch(err => console.error('No se pudo anotar la solicitud de pruebas en la lectura:', err));
    }catch(err){
      console.error(err);
      marcarSolicitud(mensaje.id, indice, { estado: 'error', mensaje: mensajeError(err) });
    }
  }
  // Respuestas de las áreas a la solicitud de pruebas (2026-10-09): verifica qué áreas respondieron y cuáles
  // no, y guarda las respuestas nuevas (correo + adjuntos) en la carpeta de la tutela en OneDrive.
  const [respuestasAreas, setRespuestasAreas] = useState({}); // { [mensajeId]: { estado, datos?, error? } }
  // Copia al portapapeles el enlace directo al archivo "Lectura LexIA.txt" de esta tutela, para pegarlo en el artefacto Plan B.
  async function handleCopiarEnlaceArtefacto(mensaje){
    const numero = numeroTutelaDeAsunto(mensaje.asunto);
    if(!numero) return;
    try{
      const enlace = await uriLecturaLexIAParaArtefacto(onedriveCarpetaUrl, numero);
      if(!enlace){ notify?.('Esta tutela todavía no tiene archivo de lectura de LexIA: extráela primero.', 'error'); return; }
      await navigator.clipboard.writeText(enlace);
      notify?.('Enlace copiado: pégalo en el cuadro de número de tutela del artefacto Plan B.', 'success');
    }catch(err){
      console.error(err);
      notify?.('No se pudo copiar el enlace: ' + mensajeError(err), 'error');
    }
  }
  // Todos los correos del buzón que mencionan la tutela (de cualquier remitente), leídos y guardados en su carpeta.
  const [todosCorreos, setTodosCorreos] = useState({}); // { [mensajeId]: { estado, datos?, error? } }
  // Lee (y guarda) los correos de la tutela. Los que ya se leyeron antes se descartan: solo se procesan los nuevos. Sin «forzar», reutiliza
  // la lectura de esta sesión si ya se hizo.
  const correosLeidosEn = useRef({});   // mensajeId -> instante en que se leyeron todos los correos (para no repetir la lectura en el mismo flujo)
  async function asegurarCorreosLeidos(mensaje, numero, forzar){
    const previo = todosCorreos[mensaje.id];
    if(!forzar && previo?.estado === 'listo') return previo.datos;
    setTodosCorreos(prev => ({ ...prev, [mensaje.id]: { estado: 'leyendo' } }));
    try{
      const datos = await leerTodosLosCorreosDeTutela({ correoBuzon, urlCarpeta: onedriveCarpetaUrl, noTutela: numero, config });
      setTodosCorreos(prev => ({ ...prev, [mensaje.id]: { estado: 'listo', datos } }));
      correosLeidosEn.current[mensaje.id] = Date.now();
      return datos;
    }catch(err){
      setTodosCorreos(prev => ({ ...prev, [mensaje.id]: { estado: 'error', error: mensajeError(err) } }));
      throw err;
    }
  }
  async function handleLeerTodosCorreos(mensaje){
    const numero = numeroTutelaDeAsunto(mensaje.asunto);
    if(!numero) return;
    try{ await asegurarCorreosLeidos(mensaje, numero, true); }catch(err){ console.error(err); }
  }
  async function handleRevisarRespuestas(mensaje){
    const numero = numeroTutelaDeAsunto(mensaje.asunto);
    if(!numero) return;
    setRespuestasAreas(prev => ({ ...prev, [mensaje.id]: { estado: 'revisando' } }));
    try{
      const datos = await revisarRespuestasAreas({ config, correoBuzon, urlCarpeta: onedriveCarpetaUrl, noTutela: numero });
      setRespuestasAreas(prev => ({ ...prev, [mensaje.id]: { estado: 'listo', datos } }));
    }catch(err){
      console.error(err);
      setRespuestasAreas(prev => ({ ...prev, [mensaje.id]: { estado: 'error', error: mensajeError(err) } }));
    }
  }

  const [aplazamiento, setAplazamiento] = useState({}); // { [mensajeId]: { estado, pasos[], error? } }
  // Al abrir la ventana se lee el formato de solicitud de pruebas (queda en memoria unos minutos): así el portal deja la copia en texto que usa el artefacto.
  useEffect(() => { if(config) leerFormatoSolicitudPruebas(config).catch(() => null); }, []);
  const [repetido, setRepetido] = useState({});   // { [mensajeId]: texto } — aviso de que el aplazamiento ya se hizo (portal, artefacto o correo ya creado)
  // Lista de seguimiento de la tutela seleccionada (debajo de la foto de LexIA). Se actualiza sola al seleccionar la tutela y cada vez que
  // termina una acción (leer correos, revisar respuestas, crear el correo con aplazamiento); también con el botón de actualizar.
  const [seguimiento, setSeguimiento] = useState({});   // { [numero]: { estado, datos?, error? } }
  const [tickSeguimiento, setTickSeguimiento] = useState(0);
  const mensajeSel = mensajes.find(x => x.id === seleccionadoId) || null;
  const numeroSel = mensajeSel ? numeroTutelaDeAsunto(mensajeSel.asunto) : null;
  const seguimientoVisible = !!(numeroSel && onedriveCarpetaUrl && (analizadasOneDrive.has(String(numeroSel)) || resultado?.mensajeId === seleccionadoId));
  useEffect(() => {
    if(!seguimientoVisible) return;
    let vigente = true;
    setSeguimiento(prev => ({ ...prev, [numeroSel]: { ...(prev[numeroSel] || {}), estado: 'cargando' } }));
    estadoSeguimientoTutela({ correoBuzon, urlCarpeta: onedriveCarpetaUrl, noTutela: numeroSel })
      .then(datos => { if(vigente) setSeguimiento(prev => ({ ...prev, [numeroSel]: { estado: 'listo', datos } })); })
      .catch(err => { if(vigente){ console.error(err); setSeguimiento(prev => ({ ...prev, [numeroSel]: { estado: 'error', error: mensajeError(err) } })); } });
    return () => { vigente = false; };
  }, [seguimientoVisible, numeroSel, tickSeguimiento, todosCorreos[seleccionadoId]?.estado, respuestasAreas[seleccionadoId]?.estado, aplazamiento[seleccionadoId]?.estado, procesando]);

  // «Correo con aplazamiento» (Sección 1): redacta el modelo de aplazamiento de cada cliente de la tutela con los datos del caso y crea el
  // borrador de la solicitud de pruebas (reenvío del correo de notificación) con esos Word adjuntos.
  async function handleCorreoConAplazamiento(mensaje, forzar = false){
    const numero = numeroTutelaDeAsunto(mensaje.asunto);
    const registros = resultado?.mensajeId === mensaje.id ? (resultado.registros || []) : [];
    if(!numero || !registros.length || !robotEscritoUrl) return;
    const pasos = [];
    const t0 = Date.now();   // cada paso lleva los segundos transcurridos, para ver cuál tarda
    const anotar = (t) => { pasos.push('[' + Math.round((Date.now() - t0) / 1000) + ' s] ' + t); setAplazamiento(prev => ({ ...prev, [mensaje.id]: { estado: 'creando', pasos: [...pasos] } })); };
    setAplazamiento(prev => ({ ...prev, [mensaje.id]: { estado: 'creando', pasos: [] } }));
    try{
      // 0) Que no se repita: si el aplazamiento ya lo hizo el portal o el artefacto, o ya hay un correo con él, se avisa y se pide confirmar.
      if(!forzar){
        anotar('Revisando que el aplazamiento no esté ya hecho...');
        const dup = await hayActuacionPrevia({ correoBuzon, urlCarpeta: onedriveCarpetaUrl, noTutela: numero, tipo: 'aplazamiento', cliente: '' }).catch(() => ({ existe: false }));
        if(dup.existe){
          setRepetido(prev => ({ ...prev, [mensaje.id]: dup.mensaje }));
          setAplazamiento(prev => ({ ...prev, [mensaje.id]: { estado: 'idle', pasos: [] } }));
          return;
        }
      }
      setRepetido(prev => ({ ...prev, [mensaje.id]: '' }));
      // 1) Los aplazamientos de TODOS los clientes se redactan a la vez (modo estricto: solo datos).
      const aplazamientosProm = Promise.all(registros.map(async (reg, i) => {
        anotar('Redactando el aplazamiento de ' + (reg.Cliente || ('cliente ' + (i + 1))) + '...');
        const r = await redactarEscritoConRobot({
          robotUrl: robotEscritoUrl, urlCarpeta: onedriveCarpetaUrl, numero, tipo: 'aplazamiento', indiceRegistro: i,
          sexo: sexoPorNombre(reg.Usuario), nota: '', estricto: true, log: (t) => anotar('   ' + (reg.Cliente ? String(reg.Cliente).split(' ')[0] + ': ' : '') + t),
        });
        return { nombre: r.nombre, bytes: r.bytes };
      }));
      aplazamientosProm.catch(() => null);   // el error se avisa al adjuntar (abajo); aquí solo se evita un aviso duplicado
      // 2) Mientras tanto: se leen los correos de la tutela y se arma la solicitud de pruebas (texto + borrador). Los aplazamientos se adjuntan
      //    cuando estén listos.
      anotar('Leyendo los correos de la tutela y armando la solicitud de pruebas (a la vez que se redactan los aplazamientos)...');
      await asegurarCorreosLeidos(mensaje, numero, true).catch(() => null);
      await generarSolicitudPruebas(mensaje, registros[0], 0, primerCorreoPorMensaje[mensaje.id] || { fecha: mensaje.fecha, id: mensaje.id }, true, aplazamientosProm, 'Aplazamiento');
      const adjuntos = await aplazamientosProm.catch(err => { throw new Error('El borrador se creó, pero sin los aplazamientos: ' + (err.message || err)); });
      anotar('Listo: el borrador quedó en Borradores del buzón de Tutelas con ' + adjuntos.length + ' aplazamiento' + (adjuntos.length === 1 ? '' : 's') + ' adjunto' + (adjuntos.length === 1 ? '' : 's') + '. Revísalo antes de enviar.');
      setAplazamiento(prev => ({ ...prev, [mensaje.id]: { estado: 'listo', pasos: [...pasos] } }));
      // Se anota en la lectura (uno por cliente, en fila para no pisarse) para que el artefacto no lo repita.
      registros.reduce((p, reg, i) => p.then(() => registrarActuacion(onedriveCarpetaUrl, numero, { tipo: 'aplazamiento', cliente: reg.Cliente || '', por: 'portal', archivo: (adjuntos[i] || {}).nombre || '' })), Promise.resolve()).catch(err => console.error('No se pudo anotar el aplazamiento en la lectura:', err));
    }catch(err){
      console.error(err);
      setAplazamiento(prev => ({ ...prev, [mensaje.id]: { estado: 'error', pasos: [...pasos], error: mensajeError(err) } }));
    }
  }

  useEffect(() => {
    if(!autoPruebasPendiente || resultado?.mensajeId !== autoPruebasPendiente) return;
    setAutoPruebasPendiente(null);
    notify?.('Creando el borrador de la solicitud de pruebas: reviso que no exista ya y leo los demás correos de la tutela…', 'info');
    handleSolicitudPruebas(0, false);
  }, [autoPruebasPendiente, resultado]);

  function handleSolicitudPruebas(indice, forzar = false){
    const registro = resultado?.registros?.[indice];
    const mensaje = mensajes.find(m => m.id === resultado?.mensajeId);
    if(!registro || !mensaje) return;
    generarSolicitudPruebas(mensaje, registro, indice, primerCorreoPorMensaje[mensaje.id] || { fecha: mensaje.fecha, id: mensaje.id }, forzar);
  }

  // Solicitud de pruebas: con UN cliente va en su fila; con varios clientes es UN solo correo para todos, así que se muestra
  // una sola vez debajo de la lista (pedido del usuario 2026-10-09).
  const bloqueSolicitud = (r, i, unico = false) => (
    <>
      {unico && <strong style={{fontSize:13, flexBasis:'100%'}}>Solicitud de pruebas — un solo correo para las {resultado.registros.length} entidades</strong>}
        {robotSolicitudUrl && (
          <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
            <IconButton icon="mail" variant="mail" label={r._solicitud?.estado === 'listo' ? 'Solicitud de pruebas creada — si pulsas de nuevo te avisa que ya existe' : r._solicitud?.estado === 'error' ? 'Reintentar el borrador de solicitud de pruebas' : 'Crear borrador de solicitud de pruebas (reenvía el correo original a las áreas)'} spinning={r._solicitud?.estado === 'creando'} onClick={() => handleSolicitudPruebas(i)} />
            {r._solicitud?.estado === 'creando' && <span className="save-hint">Armando solicitud de pruebas…</span>}
            {r._solicitud?.estado === 'listo' && <span className="badge badge-verde">Pruebas: borrador listo</span>}
          </span>
        )}
        {r._solicitud?.estado === 'listo' && (
          <p className="save-hint" style={{margin:'4px 0 0', flexBasis:'100%'}}>
            {r._solicitud.reenviado ? 'Quedó como reenvío del correo original en los Borradores del buzón de Tutelas' : 'Quedó en tus Borradores de Outlook'} — para: {(r._solicitud.para || []).join(', ') || '(sin destinatarios, complétalos)'}{r._solicitud.notas ? ` · Nota de LexIA: ${r._solicitud.notas}` : ''}
          </p>
        )}
        {r._solicitud?.estado === 'existente' && (
          <p className="save-hint" style={{margin:'4px 0 0', flexBasis:'100%'}}>
            {r._solicitud.por
              ? <>Ya la redactó {r._solicitud.por === 'artefacto' ? 'el artefacto (Plan B)' : 'el portal'}{r._solicitud.fechaTexto ? ` el ${r._solicitud.fechaTexto}` : ''}: búscala en los Borradores de Outlook de quien la creó (el artefacto la deja en el buzón de quien lo usa).{' '}</>
              : <>Ya había creado una solicitud de pruebas para esta tutela y este cliente{r._solicitud.fecha ? ` (${new Date(r._solicitud.fecha).toLocaleString('es-CO')})` : ''}: {r._solicitud.enviado ? 'ya fue ENVIADA — búscala en Enviados del buzón de Tutelas.' : 'búscala en Borradores del buzón de Tutelas.'}{' '}</>}
            {r._solicitud.enlace && <a href={r._solicitud.enlace} target="_blank" rel="noopener noreferrer">Abrirla</a>}{' '}
            <button type="button" className="clear-filters-link" onClick={() => handleSolicitudPruebas(i, true)}>Crear otra de todos modos</button>
          </p>
        )}
        {r._solicitud?.estado === 'error' && (
          <p className="save-hint" style={{margin:'4px 0 0', flexBasis:'100%', color:'var(--rojo, #a3281c)'}}>
            No se pudo armar la solicitud de pruebas: {r._solicitud.mensaje}
          </p>
        )}
    
    </>
  );

  async function handleExtraer(mensaje){
    if(!robotUrl){
      notify?.('Falta terminar de instalar LexIA (ROBOT_CLAUDE_URL en config.js) antes de poder usar esto.', 'error');
      return;
    }
    const numeroTutela = numeroTutelaDeAsunto(mensaje.asunto);
    setProcesando(true);
    const primerCorreo = await instantePrimerCorreo(mensaje);
    const instanteNotificacion = primerCorreo.fecha;
    setPrimerCorreoPorMensaje(prev => ({ ...prev, [mensaje.id]: primerCorreo }));
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
      // Regla del despacho (2026-10-15): el término se cuenta desde que el JUZGADO remitió el correo (se lee de la traza del cuerpo), no desde que el área lo reenvió.
      const envioJuzgado = envioDelJuzgadoSegunTraza(extraido.cuerpo);
      extraido.registros = extraido.registros.map(r => {
        const { registro, avisos } = aplicarVencimientoHabil(r, fechaLocalISO(instanteNotificacion), instanteNotificacion, { forzarFechaCorreo: true, envioJuzgado });
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
          guardarLecturaLexIAEnOneDrive(onedriveCarpetaUrl, numeroTutela, mensaje, extraido.asunto, extraido.cuerpo, extraido.registros, extraido.documentos, extraido.omitidos).then(() => ({ ok: true }), err => ({ error: err })),
          extraido.guardadoAdjuntos,
        ]);
        setGuardandoOneDrive(false);
        if(!lectura.error) setAnalizadasOneDrive(prev => new Set(prev).add(String(numeroTutela)));
        if(lectura.error){
          console.error(lectura.error);
          notify?.(conAvisos('Se extrajeron los datos, pero no se pudo guardar la lectura en OneDrive: ' + mensajeError(lectura.error)), 'error');
        }
        if(adjuntos?.error){
          notify?.(conAvisos('Se extrajeron los datos, pero no se pudieron guardar los adjuntos en OneDrive: ' + mensajeError(adjuntos.error) + ' — vuelve a darle "Extraer con LexIA".'), 'error');
        }
        if(!lectura.error && autoPruebas && robotSolicitudUrl) setAutoPruebasPendiente(mensaje.id);
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
    const instanteBase = primerCorreoPorMensaje[resultado.mensajeId]?.fecha || mensajeOrigen?.fecha;
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
                      {robotSolicitudUrl && (
                        <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12.5, cursor:'pointer'}} title="Al terminar la lectura crea sola la solicitud de pruebas (solo un borrador, nunca la envía). Antes revisa que no haya una en Borradores o Enviados.">
                          <input type="checkbox" checked={autoPruebas} onChange={e => cambiarAutoPruebas(e.target.checked)} />
                          Crear el borrador de pruebas al terminar
                        </label>
                      )}
                    </div>
                  )}
                  {resultado && resultado.mensajeId === m.id && (() => {
                        const otras = otrasTutelasDelUsuario(tutelas, resultado.registros[0]);
                        const antecedentesLexIA = String(resultado.registros[0]?.Analisis?.Antecedentes || '').trim();
                        // La Sección 1 siempre se muestra (aunque no haya otras tutelas del usuario): si no, la numeración arrancaba en la Sección 2.
                        return (
                          <div className="tutela-seccion tutela-seccion-aviso">
                            <div className="tutela-seccion-head"><h4><span className="tutela-seccion-n">Sección 1</span>Comentario: otras tutelas de este mismo usuario</h4></div>
                            <div className="tutela-seccion-body" style={{gap:6}}>
                            {otras.length > 0 ? (
                              <>
                                <span className="save-hint" style={{margin:0}}>Ya hay {otras.length} tutela{otras.length === 1 ? '' : 's'} registrada{otras.length === 1 ? '' : 's'} en el portal con la misma identificación{resultado.registros[0]?.Usuario ? ` (${resultado.registros[0].Usuario})` : ''}:</span>
                                <ul style={{margin:0, paddingLeft:18, fontSize:12}}>
                                  {otras.slice(0, 12).map(o => {
                                    const t = o.filas[0];
                                    return <li key={o.numero}>{o.numero} · {t.TipoRespuesta || 'TUTELA'}{fechaCorta(t.FechaNotificacion) ? ' · ' + fechaCorta(t.FechaNotificacion) : ''}{t.Tema ? ' · ' + t.Tema : ''}{o.filas.length > 1 ? ` · ${o.filas.length} clientes` : ''}</li>;
                                  })}
                                </ul>
                                {otras.length > 12 && <span className="save-hint" style={{margin:0}}>…y {otras.length - 12} más.</span>}
                                <span className="save-hint" style={{margin:0}}>Revisa si piden lo mismo (posible temeridad o cosa juzgada) y qué se decidió en cada una.</span>
                              </>
                            ) : (
                              <span className="save-hint" style={{margin:0}}>En el portal no hay otras tutelas con esa identificación.</span>
                            )}
                            {antecedentesLexIA && <span className="save-hint" style={{margin:0}}>Lo que LexIA vio mencionado en esta tutela: {antecedentesLexIA}</span>}
                            </div>
                          </div>
                        );
                  })()}
                  {onedriveCarpetaUrl && numeroDeEsteMensaje && (yaAnalizadaEnOneDrive || resultado?.mensajeId === m.id) && (
                    <div className="tutela-seccion">
                      <div className="tutela-seccion-head">
                        <h4><span className="tutela-seccion-n">Sección 2</span>Todos los correos de esta tutela</h4>
                        <IconTextButton icon="refresh" variant="secondary" disabled={todosCorreos[m.id]?.estado === 'leyendo'} onClick={() => handleLeerTodosCorreos(m)}>
                          {todosCorreos[m.id]?.estado === 'leyendo' ? 'Leyendo…' : (todosCorreos[m.id]?.datos ? 'Leer correos nuevos de esta tutela' : 'Leer correos nuevos de esta tutela')}
                        </IconTextButton>
                      </div>
                      <div className="tutela-seccion-body">
                      <p className="escrito-intro">Busca en el buzón TODOS los correos con este número (de cualquier remitente), los guarda en la carpeta de la tutela y los deja en la lectura; antes de crear el borrador de la solicitud de pruebas (y antes de redactar el escrito) se vuelven a leer solos, para que ya sepa qué llegó.</p>
                      {todosCorreos[m.id]?.estado === 'error' && <p className="save-hint" style={{margin:'6px 0 0', color:'var(--rojo, #a3281c)'}}>No se pudo leer: {todosCorreos[m.id].error}</p>}
                      {todosCorreos[m.id]?.estado === 'listo' && (() => {
                        const d = todosCorreos[m.id].datos;
                        const porClase = {};
                        d.correos.forEach(c => { const k = c.area ? (c.area.juridica ? 'área jurídica' : 'área ' + c.area.area + ' (' + c.area.entidad + ')') : c.clase; porClase[k] = (porClase[k] || 0) + 1; });
                        return (
                          <div style={{marginTop:6, fontSize:13}}>
                            <div><strong>{d.total}</strong> correo{d.total === 1 ? '' : 's'} con el número de esta tutela ({d.nuevos ? `${d.nuevos} nuevo${d.nuevos === 1 ? '' : 's'} leído${d.nuevos === 1 ? '' : 's'} y guardado${d.nuevos === 1 ? '' : 's'}` : 'ninguno nuevo'}{d.yaLeidos ? `; ${d.yaLeidos} ya leído${d.yaLeidos === 1 ? '' : 's'} antes, descartado${d.yaLeidos === 1 ? '' : 's'}` : ''}): {Object.entries(porClase).map(([k, v]) => `${v} ${k}`).join(' · ') || '—'}.</div>
                            {d.errores.length > 0 && <p className="save-hint" style={{margin:'4px 0', color:'var(--rojo, #a3281c)'}}>{d.errores.join(' · ')}</p>}
                            {d.areasSolicitud && d.areasSolicitud.areas.length === 0 && d.areasSolicitud.mensaje && (
                              <div className="save-hint" style={{margin:'8px 0 2px', padding:'8px 10px', borderRadius:8, background:'var(--gris-claro)'}}>Áreas a las que se les pidió pruebas: {d.areasSolicitud.mensaje}</div>
                            )}
                            {d.areasSolicitud && d.areasSolicitud.areas.length > 0 && (
                              <div style={{margin:'8px 0 2px', padding:'8px 10px', borderRadius:8, background:'var(--gris-claro)'}}>
                                <strong style={{fontSize:12.5}}>{d.areasSolicitud.sinSolicitud ? 'Áreas que ya respondieron (todavía no se ha creado la solicitud de pruebas):' : 'Áreas a las que se les pidió pruebas' + (d.areasSolicitud.enviada ? '' : ' (la solicitud aún está en Borradores, no se ha enviado)') + ':'}</strong>
                                <div style={{display:'flex', flexWrap:'wrap', gap:'4px 14px', marginTop:4}}>
                                  {d.areasSolicitud.areas.map(a => (
                                    <span key={a.entidad + a.area} style={{display:'inline-flex', alignItems:'center', gap:5, fontWeight:600, color: a.respondio ? 'var(--verde-oscuro)' : (d.areasSolicitud.enviada ? 'var(--rojo, #a3281c)' : 'var(--texto-suave)')}}>
                                      <span aria-hidden="true" style={{fontSize:16}}>{a.respondio ? '✓' : (d.areasSolicitud.enviada ? '✗' : '•')}</span>
                                      {a.area} ({a.entidad}) — {a.respondio ? (a.noSolicitada ? 'respondió sin que se le pidiera' : 'respondió') : (d.areasSolicitud.enviada ? 'falta' : 'pendiente de enviar')}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <details style={{marginTop:4}}>
                              <summary style={{cursor:'pointer'}}>Ver la lista</summary>
                              <div className="correos-leyenda" aria-label="Código de colores">
                                <span><i style={{background:'var(--verde-oscuro)'}} />Juzgado</span>
                                <span><i style={{background:'var(--naranja)'}} />Entidad o área (la que respondió lleva ✓ Respondida)</span>
                                <span><i style={{background:'var(--verde-claro)'}} />Enviado por Tutelas</span>
                                <span><i style={{background:'var(--texto-suave)'}} />Otro remitente</span>
                              </div>
                              <ul className="correos-tutela-lista">
                                {d.correos.map(c => (
                                  <li key={c.id} className={'correo-' + (c.clase === 'juzgado' ? 'juzgado' : String(c.clase || '').startsWith('entidad') ? 'entidad' : String(c.clase || '').startsWith('enviado') ? 'enviado' : 'otro')}>
                                    {c.fecha} · <em>{c.area ? (c.area.juridica ? 'área jurídica' : c.area.area + ' (' + c.area.entidad + ')') : c.clase}</em>{c.area && !c.area.juridica && <span className="badge badge-verde" style={{marginLeft:6}} title="Este correo viene de un área de la agenda: respondió">✓ Respondida</span>} · <strong>{nombreDeRemitente(c.de)}</strong> — {c.asunto}
                                    {c.adjuntos && c.adjuntos.length > 0 && <span> · 📎 {c.adjuntos.join(', ')}</span>}
                                    {c.enlace && <IconButton icon="open" variant="mail" label="Abrir este correo en Outlook" href={c.enlace} />}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </div>
                        );
                      })()}
                      </div>
                    </div>
                  )}
                  {/* Uno o varios registros detectados (2026-09-23, ver nota
                      arriba sobre clientes vinculados) — cada uno con su
                      propio botón, para poder crear varios borradores del
                      mismo correo sin tener que volver a extraer. */}
                  {resultado && resultado.mensajeId === m.id && (
                    <>
                    <div className="tutela-seccion">
                      <div className="tutela-seccion-head">
                        <h4><span className="tutela-seccion-n">Sección 3</span>Clientes de la tutela y borrador</h4>
                      </div>
                      <div className="tutela-seccion-body leer-correo-registros">
                      {resultado.registros.length > 1 && (
                        <p className="save-hint" style={{margin:'0 0 8px'}}>
                          Este correo señala a {resultado.registros.length} clientes distintos. Los botones «Crear borrador» de cada cliente abren el formulario de la tutela de ese cliente (en el portal cada cliente lleva su propio registro). La solicitud de pruebas, en cambio, es UN SOLO correo borrador para todos, con una sección separada por cada cliente.
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
                          ) : tutelaYaEnPortal(tutelas, r.NoTutela || numeroDeEsteMensaje, r.Cliente) ? (
                            <span className="badge badge-verde" title="Esta tutela ya está registrada en el portal para este cliente: no hace falta crearla de nuevo.">Ya está en el portal</span>
                          ) : (
                            <IconTextButton icon="add" variant="primary" onClick={() => handleCrearBorrador(i)}>
                              Crear borrador
                            </IconTextButton>
                          )}
                          {resultado.registros.length === 1 && bloqueSolicitud(r, i)}
                        </div>
                      ))}
                      {resultado.registros.length > 1 && (
                        <div className="leer-correo-registro-item">
                          {bloqueSolicitud(resultado.registros[0], 0, true)}
                        </div>
                      )}
                      </div>
                    </div>
                    </>
                  )}
                  {robotSolicitudUrl && onedriveCarpetaUrl && numeroDeEsteMensaje && (yaAnalizadaEnOneDrive || resultado?.mensajeId === m.id) && (
                    <div className="respuestas-areas-panel tutela-seccion">
                      <div className="tutela-seccion-head">
                        <h4><span className="tutela-seccion-n">Sección 4</span>Pruebas solicitadas a las áreas</h4>
                        {robotEscritoUrl && resultado?.mensajeId === m.id && (
                          <IconTextButton icon="mail" variant="primary" disabled={aplazamiento[m.id]?.estado === 'creando'} onClick={() => handleCorreoConAplazamiento(m)}>
                            {aplazamiento[m.id]?.estado === 'creando' ? 'Creando el correo…' : 'Correo con aplazamiento'}
                          </IconTextButton>
                        )}
                        <IconTextButton icon="mail" variant="secondary" disabled={respuestasAreas[m.id]?.estado === 'revisando'} onClick={() => handleRevisarRespuestas(m)}>
                          {respuestasAreas[m.id]?.estado === 'revisando' ? 'Revisando…' : (respuestasAreas[m.id]?.datos ? 'Volver a revisar respuestas' : 'Revisar respuestas de las áreas')}
                        </IconTextButton>
                      </div>
                      <div className="tutela-seccion-body">
                      {repetido[m.id] && (
                        <div style={{background:'#fff4e0', border:'1px solid var(--amarillo, #e0a93b)', borderRadius:8, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8, fontSize:13}}>
                          <span><strong>Ya está hecho.</strong> {repetido[m.id]} ¿Crear otro de todas formas?</span>
                          <span style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                            <IconTextButton icon="mail" variant="primary" onClick={() => handleCorreoConAplazamiento(m, true)}>Crear otro de todas formas</IconTextButton>
                            <IconTextButton icon="delete" variant="secondary" onClick={() => setRepetido(prev => ({ ...prev, [m.id]: '' }))}>Cancelar</IconTextButton>
                          </span>
                        </div>
                      )}
                      {aplazamiento[m.id]?.pasos?.length > 0 && (
                        <ul className="escrito-pasos">
                          {aplazamiento[m.id].pasos.map((t, i) => <li key={i} className={aplazamiento[m.id].estado === 'creando' && i === aplazamiento[m.id].pasos.length - 1 ? 'activo' : ''}>{t}</li>)}
                        </ul>
                      )}
                      {aplazamiento[m.id]?.estado === 'error' && <div className="escrito-error">{aplazamiento[m.id].error}</div>}
                      {respuestasAreas[m.id]?.estado === 'error' && (
                        <p className="save-hint" style={{margin:'6px 0 0', color:'var(--rojo, #a3281c)'}}>No se pudo revisar: {respuestasAreas[m.id].error}</p>
                      )}
                      {respuestasAreas[m.id]?.estado === 'listo' && (() => {
                        const d = respuestasAreas[m.id].datos;
                        if(d.sinSolicitud) return <p className="save-hint" style={{margin:'6px 0 0'}}>Todavía no hay una solicitud de pruebas de esta tutela en Borradores ni en Enviados del buzón de Tutelas.</p>;
                        return (
                          <div style={{marginTop:6, display:'flex', flexDirection:'column', gap:8}}>
                            {d.solicitudes.map((sol, k) => {
                              const faltan = sol.areas.filter(a => !a.respondio && !a.noSolicitada);
                              return (
                                <div key={k} style={{fontSize:13}}>
                                  <div><strong>{sol.asunto}</strong> — {sol.enviado ? 'enviada' : 'en borrador (sin enviar)'}{sol.fecha ? ` el ${sol.fecha}` : ''} {sol.enlace && <a href={sol.enlace} target="_blank" rel="noopener noreferrer">Abrir</a>}</div>
                                  <ul style={{margin:'4px 0 0', paddingLeft:18, listStyle:'none'}}>
                                    {sol.areas.map((a, j) => (
                                      <li key={j}>
                                        {a.respondio ? '✅' : (sol.enviado ? '⏳' : '📝')} {a.entidad} · {a.area} — {a.respondio ? `respondió${a.fechaRespuesta ? ' (' + a.fechaRespuesta + ')' : ''}${a.respuestas > 1 ? ', ' + a.respuestas + ' correos' : ''}${a.noSolicitada ? ' · no se le había pedido' : ''}` : (sol.enviado ? 'sin respuesta todavía' : 'aún no se envía')}
                                      </li>
                                    ))}
                                  </ul>
                                  {sol.enviado && (faltan.length > 0
                                    ? <p className="save-hint" style={{margin:'4px 0 0'}}>Faltan por responder: {faltan.map(a => a.entidad + ' · ' + a.area).join('; ')}.</p>
                                    : <p className="save-hint" style={{margin:'4px 0 0'}}>Todas las áreas solicitadas ya respondieron.</p>)}
                                </div>
                              );
                            })}
                            {d.nuevasGuardadas > 0 && <p className="save-hint" style={{margin:0}}>Guardé {d.nuevasGuardadas} respuesta{d.nuevasGuardadas === 1 ? '' : 's'} nueva{d.nuevasGuardadas === 1 ? '' : 's'} (correo y adjuntos) en la carpeta «Respuestas de áreas» de la tutela en OneDrive y en «Lectura LexIA.txt».</p>}
                            {d.errores.length > 0 && <p className="save-hint" style={{margin:0, color:'var(--rojo, #a3281c)'}}>{d.errores.join(' · ')}</p>}
                          </div>
                        );
                      })()}
                      </div>
                    </div>
                  )}
                  {onedriveCarpetaUrl && numeroDeEsteMensaje && (yaAnalizadaEnOneDrive || resultado?.mensajeId === m.id) && (
                    <div className="tutela-seccion">
                      <div className="tutela-seccion-head">
                        <h4><span className="tutela-seccion-n">Sección 5</span>Enlace para el artefacto (Plan B)</h4>
                        <IconTextButton icon="mail" variant="secondary" onClick={() => handleCopiarEnlaceArtefacto(m)}>Copiar enlace para el artefacto</IconTextButton>
                      </div>
                      <div className="tutela-seccion-body">
                        <p className="escrito-intro">Pégalo en el artefacto Plan B para que lea la lectura al instante.</p>
                      </div>
                    </div>
                  )}
                  {robotEscritoUrl && onedriveCarpetaUrl && numeroDeEsteMensaje && (yaAnalizadaEnOneDrive || resultado?.mensajeId === m.id) && (
                    <EscritoRobotPanel correoBuzon={correoBuzon} numero={numeroDeEsteMensaje} onedriveCarpetaUrl={onedriveCarpetaUrl} robotUrl={robotEscritoUrl} notify={notify} antesDeRedactar={async () => { const d = await asegurarCorreosLeidos(m, numeroDeEsteMensaje, true); try{ await handleRevisarRespuestas(m); }catch(err){ console.error(err); } return d; }} />
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
          {seguimientoVisible && (
            <SeguimientoTutela numero={numeroSel} estado={seguimiento[numeroSel]} onActualizar={() => setTickSeguimiento(t => t + 1)} />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
