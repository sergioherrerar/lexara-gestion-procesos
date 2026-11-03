import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { ICON_SVG, TUTELAS_REMITENTES_PERMITIDOS } from '../config';
import { fmtDate, listarEnviadosConAdjuntos, mensajeError } from '../lib/graph';
import { contestacionesDeEnviados, enviadasPorTutela, vencimientoEfectivo } from '../lib/contestacionesEnviadas';
import { cargarModulo } from '../lib/cargaModulo';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import TableScrollWrap from './TableScrollWrap';
// Carga diferida: es el módulo más pesado de Tutelas (lectura de correos + LexIA)
// y solo se usa al abrir "Leer correo".
const LeerCorreoTutelaModal = lazy(cargarModulo(() => import('./LeerCorreoTutelaModal')));
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';
import { useLexiaVoz } from '../hooks/useLexiaVoz';
import lexiaAvatar from '../assets/LexIA avatar.png';

// Orden pedido explícito del usuario 2026-09-01 — Juzgado se quitó de la
// tabla (no estaba en la lista que pidió); sigue existiendo como dato, solo
// no se muestra acá.
const COLUMNS = [
  {key:'noTutela', label:'No. Tutela', value: t => t.NoTutela || ""},
  {key:'fechaCreacion', label:'Fecha de creación', value: t => t.createdDateTime || ""},
  {key:'entidad', label:'Entidad', value: t => t.Entidad || ""},
  {key:'cliente', label:'Cliente', value: t => t.Cliente || ""},
  {key:'tipoRespuesta', label:'Tipo Respuesta', value: t => t.TipoRespuesta || ""},
  // Rojo (2026-09-25, pedido explícito del usuario) — resalta el encabezado
  // para que "Vencimiento" salte a la vista, misma columna crítica que ya
  // tiene el badge de alerta de "vencen hoy" arriba.
  {key:'fechaVencimiento', label:'Vencimiento', value: t => t.FechaVencimiento || "", labelColor:'#d64541'},
  {key:'fechaNotificacion', label:'Fecha Notificación', value: t => t.FechaNotificacion || ""},
  {key:'tema', label:'Tema', value: t => t.Tema || ""},
  {key:'acciones', label:'Acciones', filterable:false},
];

