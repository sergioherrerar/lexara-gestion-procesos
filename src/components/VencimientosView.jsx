import { useState, useMemo } from 'react';
import { FormularioNuevo, TablaRegistros } from './AudienciasTerminosTab';
import { PendientesSection } from './PendientesSection';
import { sumarDiasHabilesJudiciales, diasHabilesRestantes, colorCuentaRegresiva, etiquetaCuentaRegresiva } from '../lib/audienciasTerminos';
import { fmtDate } from '../lib/graph';

// Módulo "Vencimientos" (2026-09-17, pedido explícito del usuario: "que tal
// si creamos un nuevo modulo llamado vencimientos en el cual esté audiencias
// termino pendientes") — junta las 3 listas de "lo que hay que hacer y para
// cuándo" en un solo lugar del portal, en vez de tenerlas repartidas (antes
// Audiencias/Términos vivían dentro de Informes > Procesos Judiciales, ver
// CHANGELOG). Reusa tal cual los mismos componentes de formulario/tabla que
// ya existían — no se duplica ninguna lógica de negocio, solo cambia dónde
// viven dentro del portal.
const SUB_TABS = [
  {key:'todos', label:'Todos'},
  {key:'audiencias', label:'Audiencias'},
  {key:'terminos', label:'Términos'},
  {key:'pendientes', label:'Pendientes'},
];

function soloFechaISO(v){ return String(v || "").slice(0, 10); }

// Lunes a domingo de la semana que contiene "hoy" — pedido explícito del
// usuario 2026-09-18: un vistazo rápido de lo que vence esta semana en los
// 3 tipos juntos, sin depender del filtro de columna que Pendientes sí tiene
// pero Audiencias/Términos no ("por que pendientes se puede filtrar y
// audiencias y terminos no").
function limitesSemanaActual(){
  const hoy = new Date();
  const dia = hoy.getDay(); // 0=domingo .. 6=sábado
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + (dia === 0 ? -6 : 1 - dia));
  lunes.setHours(0,0,0,0);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23,59,59,999);
  return { lunes, domingo };
}
function enSemana(fechaISO, lunes, domingo){
  if(!fechaISO) return false;
  const [y,m,d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m-1, d);
  return fecha >= lunes && fecha <= domingo;
}

