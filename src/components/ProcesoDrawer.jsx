import { useState, useEffect } from 'react';
import {
  stripHtml, estadoBadgeClass, findClienteByNombre,
  facturasForProceso, ordenesCompraForProceso, facturaNumero, ordenCompraNumero,
  computeFacturaTotals, computeOrdenCompraTotals, estadoFacturaBadgeClass,
  facturaForOrdenCompra, fmtMonto, fmtDate, fechaFromPartes,
} from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { ICON_SVG } from '../config';

const TABS = [
  {key:'datos', label:'Datos generales'},
  {key:'facturas', label:'Facturas'},
  {key:'ordenes', label:'Órdenes de compra'},
];

function fechaOrdenable(row){
  return fechaFromPartes(row.Dia, row.Mes, row.Anio) || row.Fecha || "";
}

// Lista compacta de facturas/órdenes de compra relacionadas con el proceso
// abierto — reutilizada por las pestañas "Facturas" y "Órdenes de compra".
function RelatedList({ emptyMsg, rows, columns, onOpen, onPrint }){
  if(!rows.length){
    return (
      <div className="empty-state empty-state-compact">
        <div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />
        {emptyMsg}
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}<th>Acciones</th></tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              onClick={() => onOpen(row.id)}
              role="button" tabIndex={0}
              onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpen(row.id); } }}
            >
              {columns.map(c => <td key={c.key}>{c.render(row)}</td>)}
              <td style={{whiteSpace:'nowrap'}}>
                <div className="row-actions">
                  <IconButton icon="edit" variant="edit" label="Ver / editar" onClick={e => { e.stopPropagation(); onOpen(row.id); }} />
                  <IconButton icon="print" variant="print" label="Imprimir" onClick={e => { e.stopPropagation(); onPrint(row.id); }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FIELD_SECTIONS = [
  {title:"Datos generales", fields:[
    ["Cliente","text"],["Entidad","text"],["Apoderado","text"],["Despacho","text"],["NumeroDespacho","text"],
    ["Instancia","text"],["TipoProceso","text"],["TipoAccion","text"],["NumeroContrato","text"],
    ["EtapaProcesal","text"],["Estado","text"],
  ]},
  {title:"Fechas del proceso", fields:[
    ["FechaAdmision","date"],["FechaContestacion","date"],
  ]},
  {title:"Riesgo y seguimiento", fields:[
    ["CalificacionContingencia","text"],["EstadoVT","text"],["LinkCarpeta","text"],["Observaciones","textarea"],
  ]},
];
const LABELS = {
  Cliente:"Cliente", Entidad:"Entidad", Apoderado:"Apoderado", Despacho:"Despacho / juzgado", NumeroDespacho:"No. de despacho",
  Instancia:"Instancia", TipoProceso:"Tipo de proceso", TipoAccion:"Tipo de Acción", NumeroContrato:"No. de contrato",
  EtapaProcesal:"Etapa procesal", Estado:"Estado",
  FechaAdmision:"Fecha de admisión", FechaContestacion:"Fecha de contestación",
  CalificacionContingencia:"Calificación de contingencia", EstadoVT:"Estado V/T", LinkCarpeta:"Link a la carpeta",
  Observaciones:"Observaciones",
};
const EMPTY_NEW_CLIENTE = {RazonSocial:"", Nit:"", Direccion:"", Telefono:"", Correo:""};

export default function ProcesoDrawer({ proceso, clientes, facturas, ordenesCompra, liveMode, onClose, onSave, onCreateCliente, onOpenFactura, onPrintFactura, onOpenOrdenCompra, onPrintOrdenCompra, saving }){
  const [form, setForm] = useState(null);
  const [showNewCliente, setShowNewCliente] = useState(false);
  const [newCliente, setNewCliente] = useState(EMPTY_NEW_CLIENTE);
  const [nuevoClienteError, setNuevoClienteError] = useState("");
  const [activeTab, setActiveTab] = useState('datos');

  useEffect(() => {
    if(proceso){
      const initial = {};
      FIELD_SECTIONS.forEach(sec => sec.fields.forEach(([key,type]) => {
        initial[key] = key==='Estado' ? stripHtml(proceso[key]) : (proceso[key] || "");
      }));
      setForm(initial);
      setShowNewCliente(false);
      setNewCliente(EMPTY_NEW_CLIENTE);
      setNuevoClienteError("");
      setActiveTab('datos');
    } else {
      setForm(null);
    }
  }, [proceso]);

  useEscapeToClose(!!proceso, onClose);

  if(!proceso || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  async function handleCreateCliente(){
    if(!newCliente.RazonSocial.trim()){ setNuevoClienteError("El nombre (Razón social) es obligatorio."); return; }
    setNuevoClienteError("");
    const created = await onCreateCliente(newCliente);
    if(created){
      setField('Cliente', created.RazonSocial);
      setShowNewCliente(false);
      setNewCliente(EMPTY_NEW_CLIENTE);
    }
  }

  const clienteNombres = clientes.map(c => c.RazonSocial).filter(Boolean);
  if(form.Cliente && !clienteNombres.includes(form.Cliente)) clienteNombres.unshift(form.Cliente);
  const linkedCliente = findClienteByNombre(clientes, form.Cliente);

  const facturasRelacionadas = facturasForProceso(facturas, proceso)
    .sort((a,b) => Number(facturaNumero(b)) - Number(facturaNumero(a)) || 0);
  const ordenesRelacionadas = ordenesCompraForProceso(ordenesCompra, proceso)
    .sort((a,b) => Number(ordenCompraNumero(b)) - Number(ordenCompraNumero(a)));

  // Al abrir/imprimir una factura u orden de compra relacionada, se cierra
  // este panel primero — dos paneles superpuestos a la vez se ven mal.
  function goToFactura(id){ onClose(); onOpenFactura(id); }
  function goToPrintFactura(id){ onClose(); onPrintFactura(id); }
  function goToOrdenCompra(id){ onClose(); onOpenOrdenCompra(id); }
  function goToPrintOrdenCompra(id){ onClose(); onPrintOrdenCompra(id); }

  const FACTURA_COLUMNS = [
    {key:'numero', label:'No. factura', render: f => facturaNumero(f)},
    {key:'fecha', label:'Fecha', render: f => fmtDate(fechaOrdenable(f))},
    {key:'total', label:'Total', render: f => fmtMonto(computeFacturaTotals(f).total)},
    {key:'estado', label:'Estado', render: f => <span className={"badge " + estadoFacturaBadgeClass(f.EstadoFactura)}>{f.EstadoFactura || "—"}</span>},
  ];
  const ORDEN_COLUMNS = [
    {key:'numero', label:'No. orden', render: oc => ordenCompraNumero(oc)},
    {key:'fecha', label:'Fecha', render: oc => fmtDate(fechaOrdenable(oc))},
    {key:'total', label:'Total', render: oc => fmtMonto(computeOrdenCompraTotals(oc).total)},
    {key:'factura', label:'Factura', render: oc => { const f = facturaForOrdenCompra(facturas, oc); return f ? facturaNumero(f) : "—"; }},
  ];

  return (
    <>
      <div id="overlay" className="active" onClick={onClose}></div>
      <div id="drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">NUMERO_CORTO — {proceso.Radicado || "—"}</div>
          <h2>{proceso.Cliente || "Sin nombre"}</h2>
          <span className={"badge " + estadoBadgeClass(proceso.Estado)}>{stripHtml(proceso.Estado) || "—"}</span>
        </div>
        <div className="drawer-tabs">
          {TABS.map(t => (
            <button
              key={t.key} type="button"
              className={"drawer-tab" + (activeTab===t.key ? " active" : "")}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
              {t.key==='facturas' && facturasRelacionadas.length > 0 && <span className="drawer-tab-count">{facturasRelacionadas.length}</span>}
              {t.key==='ordenes' && ordenesRelacionadas.length > 0 && <span className="drawer-tab-count">{ordenesRelacionadas.length}</span>}
            </button>
          ))}
        </div>
        <div className="drawer-body">
          {activeTab === 'facturas' && (
            <div className="field-section">
              <RelatedList
                emptyMsg="No hay facturas con el mismo contrato de este proceso."
                rows={facturasRelacionadas}
                columns={FACTURA_COLUMNS}
                onOpen={goToFactura}
                onPrint={goToPrintFactura}
              />
            </div>
          )}
          {activeTab === 'ordenes' && (
            <div className="field-section">
              <RelatedList
                emptyMsg="No hay órdenes de compra con el mismo contrato de este proceso."
                rows={ordenesRelacionadas}
                columns={ORDEN_COLUMNS}
                onOpen={goToOrdenCompra}
                onPrint={goToPrintOrdenCompra}
              />
            </div>
          )}
          {activeTab === 'datos' && FIELD_SECTIONS.map(sec => (
            <div className="field-section" key={sec.title}>
              <h4>{sec.title}</h4>
              <div className={"field-grid" + (sec.fields.length===1 ? " full" : "")}>
                {sec.fields.map(([key,type]) => {
                  if(key==='Cliente'){
                    return (
                      <div className="field full" style={{gridColumn:'1/-1'}} key={key}>
                        <label>Cliente</label>
                        <select value={form.Cliente} onChange={e => setField('Cliente', e.target.value)}>
                          <option value="">— seleccionar cliente —</option>
                          {clienteNombres.map(n => <option value={n} key={n}>{n}</option>)}
                        </select>
                        <IconTextButton icon="add" variant="secondary" style={{marginTop:8, alignSelf:'flex-start'}} onClick={() => setShowNewCliente(v => !v)}>Nuevo cliente</IconTextButton>
                        {form.Cliente && (
                          linkedCliente ? (
                            <div style={{marginTop:10, padding:'10px 12px', border:'1px solid var(--gris-linea)', borderRadius:8, fontSize:12.5, color:'var(--texto-suave)', lineHeight:1.7}}>
                              <strong style={{color:'var(--texto)'}}>Datos del cliente (lista Clientes)</strong><br/>
                              NIT: {linkedCliente.Nit || "—"} · Tel: {linkedCliente.Telefono || "—"}<br/>
                              {linkedCliente.Direccion || "—"}<br/>
                              {linkedCliente.Correo || "—"}
                            </div>
                          ) : (
                            <div style={{marginTop:10, padding:'10px 12px', border:'1px solid #f3d78e', background:'#fff7e8', borderRadius:8, fontSize:12.5, color:'#6b5115'}}>
                              Este nombre no coincide con ningún registro de la lista de Clientes — créalo con "+ Nuevo cliente" para vincularlo.
                            </div>
                          )
                        )}
                        {showNewCliente && (
                          <div style={{marginTop:10, padding:12, border:'1px solid var(--gris-linea)', borderRadius:8, background:'var(--gris-claro)'}}>
                            <div className="field-grid">
                              <div className="field"><label>Razón social *</label><input type="text" value={newCliente.RazonSocial} onChange={e => setNewCliente(v => ({...v, RazonSocial:e.target.value}))} /></div>
                              <div className="field"><label>NIT</label><input type="text" value={newCliente.Nit} onChange={e => setNewCliente(v => ({...v, Nit:e.target.value}))} /></div>
                              <div className="field"><label>Dirección</label><input type="text" value={newCliente.Direccion} onChange={e => setNewCliente(v => ({...v, Direccion:e.target.value}))} /></div>
                              <div className="field"><label>Teléfono</label><input type="text" value={newCliente.Telefono} onChange={e => setNewCliente(v => ({...v, Telefono:e.target.value}))} /></div>
                              <div className="field full" style={{gridColumn:'1/-1'}}><label>Correo</label><input type="text" value={newCliente.Correo} onChange={e => setNewCliente(v => ({...v, Correo:e.target.value}))} /></div>
                            </div>
                            {nuevoClienteError && <div className="field-warning" style={{marginBottom:10}}>{nuevoClienteError}</div>}
                            <div style={{marginTop:10, display:'flex', gap:8}}>
                              <IconTextButton icon="add" variant="primary" onClick={handleCreateCliente} disabled={saving}>{saving ? "Creando…" : "Crear cliente"}</IconTextButton>
                              <button type="button" className="btn-secondary" onClick={() => setShowNewCliente(false)} disabled={saving}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className={"field" + (type==='textarea' ? " full" : "")} style={type==='textarea' ? {gridColumn:'1/-1'} : undefined} key={key}>
                      <label>{LABELS[key]}</label>
                      {type==='textarea'
                        ? <textarea value={form[key]} onChange={e => setField(key, e.target.value)} />
                        : <input type={type} value={form[key]} onChange={e => setField(key, e.target.value)} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="drawer-foot">
          <button className="btn-primary" onClick={() => onSave(form)} disabled={saving}>
            {saving && <span className="btn-spinner" />}{saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <span className="save-hint">{liveMode ? "Los cambios se guardan en SharePoint." : "Modo demo — los cambios no se guardan."}</span>
        </div>
      </div>
    </>
  );
}
