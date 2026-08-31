import { useState, useMemo } from 'react';
import { IconTextButton } from './IconButton';
import StackedBarChart from './StackedBarChart';
import {
  MESES_NOMBRES, clasificarHorasExtra, filtrarHorasExtrasPorMes,
  agruparPorColaborador, colorDeTipoHoraExtra, generarPDFHorasExtras,
} from '../lib/horasExtras';

// "Horas Extras" (Administración) — pedido explícito del usuario 2026-08-31,
// TODO dentro de Administración (registrar, aprobar y ver el resumen), no en
// Informes, porque es información sensible por persona (mismo criterio que
// se aplicó al retirar "Tutelas por Cliente" de Informes). La app calcula
// sola Diurnas/Nocturnas/Diurnas Festivas/Nocturnas Festivas (normatividad
// colombiana real, sin calcular pesos — el usuario pidió explícitamente solo
// la cantidad de horas). Ver [[project_horas_extras]] y lib/horasExtras.js.
const FORM_VACIO = { Colaborador:"", Fecha:"", HoraInicio:"", HoraFin:"", Observaciones:"" };

export default function HorasExtrasTab({ horasExtras, colaboradores, onCreateHoraExtra, onAprobarHoraExtra, notify }){
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const hoyRef = new Date();
  const [mes, setMes] = useState(hoyRef.getMonth());
  const [anio] = useState(hoyRef.getFullYear());

  const activos = [...(colaboradores||[])]
    .filter(c => (c.Activo||"Sí") !== "No")
    .sort((a,b) => (a.Nombre||"").localeCompare(b.Nombre||""));

  const preview = useMemo(() => {
    if(!form.Fecha || !form.HoraInicio || !form.HoraFin) return null;
    return clasificarHorasExtra(form.Fecha, form.HoraInicio, form.HoraFin);
  }, [form.Fecha, form.HoraInicio, form.HoraFin]);

  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  async function handleRegistrar(){
    if(!form.Colaborador || !form.Fecha || !form.HoraInicio || !form.HoraFin){
      notify?.("Completa Colaborador, Fecha, Hora inicio y Hora fin antes de registrar.", 'error');
      return;
    }
    const clasificado = clasificarHorasExtra(form.Fecha, form.HoraInicio, form.HoraFin);
    if(!clasificado.HorasDiurnas && !clasificado.HorasNocturnas && !clasificado.HorasDiurnasFestivas && !clasificado.HorasNocturnasFestivas){
      notify?.("La hora de fin debe ser distinta a la hora de inicio.", 'error');
      return;
    }
    setGuardando(true);
    try{
      await onCreateHoraExtra?.({
        Colaborador: form.Colaborador, Fecha: form.Fecha, HoraInicio: form.HoraInicio, HoraFin: form.HoraFin,
        Observaciones: form.Observaciones, ...clasificado,
      });
      setForm(FORM_VACIO);
    } finally { setGuardando(false); }
  }

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
          Registra Colaborador, Fecha y horario — la app calcula sola cuántas horas son Diurnas (6:00 a.m.–7:00 p.m.), Nocturnas (7:00 p.m.–6:00 a.m.) y si el día es domingo/festivo colombiano. Solo cuentan para el resumen mensual las horas ya <strong>Aprobadas</strong>.
        </p>

        <div className="form-grid" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:14, marginBottom:8}}>
          <div className="field">
            <label>Colaborador</label>
            <select value={form.Colaborador} onChange={e => setField('Colaborador', e.target.value)}>
              <option value="">— Selecciona —</option>
              {activos.map(c => <option key={c.id} value={c.Nombre}>{c.Nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={form.Fecha} onChange={e => setField('Fecha', e.target.value)} />
          </div>
          <div className="field">
            <label>Hora inicio</label>
            <input type="time" value={form.HoraInicio} onChange={e => setField('HoraInicio', e.target.value)} />
          </div>
          <div className="field">
            <label>Hora fin</label>
            <input type="time" value={form.HoraFin} onChange={e => setField('HoraFin', e.target.value)} />
          </div>
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <label>Observaciones (opcional)</label>
            <input type="text" value={form.Observaciones} onChange={e => setField('Observaciones', e.target.value)} placeholder="Ej: apoyo turno de tutelas" />
          </div>
        </div>

        {preview && (
          <div style={{display:'flex', gap:16, flexWrap:'wrap', margin:'0 0 14px', padding:'10px 14px', background:'var(--gris-claro)', borderRadius:8, fontSize:12.5}}>
            <span>Diurnas: <strong>{preview.HorasDiurnas}</strong></span>
            <span>Nocturnas: <strong>{preview.HorasNocturnas}</strong></span>
            <span>Diurnas Festivas: <strong>{preview.HorasDiurnasFestivas}</strong></span>
            <span>Nocturnas Festivas: <strong>{preview.HorasNocturnasFestivas}</strong></span>
          </div>
        )}

        <IconTextButton icon="add" variant="primary" onClick={handleRegistrar} disabled={guardando}>
          {guardando ? "Registrando…" : "Registrar hora extra"}
        </IconTextButton>

        <div className="table-wrap" style={{marginTop:24}}>
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
