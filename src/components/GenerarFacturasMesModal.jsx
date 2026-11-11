import { useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';
import { buscarOrdenDelMes, MESES_NOMBRES } from '../lib/ordenesComprasColmedica';
import { ordenCompraNumero, facturaNumero, fmtMonto, computeOrdenCompraTotals } from '../lib/graph';
import { facturaDeOrden } from '../lib/cruceFacturasOrdenes';
import { payloadFacturaDesdeOrden } from '../lib/correoFacturasMes';

// Órdenes Colmédica → «Generador de facturas del mes» (2026-11-11, pedido del usuario): paso 1. Por cada Cliente con orden de compra del mes crea su factura (mismos datos de la orden), salvo que
// ya exista. Nada se guarda en SharePoint hasta «Sí, crear». Las órdenes que faltan se avisan (se generan primero con «Generar órdenes de compra del mes»). Al terminar sigue al correo a Beatriz.
export default function GenerarFacturasMesModal({ mes, anio, grupos, facturas, ordenesCompra, onCrear, onCreadas, onContinuarCorreo, onClose, notify }){
  const [creando, setCreando] = useState(false);
  const [resultados, setResultados] = useState(null);

  const filas = useMemo(() => (grupos || []).map(g => {
    const oc = buscarOrdenDelMes(g.cliente, ordenesCompra, mes, anio);
    const existente = oc ? facturaDeOrden(facturas, oc, ordenesCompra).factura : null;
    return { grupo: g, oc, existente, total: oc ? computeOrdenCompraTotals(oc).total : 0 };
  }), [grupos, ordenesCompra, facturas, mes, anio]);
  const sinOrden = filas.filter(f => !f.oc);
  const porCrear = filas.filter(f => f.oc && !f.existente);

  async function crear(){
    setCreando(true);
    try{
      const r = await onCrear(porCrear.map(f => ({ cliente: f.grupo.cliente, payload: payloadFacturaDesdeOrden(f.oc) })));
      setResultados(r);
      onCreadas?.(r);
      const ok = r.filter(x => x.factura).length, mal = r.length - ok;
      notify?.(mal ? `Se crearon ${ok} facturas y ${mal} fallaron; revisa el detalle.` : `✓ Se crearon ${ok} facturas de ${MESES_NOMBRES[mes]}.`, mal ? 'error' : 'success');
      if(!mal && !sinOrden.length) onContinuarCorreo?.();
    }catch(err){ console.error(err); notify?.('No se pudieron crear las facturas: ' + (err?.message || err), 'error'); }
    finally{ setCreando(false); }
  }

  const todasListas = !sinOrden.length && (resultados ? resultados.every(x => x.factura) : porCrear.length === 0);
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={'Generar facturas de ' + MESES_NOMBRES[mes]}>
      <div className="confirm-box felicitacion-box" style={{ maxWidth: 800 }}>
        <div className="felicitacion-cab">
          <h3>Facturas de {MESES_NOMBRES[mes]} de {anio}</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        <p className="save-hint" style={{ margin: '0 0 8px' }}>Una factura por cada orden de compra del mes. Las que ya existen no se tocan ni se duplican; cada factura nueva guarda su PDF en «1 Soportes de gastos MD / año / mes». Al terminar se sigue al correo a Beatriz.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Orden de compra</th><th style={{ textAlign: 'right' }}>Total con IVA</th><th>Factura</th></tr></thead>
            <tbody>
              {filas.map(f => {
                const res = resultados?.find(x => x.cliente === f.grupo.cliente);
                return (
                  <tr key={f.grupo.cliente}>
                    <td className="cliente">{f.grupo.cliente}</td>
                    <td>{f.oc ? ordenCompraNumero(f.oc) : <span style={{ color: '#a3281c' }}>Falta generarla</span>}</td>
                    <td style={{ textAlign: 'right' }}>{f.oc ? '$ ' + fmtMonto(f.total) : '—'}</td>
                    <td>
                      {res?.factura ? <span className="badge badge-verde">✓ Creada · FE {facturaNumero(res.factura)}</span>
                        : res?.error ? <span style={{ color: '#a3281c' }}>✗ {res.error}</span>
                        : f.existente ? <span className="badge badge-verde">Ya generada · FE {facturaNumero(f.existente)}</span>
                        : f.oc ? 'Se creará' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sinOrden.length > 0 && (
          <p className="save-hint" style={{ color: '#a3281c' }}>Falta la orden de compra de {sinOrden.map(f => f.grupo.cliente).join(', ')}: genérala primero con «Generar órdenes de compra del mes».</p>
        )}
        <div className="confirm-actions" style={{ marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {!resultados && porCrear.length > 0 && (
            <IconTextButton icon="mail" variant="primary" onClick={crear} disabled={creando}>
              {creando ? 'Creando…' : `Crear ${porCrear.length} factura${porCrear.length === 1 ? '' : 's'} y seguir al correo`}
            </IconTextButton>
          )}
          {todasListas && filas.length > 0 && (
            <IconTextButton icon="mail" variant="primary" onClick={onContinuarCorreo}>Continuar al correo a Beatriz</IconTextButton>
          )}
        </div>
      </div>
    </div>
  );
}
