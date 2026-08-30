import { useState, useEffect } from 'react';
import { clienteForOrdenCompra, procesoForOrdenCompra, ordenCompraNumero, facturaForOrdenCompra, facturaNumero, parseMonto, fmtMonto, IVA_RATE_DEFAULT, ETAPA_CONTRATO_OPTIONS } from '../lib/graph';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import membrete from '../assets/Membrete Lexara.png';
import qrRedes from '../assets/Qr_Redes.png';

// Mismo problema que en Facturación: si se llama a window.print() antes de que
// el membrete/QR terminen de cargar, salen en blanco en el PDF impreso.
function preloadImage(src){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}
function imprimirCuandoListo(){
  Promise.all([preloadImage(membrete), preloadImage(qrRedes)]).then(() => window.print());
}

const LINE_NUMS = [1,2,3,4,5,6];
const OTHER_FIELDS = ["Proceso","Dia","Mes","Anio","EtapaContrato","Observacion"];

function emptyForm(oc, clientes){
  const cliente = clienteForOrdenCompra(clientes, oc);
  const initial = { CodigoCliente: oc.CodigoCliente || "", Contrato: oc.Contrato || "", Ciudad: cliente?.Ciudad || "Bogota D.C" };
  OTHER_FIELDS.forEach(key => { initial[key] = oc[key] || ""; });
  LINE_NUMS.forEach(n => {
    initial[`Descripcion${n}`] = oc[`Descripcion${n}`] || "";
    initial[`Cantidad${n}`] = oc[`Cantidad${n}`] || "";
    const vu = oc[`ValorUnitario${n}`];
    initial[`ValorUnitario${n}`] = vu ? fmtMonto(parseMonto(vu)) : "";
  });
  return initial;
}

function lineTotal(form, n){
  return parseMonto(form[`Cantidad${n}`]) * parseMonto(form[`ValorUnitario${n}`]);
}
function computeLive(form){
  const subtotal = LINE_NUMS.reduce((sum,n) => sum + lineTotal(form,n), 0);
  const iva = subtotal * (IVA_RATE_DEFAULT/100);
  return { subtotal, iva, total: subtotal + iva };
}

