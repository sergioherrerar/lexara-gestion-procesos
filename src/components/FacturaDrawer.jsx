import { useState, useEffect } from 'react';
import { clienteForFactura, procesoForFactura, facturaNumero, parseMonto, fmtMonto } from '../lib/graph';
import logoPrint from '../assets/Logo verde OScuro.png';

const LINE_NUMS = [1,2,3,4,5,6];
const OTHER_FIELDS = ["Proceso","Fecha","Etapa"];

function emptyForm(factura){
  const initial = { CodigoCliente: factura.CodigoCliente || "", Contrato: factura.Contrato || "", Iva: factura.Iva || "19" };
  OTHER_FIELDS.forEach(key => { initial[key] = factura[key] || ""; });
  LINE_NUMS.forEach(n => {
    initial[`Descripcion${n}`] = factura[`Descripcion${n}`] || "";
    initial[`Cantidad${n}`] = factura[`Cantidad${n}`] || "";
    initial[`ValorUnitario${n}`] = factura[`ValorUnitario${n}`] || "";
  });
  return initial;
}

function lineTotal(form, n){
  return parseMonto(form[`Cantidad${n}`]) * parseMonto(form[`ValorUnitario${n}`]);
}
function computeLive(form){
  const subtotal = LINE_NUMS.reduce((sum,n) => sum + lineTotal(form,n), 0);
  const ivaRate = parseMonto(form.Iva);
  const iva = subtotal * (ivaRate/100);
  return { subtotal, iva, total: subtotal + iva };
}
function fmtFechaLarga(fecha){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha||"");
  if(!m) return {dia:"—", mes:"—", anio:"—"};
  return { dia: m[3], mes: m[2], anio: m[1] };
}

