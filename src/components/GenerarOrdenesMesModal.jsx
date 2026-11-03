import { useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';
import { buscarOrdenDelMes, construirBorradorOrdenCompra, borradorAPayloadOrdenCompra, MESES_NOMBRES } from '../lib/ordenesComprasColmedica';
import { ordenCompraNumero, fmtMonto, parseMonto, computeOrdenCompraTotals } from '../lib/graph';

// Órdenes Colmédica → «Generar órdenes de compra del mes» (2026-11-03, pedido del usuario): en vez de «Generar borrador» → «Guardar cambios» cliente por cliente, crea de una vez la orden de
// cada Cliente con tutelas en el mes elegido. Primero lista qué se creará y qué ya existe; no se guarda nada en SharePoint hasta «Sí, crear». Las que ya existen no se tocan.
// Al terminar ofrece seguir al correo a Dania, que adjunta los PDF de las órdenes y el Excel de cada cliente.
export default function GenerarOrdenesMesModal({ mes, anio, grupos, valoresEntidad, clientes, ordenesCompra, onCrear, onContinuarCorreo, onClose, notify }){
  const [confirmando, setConfirmando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [resultados, setResultados] = useState(null);

  const filas = useMemo(() => (grupos || []).map(g => {
    const existente = buscarOrdenDelMes(g.cliente, ordenesCompra, mes, anio);
    const borrador = existente ? null : construirBorradorOrdenCompra(g, mes, anio, valoresEntidad, clientes);
    const total = borrador ? computeOrdenCompraTotals(borrador).total : 0;
    return { grupo: g, existente, borrador, total };
  }), [grupos, ordenesCompra, mes, anio, valoresEntidad, clientes]);
  const porCrear = filas.filter(f => !f.existente);
  const incompletas = porCrear.filter(f => !f.borrador.CodigoCliente || !(parseMonto(f.borrador.Cantidad1) > 0));

  async function crear(){
    setConfirmando(false); setCreando(true);
    try{
      const r = await onCrear(porCrear.map(f => ({ cliente: f.grupo.cliente, payload: borradorAPayloadOrdenCompra(f.borrador) })));
      setResultados(r);
      const ok = r.filter(x => x.orden).length, mal = r.length - ok;
      notify?.(mal ? `Se crearon ${ok} órdenes y ${mal} fallaron; revisa el detalle.` : `✓ Se crearon ${ok} órdenes de compra de ${MESES_NOMBRES[mes]}.`, mal ? 'error' : 'success');
    }catch(err){ console.error(err); notify?.('No se pudieron crear las órdenes: ' + (err?.message || err), 'error'); }
    finally{ setCreando(false); }
  }

  const todasListas = resultados ? resultados.every(x => x.orden) : porCrear.length === 0;
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={'Generar órdenes de compra de ' + MESES_NOMBRES[mes]}>
      <div className="confirm-box felicitacion-box" style={{ maxWidth: 760 }}>
        <div className="felicitacion-cab">
          <h3>Órdenes de compra de {MESES_NOMBRES[mes]} de {anio}</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
        <p className="save-hint" style={{ margin: '0 0 8px' }}>Una orden por Cliente con tutelas que vencen en el mes. Las que ya existen no se tocan ni se duplican.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th style={{ textAlign: 'right' }}>Total con IVA</th><th>Estado</th></tr></thead>
            <tbody>
              {filas.map(f => {
                const res = resultados?.find(x => x.cliente === f.grupo.cliente);
                return (
                  <tr key={f.grupo.cliente}>
                    <td className="cliente">{f.grupo.cliente}</td>
                    <td style={{ textAlign: 'right' }}>{f.existente ? '—' : '$ ' + fmtMonto(f.total)}</td>
                    <td>
                      {res?.orden ? <span className="badge badge-verde">✓ Creada · {ordenCompraNumero(res.orden)}</span>
                        : res?.error ? <span style={{ color: '#a3281c' }}>✗ {res.error}</span>
                        : f.existente ? <span className="badge badge-verde">Ya generada · {ordenCompraNumero(f.existente)}</span>
                        : 'Se creará'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {incompletas.length > 0 && !resultados && (
          <p className="save-hint" style={{ color: '#a3281c' }}>Ojo: {incompletas.map(f => f.grupo.cliente).join(', ')} no tiene el cliente enlazado o la cantidad en blanco; revisa el borrador de esa orden antes de crearla.</p>
        )}
        <div className="confirm-actions" style={{ marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {!resultados && porCrear.length > 0 && (confirmando ? (
            <>
              <span className="save-hint" style={{ margin: 0 }}>Se {porCrear.length === 1 ? 'creará 1 orden de compra real' : `crearán ${porCrear.length} órdenes de compra reales`} en SharePoint. ¿Continuar?</span>
              <IconTextButton icon="add" variant="primary" onClick={crear} disabled={creando}>Sí, crear</IconTextButton>
              <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
            </>
          ) : (
            <IconTextButton icon="add" variant="primary" onClick={() => setConfirmando(true)} disabled={creando}>
              {creando ? 'Creando…' : `Crear ${porCrear.length} orden${porCrear.length === 1 ? '' : 'es'} de compra`}
            </IconTextButton>
          ))}
          {todasListas && filas.length > 0 && (
            <IconTextButton icon="mail" variant="primary" onClick={onContinuarCorreo}>Continuar al correo a Dania</IconTextButton>
          )}
        </div>
      </div>
    </div>
  );
}
