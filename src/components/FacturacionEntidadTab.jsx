import { useState } from 'react';
import { groupCount, clienteForFactura, clienteForOrdenCompra } from '../lib/graph';
import { generarInformeFacturasExcel, generarInformeOrdenesCompraExcel } from '../lib/informeFacturacion';
import BarChart from './BarChart';
import IconButton from './IconButton';

function entidadDeCliente(clientes, codigoClienteOrNombre, matchFn){
  return matchFn(clientes, codigoClienteOrNombre)?.Entidad || "Sin dato";
}

// Sub-pestaña "Por Entidad" dentro de Facturación (Administración) — pedido
// explícito del usuario 2026-09-03: estos 2 gráficos (Facturación/Órdenes
// de compra por Entidad) vivían en Informes junto con Procesos/Clientes por
// Entidad; al quitar esos 2 se mudan estos acá, junto a Órdenes Colmédica y
// Honorarios por Proceso (ver FacturacionTab.jsx, el contenedor con el
// sub-menú de las 3).
export default function FacturacionEntidadTab({ facturas, ordenesCompra, clientes, notify }){
  const [generandoFacturas, setGenerandoFacturas] = useState(false);
  const [generandoOrdenes, setGenerandoOrdenes] = useState(false);

  const facturasPorEntidad = groupCount(facturas, f => entidadDeCliente(clientes, f, clienteForFactura));
  const ordenesPorEntidad = groupCount(ordenesCompra, o => entidadDeCliente(clientes, o, clienteForOrdenCompra));

  async function handleGenerarExcelFacturas(){
    setGenerandoFacturas(true);
    try{ await generarInformeFacturasExcel(facturas, clientes); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Facturación: " + err.message, 'error'); }
    finally { setGenerandoFacturas(false); }
  }
  async function handleGenerarExcelOrdenes(){
    setGenerandoOrdenes(true);
    try{ await generarInformeOrdenesCompraExcel(ordenesCompra, clientes, facturas); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Órdenes de compra: " + err.message, 'error'); }
    finally { setGenerandoOrdenes(false); }
  }

  return (
    <div className="panel-grid panel-grid-2">
      <div className="panel">
        <div className="panel-head">
          <h3>Facturación por Entidad</h3>
          <IconButton icon="excel" variant="excel" label="Descargar Excel de Facturación" spinning={generandoFacturas} onClick={handleGenerarExcelFacturas} />
        </div>
        <div className="panel-body">
          <BarChart data={facturasPorEntidad} color="var(--verde-claro)" emptyMsg="No hay facturas asociadas a una Entidad." />
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h3>Órdenes de compra por Entidad</h3>
          <IconButton icon="excel" variant="excel" label="Descargar Excel de Órdenes de compra" spinning={generandoOrdenes} onClick={handleGenerarExcelOrdenes} />
        </div>
        <div className="panel-body">
          <BarChart data={ordenesPorEntidad} color="#8a6410" emptyMsg="No hay órdenes de compra asociadas a una Entidad." />
        </div>
      </div>
    </div>
  );
}
