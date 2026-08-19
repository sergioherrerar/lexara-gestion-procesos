import { useState } from 'react';
import { ICON_SVG } from '../config';
import { clienteForFactura, procesoForFactura, facturaNumero, computeFacturaTotals, fmtMonto, fmtDate, fechaFromPartes, estadoFacturaBadgeClass, compareFacturaNumero, abrirFacturaSiigo } from '../lib/graph';
import IconButton, { IconTextButton } from './IconButton';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { useColumnFilters } from '../hooks/useColumnFilters';
import { useColumnSort } from '../hooks/useColumnSort';

function fechaOrdenable(f){
  return fechaFromPartes(f.Dia, f.Mes, f.Anio) || f.Fecha || "";
}

export default function FacturacionView({ facturas, clientes, procesos, searchQuery, onOpenFactura, onCreateFactura, onPrintFactura, config, notify }){
  const { filters, setFilter, clearFilters, rowMatches, hasActiveFilters } = useColumnFilters();
  const { sort, setSortKey, sortRows } = useColumnSort();
  const [buscandoSiigo, setBuscandoSiigo] = useState(null); // id de la factura mientras se busca su PDF

  async function handleBuscarSiigo(f){
    setBuscandoSiigo(f.id);
    try{
      await abrirFacturaSiigo(f, config.SIIGO_SHARE_URL);
    }catch(err){
      console.error(err);
      notify(err.message, 'error');
    }
    setBuscandoSiigo(null);
  }

  const COLUMNS = [
    {key:'numero', label:'No. factura', value: f => facturaNumero(f)},
    {key:'cliente', label:'Cliente', value: f => clienteForFactura(clientes, f)?.RazonSocial || ""},
    {key:'contrato', label:'Contrato', value: f => f.Contrato || ""},
    {key:'proceso', label:'Proceso', value: f => procesoForFactura(procesos, f)?.Radicado || f.Proceso || ""},
    {key:'fecha', label:'Fecha', value: f => fmtDate(fechaOrdenable(f))},
    {key:'subtotal', label:'Subtotal', value: f => fmtMonto(computeFacturaTotals(f).subtotal)},
    {key:'iva', label:'IVA', value: f => fmtMonto(computeFacturaTotals(f).iva)},
    {key:'total', label:'Total', value: f => fmtMonto(computeFacturaTotals(f).total)},
    {key:'estado', label:'Estado', value: f => f.EstadoFactura || ""},
    {key:'acciones', label:'Acciones', filterable:false},
  ];

  const query = (searchQuery||"").trim().toLowerCase();
  const rows = facturas.filter(f => {
    if(!rowMatches(f, COLUMNS)) return false;
    if(!query) return true;
    const cliente = clienteForFactura(clientes, f);
    return facturaNumero(f).toLowerCase().includes(query) ||
      (f.Contrato||"").toLowerCase().includes(query) ||
      (f.Proceso||"").toLowerCase().includes(query) ||
      (cliente?.RazonSocial||"").toLowerCase().includes(query);
  }).sort(compareFacturaNumero);
  const sortedRows = sortRows(rows, COLUMNS);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Facturación</h1>
          <p>{rows.length} de {facturas.length} facturas{hasActiveFilters && <> · <button type="button" className="clear-filters-link" onClick={clearFilters}>Limpiar filtros de columna</button></>}</p>
        </div>
        <IconTextButton icon="add" variant="primary" onClick={onCreateFactura}>Nueva factura</IconTextButton>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <ColumnHeaderMenu key={c.key} column={c} sort={sort} onSort={setSortKey} filterValue={filters[c.key]} onFilterChange={setFilter} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? sortedRows.map(f => {
              const cliente = clienteForFactura(clientes, f);
              const proceso = procesoForFactura(procesos, f);
              const totals = computeFacturaTotals(f);
              return (
                <tr
                  key={f.id}
                  onClick={() => onOpenFactura(f.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); onOpenFactura(f.id); } }}
                >
                  <td>{facturaNumero(f)}</td>
                  <td className="cliente">{cliente?.RazonSocial || "—"}</td>
                  <td>{f.Contrato || "—"}</td>
                  <td>{proceso?.Radicado || f.Proceso || "—"}</td>
                  <td>{fmtDate(fechaOrdenable(f))}</td>
                  <td>{fmtMonto(totals.subtotal)}</td>
                  <td>{fmtMonto(totals.iva)}</td>
                  <td>{fmtMonto(totals.total)}</td>
                  <td><span className={"badge " + estadoFacturaBadgeClass(f.EstadoFactura)}>{f.EstadoFactura || "—"}</span></td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <div className="row-actions">
                      <IconButton icon="edit" variant="edit" label="Ver / editar factura" onClick={e => { e.stopPropagation(); onOpenFactura(f.id); }} />
                      <IconButton icon="print" variant="print" label="Imprimir factura" onClick={e => { e.stopPropagation(); onPrintFactura(f.id); }} />
                      <IconButton icon="open" variant="open" label="Buscar y abrir factura electrónica (Siigo)" spinning={buscandoSiigo===f.id} onClick={e => { e.stopPropagation(); handleBuscarSiigo(f); }} />
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
