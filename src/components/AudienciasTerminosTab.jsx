import { useState, useMemo } from 'react';
import { mensajeError, opcionesTiposAccionParaAlerta, abogadosDisponibles } from '../lib/graph';
import { diasHabilesRestantes, colorCuentaRegresiva, etiquetaCuentaRegresiva, sumarDiasHabilesJudiciales } from '../lib/audienciasTerminos';
import { construirMensajeWhatsAppAudienciasTerminos } from '../lib/whatsappAudienciasTerminos';
import { generarAudienciasTerminosExcel } from '../lib/informeAudienciasTerminosExcel';
import IconButton, { IconTextButton } from './IconButton';

// Módulo "Audiencias Términos" (Informes > Procesos Judiciales, 2026-09-12) —
// pedido explícito del usuario para reemplazar el seguimiento manual que
// antes se llevaba en un formulario de Access. Se asocia a Procesos
// Judiciales por ID (igual que Desistimientos, ver [[project_desistimientos_data_model]]),
// y reutiliza la lista de referencia "Tipos de Acción" para armar un
// desplegable en cascada: Proceso (por Número Corto) -> su Tipo de Acción ->
// filas de Tipos de Acción con ese Tipo de Acción y con Tipo de Alerta
// "Audiencia"/"Termino" -> Descripción a elegir. El contador de días hábiles
// (lunes a viernes sin festivos colombianos, sábados NUNCA cuentan — ver
// lib/audienciasTerminos.js) se pinta con los mismos colores de badge que ya
// usa el resto de la app (verde/naranja/rojo/gris).
function soloFechaISO(v){ return String(v || "").slice(0, 10); }
// abogadosDisponibles (solo colaboradores activos con cargo de abogado) se
// movió a lib/graph.js 2026-09-21 para reusarla también en Tutelas y
// Procesos judiciales — ver nota grande ahí.

// Orden de la tabla — pedido explícito del usuario 2026-09-15: "que en la
// parte superior esté el próximo a vencer". Antes se ordenaba por la fecha
// tal cual (texto), así que un registro sin fecha (fila incompleta, "—")
// quedaba primero y uno vencido hace tiempo quedaba ARRIBA de uno que
// realmente falta poco por vencer — con días hábiles restantes como
// prioridad: lo pendiente más próximo va primero, lo vencido va después
// (lo vencido hace menos tiempo antes que lo vencido hace más tiempo), y las
// filas sin fecha (dato incompleto en SharePoint) van al final de todas.
function ordenPrioridad(restantes){
  if(restantes == null) return Infinity;
  if(restantes < 0) return 100000 + Math.abs(restantes);
  return restantes;
}

const MODOS = [
  {key:'audiencias', label:'Audiencias'},
  {key:'terminos', label:'Términos'},
];

// `procesoFijo` (agregado 2026-09-13, pedido explícito del usuario: "dentro
// de cada proceso debe quedar las audiencias y los términos") — cuando este
// formulario se usa DESDE el panel de un Proceso judicial en concreto (ver
// AudienciasTerminosDelProceso más abajo), ya se sabe cuál es el proceso, así
// que se salta el paso de buscarlo por Número Corto.
const NUEVO_TIPO_SENTINEL = '__nuevo_tipo_termino__';

