import { useState, useEffect } from 'react';
import { clienteForFactura, procesoForFactura, facturaNumero, parseMonto, fmtMonto, IVA_RATE_DEFAULT } from '../lib/graph';
import logoPrint from '../assets/Logo verde OScuro.png';

const LINE_NUMS = [1,2,3,4,5,6];
const OTHER_FIELDS = ["Proceso","Dia","Mes","Anio","EtapaContrato","EstadoFactura","Observacion"];

const ETAPA_CONTRATO_OPTIONS = [
  "Acta Audiencia","Administracion Proceso","Admision","Asesoria","Asesorias","Auditoria",
  "Audiencia de Conciliacion","Auto de Pruebas","Contestacion","Cuota Litis","Entrega de Poder",
  "Entrega poder Demanda","Escrito de Oposicion","Honorarios","Pronunciamiento Frente a las exepciones",
  "Radicacion Conciliacion","Radicacion de contestacion","Radicacion Demanda","Reforma",
  "Sentencia 1ra","Sentencia 2da","Tutelas","% Antes de Sentencia","% Por Conciliacion",
  "% Por Sentencia","% Reconocimiento Por Recurso",
];
const ESTADO_FACTURA_OPTIONS = ["Pagada","Radicada","Anulada"];

function emptyForm(factura, clientes){
  const cliente = clienteForFactura(clientes, factura);
  const initial = { CodigoCliente: factura.CodigoCliente || "", Contrato: factura.Contrato || "", Ciudad: cliente?.Ciudad || "" };
  OTHER_FIELDS.forEach(key => { initial[key] = factura[key] || ""; });
  LINE_NUMS.forEach(n => {
    initial[`Descripcion${n}`] = factura[`Descripcion${n}`] || "";
    initial[`Cantidad${n}`] = factura[`Cantidad${n}`] || "";
    // Normaliza a formato pesos con 2 decimales al cargar, sin importar cómo
    // haya llegado el valor desde SharePoint (número crudo o texto).
    const vu = factura[`ValorUnitario${n}`];
    initial[`ValorUnitario${n}`] = vu ? fmtMonto(parseMonto(vu)) : "";
  });
  return initial;
}

function lineTotal(form, n){
  return parseMonto(form[`Cantidad${n}`]) * parseMonto(form[`ValorUnitario${n}`]);
}
// Vista previa en la app — Fecha/TotalN/Subtotal/IVA/Total/Ret IVA/Valor a pagar
// son columnas calculadas por fórmula en SharePoint; esto solo estima el resultado
// mientras se edita, con el 19% fijo. El valor definitivo lo calcula SharePoint al guardar.
function computeLive(form){
  const subtotal = LINE_NUMS.reduce((sum,n) => sum + lineTotal(form,n), 0);
  const iva = subtotal * (IVA_RATE_DEFAULT/100);
  return { subtotal, iva, total: subtotal + iva };
}

