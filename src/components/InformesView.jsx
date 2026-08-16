import { useState } from 'react';
import {
  groupCount, estadoBadgeClass, fmtMonto, stripHtml,
  facturasForProceso, computeFacturaTotals, clienteForFactura, clienteForOrdenCompra,
} from '../lib/graph';
import BarChart from './BarChart';
import IconButton from './IconButton';
import { generarInformeSOSExcel, generarInformeSOSPDF, generarDesistimientosSOSExcel } from '../lib/informeSOS';
import { generarInformeFamisanarExcel, generarInformeFamisanarPDF } from '../lib/informeFamisanar';

// Entidades con formato de informe formal ya confirmado, y qué generador usa
// cada una — cada Entidad puede tener un formato distinto (columnas/orden
// propios, ver informeSOS.js/informeFamisanar.js) y no todas ofrecen los
// mismos informes (p.ej. Famisanar todavía no tiene Desistimientos armado).
// Solo aparecen los íconos de los informes que sí tiene esa Entidad — el
// resto de Entidades (sin entrada acá) muestra "Aún sin modelo".
// Ver [[project_informes_modulo]] / CHANGELOG.
const FORMATOS_POR_ENTIDAD = {
  SOS: { excel: generarInformeSOSExcel, pdf: generarInformeSOSPDF, desistimientos: generarDesistimientosSOSExcel },
  FAMISANAR: { excel: generarInformeFamisanarExcel, pdf: generarInformeFamisanarPDF },
};

function entidadDeCliente(clientes, codigoClienteOrNombre, matchFn){
  return matchFn(clientes, codigoClienteOrNombre)?.Entidad || "Sin dato";
}

