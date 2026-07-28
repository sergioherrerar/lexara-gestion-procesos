import { useState, useEffect } from 'react';
import { stripHtml, estadoBadgeClass } from '../lib/graph';

const FIELD_SECTIONS = [
  {title:"Datos generales", fields:[
    ["Cliente","text"],["Apoderado","text"],["Despacho","text"],["Instancia","text"],
    ["TipoProceso","text"],["NumeroContrato","text"],["EtapaProcesal","text"],["Estado","text"],
  ]},
  {title:"Fechas del proceso", fields:[
    ["FechaAdmision","date"],["FechaContestacion","date"],
  ]},
  {title:"Riesgo y seguimiento", fields:[
    ["CalificacionContingencia","text"],["Observaciones","textarea"],
  ]},
];
const LABELS = {
  Cliente:"Cliente", Apoderado:"Apoderado", Despacho:"Despacho / juzgado", Instancia:"Instancia",
  TipoProceso:"Tipo de proceso", NumeroContrato:"No. de contrato", EtapaProcesal:"Etapa procesal", Estado:"Estado",
  FechaAdmision:"Fecha de admisión", FechaContestacion:"Fecha de contestación",
  CalificacionContingencia:"Calificación de contingencia", Observaciones:"Observaciones",
};
const EMPTY_NEW_CLIENTE = {RazonSocial:"", Nit:"", Direccion:"", Telefono:"", Correo:""};

export default function ProcesoDrawer({ proceso, clientes, liveMode, onClose, onSave, onCreateCliente }){
  const [form, setForm] = useState(null);
  const [showNewCliente, setShowNewCliente] = useState(false);
  const [newCliente, setNewCliente] = useState(EMPTY_NEW_CLIENTE);

  useEffect(() => {
    if(proceso){
      const initial = {};
      FIELD_SECTIONS.forEach(sec => sec.fields.forEach(([key,type]) => {
        initial[key] = key==='Estado' ? stripHtml(proceso[key]) : (proceso[key] || "");
      }));
      setForm(initial);
      setShowNewCliente(false);
      setNewCliente(EMPTY_NEW_CLIENTE);
    } else {
      setForm(null);
    }
  }, [proceso]);

  if(!proceso || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  async function handleCreateCliente(){
    if(!newCliente.RazonSocial.trim()){ alert("El nombre (Razón social) es obligatorio."); return; }
    const created = await onCreateCliente(newCliente);
    if(created){
      setField('Cliente', created.RazonSocial);
      setShowNewCliente(false);
      setNewCliente(EMPTY_NEW_CLIENTE);
    }
  }

  const clienteNombres = clientes.map(c => c.RazonSocial).filter(Boolean);
  if(form.Cliente && !clienteNombres.includes(form.Cliente)) clienteNombres.unshift(form.Cliente);

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
        <div className="drawer-body">
          {FIELD_SECTIONS.map(sec => (
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
                        <button type="button" className="btn-secondary" style={{marginTop:8, alignSelf:'flex-start'}} onClick={() => setShowNewCliente(v => !v)}>+ Nuevo cliente</button>
                        {showNewCliente && (
                          <div style={{marginTop:10, padding:12, border:'1px solid var(--gris-linea)', borderRadius:8, background:'var(--gris-claro)'}}>
                            <div className="field-grid">
                              <div className="field"><label>Razón social *</label><input type="text" value={newCliente.RazonSocial} onChange={e => setNewCliente(v => ({...v, RazonSocial:e.target.value}))} /></div>
                              <div className="field"><label>NIT</label><input type="text" value={newCliente.Nit} onChange={e => setNewCliente(v => ({...v, Nit:e.target.value}))} /></div>
                              <div className="field"><label>Dirección</label><input type="text" value={newCliente.Direccion} onChange={e => setNewCliente(v => ({...v, Direccion:e.target.value}))} /></div>
                              <div className="field"><label>Teléfono</label><input type="text" value={newCliente.Telefono} onChange={e => setNewCliente(v => ({...v, Telefono:e.target.value}))} /></div>
                              <div className="field full" style={{gridColumn:'1/-1'}}><label>Correo</label><input type="text" value={newCliente.Correo} onChange={e => setNewCliente(v => ({...v, Correo:e.target.value}))} /></div>
                            </div>
                            <div style={{marginTop:10, display:'flex', gap:8}}>
                              <button type="button" className="btn-primary" onClick={handleCreateCliente}>Crear cliente</button>
                              <button type="button" className="btn-secondary" onClick={() => setShowNewCliente(false)}>Cancelar</button>
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
          <button className="btn-primary" onClick={() => onSave(form)}>Guardar cambios</button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <span className="save-hint">{liveMode ? "Los cambios se guardan en SharePoint." : "Modo demo — los cambios no se guardan."}</span>
        </div>
      </div>
    </>
  );
}
