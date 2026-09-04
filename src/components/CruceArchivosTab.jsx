import { useState } from 'react';
import { cargarWorkbook, nombresDeHojas, leerHoja, compararArchivos, generarExcelCruce } from '../lib/cruceArchivos';
import { IconTextButton } from './IconButton';

const SLOT_VACIO = { file:null, workbook:null, hojas:[], hoja:"", columnas:[], columnaLlave:"", filas:null, leyendo:false };

// "Cruce de archivos" (Informes) — pedido explícito del usuario 2026-09-03:
// cruza 2 o más archivos Excel entre sí (conciliaciones de cartera con EPS,
// cada archivo un corte/reporte distinto del mismo radicado; el tope de 3
// se quitó el mismo día, a pedido explícito). Por cada archivo: se sube, se
// elige QUÉ HOJA analizar (un mismo archivo puede traer varias) y luego
// CUÁL COLUMNA de esa hoja sirve de llave para cruzar — nunca se adivina,
// porque los nombres de hoja/columna varían de archivo a archivo. Ver
// lib/cruceArchivos.js para el detalle del cruce.
function Slot({ indice, slot, onChange, onQuitar, puedeQuitar, notify }){
  async function handleArchivo(e){
    const file = e.target.files?.[0];
    if(!file) return;
    onChange({ ...SLOT_VACIO, file, leyendo:true });
    try{
      const workbook = await cargarWorkbook(file);
      const hojas = nombresDeHojas(workbook);
      onChange({ ...SLOT_VACIO, file, workbook, hojas, leyendo:false });
    }catch(err){
      console.error(err);
      onChange({ ...SLOT_VACIO, leyendo:false });
      notify?.("No se pudo leer el archivo: " + err.message, 'error');
    }
    e.target.value = "";
  }
  function handleHoja(hoja){
    if(!hoja){ onChange({ ...slot, hoja:"", columnas:[], columnaLlave:"", filas:null }); return; }
    try{
      const { columnas, filas } = leerHoja(slot.workbook, hoja);
      onChange({ ...slot, hoja, columnas, columnaLlave:"", filas });
    }catch(err){
      console.error(err);
      onChange({ ...slot, hoja:"", columnas:[], columnaLlave:"", filas:null });
      notify?.("No se pudo leer la hoja: " + err.message, 'error');
    }
  }
  return (
    <div className="panel" style={{marginBottom:14}}>
      <div className="panel-head">
        <h3>Archivo {indice + 1}</h3>
        {puedeQuitar && <button type="button" className="btn-secondary" onClick={onQuitar}>Quitar</button>}
      </div>
      <div className="panel-body" style={{display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end'}}>
        <div className="field" style={{minWidth:220}}>
          <label>Archivo (.xlsx)</label>
          <label className="btn-secondary" style={{cursor: slot.leyendo ? 'default' : 'pointer', display:'inline-block'}}>
            {slot.leyendo ? "Leyendo…" : (slot.file ? slot.file.name : "Elegir archivo…")}
            <input type="file" accept=".xlsx" onChange={handleArchivo} disabled={slot.leyendo} style={{display:'none'}} />
          </label>
        </div>
        {slot.hojas.length > 0 && (
          <div className="field" style={{minWidth:200}}>
            <label>Hoja a analizar</label>
            <select value={slot.hoja} onChange={e => handleHoja(e.target.value)}>
              <option value="">— seleccionar —</option>
              {slot.hojas.map(h => <option value={h} key={h}>{h}</option>)}
            </select>
          </div>
        )}
        {slot.columnas.length > 0 && (
          <div className="field" style={{minWidth:220}}>
            <label>Columna de cruce (llave)</label>
            <select value={slot.columnaLlave} onChange={e => onChange({ ...slot, columnaLlave: e.target.value })}>
              <option value="">— seleccionar —</option>
              {slot.columnas.map(c => <option value={c} key={c}>{c}</option>)}
            </select>
          </div>
        )}
        {slot.filas && <span className="save-hint">{slot.filas.length} fila(s) leídas</span>}
      </div>
    </div>
  );
}

export default function CruceArchivosTab({ notify }){
  const [slots, setSlots] = useState([{ ...SLOT_VACIO }, { ...SLOT_VACIO }]);
  const [resultado, setResultado] = useState(null);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  function actualizarSlot(i, nuevo){
    setSlots(prev => prev.map((s, idx) => idx===i ? nuevo : s));
    setResultado(null);
  }
  // Sin límite de archivos — pedido explícito del usuario 2026-09-03
  // ("quitemos que sean máximo tres, que se puedan comparar más
  // archivos"). El cruce/Excel de salida ya eran genéricos para cualquier
  // cantidad (ver lib/cruceArchivos.js), solo la interfaz tenía el tope de 3.
  function agregarArchivo(){
    setSlots(prev => [...prev, { ...SLOT_VACIO }]);
  }
  function quitarSlot(i){
    setSlots(prev => prev.filter((_, idx) => idx !== i));
    setResultado(null);
  }

  const listos = slots.every(s => s.file && s.hoja && s.columnaLlave && s.filas);

  function handleComparar(){
    const archivos = slots.map(s => ({
      nombre: s.file.name.replace(/\.xlsx$/i, ''),
      columnaLlave: s.columnaLlave,
      columnas: s.columnas,
      filas: s.filas,
    }));
    setResultado(compararArchivos(archivos));
    notify?.("Cruce listo.", 'success');
  }

  async function handleDescargar(){
    if(!resultado) return;
    setGenerandoExcel(true);
    try{
      const archivos = slots.map(s => ({
        nombre: s.file.name.replace(/\.xlsx$/i, ''),
        columnaLlave: s.columnaLlave,
        columnas: s.columnas,
        filas: s.filas,
      }));
      const hoyISO = new Date().toISOString().slice(0,10);
      await generarExcelCruce(`Cruce de archivos ${hoyISO}`, archivos, resultado);
    }catch(err){
      console.error(err);
      notify?.("No se pudo generar el Excel del cruce: " + err.message, 'error');
    } finally { setGenerandoExcel(false); }
  }

  const conObservacion = resultado ? resultado.resumen.filter(f => f.observacion !== "OK").length : 0;

  return (
    <div className="panel" style={{marginTop:20}}>
      <div className="panel-head"><h3>Cruce de archivos</h3></div>
      <div className="panel-body">
        <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
          Sube 2 o más archivos Excel para cruzarlos entre sí por una columna en común (ej. un número de radicado). Por cada archivo elige qué hoja analizar y cuál es esa columna — Portal Lexara arma un Excel con el resumen del cruce y cada archivo con sus observaciones.
        </p>

        {slots.map((slot, i) => (
          <Slot
            key={i}
            indice={i}
            slot={slot}
            onChange={nuevo => actualizarSlot(i, nuevo)}
            onQuitar={() => quitarSlot(i)}
            puedeQuitar={i >= 2}
            notify={notify}
          />
        ))}

        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:18}}>
          <button type="button" className="btn-secondary" onClick={agregarArchivo}>+ Agregar otro archivo</button>
          <IconTextButton icon="add" variant="primary" onClick={handleComparar} disabled={!listos}>Comparar</IconTextButton>
        </div>

        {resultado && (
          <>
            <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:18}}>
              <span className="badge badge-verde">{resultado.resumen.length} llave(s) en total</span>
              <span className={conObservacion ? "badge badge-alerta" : "badge badge-gris"}>{conObservacion} con observación</span>
            </div>
            <div style={{marginBottom:18}}>
              <IconTextButton icon="excel" variant="secondary" onClick={handleDescargar} disabled={generandoExcel}>
                {generandoExcel ? "Generando…" : "Descargar Excel"}
              </IconTextButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