export default function InformesView({ procesos, clientes, facturas, ordenesCompra, desistimientos }){
  const [generando, setGenerando] = useState(null); // nombre de la entidad mientras genera el Excel
  const [generandoPDF, setGenerandoPDF] = useState(null); // nombre de la entidad mientras genera el PDF
  const [generandoDesistimientos, setGenerandoDesistimientos] = useState(null);

  const procesosPorEntidad = groupCount(procesos, p => p.Entidad);
  const clientesPorEntidad = groupCount(clientes, c => c.Entidad);
  const facturasPorEntidad = groupCount(facturas, f => entidadDeCliente(clientes, f, clienteForFactura));
  const ordenesPorEntidad = groupCount(ordenesCompra, o => entidadDeCliente(clientes, o, clienteForOrdenCompra));

  // Fila por Entidad de la tabla detallada — enfocada en Procesos judiciales,
  // que es donde vive el semáforo de Estado (ver [[project_procesos_extended_fields]]).
  const entidades = Array.from(new Set(procesos.map(p => p.Entidad).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const filas = entidades.map(entidad => {
    const propios = procesos.filter(p => p.Entidad === entidad);
    const activos = propios.filter(p => !(p.EstadoVT||"").toLowerCase().includes('termin'));
    const valorEnDisputa = propios.reduce((sum,p) => sum + (Number(String(p.ValorActualDemanda||"0").replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'))||0), 0);
    const facturacionTotal = propios.reduce((sum,p) => {
      const facs = facturasForProceso(facturas, p);
      return sum + facs.reduce((s2,f) => s2 + computeFacturaTotals(f).total, 0);
    }, 0);
    const semaforo = {verde:0, naranja:0, rojo:0, gris:0};
    propios.forEach(p => {
      const cls = estadoBadgeClass(p.EstadoVT, p.FechaUltimoEstado);
      if(cls==='badge-verde') semaforo.verde++;
      else if(cls==='badge-naranja') semaforo.naranja++;
      else if(cls==='badge-rojo') semaforo.rojo++;
      else semaforo.gris++;
    });
    return { entidad, total: propios.length, activos: activos.length, valorEnDisputa, facturacionTotal, semaforo };
  });

  async function handleGenerarExcel(entidad){
    const formato = FORMATOS_POR_ENTIDAD[entidad.toUpperCase()];
    if(!formato?.excel) return;
    setGenerando(entidad);
    try{ await formato.excel(procesos.filter(p => p.Entidad === entidad)); }
    finally { setGenerando(null); }
  }
  // "la cantidad de procesos son todos los vigentes de SOS" — la carta en
  // PDF cuenta y lista solo los procesos NO terminados de esa Entidad. El PDF
  // se genera y descarga directo (jsPDF) — no pasa por el diálogo de
  // impresión del navegador.
  async function handleGenerarPDF(entidad){
    const formato = FORMATOS_POR_ENTIDAD[entidad.toUpperCase()];
    if(!formato?.pdf) return;
    setGenerandoPDF(entidad);
    try{
      const vigentes = procesos.filter(p => p.Entidad === entidad && !(p.EstadoVT||"").toLowerCase().includes('termin'));
      await formato.pdf(entidad, vigentes);
    } finally {
      setGenerandoPDF(null);
    }
  }
  // Informe de Desistimientos — se une cada Desistimiento con su Proceso
  // (procesoForDesistimiento) y solo se incluyen los que pertenecen a esta
  // Entidad, filtrando primero los procesos propios de esa Entidad.
  async function handleGenerarDesistimientos(entidad){
    const formato = FORMATOS_POR_ENTIDAD[entidad.toUpperCase()];
    if(!formato?.desistimientos) return;
    setGenerandoDesistimientos(entidad);
    try{ await formato.desistimientos(desistimientos, procesos.filter(p => p.Entidad === entidad)); }
    finally { setGenerandoDesistimientos(null); }
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1>Informes</h1>
          <p>Resumen por Entidad de Procesos, Clientes, Facturación y Órdenes de compra.</p>
        </div>
      </div>

      <div className="panel-grid panel-grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Procesos por Entidad</h3></div>
          <div className="panel-body">
            <BarChart data={procesosPorEntidad} color="var(--verde-oscuro)" emptyMsg="No hay datos de Entidad en Procesos." />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Clientes por Entidad</h3></div>
          <div className="panel-body">
            <BarChart data={clientesPorEntidad} color="var(--naranja)" emptyMsg="No hay datos de Entidad en Clientes." />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Facturación por Entidad</h3></div>
          <div className="panel-body">
            <BarChart data={facturasPorEntidad} color="var(--verde-claro)" emptyMsg="No hay facturas asociadas a una Entidad." />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Órdenes de compra por Entidad</h3></div>
          <div className="panel-body">
            <BarChart data={ordenesPorEntidad} color="#8a6410" emptyMsg="No hay órdenes de compra asociadas a una Entidad." />
          </div>
        </div>
      </div>

      <div className="panel" style={{marginTop:20}}>
        <div className="panel-head"><h3>Detalle de Procesos judiciales por Entidad</h3></div>
        <div className="panel-body" style={{padding:0}}>
          {!filas.length ? (
            <div className="empty-state empty-state-compact">No hay procesos con Entidad asignada todavía.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Entidad</th>
                    <th>Procesos (activos/total)</th>
                    <th>Valor en disputa</th>
                    <th>Facturación</th>
                    <th>Semáforo de Estado</th>
                    <th>Informe</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f.entidad}>
                      <td>{f.entidad}</td>
                      <td>{f.activos} / {f.total}</td>
                      <td>{fmtMonto(f.valorEnDisputa)}</td>
                      <td>{fmtMonto(f.facturacionTotal)}</td>
                      <td>
                        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                          {f.semaforo.verde > 0 && <span className="badge badge-verde">{f.semaforo.verde} verde</span>}
                          {f.semaforo.naranja > 0 && <span className="badge badge-naranja">{f.semaforo.naranja} naranja</span>}
                          {f.semaforo.rojo > 0 && <span className="badge badge-rojo">{f.semaforo.rojo} rojo</span>}
                          {f.semaforo.gris > 0 && <span className="badge badge-gris">{f.semaforo.gris} gris</span>}
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const formato = FORMATOS_POR_ENTIDAD[f.entidad.toUpperCase()];
                          if(!formato) return <span className="save-hint" style={{fontSize:12}}>Aún sin modelo</span>;
                          return (
                            <div className="row-actions">
                              {formato.excel && <IconButton icon="excel" variant="excel" label="Descargar Excel" spinning={generando===f.entidad} onClick={() => handleGenerarExcel(f.entidad)} />}
                              {formato.pdf && <IconButton icon="pdf" variant="pdf" label="Descargar carta en PDF" spinning={generandoPDF===f.entidad} onClick={() => handleGenerarPDF(f.entidad)} />}
                              {formato.desistimientos && <IconButton icon="checklist" variant="checklist" label="Descargar Desistimientos (Excel)" spinning={generandoDesistimientos===f.entidad} onClick={() => handleGenerarDesistimientos(f.entidad)} />}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