// `fechaInicial` (2026-09-22, pedido explícito del usuario: "al momento de
// dar clic en el día [del mini calendario], agreguemos una audiencia [o] un
// término") — cuando este formulario se abre desde el panel de un día ya
// elegido en el mini calendario, se precarga esa fecha en vez de dejarla
// vacía; el usuario igual puede cambiarla.
export function FormularioNuevo({ tipo, procesos, tiposAccion, colaboradores, notify, onCrear, procesoFijo, onCreateTipoTermino, fechaInicial }){
  const vacio = { numeroCorto:'', proceso: procesoFijo ? procesoFijo.id : null, descripcion:'', fecha: fechaInicial || '', hora:'', diasHabiles:'', abogado:'' };
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  // "Agregar tipo de término personalizado" (2026-09-22, pedido explícito del
  // usuario: "agregar uno personal que yo coloque... que se llene a la lista
  // SharePoint Tipos de Acción... y quede actualizado en las listas
  // desplegables de términos"). Solo para Términos (no se pidió para
  // Audiencias) — se elige la última opción del select ("+ Agregar...") y se
  // revela un mini-formulario (nombre + días) que crea una fila nueva en la
  // lista de referencia "Tipos de Acción" (mismo Tipo de Acción del proceso
  // actual, TipoAlerta="Termino") y de una vez la deja seleccionada acá.
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState('');
  const [nuevoTipoDias, setNuevoTipoDias] = useState('');
  const [creandoTipo, setCreandoTipo] = useState(false);

  const procesoEncontrado = procesoFijo || (form.proceso ? (procesos||[]).find(p => p.id === form.proceso) : null);
  const tipoAccionProceso = procesoEncontrado?.TipoAccion || '';
  const opciones = useMemo(
    () => opcionesTiposAccionParaAlerta(tiposAccion, tipoAccionProceso, tipo === 'audiencias' ? 'Audiencia' : 'Termino'),
    [tiposAccion, tipoAccionProceso, tipo]
  );
  const mostrandoNuevoTipo = form.descripcion === NUEVO_TIPO_SENTINEL;

  function buscarProceso(val){
    const matched = (procesos||[]).find(p => p.Radicado === val);
    setForm(prev => ({ ...prev, numeroCorto: val, proceso: matched ? matched.id : null, descripcion:'', diasHabiles:'' }));
    setNuevoTipoNombre(''); setNuevoTipoDias('');
  }
  function elegirDescripcion(desc){
    if(desc === NUEVO_TIPO_SENTINEL){
      setForm(prev => ({ ...prev, descripcion: desc, diasHabiles:'' }));
      return;
    }
    const fila = opciones.find(o => o.Descripcion === desc);
    setForm(prev => ({ ...prev, descripcion: desc, diasHabiles: tipo === 'terminos' ? String(fila?.Dias || prev.diasHabiles || '') : prev.diasHabiles }));
  }
  async function handleCrearTipoTermino(){
    if(!nuevoTipoNombre.trim()){ notify?.("Escribe el nombre del nuevo tipo de término.", 'error'); return; }
    setCreandoTipo(true);
    try{
      const creado = await onCreateTipoTermino?.({ tipoAccion: tipoAccionProceso, descripcion: nuevoTipoNombre.trim(), dias: nuevoTipoDias });
      if(creado){
        setForm(prev => ({ ...prev, descripcion: creado.Descripcion, diasHabiles: String(creado.Dias || nuevoTipoDias || '') }));
        setNuevoTipoNombre(''); setNuevoTipoDias('');
      }
    }catch(err){ console.error(err); notify?.(mensajeError(err), 'error'); }
    finally{ setCreandoTipo(false); }
  }

  const vencimientoCalculado = tipo === 'terminos' && form.fecha && form.diasHabiles
    ? sumarDiasHabilesJudiciales(form.fecha, String(form.diasHabiles).replace(',', '.'))
    : '';

  async function handleAgregar(){
    if(!form.proceso){ notify?.("Escribe un Número Corto que exista para asociar el registro a un proceso.", 'error'); return; }
    if(!form.descripcion || form.descripcion === NUEVO_TIPO_SENTINEL){ notify?.("Elige (o termina de crear) el tipo de " + (tipo==='audiencias' ? 'audiencia' : 'término') + ".", 'error'); return; }
    if(!form.fecha){ notify?.("Completa la fecha.", 'error'); return; }
    setGuardando(true);
    try{
      // "Terminos" no tiene columnas reales de Abogado/Link/Observaciones
      // (confirmado por el usuario 2026-09-15 contra la lista real de
      // SharePoint) — solo "Audiencia" tiene Abogado (y Link, sin UI propia
      // todavía).
      const payload = tipo === 'audiencias'
        ? { Proceso: form.proceso, Descripcion: form.descripcion, FechaAudiencia: form.fecha, HoraAudiencia: form.hora, Abogado: form.abogado }
        : { Proceso: form.proceso, Descripcion: form.descripcion, FechaNotificacion: form.fecha, DiasHabiles: form.diasHabiles, VencimientoTermino: vencimientoCalculado };
      await onCrear?.(payload);
      setForm(vacio);
    }catch(err){ console.error(err); notify?.(mensajeError(err), 'error'); }
    finally{ setGuardando(false); }
  }

  return (
    <div style={{display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end', marginBottom:14}}>
      {!procesoFijo && (
        <div className="field" style={{minWidth:230}}>
          <label>Número Corto (Radicado)</label>
          <input type="text" list="datalist-audiencias-terminos" value={form.numeroCorto} onChange={e => buscarProceso(e.target.value)} placeholder="Escribe para buscar…" />
          <datalist id="datalist-audiencias-terminos">
            {(procesos||[]).filter(p => p.Radicado).map(p => <option value={p.Radicado} key={p.id} />)}
          </datalist>
          {form.numeroCorto && !procesoEncontrado && (
            <div className="field-warning">Este número corto no coincide con ningún proceso registrado.</div>
          )}
          {procesoEncontrado && (
            <div className="field-info">Cliente: {procesoEncontrado.Cliente || "—"} · Tipo de Acción: {tipoAccionProceso || "sin definir"}</div>
          )}
        </div>
      )}
      {procesoFijo && (
        <div className="field-info" style={{minWidth:220, alignSelf:'center'}}>Tipo de Acción: {tipoAccionProceso || "sin definir"}</div>
      )}
      <div className="field" style={{minWidth:260}}>
        <label>{tipo === 'audiencias' ? 'Tipo de audiencia' : 'Tipo de término'}</label>
        <select value={form.descripcion} onChange={e => elegirDescripcion(e.target.value)} disabled={!procesoEncontrado}>
          <option value="">{procesoEncontrado ? (opciones.length ? "Selecciona…" : "Sin opciones para este Tipo de Acción") : "Primero busca el proceso"}</option>
          {opciones.map(o => <option value={o.Descripcion} key={o.id}>{o.Descripcion}</option>)}
          {tipo === 'terminos' && onCreateTipoTermino && <option value={NUEVO_TIPO_SENTINEL}>+ Agregar tipo de término nuevo…</option>}
        </select>
      </div>
      {mostrandoNuevoTipo && (
        <div className="field" style={{minWidth:340, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap', padding:10, borderRadius:8, background:'var(--gris-claro)'}}>
          <div className="field" style={{minWidth:180}}>
            <label>Nombre del tipo de término</label>
            <input type="text" value={nuevoTipoNombre} onChange={e => setNuevoTipoNombre(e.target.value)} placeholder="Ej. Contestación demanda" />
          </div>
          <div className="field" style={{minWidth:90}}>
            <label>Días (por defecto)</label>
            <input type="text" inputMode="decimal" value={nuevoTipoDias} onChange={e => setNuevoTipoDias(e.target.value)} />
          </div>
          <IconTextButton icon="add" variant="primary" onClick={handleCrearTipoTermino} disabled={creandoTipo}>
            {creandoTipo ? "Creando…" : "Crear y usar"}
          </IconTextButton>
          <button type="button" className="btn-secondary" onClick={() => { setForm(prev => ({...prev, descripcion:'', diasHabiles:''})); setNuevoTipoNombre(''); setNuevoTipoDias(''); }}>Cancelar</button>
        </div>
      )}
      <div className="field" style={{minWidth:160}}>
        <label>{tipo === 'audiencias' ? 'Fecha de la audiencia' : 'Fecha de notificación'}</label>
        <input type="date" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} />
      </div>
      {tipo === 'audiencias' ? (
        <div className="field" style={{minWidth:110}}>
          <label>Hora</label>
          <input type="time" value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} />
        </div>
      ) : (
        <>
          <div className="field" style={{minWidth:110}}>
            <label>Días hábiles</label>
            <input type="text" inputMode="decimal" value={form.diasHabiles} onChange={e => setForm({...form, diasHabiles: e.target.value})} />
          </div>
          <div className="field" style={{minWidth:150}}>
            <label>Vencimiento (calculado)</label>
            <input type="text" value={vencimientoCalculado || "—"} readOnly disabled />
          </div>
        </>
      )}
      {tipo === 'audiencias' && (
        <div className="field" style={{minWidth:200}}>
          <label>Abogado responsable</label>
          <select value={form.abogado} onChange={e => setForm({...form, abogado: e.target.value})}>
            <option value="">Selecciona…</option>
            {abogadosDisponibles(colaboradores).map(c => <option value={c.Nombre} key={c.id}>{c.Nombre}</option>)}
          </select>
        </div>
      )}
      <IconTextButton icon="add" variant="primary" onClick={handleAgregar} disabled={guardando}>
        {guardando ? "Guardando…" : (tipo === 'audiencias' ? "Agregar audiencia" : "Agregar término")}
      </IconTextButton>
    </div>
  );
}

// `ocultarProceso` (2026-09-13) — la columna "Proceso" sobra cuando esta
// tabla se muestra DENTRO del panel de ese mismo proceso (ver
// AudienciasTerminosDelProceso más abajo).
export function TablaRegistros({ tipo, registros, procesos, colaboradores, notify, onEditar, onEliminar, ocultarProceso }){
  const [editandoId, setEditandoId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const filasConDatos = (registros||[]).map(r => {
    // String(...) (2026-09-15, mismo bug real que en el asunto del evento de
    // calendario): en vivo r.Proceso puede llegar como número y p.id siempre
    // es texto — sin esto la búsqueda fallaba en silencio.
    const proceso = (procesos||[]).find(p => String(p.id) === String(r.Proceso)) || null;
    const fechaObjetivo = tipo === 'audiencias'
      ? soloFechaISO(r.FechaAudiencia)
      : (soloFechaISO(r.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(r.FechaNotificacion), r.DiasHabiles));
    const restantes = fechaObjetivo ? diasHabilesRestantes(fechaObjetivo) : null;
    return { ...r, proceso, fechaObjetivo, restantes };
  }).sort((a,b) => ordenPrioridad(a.restantes) - ordenPrioridad(b.restantes));

  function empezarEdicion(r){
    setEditandoId(r.id);
    setEditDraft(tipo === 'audiencias'
      ? { Descripcion: r.Descripcion||'', FechaAudiencia: soloFechaISO(r.FechaAudiencia), HoraAudiencia: r.HoraAudiencia||'', Abogado: r.Abogado||'' }
      // "Terminos" no tiene columna real de Abogado (confirmado 2026-09-15).
      : { Descripcion: r.Descripcion||'', FechaNotificacion: soloFechaISO(r.FechaNotificacion), DiasHabiles: r.DiasHabiles||'' }
    );
  }
  async function handleGuardarEdicion(id){
    try{
      const updates = tipo === 'terminos'
        ? { ...editDraft, VencimientoTermino: sumarDiasHabilesJudiciales(editDraft.FechaNotificacion, String(editDraft.DiasHabiles).replace(',', '.')) }
        : editDraft;
      await onEditar?.(id, updates);
      setEditandoId(null);
    }catch(err){ console.error(err); notify?.(mensajeError(err), 'error'); }
  }

  // "Terminos" no tiene columna real de Abogado (confirmado 2026-09-15) — la
  // columna/celda solo aparece para Audiencias.
  const colSpanVacio = (ocultarProceso ? 0 : 1) + 6;

  return (
    <div className="table-wrap">
      <table className="table-compact">
        <thead>
          <tr>
            {!ocultarProceso && <th>Proceso</th>}
            <th>{tipo === 'audiencias' ? 'Tipo de audiencia' : 'Tipo de término'}</th>
            <th>{tipo === 'audiencias' ? 'Fecha' : 'Notificación'}</th>
            {tipo === 'audiencias' ? <th>Hora</th> : <th>Días hábiles</th>}
            {tipo === 'terminos' && <th>Vencimiento</th>}
            <th>Cuenta regresiva</th>
            {tipo === 'audiencias' && <th>Abogado</th>}
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filasConDatos.length ? filasConDatos.map(r => (
            editandoId === r.id ? (
              <tr key={r.id}>
                {!ocultarProceso && <td>{r.proceso?.Radicado || "—"}</td>}
                <td><input type="text" value={editDraft.Descripcion} onChange={e => setEditDraft({...editDraft, Descripcion: e.target.value})} /></td>
                {tipo === 'audiencias' ? (
                  <>
                    <td><input type="date" value={editDraft.FechaAudiencia} onChange={e => setEditDraft({...editDraft, FechaAudiencia: e.target.value})} /></td>
                    <td><input type="time" value={editDraft.HoraAudiencia} onChange={e => setEditDraft({...editDraft, HoraAudiencia: e.target.value})} /></td>
                  </>
                ) : (
                  <>
                    <td><input type="date" value={editDraft.FechaNotificacion} onChange={e => setEditDraft({...editDraft, FechaNotificacion: e.target.value})} /></td>
                    <td><input type="text" inputMode="decimal" style={{width:70}} value={editDraft.DiasHabiles} onChange={e => setEditDraft({...editDraft, DiasHabiles: e.target.value})} /></td>
                    <td>{sumarDiasHabilesJudiciales(editDraft.FechaNotificacion, String(editDraft.DiasHabiles).replace(',', '.')) || "—"}</td>
                  </>
                )}
                <td>—</td>
                {tipo === 'audiencias' && (
                  <td>
                    <select value={editDraft.Abogado} onChange={e => setEditDraft({...editDraft, Abogado: e.target.value})}>
                      <option value="">Selecciona…</option>
                      {/* Si el valor ya guardado no está en la lista filtrada (registro
                          viejo, o el colaborador ya no tiene "abogado" en su Cargo), se
                          agrega igual como opción para no perderlo de vista al editar. */}
                      {editDraft.Abogado && !abogadosDisponibles(colaboradores).some(c => c.Nombre === editDraft.Abogado) && (
                        <option value={editDraft.Abogado}>{editDraft.Abogado}</option>
                      )}
                      {abogadosDisponibles(colaboradores).map(c => <option value={c.Nombre} key={c.id}>{c.Nombre}</option>)}
                    </select>
                  </td>
                )}
                <td style={{display:'flex', gap:6}}>
                  <IconButton icon="checklist" variant="edit" label="Guardar" onClick={() => handleGuardarEdicion(r.id)} />
                  <button type="button" className="btn-secondary" onClick={() => setEditandoId(null)}>Cancelar</button>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                {!ocultarProceso && <td>{r.proceso?.Radicado || "—"}{r.proceso?.Cliente ? <div className="save-hint">{r.proceso.Cliente}</div> : null}</td>}
                <td>{r.Descripcion || "—"}</td>
                {tipo === 'audiencias' ? (
                  <>
                    <td>{soloFechaISO(r.FechaAudiencia) || "—"}</td>
                    <td>{r.HoraAudiencia || "—"}</td>
                  </>
                ) : (
                  <>
                    <td>{soloFechaISO(r.FechaNotificacion) || "—"}</td>
                    <td>{r.DiasHabiles || "—"}</td>
                    <td>{r.fechaObjetivo || "—"}</td>
                  </>
                )}
                <td><span className={"badge badge-" + colorCuentaRegresiva(r.restantes)}>{etiquetaCuentaRegresiva(r.restantes)}</span></td>
                {tipo === 'audiencias' && <td>{r.Abogado || "—"}</td>}
                <td style={{display:'flex', gap:6}}>
                  <IconButton icon="edit" variant="edit" label="Editar" onClick={() => empezarEdicion(r)} />
                  <IconButton icon="delete" variant="delete" label="Eliminar" onClick={() => onEliminar?.(r.id)} />
                </td>
              </tr>
            )
          )) : (
            <tr><td colSpan={colSpanVacio}><div className="empty-state empty-state-compact">Todavía no hay {tipo === 'audiencias' ? 'audiencias' : 'términos'} registrados.</div></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Resumen "3 más próximos a vencer" (pedido explícito del usuario 2026-09-15,
// mirando una captura de las badges estáticas de Tutelas: "coloca un mensaje
// asi como el tutelas que discrimine los tres mas cercanos por vencerse de
// terminos y audiencias colocando el numero corto y cliente") — junta
// Audiencias y Términos en una sola lista, calcula la misma fecha objetivo y
// días hábiles restantes que ya usa TablaRegistros, descarta lo vencido y lo
// sin fecha, y deja solo los 3 más urgentes.
// Exportado también (además del componente) para que ProcesosView.jsx pueda
// decidir su layout (grid 70/30 vs. una sola columna) según si en verdad hay
// algo que mostrar, sin duplicar este cálculo.
export function proximosAVencer(audiencias, terminos, procesos){
  const audienciasConTipo = (audiencias||[]).map(r => ({ ...r, tipoRegistro:'audiencias' }));
  const terminosConTipo = (terminos||[]).map(r => ({ ...r, tipoRegistro:'terminos' }));
  return [...audienciasConTipo, ...terminosConTipo]
    .map(r => {
      const proceso = (procesos||[]).find(p => String(p.id) === String(r.Proceso)) || null;
      const fechaObjetivo = r.tipoRegistro === 'audiencias'
        ? soloFechaISO(r.FechaAudiencia)
        : (soloFechaISO(r.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(r.FechaNotificacion), r.DiasHabiles));
      const restantes = fechaObjetivo ? diasHabilesRestantes(fechaObjetivo) : null;
      return { ...r, proceso, restantes };
    })
    .filter(r => r.restantes != null && r.restantes >= 0)
    .sort((a,b) => a.restantes - b.restantes)
    .slice(0, 3);
}

// Exportado (2026-09-15, pedido explícito del usuario: "este mensaje también
// déjalo viviendo acá / dentro de procesos judiciales y en informes") para
// reusarlo tal cual en ProcesosView.jsx, sin duplicar la lógica.
export function ResumenAudienciasTerminos({ audiencias, terminos, procesos, style }){
  const masUrgentes = useMemo(() => proximosAVencer(audiencias, terminos, procesos), [audiencias, terminos, procesos]);
  // Si no hay nada pendiente por vencer (todo vencido o no hay registros), no
  // se muestra ningún mensaje — pedido explícito del usuario 2026-09-15: "si
  // todo esta vencido no muestre nada" (antes salía un badge gris avisando
  // que no había nada pendiente).
  if(!masUrgentes.length) return null;
  return (
    <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, ...style}}>
      {masUrgentes.map(r => (
        <span key={r.tipoRegistro + '-' + r.id} className={"badge badge-" + colorCuentaRegresiva(r.restantes)} style={{fontSize:13, padding:'8px 14px'}}>
          {r.tipoRegistro === 'audiencias' ? 'Audiencia' : 'Término'} · {r.proceso?.Radicado || "—"}{r.proceso?.Cliente ? (" · " + r.proceso.Cliente) : ""} · {etiquetaCuentaRegresiva(r.restantes)}
        </span>
      ))}
    </div>
  );
}

export default function AudienciasTerminosTab({ procesos, tiposAccion, colaboradores, audiencias, terminos, notify, onCrearAudiencia, onEditarAudiencia, onEliminarAudiencia, onCrearTermino, onEditarTermino, onEliminarTermino, onCreateTipoTermino }){
  const [modo, setModo] = useState('audiencias');
  const [generandoExcel, setGenerandoExcel] = useState(false);

  // "Compartir por WhatsApp" (pedido explícito del usuario 2026-09-15) — abre
  // WhatsApp con el listado de lo que vence en los próximos 5 días hábiles
  // (contados desde ahora mismo) ya redactado; el usuario elige a quién
  // mandárselo desde su propio WhatsApp (ver whatsappAudienciasTerminos.js).
  function handleCompartirWhatsApp(){
    const mensaje = construirMensajeWhatsAppAudienciasTerminos(audiencias, terminos, procesos);
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
  }
  // Excel de Audiencias/Términos agrupado por Número Corto (pedido explícito
  // del usuario 2026-09-15) — ver informeAudienciasTerminosExcel.js.
  async function handleGenerarExcel(){
    setGenerandoExcel(true);
    try{ await generarAudienciasTerminosExcel(audiencias, terminos, procesos); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel: " + mensajeError(err), 'error'); }
    finally { setGenerandoExcel(false); }
  }

  return (
    <div className="panel" style={{marginTop:20}}>
      <div className="panel-head" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <h3>Audiencias Términos</h3>
        <div style={{display:'flex', gap:6}}>
          <IconButton icon="excel" variant="excel" label="Descargar Excel agrupado por Número Corto" spinning={generandoExcel} onClick={handleGenerarExcel} />
          <IconButton icon="whatsapp" variant="whatsapp" label="Compartir por WhatsApp (próximos 5 días hábiles)" onClick={handleCompartirWhatsApp} />
        </div>
      </div>
      <div className="panel-body">
        <ResumenAudienciasTerminos audiencias={audiencias} terminos={terminos} procesos={procesos} />
        <div style={{display:'flex', gap:8, marginBottom:20}}>
          {MODOS.map(m => (
            <button key={m.key} type="button" className={"subtab" + (modo === m.key ? " active" : "")} onClick={() => setModo(m.key)}>{m.label}</button>
          ))}
        </div>
        <FormularioNuevo
          tipo={modo} procesos={procesos} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify}
          onCrear={modo === 'audiencias' ? onCrearAudiencia : onCrearTermino}
          onCreateTipoTermino={onCreateTipoTermino}
        />
        <TablaRegistros
          tipo={modo} registros={modo === 'audiencias' ? audiencias : terminos} procesos={procesos} colaboradores={colaboradores} notify={notify}
          onEditar={modo === 'audiencias' ? onEditarAudiencia : onEditarTermino}
          onEliminar={modo === 'audiencias' ? onEliminarAudiencia : onEliminarTermino}
        />
      </div>
    </div>
  );
}

// Vista embebida dentro del panel de un Proceso judicial en concreto (pestaña
// "Audiencias/Términos" de ProcesoDrawer.jsx) — pedido explícito del usuario
// 2026-09-13: "dentro de procesos judiciales en cada proceso debe quedar las
// audiencias y los términos, por eso las relaciones". Muestra SOLO las
// audiencias/términos de ESE proceso (ya filtradas por el llamador con
// audienciasForProceso/terminosForProceso, ver graph.js) y, al crear una
// nueva, ya no hay que buscar el proceso — se usa directo el que está abierto.
export function AudienciasTerminosDelProceso({ proceso, procesos, tiposAccion, colaboradores, audiencias, terminos, notify, onCrearAudiencia, onEditarAudiencia, onEliminarAudiencia, onCrearTermino, onEditarTermino, onEliminarTermino, onCreateTipoTermino }){
  const [modo, setModo] = useState('audiencias');
  return (
    <div>
      <div style={{display:'flex', gap:8, marginBottom:16}}>
        {MODOS.map(m => (
          <button key={m.key} type="button" className={"subtab" + (modo === m.key ? " active" : "")} onClick={() => setModo(m.key)}>{m.label}</button>
        ))}
      </div>
      <FormularioNuevo
        tipo={modo} procesos={procesos} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify}
        procesoFijo={proceso}
        onCrear={modo === 'audiencias' ? onCrearAudiencia : onCrearTermino}
        onCreateTipoTermino={onCreateTipoTermino}
      />
      <TablaRegistros
        tipo={modo} registros={modo === 'audiencias' ? audiencias : terminos} procesos={procesos} colaboradores={colaboradores} notify={notify}
        ocultarProceso
        onEditar={modo === 'audiencias' ? onEditarAudiencia : onEditarTermino}
        onEliminar={modo === 'audiencias' ? onEliminarAudiencia : onEliminarTermino}
      />
    </div>
  );
}
