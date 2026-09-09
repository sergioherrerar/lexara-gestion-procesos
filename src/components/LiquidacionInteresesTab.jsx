import { useState } from 'react';
import { mensajeError, fmtMonto } from '../lib/graph';
import { liquidar, generarPlantillaLiquidacion, leerPlantillaLiquidacion, liquidarFilas, generarExcelLiquidado, ultimaActualizacionTasas, ultimaActualizacionIPC, MESES_NOMBRES } from '../lib/liquidacionIntereses';
import { generarLiquidacionInteresesPDF } from '../lib/liquidacionInteresesPDF';
import IconButton, { IconTextButton } from './IconButton';

// "Liquidación Intereses" (Informes > Herramientas) — agregada 2026-09-09,
// pedido explícito del usuario, reemplaza el cálculo manual en 2 archivos
// Excel reales. Modo 1 (una línea): formulario + salida en pantalla + PDF
// descargable con el mismo diseño de la casa (ver liquidacionInteresesPDF.js).
// Modo 2 (varias líneas): plantilla Excel para bajar/llenar/subir, devuelve
// un Excel ya liquidado — pedido explícito del usuario ("un botón para
// descargar plantillas se cargan los datos... y lo devuelve liquidado").
const MODOS = [
  { key: 'unaLinea', label: 'Una línea (detalle)' },
  { key: 'variasLineas', label: 'Varias líneas (Excel)' },
  { key: 'tablaTasas', label: 'Tabla Tasas de Interés' },
  { key: 'tablaIpc', label: 'Tabla IPC' },
];

