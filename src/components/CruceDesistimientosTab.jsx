import { useState } from 'react';
import { mensajeError, listarExcelDesistimientosSOS, descargarArchivoSharePoint, RUTA_DESISTIMIENTOS_SOS } from '../lib/graph';
import {
  cargarWorkbook, nombresDeHojas, leerHoja, sugerirHoja, sugerirColumnaLlave, sugerirColumnaValor, sugerirProcesoCorto, procesosDelArchivo, analizarArchivos, armarHojasEspeciales, generarExcelCruce,
} from '../lib/cruceArchivos';
import { IconTextButton } from './IconButton';

// «Cruce Desistimientos» (Informes → Herramientas, 2026-11-17, pedido del usuario): una sección pequeña y directa. Se sube primero el archivo de la DEMANDA; el archivo de DESISTIMIENTOS se trae
// solo de SharePoint (o se sube) y el Excel resultante trae una hoja nueva con TODOS los desistimientos del proceso y, al final, una anotación de cuáles siguen vigentes en la demanda.
// Es el mismo cálculo del «Cruce de Archivos» (lib/cruceArchivos.js → armarHojasEspeciales), con solo estos dos pasos.
const VACIO = { file: null, workbook: null, hojas: [], hoja: '', columnas: [], columnaLlave: '', columnaValor: '', filas: null, leyendo: false };

function conHoja(base, workbook, hoja){
  const { columnas, filas } = leerHoja(workbook, hoja);
  return { ...base, hoja, columnas, filas, columnaLlave: sugerirColumnaLlave(columnas), columnaValor: sugerirColumnaValor(columnas) };
}
async function leerArchivo(file, rol){
  const workbook = await cargarWorkbook(file);
  const hojas = nombresDeHojas(workbook);
  let slot = { ...VACIO, file, workbook, hojas };
  const propuesta = sugerirHoja(hojas, rol);
  if(propuesta){ try{ slot = conHoja(slot, workbook, propuesta); }catch(err){ console.error(err); } }
  return slot;
}
const aArchivo = (s, rol) => ({ nombre: s.file.name.replace(/\.xlsx$/i, ''), nombreHoja: '', rol, columnaLlave: s.columnaLlave, columnaCumplimiento: '', columnaValor: s.columnaValor, columnas: s.columnas, filas: s.filas });

function Selectores({ slot, onChange, notify }){
  function cambiarHoja(hoja){
    if(!hoja){ onChange({ ...slot, hoja: '', columnas: [], columnaLlave: '', columnaValor: '', filas: null }); return; }
    try{ onChange(conHoja(slot, slot.workbook, hoja)); }
    catch(err){ console.error(err); notify?.('No se pudo leer la hoja: ' + mensajeError(err), 'error'); }
  }
  return (
    <>
      {slot.hojas.length > 0 && (
        <div className="field" style={{ minWidth: 200 }}>
          <label>Hoja a analizar</label>
          <select value={slot.hoja} onChange={e => cambiarHoja(e.target.value)}>
            <option value="">— seleccionar —</option>
            {slot.hojas.map(h => <option value={h} key={h}>{h}</option>)}
          </select>
        </div>
      )}
      {slot.columnas.length > 0 && (
        <div className="field" style={{ minWidth: 240 }}>
          <label>Columna del radicado (llave){slot.columnaLlave ? ' · propuesta por el portal' : ''}</label>
          <select value={slot.columnaLlave} onChange={e => onChange({ ...slot, columnaLlave: e.target.value })}>
            <option value="">— seleccionar —</option>
            {slot.columnas.map(c => <option value={c} key={c}>{c}</option>)}
          </select>
        </div>
      )}
      {slot.filas && <span className="save-hint">{slot.filas.length} fila(s) leídas</span>}
    </>
  );
}

