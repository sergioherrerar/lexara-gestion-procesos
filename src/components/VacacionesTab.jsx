import { useState, useEffect, useCallback } from 'react';
import { leerVacacionesExcel, escribirRangoVacacionesExcel } from '../lib/graph';
import { parseVacaciones, ubicarFilaCruda, primeraColumnaVaciaDePeriodo, rangoNuevoPeriodo } from '../lib/vacaciones';
import { FieldCard } from './FormFields';
import { IconTextButton } from './IconButton';

// Pestaña "Vacaciones" de Administración — a diferencia de todo el resto de
// la app (que lee/escribe LISTAS de SharePoint), esta lee/escribe un Excel
// real ("Vacaciones.xlsx") vía Microsoft Graph Workbook API — el usuario
// pidió explícitamente seguir usando ese mismo archivo (no migrar a una
// lista nueva), solo que sus campos "se llenen desde el web". Ver
// leerVacacionesExcel/escribirRangoVacacionesExcel en graph.js,
// src/lib/vacaciones.js y [[project_administracion_modulo]].
//
// Solo funciona con sesión real (nunca en modo demo — no tiene sentido
// simular un Excel ajeno, y evita pedir el permiso Files.ReadWrite sin una
// cuenta real detrás).
export default function VacacionesTab({ config, liveMode, notify, canWrite }){
  const [filas, setFilas] = useState(null); // null = todavía no cargó ni una vez
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [abiertoPara, setAbiertoPara] = useState("");
  const [formDias, setFormDias] = useState("");
  const [formNota, setFormNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if(!liveMode) return;
    setCargando(true); setError("");
    try{
      const values = await leerVacacionesExcel(config.VACACIONES_DRIVE_ID, config.VACACIONES_ITEM_ID, config.VACACIONES_HOJA);
      setFilas(parseVacaciones(values));
    }catch(err){
      console.error(err);
      setError("No se pudo leer el Excel de Vacaciones: " + err.message);
    }finally{ setCargando(false); }
  }, [liveMode, config.VACACIONES_DRIVE_ID, config.VACACIONES_ITEM_ID, config.VACACIONES_HOJA]);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirFormulario(nombre){
    setAbiertoPara(nombre); setFormDias(""); setFormNota("");
  }

  async function handleGuardarPeriodo(nombre){
    if(!formDias || !formNota.trim()){
      notify?.("Completa los días y la nota del período antes de guardar.", 'error');
      return;
    }
    setGuardando(true);
    try{
      // Se vuelve a leer el Excel justo antes de escribir (no se reutiliza la
      // fila ya mostrada en pantalla) para tomar el estado más fresco y no
      // pisar un período que alguien más haya agregado mientras tanto.
      const values = await leerVacacionesExcel(config.VACACIONES_DRIVE_ID, config.VACACIONES_ITEM_ID, config.VACACIONES_HOJA);
      const ubicacion = ubicarFilaCruda(values, nombre);
      if(!ubicacion) throw new Error(`No se encontró a "${nombre}" en el Excel (¿cambió de nombre en la hoja?).`);
      const colIndex = primeraColumnaVaciaDePeriodo(ubicacion.fila, Math.max(ubicacion.fila.length, 200));
      if(colIndex === null) throw new Error("Esta persona ya no tiene columnas libres para un período nuevo en el Excel — hay que agregar columnas a mano.");
      const rango = rangoNuevoPeriodo(ubicacion.excelRow, colIndex);
      await escribirRangoVacacionesExcel(config.VACACIONES_DRIVE_ID, config.VACACIONES_ITEM_ID, config.VACACIONES_HOJA, rango, [Number(formDias), formNota.trim()]);
      notify?.(`Período agregado para ${nombre} en el Excel real — Días pendientes/tomados se recalculan solos (son fórmulas del propio archivo).`, 'info');
      setAbiertoPara("");
      await cargar();
    }catch(err){
      console.error(err);
      notify?.("No se pudo guardar el período: " + err.message, 'error');
    }finally{ setGuardando(false); }
  }

  if(!liveMode){
    return <div className="empty-state">El Excel de Vacaciones solo se puede leer/editar con una sesión real de Microsoft 365 — inicia sesión para verlo (no aplica en modo demo).</div>;
  }
  if(error){
    return <div className="empty-state">{error}</div>;
  }
  if(cargando && !filas){
    return <div className="empty-state">Cargando el Excel de Vacaciones…</div>;
  }

  return (
    <div>
      <p className="save-hint" style={{marginBottom:14}}>
        Esta pestaña lee y escribe directo sobre el mismo Vacaciones.xlsx que ya usaba el despacho — no es una copia. "Días pendientes/tomados" son fórmulas del propio Excel y se recalculan solas al agregar un período nuevo.
      </p>
      {(filas||[]).map(f => (
        <div className="panel" key={f.nombre} style={{marginBottom:16}}>
          <div className="panel-head">
            <h3>{f.nombre}</h3>
            {canWrite && (abiertoPara===f.nombre
              ? <button type="button" className="btn-secondary" onClick={() => setAbiertoPara("")}>Cancelar</button>
              : <IconTextButton icon="add" variant="secondary" onClick={() => abrirFormulario(f.nombre)}>Agregar período</IconTextButton>)}
          </div>
          <div className="panel-body" style={{padding:'14px 20px'}}>
            <div className="field-card-grid">
              <FieldCard label="Fecha de ingreso">{f.fechaIngreso}</FieldCard>
              <FieldCard label="Días laborados">{f.diasLaborados || "—"}</FieldCard>
              <FieldCard label="Días generados">{f.diasGenerados || "—"}</FieldCard>
              <FieldCard label="Días pendientes">{f.diasPendientes || "—"}</FieldCard>
              <FieldCard label="Días tomados">{f.diasTomados || "—"}</FieldCard>
            </div>

            {abiertoPara===f.nombre && (
              <div className="panel" style={{marginTop:14}}>
                <div className="panel-body" style={{padding:'14px 20px', display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end'}}>
                  <div className="field" style={{maxWidth:110}}>
                    <label>Días</label>
                    <input type="number" min="0" step="0.5" value={formDias} onChange={e => setFormDias(e.target.value)} />
                  </div>
                  <div className="field" style={{flex:1, minWidth:220}}>
                    <label>Nota (fechas / detalle del período)</label>
                    <input type="text" value={formNota} onChange={e => setFormNota(e.target.value)} placeholder="Ej: 15 al 19 de diciembre 2026" />
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
                    <thead><tr><th>Días</th><th>Nota</th></tr></thead>
                    <tbody>
                      {f.historial.map((h,i) => <tr key={i}><td>{h.dias || "—"}</td><td>{h.nota || "—"}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              ) : <p className="save-hint">Sin períodos registrados todavía.</p>}
            </div>
          </div>
        </div>
      ))}
      {!(filas||[]).length && <div className="empty-state">No hay filas en el Excel de Vacaciones.</div>}
    </div>
  );
}