function ModoUnaLinea({ notify, tasasInteres, ipcMensual }){
  const [valorDeuda, setValorDeuda] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [fechaCalculo, setFechaCalculo] = useState(() => new Date().toISOString().slice(0, 10));
  const [incluirIPC, setIncluirIPC] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  function handleLiquidar(e){
    e?.preventDefault();
    try{
      const r = liquidar({ valorDeuda, fechaVencimiento, fechaCalculo, incluirIPC, tasasInteres, ipcMensual });
      setResultado(r);
    }catch(err){
      setResultado(null);
      notify?.(mensajeError(err), 'error');
    }
  }

  async function handleDescargarPDF(){
    if(!resultado) return;
    setGenerandoPDF(true);
    try{
      await generarLiquidacionInteresesPDF(resultado);
    }catch(err){
      console.error(err);
      notify?.("No se pudo generar el PDF: " + mensajeError(err), 'error');
    } finally { setGenerandoPDF(false); }
  }

  return (
    <div>
      <form onSubmit={handleLiquidar} className="panel-body" style={{display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end', padding:0, marginBottom:18}}>
        <div className="field" style={{minWidth:180}}>
          <label>Valor deuda</label>
          <input type="text" inputMode="decimal" value={valorDeuda} onChange={e => setValorDeuda(e.target.value)} placeholder="Ej: 14.000.000" required />
        </div>
        <div className="field" style={{minWidth:170}}>
          <label>Fecha vencimiento</label>
          <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} required />
        </div>
        <div className="field" style={{minWidth:170}}>
          <label>Fecha de cálculo</label>
          <input type="date" value={fechaCalculo} onChange={e => setFechaCalculo(e.target.value)} required />
        </div>
        <label className="checkbox-field" style={{marginBottom:10}}>
          <input type="checkbox" checked={incluirIPC} onChange={e => setIncluirIPC(e.target.checked)} />
          ¿Liquidar también IPC?
        </label>
        <IconTextButton icon="add" variant="primary" onClick={handleLiquidar}>Liquidar</IconTextButton>
      </form>

      {resultado && (
        <div className="panel" style={{marginBottom:18}}>
          <div className="panel-head"><h3>Resultado</h3></div>
          <div className="panel-body">
            <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:16}}>
              <span className="badge badge-gris">Días en mora: {resultado.diasMora}</span>
              <span className="badge badge-verde">Interés moratorio: ${fmtMonto(resultado.interesMoratorio)}</span>
              {resultado.incluirIPC && (
                <span className="badge badge-gris">Incremento IPC: {resultado.ipc.disponible ? `$${fmtMonto(resultado.ipc.incremento)}` : 'N/D'}</span>
              )}
              <span className="badge badge-verde" style={{fontWeight:700}}>Total a pagar: ${fmtMonto(resultado.totalAPagar)}</span>
            </div>
            {resultado.incluirIPC && (
              <p className="save-hint" style={{marginBottom:12}}>
                {resultado.ipc.disponible
                  ? (resultado.aplicaIPC ? "Se aplicó la indexación por IPC (mayor valor que el interés moratorio)." : "Se aplicó el interés moratorio (mayor valor que la indexación por IPC).")
                  : "No se pudo calcular el IPC — falta el índice de algún mes en la tabla IPC. Se aplicó el interés moratorio."}
              </p>
            )}
            {resultado.diasSinTasa > 0 && (
              <p className="save-hint" style={{color:'var(--rojo, #b23b3b)', marginBottom:12}}>
                Atención: no hay tasa de interés cargada para {resultado.diasSinTasa} día(s) del periodo — revisa la tabla TasasInteres.
              </p>
            )}

            <div className="table-wrap" style={{marginBottom:14}}>
              <table className="table-compact">
                <thead><tr><th>Año</th><th style={{textAlign:'right'}}>Días en Mora</th><th style={{textAlign:'right'}}>Valor Intereses</th></tr></thead>
                <tbody>
                  {resultado.desglosePorAnio.map(r => (
                    <tr key={r.anio}>
                      <td>{r.anio}</td>
                      <td style={{textAlign:'right'}}>{r.dias}</td>
                      <td style={{textAlign:'right'}}>${fmtMonto(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{fontWeight:700}}>
                    <td>Total</td>
                    <td style={{textAlign:'right'}}>{resultado.diasMora}</td>
                    <td style={{textAlign:'right'}}>${fmtMonto(resultado.interesMoratorio)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <IconTextButton icon="pdf" variant="secondary" onClick={handleDescargarPDF} disabled={generandoPDF}>
              {generandoPDF ? "Generando…" : "Descargar PDF"}
            </IconTextButton>
          </div>
        </div>
      )}
    </div>
  );
}

function ModoVariasLineas({ notify, tasasInteres, ipcMensual }){
  const [descargandoPlantilla, setDescargandoPlantilla] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const [filas, setFilas] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  async function handleDescargarPlantilla(){
    setDescargandoPlantilla(true);
    try{ await generarPlantillaLiquidacion(); }
    catch(err){ console.error(err); notify?.("No se pudo generar la plantilla: " + mensajeError(err), 'error'); }
    finally{ setDescargandoPlantilla(false); }
  }

  async function handleArchivo(e){
    const file = e.target.files?.[0];
    if(!file) return;
    setArchivo(file); setFilas(null); setLeyendo(true);
    try{
      const leidas = await leerPlantillaLiquidacion(file);
      if(!leidas.length){
        notify?.("El archivo no tiene ninguna fila con datos.", 'error');
      } else {
        setFilas(liquidarFilas(leidas, tasasInteres, ipcMensual));
      }
    }catch(err){
      console.error(err);
      notify?.("No se pudo leer el archivo: " + mensajeError(err), 'error');
    } finally { setLeyendo(false); }
    e.target.value = "";
  }

  async function handleDescargarResultado(){
    if(!filas) return;
    setGenerandoExcel(true);
    try{ await generarExcelLiquidado(filas); }
    catch(err){ console.error(err); notify?.("No se pudo generar el Excel: " + mensajeError(err), 'error'); }
    finally{ setGenerandoExcel(false); }
  }

  const conError = filas ? filas.filter(f => f.error).length : 0;

  return (
    <div>
      <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
        Descarga la plantilla, llénala con una fila por deuda (Valor, Fecha Vencimiento, Fecha Cálculo y si esa fila liquida IPC o no) y súbela — Portal Lexara la devuelve ya liquidada en un Excel nuevo.
      </p>
      <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:18, alignItems:'center'}}>
        <IconTextButton icon="excel" variant="secondary" onClick={handleDescargarPlantilla} disabled={descargandoPlantilla}>
          {descargandoPlantilla ? "Generando…" : "Descargar plantilla"}
        </IconTextButton>
        <label className="btn-secondary" style={{cursor: leyendo ? 'default' : 'pointer', display:'inline-block'}}>
          {leyendo ? "Leyendo…" : (archivo ? archivo.name : "Subir plantilla llena…")}
          <input type="file" accept=".xlsx" onChange={handleArchivo} disabled={leyendo} style={{display:'none'}} />
        </label>
      </div>

      {filas && (
        <>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:18}}>
            <span className="badge badge-verde">{filas.length} fila(s) liquidadas</span>
            <span className={conError ? "badge badge-alerta" : "badge badge-gris"}>{conError} con error</span>
          </div>
          <IconTextButton icon="excel" variant="primary" onClick={handleDescargarResultado} disabled={generandoExcel}>
            {generandoExcel ? "Generando…" : "Descargar Excel liquidado"}
          </IconTextButton>
        </>
      )}
    </div>
  );
}

