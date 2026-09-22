import { useState, useMemo, useEffect } from 'react';
import { festivosColombia, nombresFestivosColombia } from '../lib/horasExtras';
import { sumarDiasHabilesJudiciales } from '../lib/audienciasTerminos';
import { mensajeError } from '../lib/graph';
import { FormularioNuevo } from './AudienciasTerminosTab';
import { PendienteForm } from './PendientesSection';
// Verde claro (no "verde oscuro", pedido explícito del usuario 2026-09-16)
// — el logo se ve sobre el encabezado verde oscuro del calendario; con la
// versión verde oscura quedaba invisible (bug real reportado por el usuario:
// "al mes puede incluirle el logo" — no es que faltara en el código, es que
// no se veía sobre ese fondo).
import miniVerdeClaro from '../assets/Mini verde claro.png';

// Mini calendario del mes con festivos de Colombia marcados y un punto por
// cada Audiencia (verde) / Término (naranja) que vence ese día — pedido
// explícito del usuario 2026-09-15: "un mini calendario con el logo Lexara
// con los eventos del mes, una visual con los festivos en Colombia
// marcados". Los festivos salen del mismo festivosColombia() que ya usa el
// contador de días hábiles judiciales (audienciasTerminos.js), así que nunca
// se puede desincronizar.
//
// Cada día es clicable (pedido explícito del usuario, mismo día 2026-09-15):
// muestra abajo la lista resumida de Audiencias/Términos/Pendientes/Otros de
// ESE día y un formulario rápido para crear cada uno. Los eventos "Otros"
// (creados con "+ Otro evento", directo en el calendario compartido de
// Outlook — ver crearEventoCalendarioPersonalizado en useLexaraApp.js) SÍ se
// vuelven a leer (2026-09-22, pedido explícito del usuario: "en la
// descripción del día colocar el evento otros también colocar el color en
// cabecera") — antes era de una sola vía, sin volver a mostrarse acá; ahora
// listarOtrosEventosDelMes (useLexaraApp.js/graph.js) los trae por mes cada
// vez que se abre el calendario o se cambia de mes, buscando la misma marca
// oculta ("LEXARA-MARCA:personalizado:...") que ya usa el resto de la
// sincronización con Outlook.
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_SEMANA = ['D','L','M','X','J','V','S'];
const DIAS_LARGO = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

function soloFechaISO(v){ return String(v || "").slice(0, 10); }

// Celdas (null = relleno antes del día 1) de un mes cualquiera.
function celdasDelMes(anio, mes){
  const primerDiaSemana = new Date(anio, mes, 1).getDay();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const celdas = [];
  for(let i=0; i<primerDiaSemana; i++) celdas.push(null);
  for(let d=1; d<=diasEnMes; d++) celdas.push(d);
  return celdas;
}

// Junta Audiencias/Términos/Pendientes/Otros por fecha objetivo (ISO) ->
// {audiencias:[], terminos:[], pendientes:[], otros:[]}. "Pendientes"
// agregado 2026-09-17 (pedido explícito del usuario) — a diferencia de las
// otras 2, se asocia por "Proceso" (r.Proceso, real ProcesoMD) que puede
// venir vacío (tarea suelta, sin proceso vinculado), así que ese cruce es
// opcional. "Otros" (2026-09-22) no tiene proceso — son eventos sueltos del
// calendario de Outlook, ya vienen con {id, fecha, asunto}.
function eventosPorDia(audiencias, terminos, pendientes, otros, procesos){
  const mapa = new Map();
  function agregar(registros, tipo, fechaDe, procesoDe){
    (registros||[]).forEach(r => {
      const fecha = fechaDe(r);
      if(!fecha) return;
      if(!mapa.has(fecha)) mapa.set(fecha, { audiencias:[], terminos:[], pendientes:[], otros:[] });
      // String(...) (mismo bug real ya corregido en AudienciasTerminosTab.jsx):
      // en vivo r.Proceso puede llegar como número y p.id siempre es texto.
      const procesoId = procesoDe ? procesoDe(r) : null;
      const proceso = procesoId ? (procesos||[]).find(p => String(p.id) === String(procesoId)) || null : null;
      mapa.get(fecha)[tipo].push({ ...r, proceso });
    });
  }
  agregar(audiencias, 'audiencias', r => soloFechaISO(r.FechaAudiencia), r => r.Proceso);
  agregar(terminos, 'terminos', r => soloFechaISO(r.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(r.FechaNotificacion), r.DiasHabiles), r => r.Proceso);
  agregar(pendientes, 'pendientes', r => soloFechaISO(r.FechaPendiente), r => r.ProcesoMD);
  agregar(otros, 'otros', r => soloFechaISO(r.fecha), null);
  return mapa;
}

