import { useState } from 'react';
import { agruparVacacionesPorColaborador } from '../lib/vacaciones';
import { FieldCard } from './FormFields';
import IconButton, { IconTextButton } from './IconButton';

// Pestaña "Vacaciones" de Administración — reescrita por completo 2026-08-31:
// reemplaza el Excel real que se usaba antes ("Vacaciones.xlsx", ver la saga
// de 404 en [[project_administracion_modulo]]) por la lista real "Vacaciones"
// (una fila por PERÍODO tomado, sin límite de cuántos puede tener cada
// quien — a diferencia del Excel, que reservaba 36 pares fijos de columnas
// por persona). Los totales (Días laborados/generados/pendientes/tomados) ya
// no son fórmulas de ningún archivo — se calculan acá mismo a partir de
// "Fecha de Ingreso" (Equipo MD) + la suma de "Dias" de esta lista (ver
// lib/vacaciones.js) — la MISMA fórmula real que ya usaba el Excel.
// A diferencia del Excel (que solo funcionaba con sesión real), esta pestaña
// ahora es una lista de SharePoint normal — SÍ funciona en modo demo.
const FORM_VACIO = { FechaInicio:"", FechaFin:"", Dias:"", Observaciones:"" };

export default function VacacionesTab({ colaboradores, vacacionesPeriodos, onCrearPeriodo, onEliminarPeriodo, notify, canWrite }){
  const [abiertoPara, setAbiertoPara] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const filas = agruparVacacionesPorColaborador(colaboradores, vacacionesPeriodos);

  function abrirFormulario(nombre){
    setAbiertoPara(nombre); setForm(FORM_VACIO);
  }
  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  async function handleGuardarPeriodo(nombre){
    if(!form.FechaInicio || !form.FechaFin || !form.Dias){
      notify?.("Completa Fecha inicio, Fecha fin y Días antes de guardar.", 'error');
      return;
    }
    setGuardando(true);
    try{
      await onCrearPeriodo?.({
        Colaborador: nombre, FechaInicio: form.FechaInicio, FechaFin: form.FechaFin,
        Dias: Number(form.Dias), Observaciones: form.Observaciones,
      });
      setAbiertoPara(""); setForm(FORM_VACIO);
    } finally { setGuardando(false); }
  }

  return (
    <div>
      <p className="save-hint" style={{marginBottom:14}}>
        Días laborados/generados/pendientes/tomados se calculan en vivo (Fecha de Ingreso + la suma de los períodos de abajo) — no son celdas de ningún Excel.
      </p>

      {/* Vista resumen por trabajador — pedido explícito del usuario
          2026-08-31: busca la Fecha de Ingreso en Colaboradores MD, calcula
          Días generados a la fecha de hoy, cuenta cuántos períodos tiene,
          suma sus Días tomados, y resta generados-tomados = pendientes. */}
      {filas.length > 0 && (
        <div className="table-wrap" style={{marginBottom:20}}>
          <table>
            <thead>
              <tr><th>Colaborador</th><th>Fecha de ingreso</th><th>Días generados</th><th>Períodos</th><th>Días tomados</th><th>Días pendientes</th></tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.id}>
                  <td className="cliente">{f.nombre}</td>
                  <td>{f.fechaIngreso}</td>
                  <td>{f.diasGenerados ?? "—"}</td>
                  <td>{f.cantidadPeriodos}</td>
                  <td>{f.diasTomados ?? "—"}</td>
                  <td>{f.diasPendientes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.map(f => (
        <div className="panel" key={f.id} style={{marginBottom:16}}>
          <div className="panel-head">
            <h3>{f.nombre}</h3>
            {canWrite && (abiertoPara===f.nombre
              ? <button type="button" className="btn-secondary" onClick={() => setAbiertoPara("")}>Cancelar</button>
              : <IconTextButton icon="add" variant="secondary" onClick={() => abrirFormulario(f.nombre)}>Agregar período</IconTextButton>)}
          </div>
          <div className="panel-body" style={{padding:'14px 20px'}}>
            <div className="field-card-grid">
              <FieldCard label="Fecha de ingreso">{f.fechaIngreso}</FieldCard>
              <FieldCard label="Días laborados">{f.diasLaborados ?? "—"}</FieldCard>
              <FieldCard label="Días generados">{f.diasGenerados ?? "—"}</FieldCard>
              <FieldCard label="Días pendientes">{f.diasPendientes ?? "—"}</FieldCard>
              <FieldCard label="Días tomados">{f.diasTomados ?? "—"}</FieldCard>
            </div>

            {abiertoPara===f.nombre && (
              <div className="panel" style={{marginTop:14}}>
                <div className="panel-body" style={{padding:'14px 20px', display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end'}}>
                  <div className="field" style={{maxWidth:160}}>
                    <label>Fecha inicio</label>
                    <input type="date" value={form.FechaInicio} onChange={e => setField('FechaInicio', e.target.value)} />
                  </div>
                  <div className="field" style={{maxWidth:160}}>
                    <label>Fecha fin</label>
                    <input type="date" value={form.FechaFin} onChange={e => setField('FechaFin', e.target.value)} />
                  </div>
                  <div className="field" style={{maxWidth:100}}>
                    <label>Días</label>
                    <input type="number" min="0" step="0.5" value={form.Dias} onChange={e => setField('Dias', e.target.value)} />
                  </div>
                  <div className="field" style={{flex:1, minWidth:220}}>
                    <label>Observaciones (opcional)</label>
                    <input type="text" value={form.Observaciones} onChange={e => setField('Observaciones', e.target.value)} placeholder="Ej: días no consecutivos, 1, 4, 5, 6 y 8" />
                  </div>
                  <IconTextButton icon="add" variant="primary" onClick={() => handleGuardarPeriodo(f.nombre)} disabled={guardando}>{guardando ? "Guardando…" : "Guardar período"}</IconTextButton>
                </div>
              </div>
            )}

            <div style={{marginTop:14}}>
              <div className="field-card-label" style={{marginBottom:6}}>PERÍODOS TOMADOS</div>
              {f.historial.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Fecha inicio</th><th>Fecha fin</th><th>Días</th><th>Observaciones</th>{canWrite && <th>Eliminar</th>}</tr></thead>
                    <tbody>
                      {f.historial.map(h => (
                        <tr key={h.id}>
                          <td>{h.FechaInicio || "—"}</td>
                          <td>{h.FechaFin || "—"}</td>
                          <td>{h.Dias ?? "—"}</td>
                          <td>{h.Observaciones || "—"}</td>
                          {canWrite && <td><IconButton icon="delete" variant="delete" label={`Eliminar período de ${f.nombre}`} onClick={() => onEliminarPeriodo?.(h.id)} /></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="save-hint">Sin períodos registrados todavía.</p>}
            </div>
          </div>
        </div>
      ))}
      {!filas.length && <div className="empty-state">No hay colaboradores activos con Fecha de Ingreso cargada — complétala en Colaboradores MD para que aparezcan acá.</div>}
    </div>
  );
}
