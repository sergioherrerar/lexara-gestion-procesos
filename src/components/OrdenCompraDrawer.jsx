import { facturaDeOrden, textoCruce, fechaDeRegistro } from '../lib/cruceFacturasOrdenes';
import { useState, useEffect } from 'react';
import { clienteForOrdenCompra, procesoForOrdenCompra, ordenCompraNumero, facturaForOrdenCompra, facturaNumero, fmtDate, parseMonto, fmtMonto, IVA_RATE_DEFAULT, ETAPA_CONTRATO_OPTIONS, nombreArchivoSeguro, mensajeError } from '../lib/graph';
import { generarPdfDesdeNodo, precargarImagen, precalentarLibreriasPdf } from '../lib/generarPdfDocumento';
import { obtenerQrRedesDataUrl } from '../lib/qr';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import membrete from '../assets/Membrete Lexara.png';
import { OrdenCompraHoja, LINE_NUMS, emptyForm, lineTotal, computeLive, nombreArchivoOrdenCompraPDF, fechaDeImpresion } from './OrdenCompraHoja';


export default function OrdenCompraDrawer({ ordenCompra, clientes, procesos, facturas, ordenesCompra, liveMode, onClose, onSave, onUpdateCliente, autoPrint, onAutoPrinted, saving, notify }){
  const [form, setForm] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  useEffect(() => {
    setForm(ordenCompra ? emptyForm(ordenCompra, clientes) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenCompra]);

  // Pedido explícito del usuario 2026-09-15: el botón "Guardar en PDF" ya NO
  // abre el cuadro de impresión del navegador — genera el archivo directo y
  // lo manda a Descargas, mismo mecanismo que Facturas (ver
  // lib/generarPdfDocumento.js).
  async function guardarComoPdf(){
    setGenerandoPdf(true);
    try{
      // En paralelo: librerías del PDF, membrete y QR (antes iban en fila).
      const [qrDataUrl] = await Promise.all([
        obtenerQrRedesDataUrl(),
        precargarImagen(membrete),
        precalentarLibreriasPdf(),
      ]);
      const qrImgEl = document.getElementById('oc-print-qr');
      if(qrImgEl) qrImgEl.src = qrDataUrl;
      await precargarImagen(qrDataUrl);
      await generarPdfDesdeNodo('oc-print-sheet', nombreArchivoOrdenCompraPDF(ordenCompra, clientes, procesos));
      notify?.("PDF generado — revisa tu carpeta de Descargas.", 'success');
    }catch(err){
      console.error(err);
      notify?.("No se pudo generar el PDF: " + mensajeError(err), 'error');
    }finally{
      setGenerandoPdf(false);
    }
  }

  useEffect(() => {
    if(autoPrint && form){
      guardarComoPdf().then(() => { onAutoPrinted && onAutoPrinted(); });
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
  // Cruce exacto con lo que se está editando; si no hay, el cruce flexible de la orden guardada (mientras no se haya cambiado Contrato/Proceso/Etapa).
  const facturaExacta = facturaForOrdenCompra(facturas, form);
  const sinCambiarClaves = ordenCompra && form.Contrato === ordenCompra.Contrato && form.Proceso === ordenCompra.Proceso && form.EtapaContrato === ordenCompra.EtapaContrato;
  const cruceFlexible = !facturaExacta && sinCambiarClaves ? facturaDeOrden(facturas, ordenCompra, ordenesCompra) : { factura: null, metodo: '' };
  const linkedFactura = facturaExacta || cruceFlexible.factura;
  const metodoFactura = facturaExacta ? 'Exacto' : cruceFlexible.metodo;
  const totals = computeLive(form);
  const numero = ordenCompraNumero(ordenCompra);
  const ahora = new Date();
  const fechaImpresion = `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}`;

  return (
    <>
      {/* Pedido explícito del usuario 2026-09-15: el botón de PDF de la tabla
          nunca debe mostrar el formulario — mismo criterio que FacturaDrawer. */}
      {!autoPrint && (
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
                  {linkedFactura ? `No. ${facturaNumero(linkedFactura)}${fechaDeRegistro(linkedFactura) ? ' · ' + fmtDate(fechaDeRegistro(linkedFactura)) : ''}${metodoFactura && metodoFactura !== 'Exacto' ? ' (≈ ' + textoCruce(metodoFactura).toLowerCase() + ' — revísala)' : ''}` : "— sin factura con este contrato —"}
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
          <button className="btn-secondary" onClick={guardarComoPdf} disabled={saving || generandoPdf}>{generandoPdf ? "Generando PDF…" : "Guardar en PDF"}</button>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <span className="save-hint">{liveMode ? "Los cambios se guardan en SharePoint." : "Modo demo — los cambios no se guardan."}</span>
        </div>
      </div>
      </>
      )}

      <OrdenCompraHoja idHoja="oc-print-sheet" idQr="oc-print-qr" ordenCompra={ordenCompra} form={form} linkedCliente={linkedCliente} linkedFactura={linkedFactura} totals={totals} fechaImpresion={fechaImpresion} />
    </>
  );
}
