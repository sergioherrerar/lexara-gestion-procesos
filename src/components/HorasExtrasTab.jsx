import { useState } from 'react';
import { IconTextButton } from './IconButton';
import StackedBarChart from './StackedBarChart';
import {
  MESES_NOMBRES, filtrarHorasExtrasPorMes,
  agruparPorColaborador, colorDeTipoHoraExtra, generarPDFHorasExtras,
} from '../lib/horasExtras';

// "Horas Extras" (Administración) — pedido explícito del usuario 2026-08-31.
// El REGISTRO se movió a Informes ("la idea es que el trabajador en informes
// llene sus horas extras y ya en administración se les da la aprobación") —
// acá solo queda la aprobación (chulo) y la relación mensual (gráfico +
// tarjetas + PDF), restringido a Administrador — es información sensible por
// persona, mismo criterio que se aplicó al retirar "Tutelas por Cliente" de
// Informes. La app calcula sola Diurnas/Nocturnas/Diurnas Festivas/Nocturnas
// Festivas (normatividad colombiana real, sin calcular pesos — el usuario
// pidió explícitamente solo la cantidad de horas). Ver [[project_horas_extras]]
// y lib/horasExtras.js.
export default function HorasExtrasTab({ horasExtras, onAprobarHoraExtra, notify }){
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const hoyRef = new Date();
  const [mes, setMes] = useState(hoyRef.getMonth());
  const [anio] = useState(hoyRef.getFullYear());

  async function handleDescargarPDF(){
    setGenerandoPDF(true);
    try{ await generarPDFHorasExtras(horasExtras, anio, mes); }
    catch(err){ console.error(err); notify?.("No se pudo generar el PDF de Horas Extras: " + err.message, 'error'); }
    finally{ setGenerandoPDF(false); }
  }

  const horasDelMes = filtrarHorasExtrasPorMes(horasExtras, anio, mes, true);
  const { grupos, totalGeneral } = agruparPorColaborador(horasDelMes);

  const registros = [...(horasExtras||[])].sort((a,b) => String(b.Fecha||"").localeCompare(String(a.Fecha||"")));

  return (
    <div className="panel">
      <div className="panel-head"><h3>Horas Extras</h3></div>
      <div className="panel-body">
        <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
          El registro lo hace cada colaborador desde Informes — acá se aprueba (chulo) y se ve la relación mensual. Solo cuentan para el resumen mensual las horas ya <strong>Aprobadas</strong>.
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Colaborador</th><th>Fecha</th><th>Horario</th>
                <th>Diurnas</th><th>Nocturnas</th><th>Diurnas Fest.</th><th>Nocturnas Fest.</th>
                <th>Observaciones</th><th>Aprobado</th>
              </tr>
            </thead>
            <tbody>
              {registros.length ? registros.map(h => (
                <tr key={h.id}>
                  <td className="cliente">{h.Colaborador || "—"}</td>
                  <td>{h.Fecha || "—"}</td>
                  <td>{h.HoraInicio || "—"} - {h.HoraFin || "—"}</td>
                  <td>{h.HorasDiurnas || 0}</td>
                  <td>{h.HorasNocturnas || 0}</td>
                  <td>{h.HorasDiurnasFestivas || 0}</td>
                  <td>{h.HorasNocturnasFestivas || 0}</td>
                  <td>{h.Observaciones || "—"}</td>
                  <td className="linea-pago-check">
                    <input type="checkbox" checked={!!h.Aprobado} onChange={e => onAprobarHoraExtra?.(h.id, e.target.checked)} />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={9}><div className="empty-state empty-state-compact">Todavía no hay horas extras registradas.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel-head" style={{marginTop:28, padding:'0 0 12px'}}><h3>Relación mensual (solo aprobadas)</h3></div>
        <div style={{display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', marginBottom:16}}>
          <div className="field" style={{maxWidth:200}}>
            <label>Mes</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))}>
              {MESES_NOMBRES.map((m,i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <IconTextButton icon="pdf" variant="secondary" onClick={handleDescargarPDF} disabled={generandoPDF}>
            {generandoPDF ? "Generando…" : "Descargar PDF"}
          </IconTextButton>
        </div>

        <StackedBarChart
          grupos={grupos} labelKey="colaborador" totalKey="totalColaborador"
          formatValue={v => `${v} horas`} colorFor={colorDeTipoHoraExtra}
          emptyMsg={`No hay horas extras aprobadas en ${MESES_NOMBRES[mes]} de ${anio}.`}
        />
        {grupos.length > 0 && (
          <div className="abogados-detalle" style={{marginTop:20}}>
            {grupos.map(g => (
              <div className="abogado-card" key={g.colaborador}>
                <div className="abogado-card-head">
                  <span className="abogado-nombre">{g.colaborador}</span>
                  <span className="abogado-total">{g.totalColaborador} horas</span>
                </div>
                <div className="abogado-card-body">
                  {g.filas.map(f => (
                    <div className="abogado-card-row" key={f.tipoRespuesta}>
                      <span className="abogado-tipo-dot" style={{background: colorDeTipoHoraExtra(f.tipoRespuesta)}}></span>
                      <span className="abogado-tipo-label">{f.tipoRespuesta}</span>
                      <span className="abogado-tipo-valor">{f.total} horas</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="abogados-total-general">
              <span className="abogado-nombre">Total general</span>
              <span className="abogado-total">{totalGeneral} horas</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
