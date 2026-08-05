import { ICON_SVG } from '../config';
import { clienteForOrdenCompra, procesoForOrdenCompra, ordenCompraNumero, computeOrdenCompraTotals, facturaForOrdenCompra, facturaNumero, fmtMonto, fmtDate, fechaFromPartes } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';

function fechaOrdenable(oc){
  return fechaFromPartes(oc.Dia, oc.Mes, oc.Anio) || oc.Fecha || "";
}

export default function OrdenesCompraView({ ordenesCompra, clientes, procesos, facturas, searchQuery, onOpenOrdenCompra, onCreateOrdenCompra, onPrintOrdenCompra }){
  const query = (searchQuery||"").trim().toLowerCase();
  const rows = ordenesCompra.filter(oc => {
    if(!query) return true;
    const cliente = clienteForOrdenCompra(clientes, oc);
    return ordenCompraNumero(oc).toLowerCase().includes(query) ||
      (oc.Contrato||"").toLowerCase().includes(query) ||
      (oc.Proceso||"").toLowerCase().includes(query) ||
      (cliente?.RazonSocial||"").toLowerCase().includes(query);
  }).sort((a,b) => Number(ordenCompraNumero(b)) - Number(ordenCompraNumero(a)));

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Órdenes de compra</h1>
          <p>{rows.length} de {ordenesCompra.length} órdenes de compra</p>
        </div>
        <IconTextButton icon="add" variant="primary" style={{background:'var(--verde-claro)'}} onClick={onCreateOrdenCompra}>Nueva orden de compra</IconTextButton>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No. orden</th><th>Cliente</th><th>Contrato</th><th>Proceso</th><th>Fecha</th><th>Subtotal</th><th>IVA</th><th>Total</th><th>Factura</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(oc => {
              const cliente = clienteForOrdenCompra(clientes, oc);
              const proceso = procesoForOrdenCompra(procesos, oc);
              const factura = facturaForOrdenCompra(facturas, oc);
              const totals = computeOrdenCompraTotals(oc);
              return (
                <tr
                  key={oc.id}
                  onClick={() => onOpenOrdenCompra(oc.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpenOrdenCompra(oc.id); } }}
                >
                  <td>{ordenCompraNumero(oc)}</td>
                  <td className="cliente">{cliente?.RazonSocial || "—"}</td>
                  <td>{oc.Contrato || "—"}</td>
                  <td>{proceso?.Radicado || oc.Proceso || "—"}</td>
                  <td>{fmtDate(fechaOrdenable(oc))}</td>
                  <td>{fmtMonto(totals.subtotal)}</td>
                  <td>{fmtMonto(totals.iva)}</td>
                  <td>{fmtMonto(totals.total)}</td>
                  <td>{factura ? facturaNumero(factura) : "—"}</td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <div className="row-actions">
                      <IconButton icon="edit" variant="edit" label="Ver / editar orden de compra" onClick={e => { e.stopPropagation(); onOpenOrdenCompra(oc.id); }} />
                      <IconButton icon="print" variant="print" label="Imprimir orden de compra" onClick={e => { e.stopPropagation(); onPrintOrdenCompra(oc.id); }} />
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={10}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No se encontraron órdenes de compra con ese criterio.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
