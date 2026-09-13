import { useState, useMemo } from 'react';
import { mensajeError, opcionesTiposAccionParaAlerta } from '../lib/graph';
import { diasHabilesRestantes, colorCuentaRegresiva, etiquetaCuentaRegresiva, sumarDiasHabilesJudiciales } from '../lib/audienciasTerminos';
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

const MODOS = [
  {key:'audiencias', label:'Audiencias'},
  {key:'terminos', label:'Términos'},
];

function FormularioNuevo({ tipo, procesos, tiposAccion, colaboradores, notify, onCrear }){
  const vacio = { numeroCorto:'', proceso:null, descripcion:'', fecha:'', hora:'', diasHabiles:'', abogado:'', link:'', observaciones:'' };
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);

  const procesoEncontrado = form.proceso ? (procesos||[]).find(p => p.id === form.proceso) : null;
  const tipoAccionProceso = procesoEncontrado?.TipoAccion || '';
  const opciones = useMemo(
    () => opcionesTiposAccionParaAlerta(tiposAccion, tipoAccionProceso, tipo === 'audiencias' ? 'Audiencia' : 'Termino'),
    [tiposAccion, tipoAccionProceso, tipo]
  );

  function buscarProceso(val){
    const matched = (procesos||[]).find(p => p.Radicado === val);
    setForm(prev => ({ ...prev, numeroCorto: val, proceso: matched ? matched.id : null, descripcion:'', diasHabiles:'' }));
  }
  function elegirDescripcion(desc){
    const fila = opciones.find(o => o.Descripcion === desc);
    setForm(prev => ({ ...prev, descripcion: desc, diasHabiles: tipo === 'terminos' ? String(fila?.Dias || prev.diasHabiles || '') : prev.diasHabiles }));
  }

  const vencimientoCalculado = tipo === 'terminos' && form.fecha && form.diasHabiles
    ? sumarDiasHabilesJudiciales(form.fecha, String(form.diasHabiles).replace(',', '.'))
    : '';

  async function handleAgregar(){
    if(!form.proceso){ notify?.("Escribe un Número Corto que exista para asociar el registro a un proceso.", 'error'); return; }
    if(!form.descripcion){ notify?.("Elige el tipo de " + (tipo==='audiencias' ? 'audiencia' : 'término') + ".", 'error'); return; }
    if(!form.fecha){ notify?.("Completa la fecha.", 'error'); return; }
    setGuardando(true);
    try{
      const payload = tipo === 'audiencias'
        ? { Proceso: form.proceso, Descripcion: form.descripcion, FechaAudiencia: form.fecha, HoraAudiencia: form.hora, Abogado: form.abogado, Link: form.link, Observaciones: form.observaciones }
        : { Proceso: form.proceso, Descripcion: form.descripcion, FechaNotificacion: form.fecha, DiasHabiles: form.diasHabiles, VencimientoTermino: vencimientoCalculado, Abogado: form.abogado, Link: form.link, Observaciones: form.observaciones };
      await onCrear?.(payload);
      setForm(vacio);
    }catch(err){ console.error(err); notify?.(mensajeError(err), 'error'); }
    finally{ setGuardando(false); }
  }

  return (
    <div style={{display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end', marginBottom:14}}>
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
      <div className="field" style={{minWidth:260}}>
        <label>{tipo === 'audiencias' ? 'Tipo de audiencia' : 'Tipo de término'}</label>
        <select value={form.descripcion} onChange={e => elegirDescripcion(e.target.value)} disabled={!procesoEncontrado}>
          <option value="">{procesoEncontrado ? (opciones.length ? "Selecciona…" : "Sin opciones para este Tipo de Acción") : "Primero busca el proceso"}</option>
          {opciones.map(o => <option value={o.Descripcion} key={o.id}>{o.Descripcion}</option>)}
        </select>
      </div>
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
      <div className="field" style={{minWidth:200}}>
        <label>Abogado responsable</label>
        <select value={form.abogado} onChange={e => setForm({...form, abogado: e.target.value})}>
          <option value="">Selecciona…</option>
          {(colaboradores||[]).filter(c => c.Activo !== false).map(c => <option value={c.Nombre} key={c.id}>{c.Nombre}</option>)}
        </select>
      </div>
      <IconTextButton icon="add" variant="primary" onClick={handleAgregar} disabled={guardando}>
        {guardando ? "Guardando…" : (tipo === 'audiencias' ? "Agregar audiencia" : "Agregar término")}
      </IconTextButton>
    </div>
  );
}

function TablaRegistros({ tipo, registros, procesos, notify, onEditar, onEliminar }){
  const [editandoId, setEditandoId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const filasConDatos = (registros||[]).map(r => {
    const proceso = (procesos||[]).find(p => p.id === r.Proceso) || null;
    const fechaObjetivo = tipo === 'audiencias'
      ? soloFechaISO(r.FechaAudiencia)
      : (soloFechaISO(r.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(r.FechaNotificacion), r.DiasHabiles));
    const restantes = fechaObjetivo ? diasHabilesRestantes(fechaObjetivo) : null;
    return { ...r, proceso, fechaObjetivo, restantes };
  }).sort((a,b) => String(a.fechaObjetivo||'').localeCompare(String(b.fechaObjetivo||'')));

  function empezarEdicion(r){
    setEditandoId(r.id);
    setEditDraft(tipo === 'audiencias'
      ? { Descripcion: r.Descripcion||'', FechaAudiencia: soloFechaISO(r.FechaAudiencia), HoraAudiencia: r.HoraAudiencia||'', Abogado: r.Abogado||'' }
      : { Descripcion: r.Descripcion||'', FechaNotificacion: soloFechaISO(r.FechaNotificacion), DiasHabiles: r.DiasHabiles||'', Abogado: r.Abogado||'' }
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

  const colSpanVacio = tipo === 'audiencias' ? 6 : 7;

  return (
    <div className="table-wrap">
      <table className="table-compact">
        <thead>
          <tr>
            <th>Proceso</th>
            <th>{tipo === 'audiencias' ? 'Tipo de audiencia' : 'Tipo de término'}</th>
            <th>{tipo === 'audiencias' ? 'Fecha' : 'Notificación'}</th>
            {tipo === 'audiencias' ? <th>Hora</th> : <th>Días hábiles</th>}
            {tipo === 'terminos' && <th>Vencimiento</th>}
            <th>Cuenta regresiva</th>
            <th>Abogado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filasConDatos.length ? filasConDatos.map(r => (
            editandoId === r.id ? (
              <tr key={r.id}>
                <td>{r.proceso?.Radicado || "—"}</td>
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
                <td><input type="text" value={editDraft.Abogado} onChange={e => setEditDraft({...editDraft, Abogado: e.target.value})} /></td>
                <td style={{display:'flex', gap:6}}>
                  <IconButton icon="checklist" variant="edit" label="Guardar" onClick={() => handleGuardarEdicion(r.id)} />
                  <button type="button" className="btn-secondary" onClick={() => setEditandoId(null)}>Cancelar</button>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>{r.proceso?.Radicado || "—"}{r.proceso?.Cliente ? <div className="save-hint">{r.proceso.Cliente}</div> : null}</td>
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
                <td>{r.Abogado || "—"}</td>
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

export default function AudienciasTerminosTab({ procesos, tiposAccion, colaboradores, audiencias, terminos, notify, onCrearAudiencia, onEditarAudiencia, onEliminarAudiencia, onCrearTermino, onEditarTermino, onEliminarTermino }){
  const [modo, setModo] = useState('audiencias');

  return (
    <div className="panel" style={{marginTop:20}}>
      <div className="panel-head"><h3>Audiencias Términos</h3></div>
      <div className="panel-body">
        <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
          Busca el proceso por su Número Corto (Radicado); la app trae su Tipo de Acción y filtra las opciones válidas de la lista Tipos de Acción. El contador (lunes a viernes, sin festivos de Colombia — los sábados nunca cuentan) se pinta verde con más de 5 días hábiles restantes, naranja de 2 a 5, rojo de 0 a 2, y gris cuando ya venció.
        </p>
        <div style={{display:'flex', gap:8, marginBottom:20}}>
          {MODOS.map(m => (
            <button key={m.key} type="button" className={"subtab" + (modo === m.key ? " active" : "")} onClick={() => setModo(m.key)}>{m.label}</button>
          ))}
        </div>
        <FormularioNuevo
          tipo={modo} procesos={procesos} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify}
          onCrear={modo === 'audiencias' ? onCrearAudiencia : onCrearTermino}
        />
        <TablaRegistros
          tipo={modo} registros={modo === 'audiencias' ? audiencias : terminos} procesos={procesos} notify={notify}
          onEditar={modo === 'audiencias' ? onEditarAudiencia : onEditarTermino}
          onEliminar={modo === 'audiencias' ? onEliminarAudiencia : onEliminarTermino}
        />
      </div>
    </div>
  );
}
