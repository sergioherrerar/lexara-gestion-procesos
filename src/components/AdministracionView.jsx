import { useState } from 'react';
import ColaboradoresView from './ColaboradoresView';
import VacacionesTab from './VacacionesTab';
import HorasExtrasTab from './HorasExtrasTab';
import GastosTab from './GastosTab';
import FacturacionTab from './FacturacionTab';
import { IconTextButton } from './IconButton';
import { generarCertificacionColaboradorPDF } from '../lib/informeCertificacion';

// Módulo "Administración" (agregado 2026-08-25, pedido explícito del
// usuario) — agrupa en pestañas lo que antes era el módulo suelto
// "Colaborador Lexara" más 3 piezas nuevas: Vacaciones (Excel real, ver
// VacacionesTab.jsx), Certificaciones (reorganiza el botón de PDF que ya
// existía por colaborador, ahora en su propia pestaña) y Documentos de la
// empresa (un solo link fijo a la carpeta real de SharePoint). Acceso
// restringido a Administrador únicamente — ver MODULOS_POR_ROL_LEGADO en
// permissions.js y [[project_administracion_modulo]].
const TABS = [
  {key:'colaboradores', label:'Colaboradores MD'},
  {key:'vacaciones', label:'Vacaciones'},
  {key:'documentos', label:'Documentos'},
  {key:'horasExtras', label:'Horas Extras'},
  {key:'gastos', label:'Egresos'},
  {key:'facturacion', label:'Facturación'},
];

