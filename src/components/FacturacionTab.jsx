import { useState } from 'react';
import FacturacionEntidadTab from './FacturacionEntidadTab';
import OrdenesColmedicaTab from './OrdenesColmedicaTab';
import HonorariosPorProcesoTab from './HonorariosPorProcesoTab';

const SUB_TABS = [
  {key:'porEntidad', label:'Por Entidad'},
  {key:'ordenesColmedica', label:'Órdenes Colmédica'},
  {key:'honorariosPorProceso', label:'Honorarios por Proceso'},
];

// "Facturación" (Administración) — pedido explícito del usuario 2026-09-03:
// junta acá 3 piezas que antes vivían sueltas (Facturación/Órdenes de
// compra por Entidad venían de Informes; Órdenes Colmédica y Honorarios por
// Proceso eran pestañas propias del menú principal de Administración).
// Mismo sub-menú segmentado que ya usa Egresos (Proveedores/Gastos) — ver
// .subnav-panel/.subtabs/.subtab en styles.css.
export default function FacturacionTab({ facturas, ordenesCompra, clientes, tutelas, valoresEntidad, procesos, onAbrirBorradorOrdenCompra, onAbrirBorradorFactura, notify }){
  const [subTab, setSubTab] = useState('porEntidad');
  return (
    <div>
      <div className="subnav-panel">
        <div className="subtabs">
          {SUB_TABS.map(t => (
            <button key={t.key} type="button" className={"subtab" + (subTab===t.key ? " active" : "")} onClick={() => setSubTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>
      {subTab==='porEntidad' && (
        <FacturacionEntidadTab facturas={facturas} ordenesCompra={ordenesCompra} clientes={clientes} notify={notify} />
      )}
      {subTab==='ordenesColmedica' && (
        <OrdenesColmedicaTab
          tutelas={tutelas}
          valoresEntidad={valoresEntidad}
          clientes={clientes}
          onAbrirBorradorOrdenCompra={onAbrirBorradorOrdenCompra}
          notify={notify}
        />
      )}
      {subTab==='honorariosPorProceso' && (
        <HonorariosPorProcesoTab
          procesos={procesos}
          clientes={clientes}
          onAbrirBorradorFactura={onAbrirBorradorFactura}
          onAbrirBorradorOrdenCompra={onAbrirBorradorOrdenCompra}
        />
      )}
    </div>
  );
}