export default function CruceDesistimientosTab({ notify, config, liveMode }){
  const [dem, setDem] = useState(VACIO);          // archivo de la demanda
  const [des, setDes] = useState(VACIO);          // archivo de desistimientos
  const [leyendoDem, setLeyendoDem] = useState(false);
  const [trayendo, setTrayendo] = useState(false);
  const [procesoManual, setProcesoManual] = useState('');
  const [resultado, setResultado] = useState(null);
  const [generando, setGenerando] = useState(false);

  const demArchivo = dem.file && dem.filas ? aArchivo(dem, 'base') : null;
  const desArchivo = des.file && des.filas ? aArchivo(des, 'desistimientos') : null;
  const procesoSugerido = demArchivo ? sugerirProcesoCorto([demArchivo]) : '';
  const procesoCorto = procesoManual.trim() || procesoSugerido;
  const procesosDelDes = desArchivo ? procesosDelArchivo(desArchivo) : [];
  const listo = !!(dem.hoja && dem.columnaLlave && dem.filas && des.hoja && des.columnaLlave && des.filas);

  async function subirDemanda(e){
    const file = e.target.files?.[0];
    e.target.value = '';
    if(!file) return;
    setResultado(null); setLeyendoDem(true); setDem({ ...VACIO, file });
    try{ setDem(await leerArchivo(file, 'base')); }
    catch(err){ console.error(err); setDem(VACIO); notify?.('No se pudo leer el archivo de la demanda: ' + mensajeError(err), 'error'); }
    finally{ setLeyendoDem(false); }
    // Con sesión real, los desistimientos se traen solos de SharePoint (el archivo «final» de la carpeta).
    if(liveMode && config && !des.file) traerDeSharePoint();
  }
  async function subirDesistimientos(e){
    const file = e.target.files?.[0];
    e.target.value = '';
    if(!file) return;
    setResultado(null); setTrayendo(true);
    try{ setDes(await leerArchivo(file, 'desistimientos')); }
    catch(err){ console.error(err); notify?.('No se pudo leer el archivo de desistimientos: ' + mensajeError(err), 'error'); }
    finally{ setTrayendo(false); }
  }
  async function traerDeSharePoint(){
    setTrayendo(true); setResultado(null);
    try{
      const lista = await listarExcelDesistimientosSOS(config);
      if(!lista.archivos.length){ notify?.('No encontré archivos Excel en ' + RUTA_DESISTIMIENTOS_SOS + '. Puede subir el de desistimientos a mano.', 'info'); return; }
      const a = lista.archivos.find(x => /final/i.test(x.nombre)) || lista.archivos[0];
      setDes(await leerArchivo(await descargarArchivoSharePoint(lista.driveId, a.id, a.nombre), 'desistimientos'));
    }catch(err){ console.error(err); notify?.('No se pudieron traer los desistimientos de SharePoint: ' + mensajeError(err), 'error'); }
    finally{ setTrayendo(false); }
  }

  function cruzar(){
    const todos = [aArchivo(dem, 'base'), aArchivo(des, 'desistimientos')];
    const { hojas, info } = armarHojasEspeciales(todos, procesoCorto);
    setResultado({ hojas, info, analisis: analizarArchivos([todos[0]]), procesoCorto });
    notify?.('Cruce listo.', 'success');
  }
  async function descargar(){
    if(!resultado) return;
    setGenerando(true);
    try{
      const hoy = new Date().toISOString().slice(0, 10);
      await generarExcelCruce(`${resultado.procesoCorto || 'Cruce'} Desistimientos ${hoy}`, [aArchivo(dem, 'base')], { resumen: [], porArchivo: [] }, { analisis: resultado.analisis, hojasEspeciales: resultado.hojas, infoEspecial: resultado.info });
    }catch(err){ console.error(err); notify?.('No se pudo generar el Excel: ' + mensajeError(err), 'error'); }
    finally{ setGenerando(false); }
  }

  const d = resultado?.info?.desistimientos;
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-head"><h3>Cruce Desistimientos</h3></div>
      <div className="panel-body">
        <p style={{ margin: '0 0 16px', color: 'var(--texto-suave)', fontSize: 13 }}>
          Sube primero el archivo de la <strong>demanda</strong>. Se cruza con los <strong>desistimientos</strong> (se traen solos de SharePoint) y el Excel resultante trae una hoja nueva con <strong>todos los desistimientos del proceso</strong> y,
          al final, una anotación de <strong>cuáles siguen vigentes en la demanda</strong>.
        </p>

        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head"><h3>1 · Archivo de la demanda</h3></div>
          <div className="panel-body" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <label>Archivo (.xlsx)</label>
              <label className="btn-secondary" style={{ cursor: leyendoDem ? 'default' : 'pointer', display: 'inline-block' }}>
                {leyendoDem ? 'Leyendo…' : (dem.file ? dem.file.name : 'Elegir archivo…')}
                <input type="file" accept=".xlsx" onChange={subirDemanda} disabled={leyendoDem} style={{ display: 'none' }} />
              </label>
            </div>
            <Selectores slot={dem} onChange={s => { setDem(s); setResultado(null); }} notify={notify} />
          </div>
          {dem.hojas.length > 1 && !dem.hoja && <p className="save-hint" style={{ margin: '0 16px 12px' }}>Elija la hoja que tiene la lista de la demanda (por ejemplo, «Base depurada» si es la lista final).</p>}
        </div>

        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head"><h3>2 · Desistimientos</h3></div>
          <div className="panel-body" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {trayendo && <span className="save-hint">Trayendo y leyendo el archivo de desistimientos (pesa bastante, unos segundos)…</span>}
            {!trayendo && !des.file && (
              <>
                {liveMode && config
                  ? <button type="button" className="btn-secondary" onClick={traerDeSharePoint}>Traer de SharePoint ({RUTA_DESISTIMIENTOS_SOS})</button>
                  : <span className="save-hint">En el modo demo no hay SharePoint: suba el archivo a mano.</span>}
                <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                  O elegir el archivo…
                  <input type="file" accept=".xlsx" onChange={subirDesistimientos} style={{ display: 'none' }} />
                </label>
              </>
            )}
            {!trayendo && des.file && (
              <>
                <span className="badge badge-verde">{des.file.name}</span>
                <Selectores slot={des} onChange={s => { setDes(s); setResultado(null); }} notify={notify} />
                <button type="button" className="btn-secondary" onClick={() => { setDes(VACIO); setResultado(null); }}>Cambiar archivo</button>
              </>
            )}
          </div>
        </div>

        {desArchivo && (
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-body" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="field" style={{ minWidth: 260 }}>
                <label>Proceso de esta demanda (número corto){!procesoManual.trim() && procesoSugerido ? ' · propuesto por el portal' : ''}</label>
                <input type="text" list="cruce-des-procesos" value={procesoManual} onChange={e => { setProcesoManual(e.target.value); setResultado(null); }} placeholder={procesoSugerido || 'ej. 2015-00826'} />
                <datalist id="cruce-des-procesos">{procesosDelDes.map(p => <option key={p.proceso} value={p.proceso}>{p.filas} filas</option>)}</datalist>
              </div>
              <span className="save-hint">
                {procesoCorto
                  ? 'La hoja trae TODOS los desistimientos del proceso ' + procesoCorto + ' (' + (procesosDelDes.find(p => p.proceso === procesoCorto)?.filas ?? 0) + ' filas), con la anotación de si siguen vigentes en la demanda.'
                  : 'Escriba el número corto del proceso para traer todos sus desistimientos; sin él solo se traen los que coinciden por radicado con la demanda.'}
              </span>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <IconTextButton icon="add" variant="primary" onClick={cruzar} disabled={!listo}>Cruzar con desistimientos</IconTextButton>
        </div>

        {resultado && (
          <>
            {d ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <span className="badge badge-naranja">{d.cruzan} desistimiento(s){d.proceso ? ' del proceso ' + d.proceso : ' que coinciden'}</span>
                <span className="badge badge-verde">{d.vigentes} vigentes en la demanda</span>
                <span className="badge badge-gris">{d.noEstanEnBase} no están en la demanda</span>
              </div>
            ) : <p className="save-hint" style={{ color: '#b3590a' }}>No se armó la hoja de desistimientos: revise la hoja y la columna del radicado.</p>}
            <div style={{ marginBottom: 14 }}>
              <IconTextButton icon="excel" variant="secondary" onClick={descargar} disabled={generando}>{generando ? 'Generando…' : 'Descargar Excel'}</IconTextButton>
            </div>
            {d && <p className="save-hint">El Excel trae «Resumen» y la hoja «{d.hoja}» con {d.proceso ? 'todos los desistimientos del proceso' : 'los desistimientos que coinciden'} y, al final, la columna «Anotación: vigente o no en la base de la demanda».</p>}
          </>
        )}
      </div>
    </div>
  );
}