export default function FacturaDrawer({ factura, clientes, procesos, liveMode, onClose, onSave }){
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(factura ? emptyForm(factura) : null);
  }, [factura]);

  if(!factura || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  function setLineField(n, field, value){
    setForm(prev => {
      const next = {...prev, [`${field}${n}`]: value};
      next[`Total${n}`] = fmtMonto(lineTotal(next, n));
      return next;
    });
  }

  function handleSave(){
    const totals = computeLive(form);
    const payload = {...form};
    LINE_NUMS.forEach(n => { payload[`Total${n}`] = (form[`Cantidad${n}`] || form[`ValorUnitario${n}`]) ? fmtMonto(lineTotal(form,n)) : ""; });
    payload.Subtotal = fmtMonto(totals.subtotal);
    payload.Total = fmtMonto(totals.total);
    onSave(payload);
  }

  const linkedCliente = clienteForFactura(clientes, form);
  const linkedProceso = procesoForFactura(procesos, form);
  const totals = computeLive(form);
  const numero = facturaNumero(factura);
  const fechaLarga = fmtFechaLarga(form.Fecha);

  return (
    <>
      <div id="factura-overlay" className="active" onClick={onClose}></div>
      <div id="factura-drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">FACTURA</div>
          <h2>No. {numero}</h2>
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
                  <div className="field-warning">Este código no coincide con ningún cliente registrado.</div>
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
                  <div className="field-warning">Este contrato no coincide con ningún proceso registrado.</div>
                )}
              </div>
            </div>
          </div>
          <div className="field-section">
            <h4>Datos generales</h4>
            <div className="field-grid">
              <div className="field"><label>Proceso</label><input type="text" value={form.Proceso} onChange={e => setField('Proceso', e.target.value)} /></div>
              <div className="field"><label>Fecha</label><input type="date" value={form.Fecha} onChange={e => setField('Fecha', e.target.value)} /></div>
              <div className="field"><label>Etapa</label><input type="text" value={form.Etapa} onChange={e => setField('Etapa', e.target.value)} /></div>
            </div>
          </div>
          <div className="field-section">
            <h4>Líneas de detalle</h4>
            <div className="table-wrap">
              <table className="lineas-factura">
                <thead>
                  <tr><th>Descripción</th><th>Cantidad</th><th>Valor unitario</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {LINE_NUMS.map(n => (
                    <tr key={n}>
                      <td><textarea rows={2} value={form[`Descripcion${n}`]} onChange={e => setLineField(n,'Descripcion',e.target.value)} /></td>
                      <td><input type="text" value={form[`Cantidad${n}`]} onChange={e => setLineField(n,'Cantidad',e.target.value)} /></td>
                      <td><input type="text" value={form[`ValorUnitario${n}`]} onChange={e => setLineField(n,'ValorUnitario',e.target.value)} /></td>
                      <td className="linea-total">{(form[`Cantidad${n}`] || form[`ValorUnitario${n}`]) ? fmtMonto(lineTotal(form,n)) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="field-section">
            <h4>Totales</h4>
            <div className="field-grid">
              <div className="field"><label>Subtotal</label><input type="text" value={fmtMonto(totals.subtotal)} readOnly /></div>
              <div className="field"><label>IVA (%)</label><input type="text" value={form.Iva} onChange={e => setField('Iva', e.target.value)} /></div>
              <div className="field"><label>Total</label><input type="text" value={fmtMonto(totals.total)} readOnly /></div>
            </div>
          </div>
        </div>
        <div className="drawer-foot">
          <button className="btn-primary" onClick={handleSave}>Guardar cambios</button>
          <button className="btn-secondary" onClick={() => window.print()}>Imprimir</button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <span className="save-hint">{liveMode ? "Los cambios se guardan en SharePoint." : "Modo demo — los cambios no se guardan."}</span>
        </div>
      </div>

      <div className="print-sheet">
        <div className="print-head">
          <img src={logoPrint} alt="Lexara Abogados" />
          <div className="print-title">
            <h1>SOLICITUD DE FACTURACIÓN ELECTRÓNICA</h1>
            <h2>MD ABOGADOS Nit: 900495788-3</h2>
          </div>
          <div className="print-numero">{numero}</div>
        </div>
        <div className="print-cliente">
          <div><label>Fecha</label><span>{fechaLarga.dia}/{fechaLarga.mes}/{fechaLarga.anio}</span></div>
          <div><label>Cliente</label><span>{linkedCliente?.RazonSocial || "—"}</span></div>
          <div><label>Ciudad</label><span>{linkedCliente?.Ciudad || "—"}</span></div>
          <div><label>NIT</label><span>{linkedCliente?.Nit || "—"}</span></div>
          <div><label>Dirección</label><span>{linkedCliente?.Direccion || "—"}</span></div>
          <div><label>Teléfono</label><span>{linkedCliente?.Telefono || "—"}</span></div>
          <div><label>Contrato</label><span>{form.Contrato || "—"}</span></div>
        </div>
        <table className="print-lineas">
          <thead>
            <tr><th>Descripción</th><th>Cantidad</th><th>Valor unitario</th><th>Total</th></tr>
          </thead>
          <tbody>
            {LINE_NUMS.map(n => (
              <tr key={n}>
                <td>{form[`Descripcion${n}`]}</td>
                <td>{form[`Cantidad${n}`]}</td>
                <td>{form[`ValorUnitario${n}`] ? fmtMonto(parseMonto(form[`ValorUnitario${n}`])) : ""}</td>
                <td>{lineTotal(form,n) ? fmtMonto(lineTotal(form,n)) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="print-foot">
          <div className="print-foot-left">
            <div><label>Etapa</label><span>{form.Etapa || "—"}</span></div>
            <div><label>Proceso</label><span>{form.Proceso || "—"}</span></div>
          </div>
          <div className="print-foot-right">
            <div><label>Subtotal</label><span>{fmtMonto(totals.subtotal)}</span></div>
            <div><label>IVA ({form.Iva || 0}%)</label><span>{fmtMonto(totals.iva)}</span></div>
            <div className="print-total"><label>Total</label><span>{fmtMonto(totals.total)}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}
