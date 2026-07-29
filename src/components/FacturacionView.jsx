import { ICON_SVG } from '../config';
import { clienteForFactura, procesoForFactura, facturaBadgeClass, fmtDate } from '../lib/graph';
import IconButton from './IconButton';

export default function FacturacionView({ facturas, clientes, procesos, searchQuery, onOpenFactura }){
  const query = (searchQuery||"").trim().toLowerCase();
  const rows = facturas.filter(f => {
    if(!query) return true;
    const cliente = clienteForFactura(clientes, f);
    return (f.NumeroFactura||"").toLowerCase().includes(query) ||
      (f.Contrato||"").toLowerCase().includes(query) ||
      (cliente?.RazonSocial||"").toLowerCase().includes(query);
  }).sort((a,b) => (b.FechaEmision||"").localeCompare(a.FechaEmision||""));

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Facturación</h1>
          <p>{rows.length} de {facturas.length} facturas</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No. factura</th><th>Cliente</th><th>Proceso</th><th>Valor</th><th>Estado</th><th>Emisión</th><th>Vencimiento</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map(f => {
              const cliente = clienteForFactura(clientes, f);
              const proceso = procesoForFactura(procesos, f);
              return (
                <tr key={f.id} onClick={() => onOpenFactura(f.id)}>
                  <td>{f.NumeroFactura || "—"}</td>
                  <td className="cliente">{cliente?.RazonSocial || "—"}</td>
                  <td>{proceso?.Radicado || f.Contrato || "—"}</td>
                  <td>{f.Valor || "—"}</td>
                  <td><span className={"badge " + facturaBadgeClass(f.Estado)}>{f.Estado || "—"}</span></td>
                  <td>{fmtDate(f.FechaEmision)}</td>
                  <td>{fmtDate(f.FechaVencimiento)}</td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <div className="row-actions">
                      <IconButton icon="edit" variant="edit" label="Editar factura" onClick={e => { e.stopPropagation(); onOpenFactura(f.id); }} />
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={8}><div className="empty-state"><div className="mark" dangerouslySetInnerHTML={{__html: ICON_SVG}} />No se encontraron facturas con ese criterio.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