function tituloDia(items, textoDe = it => it.Descripcion){
  return items.map(it => `${it.proceso?.Radicado || '—'}${textoDe(it) ? ' — ' + textoDe(it) : ''}`).join('\n');
}

function fechaLarga(iso){
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return `${DIAS_LARGO[dt.getDay()]} ${d} de ${MESES[m-1].toLowerCase()}`;
}

export default function MiniCalendarioAudienciasTerminos({
  audiencias, terminos, pendientes, procesos, tiposAccion, colaboradores, liveMode,
  onCrearEventoPersonalizado, onListarOtrosEventosDelMes, onCrearAudiencia, onCrearTermino, onCreateTipoTermino, onCrearPendiente,
  canWrite = true, notify,
}){
  const hoy = new Date();
  const [cursor, setCursor] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  // "Otros" del mes visible (2026-09-22) — se traen aparte (no vienen en
  // props, a diferencia de audiencias/terminos/pendientes que ya están
  // cargados de antes en memoria) porque viven solo en Outlook; se piden de
  // nuevo cada vez que se abre el calendario o se cambia de mes.
  const [otrosDelMes, setOtrosDelMes] = useState([]);
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const r = await onListarOtrosEventosDelMes?.(cursor.anio, cursor.mes);
      if(!cancelado) setOtrosDelMes(r || []);
    })();
    return () => { cancelado = true; };
  }, [cursor.anio, cursor.mes, onListarOtrosEventosDelMes]);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [nombreEvento, setNombreEvento] = useState('');
  const [horaEvento, setHoraEvento] = useState('');
  const [horaFinEvento, setHoraFinEvento] = useState('');
  const [guardando, setGuardando] = useState(false);
  // "Agregar audiencia/término/pendiente desde el día" (2026-09-22, pedido
  // explícito del usuario: "al momento de dar clic en el día, agreguemos una
  // audiencia un termino o un pendiente y otro tipo de evento como ya esta")
  // — antes el panel del día solo permitía programar un evento suelto
  // directo en Outlook ("otro"); ahora se elige primero QUÉ se quiere crear,
  // y se reusan los mismos formularios que ya existen en Vencimientos, con
  // la fecha de ese día ya precargada.
  const [tipoNuevo, setTipoNuevo] = useState(null);
  const [guardandoTipado, setGuardandoTipado] = useState(false);
  const eventos = useMemo(() => eventosPorDia(audiencias, terminos, pendientes, otrosDelMes, procesos), [audiencias, terminos, pendientes, otrosDelMes, procesos]);
  const festivos = festivosColombia(cursor.anio);
  const nombresFestivos = nombresFestivosColombia(cursor.anio);

  const celdas = celdasDelMes(cursor.anio, cursor.mes);

  function isoDelDia(d){
    return `${cursor.anio}-${String(cursor.mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  const hoyISO = soloFechaISO(hoy);

  function cambiarMes(delta){
    setCursor(c => {
      let mes = c.mes + delta, anio = c.anio;
      if(mes < 0){ mes = 11; anio--; }
      if(mes > 11){ mes = 0; anio++; }
      return { anio, mes };
    });
    setDiaSeleccionado(null);
  }

  function elegirDia(iso){
    setDiaSeleccionado(iso === diaSeleccionado ? null : iso);
    setNombreEvento('');
    setHoraEvento('');
    setHoraFinEvento('');
    setTipoNuevo(null);
  }

  // onCrearPendiente (igual que onCrearAudiencia/onCrearTermino en
  // useLexaraApp.js) ya atrapa sus propios errores y avisa con notify — acá
  // solo hace falta manejar el estado de "guardando" del mini-formulario.
  async function guardarPendiente(datos){
    setGuardandoTipado(true);
    try{ await onCrearPendiente?.(datos); }
    finally{ setGuardandoTipado(false); setTipoNuevo(null); }
  }

  async function handleAgregarEvento(e){
    e.preventDefault();
    if(!nombreEvento.trim()) return;
    setGuardando(true);
    try{
      await onCrearEventoPersonalizado?.({ nombre: nombreEvento.trim(), fechaISO: diaSeleccionado, horaHHMM: horaEvento || null, horaFinHHMM: horaEvento ? (horaFinEvento || null) : null });
      notify?.(`Evento agendado en el calendario de Outlook para el ${fechaLarga(diaSeleccionado)}.`, 'success');
      setNombreEvento('');
      setHoraEvento('');
      setHoraFinEvento('');
      // Refresca "Otros" del mes de una vez, para que el evento recién
      // creado aparezca en la descripción del día sin tener que cerrar y
      // volver a abrir el mini calendario.
      const actualizados = await onListarOtrosEventosDelMes?.(cursor.anio, cursor.mes);
      setOtrosDelMes(actualizados || []);
    }catch(err){ console.error(err); notify?.("No se pudo programar el evento: " + mensajeError(err), 'error'); }
    finally { setGuardando(false); }
  }

  const eventosDelDia = diaSeleccionado ? eventos.get(diaSeleccionado) : null;
  const nombreFestivoDiaSeleccionado = diaSeleccionado ? nombresFestivos.get(diaSeleccionado) : null;

  return (
    <div className="mini-calendario">
      <div className="mini-calendario-header">
        <img src={miniVerdeClaro} alt="" className="mini-calendario-logo" />
        <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">‹</button>
        <span>{MESES[cursor.mes]} {cursor.anio}</span>
        <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">›</button>
      </div>
      <div className="mini-calendario-leyenda">
        <span><span className="punto punto-audiencia" /> Audiencias</span>
        <span><span className="punto punto-termino" /> Términos</span>
        <span><span className="punto punto-pendiente" /> Pendientes</span>
        {/* "Otros" (2026-09-22, pedido explícito del usuario: "para otros
            eventos dejalo con color #52bbb5... también colocar el color en
            cabecera del calendario Otros") — mismo color en el punto, la
            celda sombreada y la lista del día. */}
        <span><span className="punto punto-otro" /> Otros</span>
        {/* Festivo (pedido explícito del usuario 2026-09-17: "incluye color
            de festivos") — no es un punto (los festivos no tienen punto en
            el día, sombrean toda la celda), así que se representa con un
            cuadrito en vez de un círculo para no confundirlo con los otros 3. */}
        <span><span className="cuadrito cuadrito-festivo" /> Festivos</span>
      </div>
      {/* Encabezado D L M X J V S aparte del grid de números (2026-09-22,
          pedido explícito del usuario: "dejemos la columna de gris solo
          hasta el numero del día no hasta la letra del día") — antes vivía
          dentro del mismo .mini-calendario-grid que los números, así que la
          franja de fin de semana (ver abajo) también le pasaba por detrás.
          Separado en su propia fila, la franja (que arranca en
          .mini-calendario-grid-area, ya sin el encabezado adentro) empieza
          justo en la primera fila de números. */}
      <div className="mini-calendario-diasemana-fila">
        {DIAS_SEMANA.map((d,i) => <div key={i} className="mini-calendario-diasemana">{d}</div>)}
      </div>
      <div className="mini-calendario-grid-area">
        {/* Sábado/domingo sombreados como una franja continua (2026-09-22,
            pedido explícito del usuario: primero "dale sombra al domingo y
            al sábado", y al ver que quedaba dividido celda por celda, "que
            no quede dividida... como una sola columna, que no se vean las
            divisiones de fila"). Van FUERA del grid (no como ítems propios
            de grid — eso rompía el auto-acomodo de las 7 columnas, corrido
            visto al probar) — son 2 franjas sueltas, posicionadas por CSS
            (columna 1 y columna 7, ancho calculado a partir del padding y
            los gaps reales del grid) y detrás de las celdas porque van
            primero en el DOM y ambas usan position (celdas ya son
            position:relative). */}
        <div className="mini-calendario-finde-franja domingo" />
        <div className="mini-calendario-finde-franja sabado" />
        <div className="mini-calendario-grid">
          {celdas.map((d, i) => {
          if(d == null) return <div key={i} className="mini-calendario-celda vacia" />;
          const iso = isoDelDia(d);
          const esFestivo = festivos.has(iso);
          const diaSemanaNum = new Date(cursor.anio, cursor.mes, d).getDay();
          const esDomingo = diaSemanaNum === 0;
          const esSabado = diaSemanaNum === 6;
          const ev = eventos.get(iso);
          const esHoy = iso === hoyISO;
          const esSeleccionado = iso === diaSeleccionado;
          // Tooltip al pasar el mouse (pedido explícito del usuario
          // 2026-09-16: "muestre... color del punto y evento; si hay
          // festivo, que esté marcado qué se celebra") — el nombre real del
          // festivo (no solo "Festivo") más el resumen de Audiencias/Términos
          // de ese día, sin tener que hacer clic.
          const titulo = [
            esFestivo ? `Festivo: ${nombresFestivos.get(iso) || ''}` : null,
            ev?.audiencias?.length ? `Audiencias:\n${tituloDia(ev.audiencias)}` : null,
            ev?.terminos?.length ? `Términos:\n${tituloDia(ev.terminos)}` : null,
            ev?.pendientes?.length ? `Pendientes:\n${tituloDia(ev.pendientes, it => it.Pendiente)}` : null,
            ev?.otros?.length ? `Otros:\n${ev.otros.map(o => o.asunto || '—').join('\n')}` : null,
          ].filter(Boolean).join('\n\n');
          // Sombreado de la celda por tipo de evento (pedido explícito del
          // usuario 2026-09-17: "sombrea del color asi como los fectivos
          // audiencias terminos pendientes") — mismo tratamiento visual que
          // ya tenían los festivos (fondo suave + número en negrita de su
          // color), no solo el punto pequeño de abajo. Un festivo se ve
          // igual que siempre (su color es el festivo, no se mezcla); si un
          // día no es festivo pero tiene más de un tipo de evento, se
          // muestra el de mayor prioridad (Audiencia > Término > Pendiente >
          // Otro — "Otro" al final, 2026-09-22, es el menos crítico de los 4).
          const tipoEvento = !esFestivo
            ? (ev?.audiencias?.length ? 'audiencia' : ev?.terminos?.length ? 'termino' : ev?.pendientes?.length ? 'pendiente' : ev?.otros?.length ? 'otro' : null)
            : null;
          return (
            <button
              type="button"
              key={i}
              className={"mini-calendario-celda" + (esFestivo ? ' festivo' : '') + (tipoEvento ? ' con-' + tipoEvento : '') + (esDomingo ? ' domingo' : '') + (esSabado ? ' sabado' : '') + (esHoy ? ' hoy' : '') + (esSeleccionado ? ' seleccionado' : '')}
              onClick={() => elegirDia(iso)}
              title={titulo || undefined}
            >
              <span className="numero">{d}</span>
              {ev && (
                <span className="puntos">
                  {ev.audiencias.length > 0 && <span className="punto punto-audiencia" />}
                  {ev.terminos.length > 0 && <span className="punto punto-termino" />}
                  {ev.pendientes.length > 0 && <span className="punto punto-pendiente" />}
                  {ev.otros.length > 0 && <span className="punto punto-otro" />}
                </span>
              )}
            </button>
          );
          })}
        </div>
      </div>
      {diaSeleccionado && (
        <div className="mini-calendario-dia-panel">
          <p className="mini-calendario-dia-titulo">
            {fechaLarga(diaSeleccionado)}{nombreFestivoDiaSeleccionado ? ` · ${nombreFestivoDiaSeleccionado}` : ''}
          </p>
          {(eventosDelDia?.terminos?.length || eventosDelDia?.audiencias?.length || eventosDelDia?.pendientes?.length || eventosDelDia?.otros?.length) ? (
            <ul className="mini-calendario-dia-lista">
              {/* El tipo de audiencia/término (Descripcion) se agrega acá
                  (pedido explícito del usuario 2026-09-17: "que muestre tipo
                  de audiencia y tipo de termino") — antes solo se veía el
                  Número Corto, sin decir de qué se trata. */}
              {eventosDelDia.terminos.map(t => (
                <li key={'t'+t.id}><strong>Término</strong> {t.proceso?.Radicado || '—'}{t.Descripcion ? ` — ${t.Descripcion}` : ''}</li>
              ))}
              {eventosDelDia.audiencias.map(a => (
                <li key={'a'+a.id}><strong>Audiencia</strong> {a.proceso?.Radicado || '—'}{a.Descripcion ? ` — ${a.Descripcion}` : ''}</li>
              ))}
              {eventosDelDia.pendientes.map(p => (
                <li key={'p'+p.id}><strong>Pendiente</strong> {p.Pendiente || '—'}{p.proceso?.Radicado ? ` (${p.proceso.Radicado})` : ''}</li>
              ))}
              {/* "Otros" (2026-09-22, pedido explícito del usuario: "en la
                  descripción del día colocar el evento otros") — traídos de
                  vuelta de Outlook (ver listarOtrosEventosDelMes arriba). */}
              {eventosDelDia.otros.map(o => (
                <li key={'o'+o.id} className="mini-calendario-dia-item-otro"><strong>Otro</strong> {o.asunto || '—'}</li>
              ))}
            </ul>
          ) : (
            <p className="mini-calendario-dia-vacio">Sin audiencias, términos ni pendientes este día.</p>
          )}
          {canWrite && (
            <div className="mini-calendario-tipo-nuevo">
              <div className="mini-calendario-tipo-botones">
                {[
                  {key:'audiencia', label:'+ Audiencia'},
                  {key:'termino', label:'+ Término'},
                  {key:'pendiente', label:'+ Pendiente'},
                  {key:'otro', label:'+ Otro evento'},
                ].map(op => (
                  <button
                    key={op.key} type="button"
                    className={"mini-calendario-tipo-btn" + (tipoNuevo===op.key ? " active" : "")}
                    onClick={() => setTipoNuevo(t => t===op.key ? null : op.key)}
                  >{op.label}</button>
                ))}
              </div>
              {(tipoNuevo === 'audiencia' || tipoNuevo === 'termino') && (
                <div className="mini-calendario-form-embebido">
                  <FormularioNuevo
                    key={tipoNuevo + '-' + diaSeleccionado}
                    tipo={tipoNuevo === 'audiencia' ? 'audiencias' : 'terminos'}
                    procesos={procesos} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify}
                    onCrear={tipoNuevo === 'audiencia' ? onCrearAudiencia : onCrearTermino}
                    onCreateTipoTermino={tipoNuevo === 'termino' ? onCreateTipoTermino : undefined}
                    fechaInicial={diaSeleccionado}
                  />
                </div>
              )}
              {tipoNuevo === 'pendiente' && (
                <div className="mini-calendario-form-embebido">
                  <PendienteForm
                    key={'pendiente-' + diaSeleccionado}
                    inicial={{ FechaPendiente: diaSeleccionado }}
                    colaboradores={colaboradores} procesos={procesos}
                    onGuardar={guardarPendiente} onCancelar={() => setTipoNuevo(null)} guardando={guardandoTipado}
                  />
                </div>
              )}
              {tipoNuevo === 'otro' && (
                <>
                  <form onSubmit={handleAgregarEvento} className="mini-calendario-nuevo-evento">
                    <input
                      type="text" placeholder="Nombre del evento nuevo…" value={nombreEvento}
                      onChange={e => setNombreEvento(e.target.value)} disabled={!liveMode || guardando}
                    />
                    <input type="time" title="Hora de inicio" value={horaEvento} onChange={e => setHoraEvento(e.target.value)} disabled={!liveMode || guardando} />
                    {/* Hora de finalización (2026-09-22, pedido explícito del
                        usuario) — solo aplica con hora de inicio (sin hora es
                        un evento de día completo); por defecto, si se deja
                        vacía, sigue siendo 1 hora después del inicio como
                        siempre. */}
                    {horaEvento && (
                      <input type="time" title="Hora de finalización" value={horaFinEvento} onChange={e => setHoraFinEvento(e.target.value)} disabled={!liveMode || guardando} />
                    )}
                    <button type="submit" className="btn-secondary" disabled={!liveMode || guardando || !nombreEvento.trim()}>
                      {guardando ? "Guardando…" : "+ Agendar"}
                    </button>
                  </form>
                  {!liveMode && <p className="mini-calendario-dia-vacio">Programar un evento nuevo solo funciona conectado a SharePoint.</p>}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