function VencimientosSemana({ audiencias, terminos, pendientes, procesos }){
  const { lunes, domingo } = limitesSemanaActual();
  const procesoDe = id => (procesos||[]).find(p => String(p.id) === String(id));

  const audienciasSemana = (audiencias||[])
    .filter(a => enSemana(soloFechaISO(a.FechaAudiencia), lunes, domingo))
    .map(a => ({ ...a, proceso: procesoDe(a.Proceso) }))
    .sort((a,b) => String(a.FechaAudiencia||"").localeCompare(String(b.FechaAudiencia||"")));
  const terminosSemana = (terminos||[])
    .map(t => ({ ...t, vencimiento: soloFechaISO(t.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(t.FechaNotificacion), t.DiasHabiles) }))
    .filter(t => enSemana(t.vencimiento, lunes, domingo))
    .map(t => ({ ...t, proceso: procesoDe(t.Proceso) }))
    .sort((a,b) => String(a.vencimiento||"").localeCompare(String(b.vencimiento||"")));
  const pendientesSemana = (pendientes||[])
    .filter(p => enSemana(soloFechaISO(p.FechaPendiente), lunes, domingo))
    .sort((a,b) => String(a.FechaPendiente||"").localeCompare(String(b.FechaPendiente||"")));

  if(!audienciasSemana.length && !terminosSemana.length && !pendientesSemana.length){
    return (
      <div className="panel" style={{marginBottom:20}}>
        <div className="panel-body" style={{padding:'14px 20px'}}>
          <p className="empty-state empty-state-compact" style={{margin:0}}>Nada vence esta semana.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{marginBottom:20}}>
      <div className="panel-head"><h3>Vencimientos de esta semana</h3></div>
      <div className="panel-body" style={{padding:'14px 20px', display:'flex', flexWrap:'wrap', gap:24}}>
        {audienciasSemana.length > 0 && (
          <div className="vencimientos-semana-audiencia" style={{flex:'1 1 260px', minWidth:0}}>
            <p className="save-hint semana-tipo-titulo" style={{margin:'0 0 8px', fontWeight:600}}>Audiencias</p>
            <div className="table-wrap">
              <table className="table-compact">
                <thead><tr><th>Número Corto</th><th>Tipo de audiencia</th><th>Fecha</th></tr></thead>
                <tbody>
                  {audienciasSemana.map(a => (
                    <tr key={a.id}><td>{a.proceso?.Radicado || "—"}</td><td>{a.Descripcion || "—"}</td><td>{fmtDate(a.FechaAudiencia)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {terminosSemana.length > 0 && (
          <div className="vencimientos-semana-termino" style={{flex:'1 1 260px', minWidth:0}}>
            <p className="save-hint semana-tipo-titulo" style={{margin:'0 0 8px', fontWeight:600}}>Términos</p>
            <div className="table-wrap">
              <table className="table-compact">
                <thead><tr><th>Número Corto</th><th>Tipo de término</th><th>Vencimiento</th></tr></thead>
                <tbody>
                  {terminosSemana.map(t => (
                    <tr key={t.id}><td>{t.proceso?.Radicado || "—"}</td><td>{t.Descripcion || "—"}</td><td>{fmtDate(t.vencimiento)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {pendientesSemana.length > 0 && (
          <div className="vencimientos-semana-pendiente" style={{flex:'1 1 260px', minWidth:0}}>
            <p className="save-hint semana-tipo-titulo" style={{margin:'0 0 8px', fontWeight:600}}>Pendientes</p>
            <div className="table-wrap">
              <table className="table-compact">
                <thead><tr><th>Pendiente</th><th>Para</th><th>Fecha</th></tr></thead>
                <tbody>
                  {pendientesSemana.map(p => (
                    <tr key={p.id}><td>{p.Pendiente || "—"}</td><td>{p.PendientePara || "—"}</td><td>{fmtDate(p.FechaPendiente)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Pestaña "Todos" (2026-10-05, pedido explícito del usuario: una pestaña
// "todos" que al entrar a Vencimientos muestre una lista de todo ordenado por
// fecha de vencimiento y, al lado, a qué pestaña pertenece cada uno) — junta
// Audiencias, Términos y Pendientes en una sola lista por fecha. Es solo de
// consulta: el tipo de cada fila es un botón que lleva a su pestaña, donde se
// edita/elimina (reusa los mismos componentes, sin duplicar lógica).
const TIPOS = {
  audiencias: { label:'Audiencia', plural:'Audiencias', cls:'badge-tipo-audiencia' },
  terminos:   { label:'Término',   plural:'Términos',   cls:'badge-tipo-termino' },
  pendientes: { label:'Pendiente', plural:'Pendientes', cls:'badge-tipo-pendiente' },
};
function hoyISOLocal(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function TodosVencimientos({ audiencias, terminos, pendientes, procesos, onIrATab }){
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [verVencidos, setVerVencidos] = useState(false);
  const hoy = hoyISOLocal();

  const filas = useMemo(() => {
    const procesoPorId = new Map((procesos||[]).map(p => [String(p.id), p]));
    const lista = [];
    (audiencias||[]).forEach(a => {
      lista.push({ clave:'a'+a.id, tipo:'audiencias', fecha:soloFechaISO(a.FechaAudiencia), hora:a.HoraAudiencia||'', texto:a.Descripcion||'', responsable:a.Abogado||'', proceso:procesoPorId.get(String(a.Proceso))||null, terminado:false });
    });
    (terminos||[]).forEach(t => {
      const fecha = soloFechaISO(t.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(t.FechaNotificacion), t.DiasHabiles) || '';
      lista.push({ clave:'t'+t.id, tipo:'terminos', fecha, hora:'', texto:t.Descripcion||'', responsable:'', proceso:procesoPorId.get(String(t.Proceso))||null, terminado:false });
    });
    (pendientes||[]).forEach(p => {
      lista.push({ clave:'p'+p.id, tipo:'pendientes', fecha:soloFechaISO(p.FechaPendiente), hora:'', texto:p.Pendiente||'', responsable:p.PendientePara||'', proceso:procesoPorId.get(String(p.Proceso))||null, terminado:p.Estado==='Terminado', observacion:p.Observacion||'' });
    });
    return lista;
  }, [audiencias, terminos, pendientes, procesos]);

  // "Vencido" = fecha anterior a hoy, o un pendiente ya Terminado. Se ocultan
  // por defecto para que lo próximo quede arriba (con años de registros, lo
  // viejo enterraría lo que sí hay que atender); el interruptor los muestra.
  const esVencida = f => f.terminado || (f.fecha && f.fecha < hoy);
  const delTipo = filas.filter(f => filtroTipo==='todos' || f.tipo===filtroTipo);
  const vigentes = delTipo.filter(f => !esVencida(f));
  const visibles = (verVencidos ? delTipo : vigentes)
    .slice()
    .sort((a,b) => {
      if(!a.fecha && !b.fecha) return 0;
      if(!a.fecha) return 1;   // sin fecha, al final
      if(!b.fecha) return -1;
      return a.fecha.localeCompare(b.fecha) || (a.hora||'').localeCompare(b.hora||'');
    });
  const ocultos = delTipo.length - vigentes.length;
  const conteo = tipo => filas.filter(f => f.tipo===tipo && !esVencida(f)).length;

  function cuentaRegresiva(f){
    if(f.terminado) return { texto:'Terminado', color:'gris' };
    if(!f.fecha) return { texto:'—', color:'gris' };
    // Lo ya vencido no se cuenta día por día (con fechas de años atrás sería
    // lento) — solo se marca "Vencido".
    const restantes = f.fecha < hoy ? -1 : diasHabilesRestantes(f.fecha);
    return { texto:etiquetaCuentaRegresiva(restantes), color:colorCuentaRegresiva(restantes) };
  }

  return (
    <div style={{marginTop:20}}>
      <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:14}}>
        <button type="button" className={"filter-chip" + (filtroTipo==='todos' ? " active" : "")} onClick={() => setFiltroTipo('todos')}>Todos</button>
        {Object.entries(TIPOS).map(([k,t]) => (
          <button key={k} type="button" className={"filter-chip" + (filtroTipo===k ? " active" : "")} onClick={() => setFiltroTipo(k)}>
            {t.plural} ({conteo(k)})
          </button>
        ))}
        <label style={{display:'inline-flex', alignItems:'center', gap:6, marginLeft:'auto', fontSize:13, cursor:'pointer'}}>
          <input type="checkbox" checked={verVencidos} onChange={e => setVerVencidos(e.target.checked)} />
          Ver vencidos y terminados{!verVencidos && ocultos > 0 ? ` (${ocultos} ocultos)` : ''}
        </label>
      </div>
      <div className="table-wrap">
        <table className="table-compact">
          <thead>
            <tr><th>Tipo</th><th>Fecha</th><th>Cuenta regresiva</th><th>Proceso</th><th>Detalle</th><th>Responsable</th></tr>
          </thead>
          <tbody>
            {visibles.length ? visibles.map(f => {
              const cr = cuentaRegresiva(f);
              const t = TIPOS[f.tipo];
              return (
                <tr key={f.clave}>
                  <td><button type="button" className={"badge " + t.cls} style={{border:'none', cursor:'pointer'}} title={"Ir a la pestaña " + t.plural} onClick={() => onIrATab(f.tipo)}>{t.label}</button></td>
                  <td style={{whiteSpace:'nowrap'}}>{f.fecha ? fmtDate(f.fecha) : "—"}{f.hora ? <div className="save-hint">{f.hora}</div> : null}</td>
                  <td><span className={"badge badge-" + cr.color}>{cr.texto}</span></td>
                  <td>{f.proceso?.Radicado || "—"}{f.proceso?.Cliente ? <div className="save-hint">{f.proceso.Cliente}</div> : null}</td>
                  <td>{f.texto || "—"}{f.observacion ? <div className="save-hint">{f.observacion}</div> : null}</td>
                  <td>{f.responsable || "—"}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={6}><div className="empty-state empty-state-compact">{ocultos > 0 && !verVencidos ? 'No hay nada vigente. Activa "Ver vencidos y terminados" para ver el historial.' : 'Todavía no hay registros.'}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function VencimientosView({
  procesos, tiposAccion, colaboradores,
  audiencias, terminos, pendientes, notify,
  onCrearAudiencia, onEditarAudiencia, onEliminarAudiencia,
  onCrearTermino, onEditarTermino, onEliminarTermino,
  onCrearPendiente, onEditarPendiente, onEliminarPendiente,
  onCreateTipoTermino,
  canWrite = true,
}){
  const [subTab, setSubTab] = useState('todos');
  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Vencimientos</h1>
          <p>Audiencias, términos y pendientes del equipo, todo en un solo lugar.</p>
        </div>
      </div>
      <div className="subnav-panel">
        <div className="subtabs">
          {SUB_TABS.map(t => (
            <button key={t.key} type="button" className={"subtab" + (subTab===t.key ? " active" : "")} onClick={() => setSubTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      <VencimientosSemana audiencias={audiencias} terminos={terminos} pendientes={pendientes} procesos={procesos} />
      {subTab==='todos' && (
        <TodosVencimientos audiencias={audiencias} terminos={terminos} pendientes={pendientes} procesos={procesos} onIrATab={setSubTab} />
      )}
      {subTab==='audiencias' && (
        <div style={{marginTop:20}}>
          {canWrite && <FormularioNuevo tipo="audiencias" procesos={procesos} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify} onCrear={onCrearAudiencia} />}
          <TablaRegistros tipo="audiencias" registros={audiencias} procesos={procesos} colaboradores={colaboradores} notify={notify} onEditar={onEditarAudiencia} onEliminar={onEliminarAudiencia} />
        </div>
      )}
      {subTab==='terminos' && (
        <div style={{marginTop:20}}>
          {canWrite && <FormularioNuevo tipo="terminos" procesos={procesos} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify} onCrear={onCrearTermino} onCreateTipoTermino={onCreateTipoTermino} />}
          <TablaRegistros tipo="terminos" registros={terminos} procesos={procesos} colaboradores={colaboradores} notify={notify} onEditar={onEditarTermino} onEliminar={onEliminarTermino} />
        </div>
      )}
      {subTab==='pendientes' && (
        <div style={{marginTop:20}}>
          <PendientesSection pendientes={pendientes} colaboradores={colaboradores} procesos={procesos} onCrear={onCrearPendiente} onEditar={onEditarPendiente} onEliminar={onEliminarPendiente} canWrite={canWrite} />
        </div>
      )}
    </div>
  );
}
