import { ICON_SVG } from '../config';
import { clienteForFactura, procesoForFactura, facturaNumero, computeFacturaTotals, fmtMonto, fmtDate, fechaFromPartes } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';

function fechaOrdenable(f){
  return fechaFromPartes(f.Dia, f.Mes, f.Anio) || f.Fecha || "";
}

export default function FacturacionView({ facturas, clientes, procesos, searchQuery, onOpenFactura, onCreateFactura, onPrintFactura }){
  const query = (searchQuery||"").trim().toLowerCase();
  const rows = facturas.filter(f => {
    if(!query) return true;
    const cliente = clienteForFactura(clientes, f);
    return facturaNumero(f).toLowerCase().includes(query) ||
      (f.Contrato||"").toLowerCase().includes(query) ||
      (f.Proceso||"").toLowerCase().includes(query) ||
      (cliente?.RazonSocial||"").toLowerCase().includes(query);
  }).sort((a,b) => Number(facturaNumero(b)) - Number(facturaNumero(a)));

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Facturación</h1>
          <p>{rows.length} de {facturas.length} facturas</p>
        </div>
        <IconTextButton icon="add" variant="primary" onClick={onCreateFactura}>Nueva factura</IconTextButton>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No. factura</th><th>Cliente</th><th>Contrato</th><th>Proceso</th><th>Fecha</th><th>Subtotal</th><th>IVA</th><th>Total</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(f => {
              const cliente = clienteForFactura(clientes, f);
              const proceso = procesoForFactura(procesos, f);
              const totals = computeFacturaTotals(f);
              return (
                <tr key={f.id} onClick={() => onOpenFactura(f.id)}>
                  <td>{facturaNumero(f)}</td>
                  <td className="cliente">{cliente?.RazonSocial || "—"}</td>
                  <td>{f.Contrato || "—"}</td>
                  <td>{proceso?.Radicado || f.Proceso || "—"}</td>
                  <td>{fmtDate(fechaOrdenable(f))}</td>
                  <td>{fmtMonto(totals.subtotal)}</td>
                  <td>{fmtMonto(totals.iva)}</td>
                  <td>{fmtMonto(totals.total)}</td>
                  <td><span className={"estado-badge" + (f.EstadoFactura ? " estado-" + f.EstadoFactura.toLowerCase() : "")}>{f.EstadoFactura || "—"}</span></td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <div className="row-actions">
                      <IconButton icon="edit" variant="edit" label="Ver / editar factura" onClick={e => { e.stopPropagation(); onOpenFactura(f.id); }} />
                      <IconButton icon="print" variant="print" label="Imprimir factura" onClick={e => { e.stopPropagation(); onPrintFactura(f.id); }} />
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={10}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No se encontraron facturas con ese criterio.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
