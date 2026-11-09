import { useState } from 'react';
import { mensajeError, fmtMonto, listarExcelDesistimientosSOS, descargarArchivoSharePoint, RUTA_DESISTIMIENTOS_SOS } from '../lib/graph';
import {
  cargarWorkbook, nombresDeHojas, leerHoja, compararArchivos, generarExcelCruce,
  ROLES_CRUCE, detectarRol, sugerirColumnaValor, sugerirProcesoCorto, procesosDelArchivo, sugerirHoja, sugerirColumnaLlave, sugerirColumnaCumplimiento, analizarArchivos, armarHojasEspeciales,
} from '../lib/cruceArchivos';
import { IconTextButton } from './IconButton';

const SLOT_VACIO = { file:null, workbook:null, hojas:[], hoja:"", columnas:[], columnaLlave:"", columnaCumplimiento:"", columnaValor:"", filas:null, leyendo:false, rol:"generico", sugerida:false };

// «Cruce de archivos» (Informes → Herramientas) — pedido del usuario 2026-09-03 y mejorado 2026-11-09 (cruce de la base de la demanda con el peritaje y con los desistimientos).
// Por cada archivo: se sube (o, el de desistimientos, se trae de SharePoint), se dice QUÉ ES (base de la demanda / peritaje / desistimientos / otro), qué HOJA analizar y cuál es la
// COLUMNA llave (casi siempre «Ultimo Radicado MYT0102», «RADICADO O ENTREGA» o «RADICADO»: el portal la propone y se puede cambiar). Ver lib/cruceArchivos.js.
function Slot({ indice, slot, onChange, onQuitar, puedeQuitar, notify, config, liveMode }){
  const [listaSP, setListaSP] = useState(null);       // { driveId, archivos } de la carpeta de Desistimientos en SharePoint
  const [elegidoSP, setElegidoSP] = useState("");
  const [cargandoSP, setCargandoSP] = useState(false);

  // Una hoja ya elegida → sus columnas, filas y las sugerencias (llave, cumplimiento).
  function conHoja(base, workbook, hoja, rol){
    const { columnas, filas } = leerHoja(workbook, hoja);
    const llave = sugerirColumnaLlave(columnas);
    return { ...base, hoja, columnas, filas, columnaLlave: llave, columnaCumplimiento: rol === 'peritaje' ? sugerirColumnaCumplimiento(columnas) : "", columnaValor: sugerirColumnaValor(columnas), sugerida: !!llave };
  }

  async function procesarArchivo(file){
    onChange({ ...SLOT_VACIO, file, leyendo:true });
    try{
      const workbook = await cargarWorkbook(file);
      const hojas = nombresDeHojas(workbook);
      const rol = detectarRol(file.name, indice);
      let nuevo = { ...SLOT_VACIO, file, workbook, hojas, rol, leyendo:false };
      const propuesta = sugerirHoja(hojas, rol);
      if(propuesta){ try{ nuevo = conHoja(nuevo, workbook, propuesta, rol); }catch(err){ console.error(err); } }
      onChange(nuevo);
    }catch(err){
      console.error(err);
      onChange({ ...SLOT_VACIO, leyendo:false });
      notify?.("No se pudo leer el archivo: " + mensajeError(err), 'error');
    }
  }
  async function handleArchivo(e){
    const file = e.target.files?.[0];
    e.target.value = "";
    if(file) await procesarArchivo(file);
  }
  function handleHoja(hoja){
    if(!hoja){ onChange({ ...slot, hoja:"", columnas:[], columnaLlave:"", columnaCumplimiento:"", columnaValor:"", filas:null, sugerida:false }); return; }
    try{ onChange(conHoja(slot, slot.workbook, hoja, slot.rol)); }
    catch(err){
      console.error(err);
      onChange({ ...slot, hoja:"", columnas:[], columnaLlave:"", columnaCumplimiento:"", filas:null, sugerida:false });
      notify?.("No se pudo leer la hoja: " + mensajeError(err), 'error');
    }
  }
  function handleRol(rol){
    onChange({ ...slot, rol, columnaCumplimiento: rol === 'peritaje' && slot.columnas.length ? sugerirColumnaCumplimiento(slot.columnas) : "" });
  }
  async function listarSharePoint(){
    setCargandoSP(true);
    try{
      const lista = await listarExcelDesistimientosSOS(config);
      if(!lista.archivos.length){ notify?.('No encontré archivos Excel en ' + RUTA_DESISTIMIENTOS_SOS + '.', 'info'); return; }
      setListaSP(lista);
      setElegidoSP((lista.archivos.find(a => /final/i.test(a.nombre)) || lista.archivos[0]).id);
    }catch(err){ console.error(err); notify?.('No se pudo leer la carpeta de Desistimientos en SharePoint: ' + mensajeError(err), 'error'); }
    finally{ setCargandoSP(false); }
  }
  async function cargarSharePoint(){
    const a = listaSP?.archivos.find(x => x.id === elegidoSP);
    if(!a) return;
    setCargandoSP(true);
    try{ await procesarArchivo(await descargarArchivoSharePoint(listaSP.driveId, a.id, a.nombre)); setListaSP(null); }
    catch(err){ console.error(err); notify?.('No se pudo traer «' + a.nombre + '»: ' + mensajeError(err), 'error'); }
    finally{ setCargandoSP(false); }
  }

  const sinCumplimiento = slot.rol === 'peritaje' && slot.columnas.length > 0 && !slot.columnaCumplimiento;
  return (
    <div className="panel" style={{marginBottom:14}}>
      <div className="panel-head">
        <h3>Archivo {indice + 1}{slot.file ? ' · ' + ROLES_CRUCE[slot.rol] : ''}</h3>
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
        {slot.file && (
          <div className="field" style={{minWidth:180}}>
            <label>¿Qué archivo es?</label>
            <select value={slot.rol} onChange={e => handleRol(e.target.value)}>
              {Object.entries(ROLES_CRUCE).map(([k, nombre]) => <option value={k} key={k}>{nombre}</option>)}
            </select>
          </div>
        )}
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
          <div className="field" style={{minWidth:240}}>
            <label>Columna de cruce (llave){slot.sugerida && slot.columnaLlave ? ' · propuesta por el portal' : ''}</label>
            <select value={slot.columnaLlave} onChange={e => onChange({ ...slot, columnaLlave: e.target.value, sugerida:false })}>
              <option value="">— seleccionar —</option>
              {slot.columnas.map(c => <option value={c} key={c}>{c}</option>)}
            </select>
          </div>
        )}
        {slot.columnas.length > 0 && (
          <div className="field" style={{minWidth:240}}>
            <label>Columna de valor (subtotales){slot.columnaValor ? ' · propuesta por el portal' : ''}</label>
            <select value={slot.columnaValor} onChange={e => onChange({ ...slot, columnaValor: e.target.value })}>
              <option value="">— sin subtotal de valor —</option>
              {slot.columnas.map(c => <option value={c} key={c}>{c}</option>)}
            </select>
          </div>
        )}
        {slot.rol === 'peritaje' && slot.columnas.length > 0 && (
          <div className="field" style={{minWidth:260}}>
            <label>Columna de cumplimiento de requisitos esenciales</label>
            <select value={slot.columnaCumplimiento} onChange={e => onChange({ ...slot, columnaCumplimiento: e.target.value })}>
              <option value="">— seleccionar —</option>
              {slot.columnas.map(c => <option value={c} key={c}>{c}</option>)}
            </select>
          </div>
        )}
        {slot.filas && <span className="save-hint">{slot.filas.length} fila(s) leídas</span>}
      </div>
      {sinCumplimiento && (
        <p className="save-hint" style={{ color:'#b3590a', margin:'0 16px 12px' }}>No encontré una columna llamada «CUMPLIMIENTO ESENCIALES DEL RECOBRO»: elígela de la lista (la hoja «Peritaje CUMPLE» solo se arma con esa columna).</p>
      )}
      {slot.rol === 'desistimientos' && liveMode && config && (
        <div className="panel-body" style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', paddingTop:0 }}>
          {!listaSP ? (
            <button type="button" className="btn-secondary" onClick={listarSharePoint} disabled={cargandoSP}>{cargandoSP ? 'Buscando…' : 'Traer de SharePoint (' + RUTA_DESISTIMIENTOS_SOS + ')'}</button>
          ) : (
            <>
              <div className="field" style={{ minWidth:280 }}>
                <label>Archivo de la carpeta de Desistimientos</label>
                <select value={elegidoSP} onChange={e => setElegidoSP(e.target.value)}>
                  {listaSP.archivos.map(a => <option value={a.id} key={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <button type="button" className="btn-primary" onClick={cargarSharePoint} disabled={cargandoSP}>{cargandoSP ? 'Trayendo…' : 'Cargar este archivo'}</button>
              <button type="button" className="btn-secondary" onClick={() => setListaSP(null)} disabled={cargandoSP}>Cancelar</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CruceArchivosTab({ notify, config, liveMode }){
  const [slots, setSlots] = useState([{ ...SLOT_VACIO, rol:'base' }, { ...SLOT_VACIO }]);
  const [resultado, setResultado] = useState(null);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [procesoManual, setProcesoManual] = useState('');   // el número corto del proceso de la demanda; vacío = el que propone el portal

  function actualizarSlot(i, nuevo){
    setSlots(prev => prev.map((s, idx) => idx===i ? nuevo : s));
    setResultado(null);
  }
  // Sin límite de archivos — pedido explícito del usuario 2026-09-03.
  function agregarArchivo(){ setSlots(prev => [...prev, { ...SLOT_VACIO }]); }
  function quitarSlot(i){ setSlots(prev => prev.filter((_, idx) => idx !== i)); setResultado(null); }

  const listos = slots.every(s => s.file && s.hoja && s.columnaLlave && s.filas) && slots.some(s => s.rol !== 'desistimientos');

  function aArchivo(s){
    const base = s.file.name.replace(/\.xlsx$/i, '');
    // El mismo Excel puede entrar dos veces con hojas distintas (p. ej. «Base original» y «Base depurada»): se distinguen por su hoja.
    const repetido = slots.filter(x => x.file && x.file.name === s.file.name).length > 1;
    return { nombre: repetido ? base + ' · ' + s.hoja : base, nombreHoja: repetido ? s.hoja : '', rol: s.rol, columnaLlave: s.columnaLlave, columnaCumplimiento: s.columnaCumplimiento, columnaValor: s.columnaValor, columnas: s.columnas, filas: s.filas };
  }

  const archivosLeidos = slots.filter(s => s.file && s.filas).map(aArchivo);
  const procesoSugerido = sugerirProcesoCorto(archivosLeidos);
  const archivoDes = archivosLeidos.find(a => a.rol === 'desistimientos');
  const procesosDelDes = archivoDes ? procesosDelArchivo(archivoDes) : [];
  const procesoCorto = procesoManual.trim() || procesoSugerido;

  function handleComparar(){
    const todos = slots.map(aArchivo);
    // Los desistimientos (decenas de miles de filas) no entran al cruce general: alimentan su propia hoja.
    const entreSi = todos.filter(a => a.rol !== 'desistimientos');
    const cruce = entreSi.length >= 2 ? compararArchivos(entreSi) : { resumen: [], porArchivo: [] };
    const analisis = analizarArchivos(entreSi);
    const { hojas, info } = armarHojasEspeciales(todos, procesoCorto);
    setResultado({ cruce, entreSi, analisis, hojasEspeciales: hojas, infoEspecial: info, procesoCorto });
    notify?.("Cruce listo.", 'success');
  }

  async function handleDescargar(){
    if(!resultado) return;
    setGenerandoExcel(true);
    try{
      const hoyISO = new Date().toISOString().slice(0,10);
      // Nombre del archivo (pedido del usuario 2026-11-09): número corto del proceso + «Análisis» + la fecha, p. ej. «2015-00826 Análisis 2026-11-09».
      await generarExcelCruce(`${resultado.procesoCorto || 'Cruce de archivos'} Análisis ${hoyISO}`, resultado.entreSi, resultado.cruce, { analisis: resultado.analisis, hojasEspeciales: resultado.hojasEspeciales, infoEspecial: resultado.infoEspecial });
    }catch(err){
      console.error(err);
      notify?.("No se pudo generar el Excel del cruce: " + mensajeError(err), 'error');
    } finally { setGenerandoExcel(false); }
  }

  const conObservacion = resultado ? resultado.cruce.resumen.filter(f => f.observacion !== "OK").length : 0;
  const peri = resultado?.infoEspecial?.peritaje, des = resultado?.infoEspecial?.desistimientos;

  return (
    <div className="panel" style={{marginTop:20}}>
      <div className="panel-head"><h3>Cruce de archivos</h3></div>
      <div className="panel-body">
        <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
          Sube 2 o más archivos Excel para cruzarlos por una columna en común (el número de radicado). Por cada archivo di qué es (base de la demanda, peritaje, desistimientos u otro), elige la hoja y confirma la columna — el portal propone
          «Ultimo Radicado MYT0102», «RADICADO O ENTREGA» o «RADICADO». Con un <strong>peritaje</strong> arma además la hoja de los recobros que CUMPLEN, y con los <strong>desistimientos</strong> la hoja con todos los del proceso de la demanda y una anotación final de si siguen vigentes en la base.
          Consejo: el mismo Excel se puede subir dos veces con hojas distintas (por ejemplo «Base original» como base y «Base depurada» como «Otro archivo»): la hoja de desistimientos dirá en cuál de las dos sigue estando cada radicado.
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
            config={config}
            liveMode={liveMode}
          />
        ))}

        {archivoDes && (
          <div className="panel" style={{marginBottom:14}}>
            <div className="panel-body" style={{display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end'}}>
              <div className="field" style={{minWidth:260}}>
                <label>Proceso de esta demanda (número corto){!procesoManual.trim() && procesoSugerido ? ' · propuesto por el portal' : ''}</label>
                <input type="text" list="cruce-procesos-des" value={procesoManual} onChange={e => { setProcesoManual(e.target.value); setResultado(null); }} placeholder={procesoSugerido || 'ej. 2015-00826'} />
                <datalist id="cruce-procesos-des">{procesosDelDes.map(p => <option key={p.proceso} value={p.proceso}>{p.filas} filas</option>)}</datalist>
              </div>
              <span className="save-hint">
                {procesoCorto
                  ? 'La hoja de desistimientos trae TODOS los del proceso ' + procesoCorto + ' (' + (procesosDelDes.find(p => p.proceso === procesoCorto)?.filas ?? 0) + ' filas), con su anotación al final de si siguen en la base de la demanda.'
                  : 'Escribe el número corto del proceso para traer todos sus desistimientos; sin él solo se traen los que cruzan por radicado.'}
              </span>
            </div>
          </div>
        )}

        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:18}}>
          <button type="button" className="btn-secondary" onClick={agregarArchivo}>+ Agregar otro archivo</button>
          <IconTextButton icon="add" variant="primary" onClick={handleComparar} disabled={!listos}>Comparar</IconTextButton>
        </div>

        {resultado && (
          <>
            <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:14}}>
              <span className="badge badge-verde">{resultado.analisis.llavesTotales} llave(s) en total</span>
              {resultado.entreSi.length >= 2 && <span className={conObservacion ? "badge badge-alerta" : "badge badge-gris"}>{conObservacion} con observación</span>}
              {peri && <span className="badge badge-verde">{peri.cumple} fila(s) CUMPLEN de {peri.filasTotales}</span>}
              {des && <span className="badge badge-naranja">{des.cruzan} desistimiento(s){des.proceso ? ' del proceso ' + des.proceso : ' cruzan'}</span>}
              {des && <span className="badge badge-verde">{des.vigentes} vigentes en la base</span>}
              {des && <span className="badge badge-gris">{des.noEstanEnBase} no están en la base</span>}
            </div>
            <div className="table-wrap" style={{marginBottom:14}}>
              <table className="table-compact">
                <thead><tr><th>Archivo</th><th style={{textAlign:'right'}}>Filas</th><th style={{textAlign:'right'}}>Recobros únicos</th><th style={{textAlign:'right'}}>Sin llave</th><th style={{textAlign:'right'}}>Llaves repetidas</th><th style={{textAlign:'right'}}>Subtotal del valor</th></tr></thead>
                <tbody>
                  {resultado.analisis.porArchivo.map(p => (
                    <tr key={p.nombre}><td>{p.nombre}</td><td style={{textAlign:'right'}}>{p.filas}</td><td style={{textAlign:'right'}}>{p.llavesUnicas}</td><td style={{textAlign:'right'}}>{p.sinLlave}</td><td style={{textAlign:'right'}}>{p.llavesRepetidas}</td><td style={{textAlign:'right'}}>{p.valor == null ? '—' : '$ ' + fmtMonto(p.valor)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {resultado.analisis.cobertura.length > 1 && (
              <p className="save-hint" style={{marginBottom:14}}>{resultado.analisis.cobertura.map(c => c.etiqueta + ': ' + c.llaves).join(' · ')}</p>
            )}
            {resultado.infoEspecial.peritajeSinColumna && <p className="save-hint" style={{color:'#b3590a'}}>No se armó la hoja «Peritaje CUMPLE»: falta elegir la columna de cumplimiento.</p>}
            <div style={{marginBottom:18}}>
              <IconTextButton icon="excel" variant="secondary" onClick={handleDescargar} disabled={generandoExcel}>
                {generandoExcel ? "Generando…" : "Descargar Excel"}
              </IconTextButton>
            </div>
            <p className="save-hint">
              El Excel trae: «Resumen» (lo que encontró el análisis), «Revisión» (por llave, con la observación de cada una), una hoja por cada archivo{peri ? ', «Peritaje CUMPLE» (solo los recobros que cumplen)' : ''}{des ? ' y «' + des.hoja + '» (' + (des.proceso ? 'todos los desistimientos de ese proceso' : 'los que cruzan') + ', con la anotación al final de si siguen vigentes en la base de la demanda)' : ''}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