// Fecha de hoy en formato "yyyy-mm-dd", para comparar contra Fecha
// Vencimiento (que llega como fecha/hora ISO) sin líos de huso horario.
function hoyISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function TutelasView({ onMarcarContestadas, tutelas, temas, searchQuery, onOpenTutela, onCreateTutela, onDuplicateTutela, onDeleteTutela, onAgregarCorreccionIA, canWrite = true, liveMode, config, notify }){
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();
  // "Leer correo (LexIA)" — nombre elegido por el usuario 2026-09-24 para
  // el robot/asistente ("con Lexara mejor... me gusta LexIA"), en vez del
  // genérico "(IA)" de antes. "API Claude" Tarea 1 (2026-09-23, pedido explícito
  // del usuario, con aprobación interna, ver [[project_api_claude_tutelas]]).
  // Solo tiene sentido conectado a SharePoint en vivo (necesita leer un
  // buzón real de Outlook) — en modo demo no se muestra.
  const [mostrarLeerCorreo, setMostrarLeerCorreo] = useState(false);
  // Voz de LexIA (2026-09-24, pedido explícito del usuario: "que salude
  // con la voz al abrir") — se instancia acá (no dentro del modal) para
  // poder disparar el saludo DENTRO del mismo clic que abre la ventana:
  // varios navegadores solo dejan sonar la síntesis de voz si queda
  // pegada al gesto real del usuario, no un instante después (que es lo
  // que pasaba cuando el saludo se disparaba en un useEffect al montar el
  // modal, un tris más tarde que el clic).
  const { decir, hablando: lexiaHablando } = useLexiaVoz();
  // Contador de tutelas que vencen hoy — se recalcula en cada render, así
  // que siempre queda al día con lo último que haya en `tutelas` (recién
  // cargado o después de un refresh).
  const vencenHoy = tutelas.filter(t => String(t.FechaVencimiento||"").slice(0,10) === hoyISO()).length;
  // «Contestación» (2026-11-03, pedido del usuario): reconoce en los Enviados de Tutelas@ el correo de contestación de cada tutela (por su número) y la marca como Enviada;
  // lo que sigue sin correo queda «Por contestar». Se revisa solo al abrir (sin ventanas de permiso) y con el botón «Revisar enviadas». Solo se hace seguimiento a lo que
  // venció en los últimos 45 días (lo anterior no se marca como pendiente).
  const DIAS_SEGUIMIENTO = 45;
  const [envios, setEnvios] = useState(null);          // Map id → { fecha, tipo } del último escaneo
  const [revisando, setRevisando] = useState(false);
  const [errorRevision, setErrorRevision] = useState('');   // por qué falló la última revisión (la automática no muestra avisos)
  const [filtroEnvio, setFiltroEnvio] = useState('todas'); // 'todas' | 'porContestar' | 'enviadas'
  const desdeISO = (() => { const d = new Date(); d.setDate(d.getDate() - DIAS_SEGUIMIENTO); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
  function estadoDe(t){
    const venc = String(t.FechaVencimiento||"").slice(0,10);
    const guardada = String(t.Contestada||"").trim().toUpperCase() === 'SI';
    const escaneada = envios?.get(t.id);
    if(guardada || escaneada) return { estado:'enviada', fecha: guardada ? (t.FechaContestacion || escaneada?.fecha || '') : escaneada.fecha };
    if(!envios) return null;                          // todavía no se ha revisado Tutelas@: no se afirma nada
    if(!venc || venc < desdeISO) return null;       // fuera del seguimiento
    // Si de este número ya se envió el aplazamiento, el plazo gana un día hábil (ver vencimientoEfectivo).
    const ef = vencimientoEfectivo(t, tutelas, x => String(x.Contestada||"").trim().toUpperCase() === 'SI' || !!envios.get(x.id));
    return { estado: ef.fecha < hoyISO() ? 'vencida' : 'porContestar', ampliado: ef.ampliado, vence: ef.fecha };
  }
  function fechaHoraCorta(iso){
    const d = new Date(iso);
    if(isNaN(d)) return '';
    return d.toLocaleDateString('es-CO', {day:'2-digit', month:'2-digit'}) + ' ' + d.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', hour12:false});
  }
  async function revisarEnviadas(silencioso){
    if(!liveMode || !config?.TUTELAS_BUZON_CORREO) return;
    setRevisando(true); setErrorRevision('');
    try{
      const mensajes = await listarEnviadosConAdjuntos(config.TUTELAS_BUZON_CORREO, desdeISO, silencioso);
      const mapa = enviadasPorTutela(tutelas, contestacionesDeEnviados(mensajes));
      setEnvios(mapa);
      const nuevas = [...mapa.entries()].filter(([id]) => { const t = tutelas.find(x => x.id === id); return t && String(t.Contestada||"").trim().toUpperCase() !== 'SI'; }).map(([id, e]) => ({ id, fecha: e.fecha }));
      let guardadas = 0;
      if(canWrite && onMarcarContestadas && nuevas.length) guardadas = await onMarcarContestadas(nuevas);
      if(!silencioso) notify?.(mapa.size ? ('Se reconocieron ' + mapa.size + ' contestaciones enviadas desde Tutelas@' + (guardadas ? ' (' + guardadas + ' nuevas guardadas)' : '') + '.') : ('No encontré contestaciones enviadas en los últimos ' + DIAS_SEGUIMIENTO + ' días.'), 'success');
    }catch(err){
      console.error('Revisar enviadas:', err);
      setErrorRevision(mensajeError(err));
      if(!silencioso) notify?.('No se pudieron revisar los correos enviados de Tutelas@: ' + mensajeError(err), 'error');
    }finally{ setRevisando(false); }
  }
  const revisoAlAbrir = useRef(false);
  useEffect(() => {
    if(revisoAlAbrir.current || !liveMode || !tutelas.length) return;
    revisoAlAbrir.current = true;
    revisarEnviadas(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode, tutelas.length]);
  const textoEstado = t => { const e = estadoDe(t); return !e ? '' : e.estado === 'enviada' ? 'Enviada' : e.estado === 'vencida' ? 'Sin envío reconocido' : 'Por contestar'; };
  const columnas = useMemo(() => [...COLUMNS.slice(0, 8), { key:'contestacion', label:'Contestación', value: textoEstado }, ...COLUMNS.slice(8)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [envios, tutelas]);
  const query = (searchQuery||"").trim().toLowerCase();
  // "No Tutela" es una columna numérica en SharePoint (llega como number,
  // no string) — .toLowerCase()/.localeCompare no existen en números y
  // tumbaban la búsqueda/orden sin avisar. Se envuelve todo en String().
  // Orden por defecto pedido explícito del usuario 2026-09-01: siempre por
  // "No Tutela", el número mayor arriba — antes era por Fecha Vencimiento.
  // Number() y no localeCompare: "No Tutela" es una columna numérica real
  // (ver nota más abajo), comparar como texto ordenaría mal en cuanto
  // cambiara de cantidad de dígitos (ej. "9" quedaría después de "10").
  const rows = tutelas.filter(t => (!query ||
    String(t.NoTutela||"").toLowerCase().includes(query) ||
    String(t.Cliente||"").toLowerCase().includes(query) ||
    String(t.Entidad||"").toLowerCase().includes(query)) && rowMatches(t, columnas) && (filtroEnvio === 'todas' || (filtroEnvio === 'enviadas' ? estadoDe(t)?.estado === 'enviada' : ['porContestar','vencida'].includes(estadoDe(t)?.estado))))
    .sort((a,b) => (Number(b.NoTutela)||0) - (Number(a.NoTutela)||0));
  const sortedRows = sortRows(rows, columnas);
  // Diferencia por tipo (pedido explícito del usuario 2026-08-31, ajustado
  // 2026-09-01 a "solo las del día") — desglose del mismo badge "vencen
  // hoy" de arriba: cuántas de las que vencen HOY son Tutela/Impugnación/
  // Otras, sobre el total de `tutelas` (sin filtrar por búsqueda/columna,
  // igual que vencenHoy) — antes contaba todo lo filtrado/buscado en
  // pantalla, sin importar la fecha.
  const tutelasHoy = tutelas.filter(t => String(t.FechaVencimiento||"").slice(0,10) === hoyISO());
  const conteoTutela = tutelasHoy.filter(t => (t.TipoRespuesta||"").trim().toUpperCase() === 'TUTELA').length;
  const conteoImpugnacion = tutelasHoy.filter(t => (t.TipoRespuesta||"").trim().toUpperCase() === 'IMPUGNACION').length;
  const conteoOtras = tutelasHoy.length - conteoTutela - conteoImpugnacion;
  const enviadasHoy = tutelasHoy.filter(t => estadoDe(t)?.estado === 'enviada').length;
  const hayEstado = !!envios || tutelas.some(t => t.Contestada);

  return (
    <div className="view">
      <div className="view-header view-header-lexia">
        <div>
          <h1>Tutelas</h1>
          <p>{rows.length} de {tutelas.length} tutelas{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
        </div>
        {/* Botón de LexIA centrado (2026-09-24, pedido explícito del
            usuario: "mejor deja el botón de LexIA en la mitad, debajo del
            calendario") — el calendario global vive centrado en la barra
            superior (Topbar.jsx), así que este botón queda alineado
            debajo de ese mismo eje central, separado del grupo de la
            derecha (badge/Nueva tutela). */}
        {/* "Que LexIA llegue como cayendo a esa posición, con un mensaje
            púlsame para ayudarte" (2026-09-29, pedido explícito del
            usuario) — el botón cae con rebote desde arriba cada vez que se
            abre esta vista (mismo estilo de entrada que .lexia-entrada del
            modal), y junto a él aparece una burbuja invitando a hacer clic,
            que se desvanece sola después de unos segundos. */}
        {canWrite && liveMode && (
          <div className="lexia-btn-caida">
            <button type="button" className="btn-lexia" onClick={() => {
              setMostrarLeerCorreo(true);
              decir('Hola, soy LexIA. Elige un correo y dale extraer, o pregúntame lo que necesites.');
            }}>
              <img src={lexiaAvatar} alt="" className="btn-lexia-avatar" />
              LexIA
            </button>
            <span className="lexia-tip-burbuja">¡Púlsame para ayudarte!</span>
          </div>
        )}
        <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
          <span className={"badge badge-forma-boton " + (vencenHoy > 0 ? "badge-alerta" : "badge-gris")}>
            {vencenHoy} {vencenHoy === 1 ? "vence" : "vencen"} hoy
          </span>
          {liveMode && !envios && !revisando && <span className="badge badge-naranja" title={errorRevision || 'Aún no se han revisado los correos enviados de Tutelas@'}>{errorRevision ? 'No se pudo revisar Tutelas@' : 'Sin revisar enviadas'}</span>}
          {liveMode && <IconTextButton icon="mail" variant="secondary" onClick={() => revisarEnviadas(false)} disabled={revisando}>{revisando ? 'Revisando…' : 'Revisar enviadas'}</IconTextButton>}
          {canWrite && <IconTextButton icon="add" variant="primary" onClick={() => onCreateTutela()}>Nueva tutela</IconTextButton>}
        </div>
      </div>
      {mostrarLeerCorreo && (
        <Suspense fallback={null}>
        <LeerCorreoTutelaModal
          correoBuzon={config?.TUTELAS_BUZON_CORREO}
          remitentesPermitidos={TUTELAS_REMITENTES_PERMITIDOS}
          robotUrl={config?.ROBOT_CLAUDE_URL}
          onedriveCarpetaUrl={config?.TUTELAS_ONEDRIVE_CARPETA_URL}
          tutelas={tutelas}
          temas={temas}
          onAgregarCorreccionIA={onAgregarCorreccionIA}
          robotPreguntasUrl={config?.ROBOT_PREGUNTAS_URL}
          robotEscritoUrl={config?.ROBOT_ESCRITO_URL || (config?.ROBOT_CLAUDE_URL || '').replace('extraer-tutela.php', 'redactar-escrito.php')}
          config={config}
          robotSolicitudUrl={config?.ROBOT_SOLICITUD_PRUEBAS_URL || (config?.ROBOT_CLAUDE_URL || '').replace('extraer-tutela.php', 'solicitud-pruebas.php')}
          notify={notify}
          lexiaHablando={lexiaHablando}
          onClose={() => setMostrarLeerCorreo(false)}
          onExtraido={campos => onCreateTutela(campos)}
        />
        </Suspense>
      )}
      {/* Diferencia por tipo, solo de lo que vence HOY (pedido explícito del
          usuario 2026-09-01) — en su propia fila, separada del título/botón
          de arriba: metida en la misma fila del view-header (que no tiene
          flex-wrap) empujaba el título hacia abajo en pantallas angostas.
          Alineada a la derecha, también pedido explícito. */}
      <div style={{display:'flex', gap:10, flexWrap:'wrap', justifyContent:'flex-end', alignItems:'center', marginBottom:16}}>
        {hayEstado && (
          <span style={{display:'inline-flex', gap:6, marginRight:'auto', flexWrap:'wrap'}}>
            {[['todas','Todas'],['porContestar','Por contestar'],['enviadas','Enviadas']].map(([k, etiqueta]) => (
              <button key={k} type="button" className={"filter-chip" + (filtroEnvio === k ? " active" : "")} onClick={() => setFiltroEnvio(k)}>{etiqueta}</button>
            ))}
          </span>
        )}
        {hayEstado && <span className="badge badge-verde">{enviadasHoy} de hoy ya enviadas</span>}
        {hayEstado && <span className="badge badge-naranja">{tutelasHoy.length - enviadasHoy} de hoy por contestar</span>}
        <span className="badge badge-verde">{conteoTutela} Tutelas</span>
        <span className="badge badge-naranja">{conteoImpugnacion} Impugnaciones</span>
        <span className="badge badge-gris">{conteoOtras} Otras contestaciones</span>
      </div>
      <TableScrollWrap>
        <table>
          <thead>
            <tr>
              {columnas.map(c => (
                <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setFilter} rows={tutelas} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? sortedRows.map(t => (
              <tr key={t.id}>
                <td className="cliente">{t.NoTutela || "—"}</td>
                <td>{fmtDate(t.createdDateTime)}</td>
                <td>{t.Entidad || "—"}</td>
                <td>{t.Cliente || "—"}</td>
                <td>{t.TipoRespuesta || "—"}</td>
                <td>{fmtDate(t.FechaVencimiento)}</td>
                <td>{fmtDate(t.FechaNotificacion)}</td>
                <td>{t.Tema || "—"}</td>
                <td>{(() => { const e = estadoDe(t); if(!e) return "—"; return e.estado === 'enviada' ? <span className="badge badge-verde" title="Contestación enviada desde Tutelas@">Enviada{e.fecha ? ' ' + fechaHoraCorta(e.fecha) : ''}</span> : e.estado === 'vencida' ? <span className="badge badge-naranja" title={'Era para el ' + fmtDate(e.vence) + (e.ampliado ? ' (plazo ampliado por el aplazamiento enviado)' : '') + ' y no encontré el correo de contestación en Tutelas@. Verifica antes de darla por vencida: puede haber salido con otro número o desde otro buzón.'}>Sin envío reconocido</span> : <span className="badge badge-naranja" title={e.ampliado ? 'Plazo ampliado un día hábil por el aplazamiento ya enviado: vence ' + fmtDate(e.vence) : undefined}>Por contestar{e.ampliado ? ' · +' + e.ampliado + ' día hábil' : ''}</span>; })()}</td>
                <td style={{whiteSpace:'nowrap'}}>
                  <div className="row-actions">
                    <IconButton icon="edit" variant="edit" label={canWrite ? "Editar tutela" : "Ver tutela"} onClick={() => onOpenTutela(t.id)} />
                    {canWrite && <IconButton icon="duplicate" variant="duplicate" label="Duplicar tutela" onClick={() => onDuplicateTutela(t.id)} />}
                    {canWrite && <IconButton icon="delete" variant="delete" label="Eliminar tutela" onClick={() => onDeleteTutela(t.id)} />}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={10}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No hay tutelas para mostrar.</div></td></tr>
            )}
          </tbody>
        </table>
      </TableScrollWrap>
    </div>
  );
}
