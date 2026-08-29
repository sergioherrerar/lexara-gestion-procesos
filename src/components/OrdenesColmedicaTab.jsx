import { useState } from 'react';
import IconButton, { IconTextButton } from './IconButton';
import {
  MESES_NOMBRES, filtrarTutelasPorMesCalendario, agruparPorClienteParaOrden,
  construirBorradorOrdenCompra, generarExcelOrdenesColmedica,
} from '../lib/ordenesComprasColmedica';

// "Órdenes Colmédica" (Administración) — pedido explícito del usuario
// 2026-08-29: por cada Cliente con tutelas en el mes elegido (mes calendario
// completo, día 1 al 30/31 por Vencimiento — NO el corte día 28 de los
// otros informes de Tutelas), muestra el detalle (Tutelas/Impugnaciones/
// Otras contestaciones) y un botón para abrir un borrador de Orden de
// compra YA armado (Cliente, Contrato, Observación, líneas con cantidad y
// valor) listo para revisar y darle "Guardar cambios" — no se crea nada en
// SharePoint solo. El botón de Excel descarga el mismo detalle de todos los
// clientes de ese mes junto, de referencia.
export default function OrdenesColmedicaTab({ tutelas, valoresEntidad, clientes, onAbrirBorradorOrdenCompra, notify }){
  const hoyRef = new Date();
  const [mes, setMes] = useState(hoyRef.getMonth());
  const [anio] = useState(hoyRef.getFullYear());
  const [generandoExcel, setGenerandoExcel] = useState(false);
  // Pedido explícito del usuario 2026-08-29 (probando con datos reales): un
  // Excel por cliente, además del general de arriba con todos juntos.
  const [generandoExcelCliente, setGenerandoExcelCliente] = useState(null);

  const tutelasDelMes = filtrarTutelasPorMesCalendario(tutelas, anio, mes);
  const grupos = agruparPorClienteParaOrden(tutelasDelMes);

  function handleGenerarBorrador(grupo){
    const borrador = construirBorradorOrdenCompra(grupo, mes, anio, valoresEntidad, clientes);
    onAbrirBorradorOrdenCompra(borrador);
  }

  async function handleDescargarExcel(){
    setGenerandoExcel(true);
    try{ await generarExcelOrdenesColmedica(tutelasDelMes, valoresEntidad, mes, anio); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Órdenes Colmédica: " + err.message, 'error'); }
    finally{ setGenerandoExcel(false); }
  }

  async function handleDescargarExcelCliente(cliente){
    setGenerandoExcelCliente(cliente);
    try{
      const tutelasDelCliente = tutelasDelMes.filter(t => (t.Cliente||"").trim() === cliente);
      await generarExcelOrdenesColmedica(tutelasDelCliente, valoresEntidad, mes, anio, cliente);
    }
    catch(err){ console.error(err); notify?.(`No se pudo generar el Excel de ${cliente}: ` + err.message, 'error'); }
    finally{ setGenerandoExcelCliente(null); }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>Órdenes Colmédica</h3></div>
      <div className="panel-body">
        <p style={{margin:'0 0 14px', color:'var(--texto-suave)', fontSize:13}}>
          Filtra las tutelas por fecha de <strong>Vencimiento</strong> dentro del mes calendario completo elegido (día 1 al último día del mes) y arma, por cada Cliente, un borrador de Orden de compra con la cantidad de Tutelas/Impugnaciones/Otras contestaciones y su valor (buscado por Entidad en Valores Entidad) — revísalo y dale "Guardar cambios" en el drawer para crearlo de verdad.
        </p>
        <div style={{display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', marginBottom:16}}>
          <div className="field" style={{maxWidth:200}}>
            <label>Mes</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))}>
              {MESES_NOMBRES.map((m,i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <IconTextButton icon="excel" variant="secondary" onClick={handleDescargarExcel} disabled={generandoExcel}>
            {generandoExcel ? "Generando…" : "Descargar Excel"}
          </IconTextButton>
        </div>
        {grupos.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cliente</th><th>Tutelas</th><th>Impugnaciones</th><th>Otras contestaciones</th><th>Excel</th><th>Orden de compra</th></tr>
              </thead>
              <tbody>
                {grupos.map(g => (
                  <tr key={g.cliente}>
                    <td className="cliente">{g.cliente}</td>
                    <td>{g.cantidadTutela}</td>
                    <td>{g.cantidadImpugnacion}</td>
                    <td>{g.cantidadOtras}</td>
                    <td>
                      <IconButton
                        icon="excel" variant="excel"
                        label={`Descargar Excel de ${g.cliente}`}
                        spinning={generandoExcelCliente===g.cliente}
                        onClick={() => handleDescargarExcelCliente(g.cliente)}
                      />
                    </td>
                    <td>
                      <IconTextButton icon="add" variant="secondary" onClick={() => handleGenerarBorrador(g)}>
                        Generar borrador
                      </IconTextButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state empty-state-compact">No hay tutelas con vencimiento en {MESES_NOMBRES[mes]} de {anio}.</div>
        )}
      </div>
    </div>
  );
}