// Pestañas "Tabla Tasas de Interés" / "Tabla IPC" — pedido explícito del
// usuario 2026-09-09: agregar/modificar/eliminar las filas de referencia
// directo desde la app, sin tener que entrar a SharePoint. Mismo patrón
// simple de formulario + tabla con Editar/Eliminar por fila que ya usa
// "Registros de horas extras" (InformesView.jsx).
const TASA_VACIA = { FechaDesde: "", FechaHasta: "", TasaAnualPct: "" };

function TablaTasasInteres({ tasasInteres, notify, onCrear, onEditar, onEliminar }){
  const [nuevo, setNuevo] = useState(TASA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [editDraft, setEditDraft] = useState(TASA_VACIA);

  const filas = [...(tasasInteres || [])].sort((a, b) => String(b.FechaDesde || "").localeCompare(String(a.FechaDesde || "")));

  async function handleAgregar(){
    if(!nuevo.FechaDesde || !nuevo.FechaHasta || nuevo.TasaAnualPct === ""){
      notify?.("Completa Fecha Desde, Fecha Hasta y Tasa Anual.", 'error'); return;
    }
    setGuardando(true);
    try{
      await onCrear?.({ FechaDesde: nuevo.FechaDesde, FechaHasta: nuevo.FechaHasta, TasaAnual: Number(nuevo.TasaAnualPct) / 100 });
      setNuevo(TASA_VACIA);
    }catch(err){ console.error(err); notify?.(mensajeError(err), 'error'); }
    finally{ setGuardando(false); }
  }
  function empezarEdicion(t){
    setEditandoId(t.id);
    setEditDraft({ FechaDesde: t.FechaDesde, FechaHasta: t.FechaHasta, TasaAnualPct: (Number(t.TasaAnual) * 100).toFixed(4).replace(/\.?0+$/, '') });
  }
  async function handleGuardarEdicion(id){
    if(!editDraft.FechaDesde || !editDraft.FechaHasta || editDraft.TasaAnualPct === ""){
      notify?.("Completa Fecha Desde, Fecha Hasta y Tasa Anual.", 'error'); return;
    }
    try{
      await onEditar?.(id, { FechaDesde: editDraft.FechaDesde, FechaHasta: editDraft.FechaHasta, TasaAnual: Number(editDraft.TasaAnualPct) / 100 });
      setEditandoId(null);
    }catch(err){ console.error(err); notify?.(mensajeError(err), 'error'); }
  }

  return (
    <div>
      <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
        Un tramo por cada vez que cambió la tasa (Fecha Desde exclusiva / Fecha Hasta inclusiva). La tasa se escribe en porcentaje anual (ej: 29.66).
      </p>
      <div style={{display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end', marginBottom:18}}>
        <div className="field" style={{minWidth:160}}>
          <label>Fecha Desde</label>
          <input type="date" value={nuevo.FechaDesde} onChange={e => setNuevo({...nuevo, FechaDesde: e.target.value})} />
        </div>
        <div className="field" style={{minWidth:160}}>
          <label>Fecha Hasta</label>
          <input type="date" value={nuevo.FechaHasta} onChange={e => setNuevo({...nuevo, FechaHasta: e.target.value})} />
        </div>
        <div className="field" style={{minWidth:140}}>
          <label>Tasa Anual (%)</label>
          <input type="text" inputMode="decimal" value={nuevo.TasaAnualPct} onChange={e => setNuevo({...nuevo, TasaAnualPct: e.target.value})} placeholder="Ej: 29.66" />
        </div>
        <IconTextButton icon="add" variant="primary" onClick={handleAgregar} disabled={guardando}>{guardando ? "Guardando…" : "Agregar tramo"}</IconTextButton>
      </div>

      <div className="table-wrap">
        <table className="table-compact">
          <thead><tr><th>Fecha Desde</th><th>Fecha Hasta</th><th style={{textAlign:'right'}}>Tasa Anual</th><th>Acciones</th></tr></thead>
          <tbody>
            {filas.length ? filas.map(t => (
              editandoId === t.id ? (
                <tr key={t.id}>
                  <td><input type="date" value={editDraft.FechaDesde} onChange={e => setEditDraft({...editDraft, FechaDesde: e.target.value})} /></td>
                  <td><input type="date" value={editDraft.FechaHasta} onChange={e => setEditDraft({...editDraft, FechaHasta: e.target.value})} /></td>
                  <td><input type="text" inputMode="decimal" style={{width:80, textAlign:'right'}} value={editDraft.TasaAnualPct} onChange={e => setEditDraft({...editDraft, TasaAnualPct: e.target.value})} /></td>
                  <td style={{display:'flex', gap:6}}>
                    <IconButton icon="checklist" variant="edit" label="Guardar" onClick={() => handleGuardarEdicion(t.id)} />
                    <button type="button" className="btn-secondary" onClick={() => setEditandoId(null)}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td>{t.FechaDesde}</td>
                  <td>{t.FechaHasta}</td>
                  <td style={{textAlign:'right'}}>{(Number(t.TasaAnual) * 100).toFixed(2)}%</td>
                  <td style={{display:'flex', gap:6}}>
                    <IconButton icon="edit" variant="edit" label="Editar" onClick={() => empezarEdicion(t)} />
                    <IconButton icon="delete" variant="delete" label="Eliminar" onClick={() => onEliminar?.(t.id)} />
                  </td>
                </tr>
              )
            )) : (
              <tr><td colSpan={4}><div className="empty-state empty-state-compact">Todavía no hay tramos de tasa cargados.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const IPC_VACIO = { Anio: "", Mes: "", Indice: "" };

function TablaIPC({ ipcMensual, notify, onCrear, onEditar, onEliminar }){
  const [nuevo, setNuevo] = useState(IPC_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [editDraft, setEditDraft] = useState(IPC_VACIO);

  const filas = [...(ipcMensual || [])].sort((a, b) => (Number(b.Anio) * 12 + Number(b.Mes)) - (Number(a.Anio) * 12 + Number(a.Mes)));

  async function handleAgregar(){
    if(!nuevo.Anio || !nuevo.Mes || nuevo.Indice === ""){
      notify?.("Completa Año, Mes e Índice.", 'error'); return;
    }
    setGuardando(true);
    try{
      await onCrear?.({ Anio: Number(nuevo.Anio), Mes: Number(nuevo.Mes), Indice: Number(nuevo.Indice) });
      setNuevo(IPC_VACIO);
    }catch(err){ console.error(err); notify?.(mensajeError(err), 'error'); }
    finally{ setGuardando(false); }
  }
  function empezarEdicion(i){
    setEditandoId(i.id);
    setEditDraft({ Anio: i.Anio, Mes: i.Mes, Indice: i.Indice });
  }
  async function handleGuardarEdicion(id){
    if(!editDraft.Anio || !editDraft.Mes || editDraft.Indice === ""){
      notify?.("Completa Año, Mes e Índice.", 'error'); return;
    }
    try{
      await onEditar?.(id, { Anio: Number(editDraft.Anio), Mes: Number(editDraft.Mes), Indice: Number(editDraft.Indice) });
      setEditandoId(null);
    }catch(err){ console.error(err); notify?.(mensajeError(err), 'error'); }
  }

  return (
    <div>
      <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
        Un registro por mes (Índice de Precios al Consumidor de DANE, no la variación porcentual).
      </p>
      <div style={{display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end', marginBottom:18}}>
        <div className="field" style={{minWidth:110}}>
          <label>Año</label>
          <input type="number" value={nuevo.Anio} onChange={e => setNuevo({...nuevo, Anio: e.target.value})} placeholder="Ej: 2026" />
        </div>
        <div className="field" style={{minWidth:150}}>
          <label>Mes</label>
          <select value={nuevo.Mes} onChange={e => setNuevo({...nuevo, Mes: e.target.value})}>
            <option value="">— Selecciona —</option>
            {MESES_NOMBRES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="field" style={{minWidth:140}}>
          <label>Índice</label>
          <input type="text" inputMode="decimal" value={nuevo.Indice} onChange={e => setNuevo({...nuevo, Indice: e.target.value})} placeholder="Ej: 159.53" />
        </div>
        <IconTextButton icon="add" variant="primary" onClick={handleAgregar} disabled={guardando}>{guardando ? "Guardando…" : "Agregar mes"}</IconTextButton>
      </div>

      <div className="table-wrap">
        <table className="table-compact">
          <thead><tr><th>Año</th><th>Mes</th><th style={{textAlign:'right'}}>Índice</th><th>Acciones</th></tr></thead>
          <tbody>
            {filas.length ? filas.map(i => (
              editandoId === i.id ? (
                <tr key={i.id}>
                  <td><input type="number" style={{width:80}} value={editDraft.Anio} onChange={e => setEditDraft({...editDraft, Anio: e.target.value})} /></td>
                  <td>
                    <select value={editDraft.Mes} onChange={e => setEditDraft({...editDraft, Mes: e.target.value})}>
                      {MESES_NOMBRES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                    </select>
                  </td>
                  <td><input type="text" inputMode="decimal" style={{width:80, textAlign:'right'}} value={editDraft.Indice} onChange={e => setEditDraft({...editDraft, Indice: e.target.value})} /></td>
                  <td style={{display:'flex', gap:6}}>
                    <IconButton icon="checklist" variant="edit" label="Guardar" onClick={() => handleGuardarEdicion(i.id)} />
                    <button type="button" className="btn-secondary" onClick={() => setEditandoId(null)}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={i.id}>
                  <td>{i.Anio}</td>
                  <td>{MESES_NOMBRES[Number(i.Mes) - 1] || i.Mes}</td>
                  <td style={{textAlign:'right'}}>{i.Indice}</td>
                  <td style={{display:'flex', gap:6}}>
                    <IconButton icon="edit" variant="edit" label="Editar" onClick={() => empezarEdicion(i)} />
                    <IconButton icon="delete" variant="delete" label="Eliminar" onClick={() => onEliminar?.(i.id)} />
                  </td>
                </tr>
              )
            )) : (
              <tr><td colSpan={4}><div className="empty-state empty-state-compact">Todavía no hay meses de IPC cargados.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Seguimiento visual de "hasta cuándo están cargadas las tablas" — pedido
// explícito del usuario 2026-09-09 ("una muestra visual del ultimo dato...
// para darle seguimiento hasta cuando esta actualizado"). Se marca en
// alerta cuando el dato más reciente ya tiene más de ~45 días — DANE y
// Superfinanciera publican mensual, así que pasado ese margen ya debería
// haber un dato más nuevo por cargar.
function abrirEnlace(url){
  if(url) window.open(url, '_blank', 'noopener');
}

// Botones "Actualizar" — pedido explícito del usuario 2026-09-09: abren la
// página oficial real (DANE/Superfinanciera) donde se publica el dato nuevo
// cada mes, para ir directo a mirar y cargar la fila que falte en la lista
// de SharePoint correspondiente (no hay forma de traerlo en vivo, ver
// config.js). No reemplazan la carga manual, solo la hacen más rápida.
function EstadoActualizacion({ tasasInteres, ipcMensual, config }){
  const tasas = ultimaActualizacionTasas(tasasInteres);
  const ipc = ultimaActualizacionIPC(ipcMensual);
  const hoy = new Date();
  const diasDesdeTasas = tasas ? Math.round((hoy - tasas.fechaObj) / 86400000) : null;
  const mesesDesdeIpc = ipc ? (hoy.getFullYear() * 12 + hoy.getMonth()) - (ipc.anio * 12 + (ipc.mes - 1)) : null;

  return (
    <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:18}}>
      <span className={!tasas ? "badge badge-alerta" : (diasDesdeTasas > 45 ? "badge badge-naranja" : "badge badge-verde")}>
        Tasas de interés: {tasas ? `actualizadas hasta ${tasas.fecha}` : "sin datos cargados"}
      </span>
      <IconTextButton icon="open" variant="secondary" onClick={() => abrirEnlace(config?.TASAS_INTERES_FUENTE_URL)}>Actualizar tasas (Superfinanciera)</IconTextButton>
      <span className={!ipc ? "badge badge-alerta" : (mesesDesdeIpc > 2 ? "badge badge-naranja" : "badge badge-verde")}>
        IPC: {ipc ? `actualizado hasta ${ipc.etiqueta}` : "sin datos cargados"}
      </span>
      <IconTextButton icon="open" variant="secondary" onClick={() => abrirEnlace(config?.IPC_FUENTE_URL)}>Actualizar IPC (DANE)</IconTextButton>
    </div>
  );
}

export default function LiquidacionInteresesTab({ notify, tasasInteres, ipcMensual, config, onCrearTasaInteres, onEditarTasaInteres, onEliminarTasaInteres, onCrearIPC, onEditarIPC, onEliminarIPC }){
  const [modo, setModo] = useState('unaLinea');

  const sinDatos = !tasasInteres?.length || !ipcMensual?.length;

  return (
    <div className="panel" style={{marginTop:20}}>
      <div className="panel-head"><h3>Liquidación Intereses</h3></div>
      <div className="panel-body">
        <EstadoActualizacion tasasInteres={tasasInteres} ipcMensual={ipcMensual} config={config} />
        {sinDatos && (
          <p className="save-hint" style={{color:'var(--rojo, #b23b3b)', marginBottom:16}}>
            Todavía no hay datos cargados en las listas TasasInteres y/o IPC de SharePoint — el cálculo puede salir incompleto hasta que se carguen.
          </p>
        )}
        <div style={{display:'flex', gap:8, marginBottom:20}}>
          {MODOS.map(m => (
            <button key={m.key} type="button" className={"subtab" + (modo === m.key ? " active" : "")} onClick={() => setModo(m.key)}>{m.label}</button>
          ))}
        </div>
        {modo === 'unaLinea' && <ModoUnaLinea notify={notify} tasasInteres={tasasInteres} ipcMensual={ipcMensual} />}
        {modo === 'variasLineas' && <ModoVariasLineas notify={notify} tasasInteres={tasasInteres} ipcMensual={ipcMensual} />}
        {modo === 'tablaTasas' && <TablaTasasInteres tasasInteres={tasasInteres} notify={notify} onCrear={onCrearTasaInteres} onEditar={onEditarTasaInteres} onEliminar={onEliminarTasaInteres} />}
        {modo === 'tablaIpc' && <TablaIPC ipcMensual={ipcMensual} notify={notify} onCrear={onCrearIPC} onEditar={onEditarIPC} onEliminar={onEliminarIPC} />}
      </div>
    </div>
  );
}