function CertificacionesTab({ colaboradores, notify }){
  const [generando, setGenerando] = useState(null);
  async function handleGenerar(c){
    if(!c.Cargo || !c.FechaIngreso){
      notify?.(`Antes de generar la certificación de ${c.Nombre}, completa su Cargo y Fecha de ingreso en la ficha del colaborador (pestaña Colaboradores MD).`, 'error');
      return;
    }
    setGenerando(c.id);
    try{ await generarCertificacionColaboradorPDF(c); }
    catch(err){ console.error(err); notify?.("No se pudo generar la certificación: " + err.message, 'error'); }
    finally{ setGenerando(null); }
  }
  const activos = [...colaboradores].sort((a,b) => (a.Nombre||"").localeCompare(b.Nombre||""));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Nombre</th><th>Cargo</th><th>Tipo de colaborador</th><th>Fecha de ingreso</th><th>Certificación</th></tr>
        </thead>
        <tbody>
          {activos.length ? activos.map(c => (
            <tr key={c.id}>
              <td className="cliente">{c.Nombre || "—"}</td>
              <td>{c.Cargo || "—"}</td>
              <td>{c.TipoColaborador || "Trabajador"}</td>
              <td>{c.FechaIngreso || "—"}</td>
              <td>
                <IconTextButton
                  icon="pdf" variant="secondary"
                  onClick={() => handleGenerar(c)}
                  disabled={generando===c.id}
                >
                  {generando===c.id ? "Generando…" : (((c.TipoColaborador||"").toLowerCase()==='contratista') ? "Certificación de servicios" : "Certificación laboral")}
                </IconTextButton>
              </td>
            </tr>
          )) : (
            <tr><td colSpan={5}><div className="empty-state empty-state-compact">No hay colaboradores para mostrar.</div></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DocumentosEmpresaTab({ config }){
  return (
    <div className="panel">
      <div className="panel-body" style={{padding:'32px 28px', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:14}}>
        <span style={{width:48, height:48, borderRadius:12, background:'var(--verde-tinte, #e6efed)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--verde-oscuro)'}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:24, height:24}}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <div>
          <h3 style={{margin:'0 0 6px', fontFamily:'var(--font-display)', color:'var(--verde-oscuro)'}}>Documentos de la empresa</h3>
          <p style={{margin:0, color:'var(--texto-suave)', fontSize:13, maxWidth:420}}>Políticas, formatos y demás documentos internos del despacho, en la carpeta compartida de SharePoint.</p>
        </div>
        <a className="btn-primary" href={config?.DOCUMENTOS_EMPRESA_URL} target="_blank" rel="noopener noreferrer">Abrir documentos de la empresa</a>
      </div>
    </div>
  );
}

const DOCUMENTOS_SUB_TABS = [
  {key:'certificaciones', label:'Certificaciones'},
  {key:'documentosEmpresa', label:'Documentos de la empresa'},
];

// "Documentos" (Administración) — pedido explícito del usuario 2026-09-03:
// junta acá 2 pestañas que antes vivían sueltas en el menú principal
// (Certificaciones y Documentos de la empresa). Mismo sub-menú segmentado
// que ya usan Egresos y Facturación — ver .subnav-panel/.subtabs/.subtab
// en styles.css.
function DocumentosTab({ colaboradores, config, notify }){
  const [subTab, setSubTab] = useState('certificaciones');
  return (
    <div>
      <div className="subnav-panel">
        <div className="subtabs">
          {DOCUMENTOS_SUB_TABS.map(t => (
            <button key={t.key} type="button" className={"subtab" + (subTab===t.key ? " active" : "")} onClick={() => setSubTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      {subTab==='certificaciones' && <CertificacionesTab colaboradores={colaboradores} notify={notify} />}
      {subTab==='documentosEmpresa' && <DocumentosEmpresaTab config={config} />}
    </div>
  );
}

export default function AdministracionView({ colaboradores, searchQuery, onOpenColaborador, onCreateColaborador, onDeleteColaborador, canWrite = true, notify, config, tutelas, valoresEntidad, clientes, procesos, facturas, ordenesCompra, onAbrirBorradorOrdenCompra, onAbrirBorradorFactura, horasExtras, onAprobarHoraExtra, vacacionesPeriodos, onCrearPeriodoVacaciones, onEditarPeriodoVacaciones, onEliminarPeriodoVacaciones,
  proveedoresGastos, cuentasCobroGastos, pagosPorRealizar, gastos,
  onCrearProveedorGastos, onEditarProveedorGastos, onEliminarProveedorGastos,
  onCrearCuentaCobroGastos, onEditarCuentaCobroGastos, onEliminarCuentaCobroGastos,
  onCrearPagoPorRealizar, onEditarPagoPorRealizar, onEliminarPagoPorRealizar,
  onCrearGasto, onEditarGasto, onEliminarGasto }){
  const [tab, setTab] = useState('colaboradores');
  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Administración</h1>
          <p>Equipo, vacaciones, certificaciones y documentos del despacho.</p>
        </div>
      </div>
      <div className="drawer-tabs" style={{padding:'0 0 14px', border:'none'}}>
        {TABS.map(t => (
          <button
            key={t.key} type="button"
            className={"drawer-tab" + (tab===t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>
      {tab==='colaboradores' && (
        <ColaboradoresView
          colaboradores={colaboradores}
          searchQuery={searchQuery}
          onOpenColaborador={onOpenColaborador}
          onCreateColaborador={onCreateColaborador}
          onDeleteColaborador={onDeleteColaborador}
          canWrite={canWrite}
          notify={notify}
          embedded
          titulo="Colaboradores MD"
        />
      )}
      {tab==='vacaciones' && (
        <VacacionesTab
          colaboradores={colaboradores}
          vacacionesPeriodos={vacacionesPeriodos}
          onCrearPeriodo={onCrearPeriodoVacaciones}
          onEditarPeriodo={onEditarPeriodoVacaciones}
          onEliminarPeriodo={onEliminarPeriodoVacaciones}
          notify={notify}
          canWrite={canWrite}
        />
      )}
      {tab==='documentos' && <DocumentosTab colaboradores={colaboradores} config={config} notify={notify} />}
      {tab==='horasExtras' && (
        <HorasExtrasTab
          horasExtras={horasExtras}
          tutelas={tutelas}
          colaboradores={colaboradores}
          onAprobarHoraExtra={onAprobarHoraExtra}
          notify={notify}
        />
      )}
      {tab==='gastos' && (
        <GastosTab
          config={config}
          proveedoresGastos={proveedoresGastos}
          gastos={gastos}
          onCrearProveedorGastos={onCrearProveedorGastos}
          onEditarProveedorGastos={onEditarProveedorGastos}
          onEliminarProveedorGastos={onEliminarProveedorGastos}
          onCrearGasto={onCrearGasto}
          onEditarGasto={onEditarGasto}
          onEliminarGasto={onEliminarGasto}
          canWrite={canWrite}
          notify={notify}
        />
      )}
      {tab==='facturacion' && (
        <FacturacionTab
          facturas={facturas}
          ordenesCompra={ordenesCompra}
          clientes={clientes}
          tutelas={tutelas}
          valoresEntidad={valoresEntidad}
          procesos={procesos}
          onAbrirBorradorOrdenCompra={onAbrirBorradorOrdenCompra}
          onAbrirBorradorFactura={onAbrirBorradorFactura}
          notify={notify}
        />
      )}
    </div>
  );
}
