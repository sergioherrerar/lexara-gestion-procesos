import { useState, useMemo } from 'react';
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
// muestra abajo la lista resumida de Audiencias/Términos de ESE día
// ("Término" {Número Corto} / "Audiencia" {Número Corto}) y un formulario
// rápido para programar un evento NUEVO, distinto de Audiencias/Términos,
// directo en el calendario compartido de Outlook (nombre + fecha del día
// elegido + hora) — ver crearEventoCalendarioPersonalizado en
// useLexaraApp.js. Ese evento nuevo no queda representado por ningún punto
// acá (no hay ninguna lista propia de donde volver a leerlo sin conectarse
// de nuevo a Microsoft Graph), es de una sola vía.
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_SEMANA = ['D','L','M','X','J','V','S'];
const DIAS_LARGO = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

function soloFechaISO(v){ return String(v || "").slice(0, 10); }

// Junta Audiencias/Términos/Pendientes por fecha objetivo (ISO) ->
// {audiencias:[], terminos:[], pendientes:[]}. "Pendientes" agregado
// 2026-09-17 (pedido explícito del usuario) — a diferencia de las otras 2,
// se asocia por "Proceso" (r.Proceso, real ProcesoMD) que puede venir vacío
// (tarea suelta, sin proceso vinculado), así que ese cruce es opcional.
function eventosPorDia(audiencias, terminos, pendientes, procesos){
  const mapa = new Map();
  function agregar(registros, tipo, fechaDe, procesoDe){
    (registros||[]).forEach(r => {
      const fecha = fechaDe(r);
      if(!fecha) return;
      if(!mapa.has(fecha)) mapa.set(fecha, { audiencias:[], terminos:[], pendientes:[] });
      // String(...) (mismo bug real ya corregido en AudienciasTerminosTab.jsx):
      // en vivo r.Proceso puede llegar como número y p.id siempre es texto.
      const procesoId = procesoDe(r);
      const proceso = procesoId ? (procesos||[]).find(p => String(p.id) === String(procesoId)) || null : null;
      mapa.get(fecha)[tipo].push({ ...r, proceso });
    });
  }
  agregar(audiencias, 'audiencias', r => soloFechaISO(r.FechaAudiencia), r => r.Proceso);
  agregar(terminos, 'terminos', r => soloFechaISO(r.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(r.FechaNotificacion), r.DiasHabiles), r => r.Proceso);
  agregar(pendientes, 'pendientes', r => soloFechaISO(r.FechaPendiente), r => r.ProcesoMD);
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
  onCrearEventoPersonalizado, onCrearAudiencia, onCrearTermino, onCreateTipoTermino, onCrearPendiente,
  canWrite = true, notify,
}){
  const hoy = new Date();
  const [cursor, setCursor] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
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
  const eventos = useMemo(() => eventosPorDia(audiencias, terminos, pendientes, procesos), [audiencias, terminos, pendientes, procesos]);
  const festivos = festivosColombia(cursor.anio);
  const nombresFestivos = nombresFestivosColombia(cursor.anio);

  const primerDiaSemana = new Date(cursor.anio, cursor.mes, 1).getDay();
  const diasEnMes = new Date(cursor.anio, cursor.mes + 1, 0).getDate();
  const celdas = [];
  for(let i=0; i<primerDiaSemana; i++) celdas.push(null);
  for(let d=1; d<=diasEnMes; d++) celdas.push(d);

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
        {/* Festivo (pedido explícito del usuario 2026-09-17: "incluye color
            de festivos") — no es un punto (los festivos no tienen punto en
            el día, sombrean toda la celda), así que se representa con un
            cuadrito en vez de un círculo para no confundirlo con los otros 3. */}
        <span><span className="cuadrito cuadrito-festivo" /> Festivos</span>
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
          {DIAS_SEMANA.map((d,i) => <div key={i} className="mini-calendario-diasemana">{d}</div>)}
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
          ].filter(Boolean).join('\n\n');
          // Sombreado de la celda por tipo de evento (pedido explícito del
          // usuario 2026-09-17: "sombrea del color asi como los fectivos
          // audiencias terminos pendientes") — mismo tratamiento visual que
          // ya tenían los festivos (fondo suave + número en negrita de su
          // color), no solo el punto pequeño de abajo. Un festivo se ve
          // igual que siempre (su color es el festivo, no se mezcla); si un
          // día no es festivo pero tiene más de un tipo de evento, se
          // muestra el de mayor prioridad (Audiencia > Término > Pendiente).
          const tipoEvento = !esFestivo
            ? (ev?.audiencias?.length ? 'audiencia' : ev?.terminos?.length ? 'termino' : ev?.pendientes?.length ? 'pendiente' : null)
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
          {(eventosDelDia?.terminos?.length || eventosDelDia?.audiencias?.length || eventosDelDia?.pendientes?.length) ? (
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
