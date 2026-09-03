import { useState } from 'react';
import { agruparVacacionesPorColaborador, generarVacacionesExcel, generarPDFVacacionesColaborador } from '../lib/vacaciones';
import { fmtDate } from '../lib/graph';
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

export default function VacacionesTab({ colaboradores, vacacionesPeriodos, onCrearPeriodo, onEditarPeriodo, onEliminarPeriodo, notify, canWrite }){
  const [abiertoPara, setAbiertoPara] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  // "Editar" (pedido explícito del usuario 2026-09-01) — mismo patrón que
  // Horas Extras en Informes: al hacer clic en Editar en la tabla de abajo,
  // se precarga el mismo formulario de "Agregar período" (editandoId !=
  // null) y el botón pasa a decir "Guardar cambios", llamando
  // onEditarPeriodo en vez de crear uno nuevo.
  const [editandoId, setEditandoId] = useState(null);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  // PDF individual por colaborador — pedido explícito del usuario
  // 2026-09-02 ("por trabajador agrega un PDF con la información de cada
  // uno"). Se guarda el id de quién se está generando (no un solo booleano)
  // para poder deshabilitar solo el botón de esa tarjeta, no todos a la vez.
  const [generandoPDFId, setGenerandoPDFId] = useState(null);

  const filas = agruparVacacionesPorColaborador(colaboradores, vacacionesPeriodos);

  async function handleDescargarExcel(){
    setGenerandoExcel(true);
    try{ await generarVacacionesExcel(filas); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel de Vacaciones: " + err.message, 'error'); }
    finally{ setGenerandoExcel(false); }
  }

  async function handleDescargarPDF(fila){
    setGenerandoPDFId(fila.id);
    try{ await generarPDFVacacionesColaborador(fila); }
    catch(err){ console.error(err); notify?.("No se pudo generar el PDF de " + fila.nombre + ": " + err.message, 'error'); }
    finally{ setGenerandoPDFId(null); }
  }

  function abrirFormulario(nombre){
    setAbiertoPara(nombre); setEditandoId(null); setForm(FORM_VACIO);
  }
  function abrirEdicion(nombre, periodo){
    setAbiertoPara(nombre); setEditandoId(periodo.id);
    setForm({
      FechaInicio: String(periodo.FechaInicio||"").slice(0,10),
      FechaFin: String(periodo.FechaFin||"").slice(0,10),
      Dias: periodo.Dias ?? "",
      Observaciones: periodo.Observaciones || "",
    });
  }
  function cerrarFormulario(){
    setAbiertoPara(""); setEditandoId(null); setForm(FORM_VACIO);
  }
  function setField(key, value){ setForm(prev => ({...prev, [key]: value})); }

  async function handleGuardarPeriodo(nombre){
    if(!form.FechaInicio || !form.FechaFin || !form.Dias){
      notify?.("Completa Fecha inicio, Fecha fin y Días antes de guardar.", 'error');
      return;
    }
    setGuardando(true);
    try{
      const datos = {
        Colaborador: nombre, FechaInicio: form.FechaInicio, FechaFin: form.FechaFin,
        Dias: Number(form.Dias), Observaciones: form.Observaciones,
      };
      if(editandoId) await onEditarPeriodo?.(editandoId, datos);
      else await onCrearPeriodo?.(datos);
      cerrarFormulario();
    } finally { setGuardando(false); }
  }

  return (
    <div>
      <p className="save-hint" style={{marginBottom:14}}>
        Días laborados/generados/pendientes/tomados se calculan en vivo (Fecha de Ingreso + la suma de los períodos de abajo) — no son celdas de ningún Excel. Solo se muestran trabajadores (no contratistas) vigentes.
      </p>
      <div style={{marginBottom:16}}>
        <IconTextButton icon="excel" variant="secondary" onClick={handleDescargarExcel} disabled={generandoExcel}>
          {generandoExcel ? "Generando…" : "Descargar Excel"}
        </IconTextButton>
      </div>

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
                  <td>{fmtDate(f.fechaIngreso)}</td>
                  <td>{f.diasGenerados ?? "—"}</td>
                  <td>{f.cantidadPeriodos}</td>
                  <td>{f.diasTomados ?? "—"}</td>
                  <td><strong style={{color:'#b3590a'}}>{f.diasPendientes ?? "—"}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.map(f => (
        <div className="panel" key={f.id} style={{marginBottom:16}}>
          <div className="panel-head" style={{gap:8}}>
            <h3>{f.nombre}</h3>
            <div style={{display:'flex', gap:8}}>
              <IconTextButton icon="pdf" variant="secondary" onClick={() => handleDescargarPDF(f)} disabled={generandoPDFId===f.id}>
                {generandoPDFId===f.id ? "Generando…" : "Descargar PDF"}
              </IconTextButton>
              {canWrite && (abiertoPara===f.nombre
                ? <button type="button" className="btn-secondary" onClick={cerrarFormulario}>Cancelar</button>
                : <IconTextButton icon="add" variant="secondary" onClick={() => abrirFormulario(f.nombre)}>Agregar período</IconTextButton>)}
            </div>
          </div>
          <div className="panel-body" style={{padding:'14px 20px'}}>
            <div className="field-card-grid">
              <FieldCard label="Fecha de ingreso">{fmtDate(f.fechaIngreso)}</FieldCard>
              <FieldCard label="Días laborados">{f.diasLaborados ?? "—"}</FieldCard>
              <FieldCard label="Días generados">{f.diasGenerados ?? "—"}</FieldCard>
              <FieldCard label="Días pendientes"><strong style={{color:'#b3590a'}}>{f.diasPendientes ?? "—"}</strong></FieldCard>
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
                  <IconTextButton icon="add" variant="primary" onClick={() => handleGuardarPeriodo(f.nombre)} disabled={guardando}>
                    {guardando ? "Guardando…" : (editandoId ? "Guardar cambios" : "Guardar período")}
                  </IconTextButton>
                </div>
              </div>
            )}

            <div style={{marginTop:14}}>
              <div className="field-card-label" style={{marginBottom:6}}>PERÍODOS TOMADOS</div>
              {f.historial.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Fecha inicio</th><th>Fecha fin</th><th>Días</th><th>Observaciones</th>{canWrite && <th>Acciones</th>}</tr></thead>
                    <tbody>
                      {f.historial.map(h => (
                        <tr key={h.id}>
                          <td>{fmtDate(h.FechaInicio)}</td>
                          <td>{fmtDate(h.FechaFin)}</td>
                          <td>{h.Dias ?? "—"}</td>
                          <td>{h.Observaciones || "—"}</td>
                          {canWrite && (
                            <td>
                              <div className="row-actions">
                                <IconButton icon="edit" variant="edit" label={`Editar período de ${f.nombre}`} onClick={() => abrirEdicion(f.nombre, h)} />
                                <IconButton icon="delete" variant="delete" label={`Eliminar período de ${f.nombre}`} onClick={() => onEliminarPeriodo?.(h.id)} />
                              </div>
                            </td>
                          )}
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
