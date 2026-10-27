import { useState } from 'react';
import { groupCount, clienteForFactura, clienteForOrdenCompra, mensajeError } from '../lib/graph';
import { generarInformeFacturasExcel, generarInformeOrdenesCompraExcel } from '../lib/informeFacturacion';
import { buscarFacturasParaOrdenes, resumenCruce } from '../lib/cruceFacturasOrdenes';
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
  const [buscandoFacturas, setBuscandoFacturas] = useState(false);

  const facturasPorEntidad = groupCount(facturas, f => entidadDeCliente(clientes, f, clienteForFactura));
  const ordenesPorEntidad = groupCount(ordenesCompra, o => entidadDeCliente(clientes, o, clienteForOrdenCompra));

  async function handleGenerarExcelFacturas(){
    setGenerandoFacturas(true);
    try{ await generarInformeFacturasExcel(facturas, clientes); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Facturación: " + mensajeError(err), 'error'); }
    finally { setGenerandoFacturas(false); }
  }
  async function handleGenerarExcelOrdenes(){
    setGenerandoOrdenes(true);
    try{ await generarInformeOrdenesCompraExcel(ordenesCompra, clientes, facturas); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Órdenes de compra: " + mensajeError(err), 'error'); }
    finally { setGenerandoOrdenes(false); }
  }

  // Botón aparte (2026-10-27): busca la factura de cada orden con criterios más flexibles que el cruce exacto del Excel normal,
  // avisa cuántas encontró y descarga el Excel con la factura, su fecha y con qué criterio se cruzó (las no exactas van resaltadas).
  async function handleBuscarFacturas(){
    setBuscandoFacturas(true);
    try{
      const cruce = buscarFacturasParaOrdenes(ordenesCompra, facturas);
      const r = resumenCruce(ordenesCompra, cruce);
      await generarInformeOrdenesCompraExcel(ordenesCompra, clientes, facturas, cruce);
      notify?.(`Búsqueda de facturas lista: ${r.exactas} órdenes con su factura exacta, ${r.nuevas} encontradas con un criterio flexible (resaltadas en la columna «Cruce», conviene revisarlas) y ${r.sin} sin factura de ${r.total} órdenes. El Excel ya incluye el número y la fecha de cada factura.`, r.nuevas || r.exactas ? 'success' : 'info');
    }catch(err){
      console.error(err);
      notify?.("No se pudo buscar las facturas de las órdenes: " + mensajeError(err), 'error');
    }finally { setBuscandoFacturas(false); }
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
          <span style={{display:'inline-flex', gap:8}}>
            <IconButton icon="search" variant="open" label="Buscar las facturas de cada orden de compra e incluir su número y fecha en el Excel" spinning={buscandoFacturas} onClick={handleBuscarFacturas} />
            <IconButton icon="excel" variant="excel" label="Descargar Excel de Órdenes de compra" spinning={generandoOrdenes} onClick={handleGenerarExcelOrdenes} />
          </span>
        </div>
        <div className="panel-body">
          <BarChart data={ordenesPorEntidad} color="#8a6410" emptyMsg="No hay órdenes de compra asociadas a una Entidad." />
        </div>
      </div>
    </div>
  );
}