export default function FacturaDrawer({ factura, clientes, procesos, liveMode, onClose, onSave, onUpdateCliente, autoPrint, onAutoPrinted }){
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(factura ? emptyForm(factura, clientes) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factura]);

  // Botón de imprimir de la tabla: abre la factura e imprime en cuanto el
  // formulario (y su hoja de impresión) ya están montados.
  useEffect(() => {
    if(autoPrint && form){
      window.print();
      onAutoPrinted && onAutoPrinted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, form]);

  if(!factura || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  function setLineField(n, field, value){
    setField(`${field}${n}`, value);
  }

  // Fecha/TotalN/Subtotal/IVA/Total/Ret IVA/Valor a pagar son columnas calculadas
  // por fórmula en SharePoint — la app nunca les escribe un valor, solo las lee.
  // Se guardan los campos de origen (Día/Mes/Año, Cantidad, Valor unitario, etc.)
  // y SharePoint recalcula esas columnas por su cuenta.
  function handleSave(){
    const payload = {...form};
    LINE_NUMS.forEach(n => { delete payload[`Total${n}`]; });
    delete payload.Fecha;
    delete payload.Subtotal;
    delete payload.Iva;
    delete payload.Total;
    delete payload.RetIva;
    delete payload.ValorAPagar;
    // Los campos numéricos en blanco se envían como 0 (no "") para no romper
    // las fórmulas/sumas de SharePoint (Cantidad × Valor unitario, Subtotales...).
    ['Dia','Mes','Anio'].forEach(k => { if(payload[k] === "") payload[k] = 0; });
    LINE_NUMS.forEach(n => {
      if(payload[`Cantidad${n}`] === "") payload[`Cantidad${n}`] = 0;
      if(payload[`ValorUnitario${n}`] === "") payload[`ValorUnitario${n}`] = 0;
    });
    // Ciudad es del Cliente, no de la Factura — se guarda aparte en el registro
    // del cliente relacionado, no como columna de esta lista.
    const ciudad = payload.Ciudad;
    delete payload.Ciudad;
    const clienteOriginal = clienteForFactura(clientes, factura);
    if(clienteOriginal && ciudad !== (clienteOriginal.Ciudad || "") && onUpdateCliente){
      onUpdateCliente(clienteOriginal.id, { Ciudad: ciudad });
    }
    onSave(payload);
  }

  const linkedCliente = clienteForFactura(clientes, form);
  const linkedProceso = procesoForFactura(procesos, form);
  const totals = computeLive(form);
  const numero = facturaNumero(factura);

  return (
    <>
      <div id="factura-overlay" className="active" onClick={onClose}></div>
      <div id="factura-drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow">FACTURA</div>
          <h2>{numero ? `No. ${numero}` : "Nueva factura (No. se asigna al guardar)"}</h2>
        </div>
        <div className="drawer-body">
          <div className="field-section">
            <h4>Relaciones</h4>
            <div className="field-grid">
              <div className="field">
                <label>Cliente</label>
                <select value={form.CodigoCliente} onChange={e => {
                  const codigoCliente = e.target.value;
                  const cliente = clientes.find(c => String(c.id) === codigoCliente);
                  setForm(prev => ({...prev, CodigoCliente: codigoCliente, Ciudad: cliente ? (cliente.Ciudad || "") : prev.Ciudad}));
                }}>
                  <option value="">— seleccionar cliente —</option>
                  {clientes.map(c => <option value={c.id} key={c.id}>{c.RazonSocial}</option>)}
                </select>
                {form.CodigoCliente && !linkedCliente && (
                  <div className="field-warning">Este código no coincide con ningún cliente registrado.</div>
                )}
              </div>
              <div className="field">
                <label>Ciudad</label>
                <input type="text" value={form.Ciudad} onChange={e => setField('Ciudad', e.target.value)} />
              </div>
              <div className="field">
                <label>Número de contrato</label>
                <select value={form.Contrato} onChange={e => {
                  const contrato = e.target.value;
                  const matched = procesos.find(p => p.NumeroContrato === contrato);
                  setForm(prev => ({...prev, Contrato: contrato, Proceso: matched ? matched.Radicado : prev.Proceso}));
                }}>
                  <option value="">— seleccionar contrato —</option>
                  {procesos.filter(p => p.NumeroContrato).map(p => (
                    <option value={p.NumeroContrato} key={p.id}>{p.NumeroContrato} · {p.Radicado}</option>
                  ))}
                </select>
                {form.Contrato && !linkedProceso && (
                  <div className="field-warning">Este contrato no coincide con ningún proceso registrado.</div>
                )}
                {linkedProceso && (
                  <div className="field-info">Numero corto: {linkedProceso.Radicado || "—"}</div>
                )}
              </div>
            </div>
          </div>
          <div className="field-section">
            <h4>Datos generales</h4>
            <div className="field-grid">
              <div className="field"><label>Proceso</label><input type="text" value={form.Proceso} onChange={e => setField('Proceso', e.target.value)} /></div>
              <div className="field"><label>Contrato</label><input type="text" value={form.Contrato} readOnly /></div>
              <div className="field">
                <label>Estado de factura</label>
                <select value={form.EstadoFactura} onChange={e => setField('EstadoFactura', e.target.value)}>
                  <option value="">— seleccionar estado —</option>
                  {ESTADO_FACTURA_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field-grid-3" style={{gridColumn:'1/-1'}}>
                <div className="field"><label>Día</label><input type="text" inputMode="numeric" maxLength={2} value={form.Dia} onChange={e => setField('Dia', e.target.value)} /></div>
                <div className="field"><label>Mes</label><input type="text" inputMode="numeric" maxLength={2} value={form.Mes} onChange={e => setField('Mes', e.target.value)} /></div>
                <div className="field"><label>Año</label><input type="text" inputMode="numeric" maxLength={4} value={form.Anio} onChange={e => setField('Anio', e.target.value)} /></div>
              </div>
              <div className="field full" style={{gridColumn:'1/-1'}}>
                <label>Etapa contrato</label>
                <select value={form.EtapaContrato} onChange={e => setField('EtapaContrato', e.target.value)}>
                  <option value="">— seleccionar etapa —</option>
                  {ETAPA_CONTRATO_OPTIONS.map(o => <option value={o} key={o}>{o}</option>)}
                </select>
              </div>
              <div className="field full" style={{gridColumn:'1/-1'}}><label>Observación</label><textarea value={form.Observacion} onChange={e => setField('Observacion', e.target.value)} /></div>
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
                      <td><textarea rows={6} value={form[`Descripcion${n}`]} onChange={e => setLineField(n,'Descripcion',e.target.value)} /></td>
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
            <p style={{fontSize:12.5, color:'var(--texto-suave)', marginTop:-6, marginBottom:12}}>
              Los calcula SharePoint automáticamente (IVA fijo del {IVA_RATE_DEFAULT}%). Lo de aquí abajo es una vista previa mientras editas; el valor definitivo aparece al guardar y actualizar.
            </p>
            <div className="totales-resumen">
              <div><span>Subtotal</span><strong>{fmtMonto(totals.subtotal)}</strong></div>
              <div><span>IVA ({IVA_RATE_DEFAULT}%)</span><strong>{fmtMonto(totals.iva)}</strong></div>
              <div className="totales-resumen-total"><span>Total</span><strong>{fmtMonto(totals.total)}</strong></div>
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
          <div><label>Fecha</label><span>{form.Dia || "—"}/{form.Mes || "—"}/{form.Anio || "—"}</span></div>
          <div><label>Cliente</label><span>{linkedCliente?.RazonSocial || "—"}</span></div>
          <div><label>Ciudad</label><span>{form.Ciudad || "—"}</span></div>
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
            <div><label>Etapa</label><span>{form.EtapaContrato || "—"}</span></div>
            <div><label>Proceso</label><span>{form.Proceso || "—"}</span></div>
            <div><label>Estado</label><span>{form.EstadoFactura || "—"}</span></div>
          </div>
          <div className="print-foot-right">
            <div><label>Subtotal</label><span>{fmtMonto(totals.subtotal)}</span></div>
            <div><label>IVA ({IVA_RATE_DEFAULT}%)</label><span>{fmtMonto(totals.iva)}</span></div>
            <div className="print-total"><label>Total</label><span>{fmtMonto(totals.total)}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}
