import { useState } from 'react';
import { IconTextButton } from './IconButton';
import StackedBarChart from './StackedBarChart';
import {
  MESES_NOMBRES, filtrarHorasExtrasPorMes, soloFecha,
  agruparPorColaborador, colorDeTipoHoraExtra, generarPDFHorasExtras,
} from '../lib/horasExtras';
import { colorDeTipoRespuesta } from '../lib/informeAbogadosTutelas';

// "Cajas visuales" del día — pedido explícito del usuario 2026-08-31, viendo
// la tabla de aprobación en vivo: por cada hora extra, cuántas Tutelas,
// Impugnaciones y Otras contestaciones tenían Vencimiento ESE mismo día —
// le da contexto a quien aprueba (¿de verdad había carga de trabajo ese
// día?) sin tener que ir a mirar la lista de Tutelas aparte.
function contarTutelasDelDia(tutelas, fechaHoraExtra){
  const dia = soloFecha(fechaHoraExtra);
  const conteo = { TUTELA:0, IMPUGNACION:0, Otras:0 };
  (tutelas||[]).forEach(t => {
    if(soloFecha(t.FechaVencimiento) !== dia) return;
    const tipo = (t.TipoRespuesta||"").trim().toUpperCase();
    if(tipo === 'TUTELA') conteo.TUTELA++;
    else if(tipo === 'IMPUGNACION') conteo.IMPUGNACION++;
    else conteo.Otras++;
  });
  return conteo;
}
const CAJA_ESTILO = { display:'inline-flex', flexDirection:'column', alignItems:'center', minWidth:44, padding:'3px 6px', borderRadius:6, background:'var(--gris-claro)' };
function CajaConteo({ label, valor, color }){
  return (
    <div style={CAJA_ESTILO}>
      <span style={{fontWeight:700, fontSize:14, color}}>{valor}</span>
      <span style={{fontSize:9.5, color:'var(--texto-suave)', textTransform:'uppercase', letterSpacing:'.02em'}}>{label}</span>
    </div>
  );
}

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
export default function HorasExtrasTab({ horasExtras, tutelas, onAprobarHoraExtra, notify }){
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
                <th>Tutelas del día</th>
                <th>Observaciones</th><th>Aprobado</th>
              </tr>
            </thead>
            <tbody>
              {registros.length ? registros.map(h => {
                const conteo = contarTutelasDelDia(tutelas, h.Fecha);
                return (
                <tr key={h.id}>
                  <td className="cliente">{h.Colaborador || "—"}</td>
                  <td>{soloFecha(h.Fecha)}</td>
                  <td>{h.HoraInicio || "—"} - {h.HoraFin || "—"}</td>
                  <td>{h.HorasDiurnas || 0}</td>
                  <td>{h.HorasNocturnas || 0}</td>
                  <td>{h.HorasDiurnasFestivas || 0}</td>
                  <td>{h.HorasNocturnasFestivas || 0}</td>
                  <td>
                    <div style={{display:'flex', gap:6}}>
                      <CajaConteo label="Tutelas" valor={conteo.TUTELA} color={colorDeTipoRespuesta('TUTELA')} />
                      <CajaConteo label="Impugn." valor={conteo.IMPUGNACION} color={colorDeTipoRespuesta('IMPUGNACION')} />
                      <CajaConteo label="Otras" valor={conteo.Otras} color="var(--texto-suave)" />
                    </div>
                  </td>
                  <td>{h.Observaciones || "—"}</td>
                  <td className="linea-pago-check">
                    <input type="checkbox" checked={!!h.Aprobado} onChange={e => onAprobarHoraExtra?.(h.id, e.target.checked)} />
                  </td>
                </tr>
                );
              }) : (
                <tr><td colSpan={10}><div className="empty-state empty-state-compact">Todavía no hay horas extras registradas.</div></td></tr>
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