export default function OrdenCompraDrawer({ ordenCompra, clientes, procesos, facturas, liveMode, onClose, onSave, onUpdateCliente, autoPrint, onAutoPrinted, saving }){
  const [form, setForm] = useState(null);

  useEffect(() => {
    setForm(ordenCompra ? emptyForm(ordenCompra, clientes) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenCompra]);

  useEffect(() => {
    if(autoPrint && form){
      imprimirCuandoListo();
      onAutoPrinted && onAutoPrinted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, form]);

  useEscapeToClose(!!ordenCompra, onClose);

  if(!ordenCompra || !form) return null;

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }
  function setLineField(n, field, value){ setField(`${field}${n}`, value); }

  // Fecha/TotalN/Subtotal/IVA/Total/RetIva/ValorAPagar son columnas calculadas
  // por fórmula en SharePoint, igual que en Facturación — nunca se les escribe.
  function handleSave(){
    const payload = {...form};
    LINE_NUMS.forEach(n => { delete payload[`Total${n}`]; });
    delete payload.Fecha;
    delete payload.Subtotal;
    delete payload.Iva;
    delete payload.Total;
    delete payload.RetIva;
    delete payload.ValorAPagar;
    ['Dia','Mes','Anio','CodigoCliente'].forEach(k => { payload[k] = parseMonto(payload[k]); });
    LINE_NUMS.forEach(n => {
      payload[`Cantidad${n}`] = parseMonto(payload[`Cantidad${n}`]);
      payload[`ValorUnitario${n}`] = parseMonto(payload[`ValorUnitario${n}`]);
    });
    // "Factura" es de solo lectura en SharePoint (columna calculada/lookup) —
    // igual que Fecha/TotalN, nunca se le escribe. Se sigue mostrando en
    // pantalla calculada en vivo (facturaForOrdenCompra), solo que no se envía.
    delete payload.Factura;
    const ciudad = payload.Ciudad;
    delete payload.Ciudad;
    const clienteOriginal = clienteForOrdenCompra(clientes, ordenCompra);
    if(clienteOriginal && ciudad !== (clienteOriginal.Ciudad || "") && onUpdateCliente){
      onUpdateCliente(clienteOriginal.id, { Ciudad: ciudad });
    }
    onSave(payload);
  }

  const linkedCliente = clienteForOrdenCompra(clientes, form);
  const linkedProceso = procesoForOrdenCompra(procesos, form);
  const linkedFactura = facturaForOrdenCompra(facturas, form);
  const totals = computeLive(form);
  const numero = ordenCompraNumero(ordenCompra);
  const ahora = new Date();
  const fechaImpresion = `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}`;

  return (
    <>
      <div id="oc-overlay" className="active" onClick={onClose}></div>
      <div id="oc-drawer" className="active">
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="eyebrow eyebrow-oc">ORDEN DE COMPRA</div>
          <h2>{numero ? `No. ${numero}` : "Nueva orden de compra (No. se asigna al guardar)"}</h2>
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
                  setForm(prev => ({...prev, CodigoCliente: codigoCliente, Ciudad: cliente ? (cliente.Ciudad || "Bogota D.C") : prev.Ciudad}));
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
                <input type="text" list="lista-contratos-oc" value={form.Contrato} onChange={e => {
                  const contrato = e.target.value;
                  const matched = procesos.find(p => p.NumeroContrato === contrato);
                  setForm(prev => ({...prev, Contrato: contrato, Proceso: matched ? matched.Radicado : prev.Proceso}));
                }} placeholder="Escribe para buscar…" />
                <datalist id="lista-contratos-oc">
                  {procesos.filter(p => p.NumeroContrato).map(p => (
                    <option value={p.NumeroContrato} key={p.id}>{p.NumeroContrato} · {p.Radicado}</option>
                  ))}
                </datalist>
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
                <label>Factura relacionada</label>
                <div className="field-info" style={{marginTop:0}}>
                  {linkedFactura ? `No. ${facturaNumero(linkedFactura)}` : "— sin factura con este contrato —"}
                </div>
              </div>
              <div className="field-grid-3" style={{gridColumn:'1/-1'}}>
                <div className="field"><label>Día</label><input type="text" inputMode="numeric" maxLength={2} value={form.Dia} onChange={e => setField('Dia', e.target.value)} /></div>
                <div className="field"><label>Mes</label><input type="text" inputMode="numeric" maxLength={2} value={form.Mes} onChange={e => setField('Mes', e.target.value)} /></div>
                <div className="field"><label>Año</label><input type="text" inputMode="numeric" maxLength={4} value={form.Anio} onChange={e => setField('Anio', e.target.value)} /></div>
              </div>
              <div className="field full" style={{gridColumn:'1/-1'}}>
                <label>Etapa contrato</label>
                {/* Si el valor ya guardado no coincide con ninguna opción fija
                    (ej. una orden vieja con un texto que ya no existe en
                    SharePoint, como "Acta Audiencia" o "Entrega de Poder"
                    antes de esta corrección) se agrega igual como opción —
                    mismo criterio que otros selects de la app — para no
                    perderlo de vista ni pisarlo con "" al guardar sin querer. */}
                <select value={form.EtapaContrato} onChange={e => setField('EtapaContrato', e.target.value)}>
                  <option value="">— seleccionar etapa —</option>
                  {form.EtapaContrato && !ETAPA_CONTRATO_OPTIONS.includes(form.EtapaContrato) && <option value={form.EtapaContrato}>{form.EtapaContrato}</option>}
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
                      <td><div className="linea-total">{(form[`Cantidad${n}`] || form[`ValorUnitario${n}`]) ? fmtMonto(lineTotal(form,n)) : ""}</div></td>
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
          <button className="btn-primary btn-primary-oc" onClick={handleSave} disabled={saving}>
            {saving && <span className="btn-spinner" />}{saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <button className="btn-secondary" onClick={imprimirCuandoListo} disabled={saving}>Imprimir</button>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <span className="save-hint">{liveMode ? "Los cambios se guardan en SharePoint." : "Modo demo — los cambios no se guardan."}</span>
        </div>
      </div>

      <div className="print-sheet print-sheet-oc">
        <img src={membrete} alt="" className="print-membrete-bg" />
        <div className="print-body">
        <div className="print-head">
          <div className="print-title">
            <h1>SOLICITUD DE NUMERO ORDEN DE COMPRA</h1>
            <h2>MD ABOGADOS Nit: 900495788-3</h2>
          </div>
          <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6}}>
            <div className="print-numero">{numero}</div>
            <div className="print-oc-stamp">Orden de compra</div>
          </div>
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
            <div><label>Factura</label><span>{linkedFactura ? facturaNumero(linkedFactura) : "—"}</span></div>
          </div>
          <div className="print-foot-right">
            <div><label>Subtotal</label><span>{fmtMonto(totals.subtotal)}</span></div>
            <div><label>IVA ({IVA_RATE_DEFAULT}%)</label><span>{fmtMonto(totals.iva)}</span></div>
            <div className="print-total"><label>Total</label><span>{fmtMonto(totals.total)}</span></div>
          </div>
        </div>
        </div>
        <div className="print-page-footer">
          <div className="print-page-footer-contact">
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg> www.lexaraabogados.com</span>
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg> Gerencia@lexaraabogados.com</span>
            <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2z"/></svg> +57 312 442 0026</span>
          </div>
          <div className="print-page-footer-meta">
            <img src={qrRedes} alt="Redes sociales" className="print-qr" />
            <span>Generado el {fechaImpresion}</span>
          </div>
        </div>
      </div>
    </>
  );
}
