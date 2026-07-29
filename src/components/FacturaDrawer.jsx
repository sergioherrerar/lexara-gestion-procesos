import { useState, useEffect } from 'react';
import { clienteForFactura, procesoForFactura, facturaBadgeClass } from '../lib/graph';

const FIELDS = [
  ["NumeroFactura","text","No. de factura"],
  ["Valor","text","Valor"],
  ["Estado","text","Estado"],
  ["FechaEmision","date","Fecha de emisión"],
  ["FechaVencimiento","date","Fecha de vencimiento"],
];

export default function FacturaDrawer({ factura, clientes, procesos, liveMode, onClose, onSave }){
  const [form, setForm] = useState(null);

  useEffect(() => {
    if(factura){
      const initial = { CodigoCliente: factura.CodigoCliente || "", Contrato: factura.Contrato || "", Concepto: factura.Concepto || "" };
      FIELDS.forEach(([key]) => { initial[key] = factura[key] || ""; });
      setForm(initial);
    } else {
      setForm(null);
    }
  }, [factura]);

  if(!factura || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  const linkedCliente = clienteForFactura(clientes, form);
  const linkedProceso = procesoForFactura(procesos, form);

  return (
    <>
      <div id="factura-overlay" className="active" onClick={onClose}></div>
      <div id="factura-drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">FACTURA</div>
          <h2>{factura.NumeroFactura || "Sin número"}</h2>
          <span className={"badge " + facturaBadgeClass(form.Estado)}>{form.Estado || "—"}</span>
        </div>
        <div className="drawer-body">
          <div className="field-section">
            <h4>Relaciones</h4>
            <div className="field-grid">
              <div className="field">
                <label>Cliente</label>
                <select value={form.CodigoCliente} onChange={e => setField('CodigoCliente', e.target.value)}>
                  <option value="">— seleccionar cliente —</option>
                  {clientes.map(c => <option value={c.id} key={c.id}>{c.RazonSocial}</option>)}
                </select>
                {form.CodigoCliente && !linkedCliente && (
                  <div style={{marginTop:8, padding:'8px 10px', border:'1px solid #f3d78e', background:'#fff7e8', borderRadius:8, fontSize:12.5, color:'#6b5115'}}>
                    Este código no coincide con ningún cliente registrado.
                  </div>
                )}
              </div>
              <div className="field">
                <label>Proceso (contrato)</label>
                <select value={form.Contrato} onChange={e => setField('Contrato', e.target.value)}>
                  <option value="">— seleccionar proceso —</option>
                  {procesos.filter(p => p.NumeroContrato).map(p => (
                    <option value={p.NumeroContrato} key={p.id}>{p.Radicado} · {p.NumeroContrato}</option>
                  ))}
                </select>
                {form.Contrato && !linkedProceso && (
                  <div style={{marginTop:8, padding:'8px 10px', border:'1px solid #f3d78e', background:'#fff7e8', borderRadius:8, fontSize:12.5, color:'#6b5115'}}>
                    Este contrato no coincide con ningún proceso registrado.
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="field-section">
            <h4>Datos de la factura</h4>
            <div className="field-grid">
              {FIELDS.map(([key,type,label]) => (
                <div className="field" key={key}>
                  <label>{label}</label>
                  <input type={type} value={form[key]} onChange={e => setField(key, e.target.value)} />
                </div>
              ))}
              <div className="field full" style={{gridColumn:'1/-1'}}>
                <label>Concepto / Observaciones</label>
                <textarea value={form.Concepto} onChange={e => setField('Concepto', e.target.value)} />
              </div>
            </div>
          </div>
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
