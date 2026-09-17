import { useState } from 'react';
import { FormularioNuevo, TablaRegistros } from './AudienciasTerminosTab';
import { PendientesSection } from './PendientesSection';

// Módulo "Vencimientos" (2026-09-17, pedido explícito del usuario: "que tal
// si creamos un nuevo modulo llamado vencimientos en el cual esté audiencias
// termino pendientes") — junta las 3 listas de "lo que hay que hacer y para
// cuándo" en un solo lugar del portal, en vez de tenerlas repartidas (antes
// Audiencias/Términos vivían dentro de Informes > Procesos Judiciales, ver
// CHANGELOG). Reusa tal cual los mismos componentes de formulario/tabla que
// ya existían — no se duplica ninguna lógica de negocio, solo cambia dónde
// viven dentro del portal.
const SUB_TABS = [
  {key:'audiencias', label:'Audiencias'},
  {key:'terminos', label:'Términos'},
  {key:'pendientes', label:'Pendientes'},
];

export default function VencimientosView({
  procesos, tiposAccion, colaboradores,
  audiencias, terminos, pendientes, notify,
  onCrearAudiencia, onEditarAudiencia, onEliminarAudiencia,
  onCrearTermino, onEditarTermino, onEliminarTermino,
  onCrearPendiente, onEditarPendiente, onEliminarPendiente,
  canWrite = true,
}){
  const [subTab, setSubTab] = useState('audiencias');
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
      {subTab==='audiencias' && (
        <div style={{marginTop:20}}>
          {canWrite && <FormularioNuevo tipo="audiencias" procesos={procesos} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify} onCrear={onCrearAudiencia} />}
          <TablaRegistros tipo="audiencias" registros={audiencias} procesos={procesos} colaboradores={colaboradores} notify={notify} onEditar={onEditarAudiencia} onEliminar={onEliminarAudiencia} />
        </div>
      )}
      {subTab==='terminos' && (
        <div style={{marginTop:20}}>
          {canWrite && <FormularioNuevo tipo="terminos" procesos={procesos} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify} onCrear={onCrearTermino} />}
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
