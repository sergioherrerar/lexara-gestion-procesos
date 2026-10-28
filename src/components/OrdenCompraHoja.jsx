import { clienteForOrdenCompra, ordenCompraNumero, facturaNumero, parseMonto, fmtMonto, IVA_RATE_DEFAULT, procesoForOrdenCompra, nombreArchivoSeguro } from '../lib/graph';
import membrete from '../assets/Membrete Lexara.png';

// La HOJA imprimible de la Orden de compra («SOLICITUD DE NUMERO ORDEN DE COMPRA», A4 con membrete) y sus ayudas de cálculo. Vivía dentro de OrdenCompraDrawer.jsx;
// se separó (2026-10-29) para poder dibujar la misma hoja fuera del drawer —en el correo de Órdenes Colmédica se generan los PDF de las órdenes sin abrirlas—.
// Nada cambia para quien la usa desde el drawer: mismo diseño, mismos cálculos.
export const LINE_NUMS = [1,2,3,4,5,6];
const OTHER_FIELDS = ["Proceso","Dia","Mes","Anio","EtapaContrato","Observacion"];

export function emptyForm(oc, clientes){
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

export function lineTotal(form, n){
  return parseMonto(form[`Cantidad${n}`]) * parseMonto(form[`ValorUnitario${n}`]);
}
export function computeLive(form){
  const subtotal = LINE_NUMS.reduce((sum,n) => sum + lineTotal(form,n), 0);
  const iva = subtotal * (IVA_RATE_DEFAULT/100);
  return { subtotal, iva, total: subtotal + iva };
}

// Nombre del PDF — pedido explícito del usuario 2026-09-15 (reemplaza el
// formato anterior "OC (Cliente) (Proceso)" de 2026-09-07): "OC" + Entidad +
// Número Corto + Etapa contrato — mismo patrón que Facturas.
export function nombreArchivoOrdenCompraPDF(oc, clientes, procesos){
  // ordenCompraNumero ya trae el prefijo "OC-" (ej. "OC-2026-0002") — no se
  // repite acá para no leer "OC OC-2026-0002".
  const proceso = procesoForOrdenCompra(procesos, oc);
  return nombreArchivoSeguro(`${ordenCompraNumero(oc)} ${proceso?.Entidad || 'Sin entidad'} ${proceso?.Radicado || oc.Proceso || 'Sin proceso'} ${oc.EtapaContrato || ''}`.trim());
}

// `idHoja`/`idQr`: ids del nodo y del QR (distintos si hay varias hojas a la vez). `ordenCompra` = el registro (para el número); `form` = emptyForm(...) o el formulario en edición.
export function OrdenCompraHoja({ idHoja = 'oc-print-sheet', idQr = 'oc-print-qr', ordenCompra, form, linkedCliente, linkedFactura, totals, fechaImpresion }){
  const numero = ordenCompraNumero(ordenCompra);
  return (
      <div className="print-sheet print-sheet-oc" id={idHoja}>
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
            <img id={idQr} alt="Redes sociales" className="print-qr" />
            <span>Generado el {fechaImpresion}</span>
          </div>
        </div>
      </div>
  );
}

export function fechaDeImpresion(){
  const ahora = new Date();
  return `${ahora.toLocaleDateString('es-CO')} ${ahora.toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'})}`;
}
