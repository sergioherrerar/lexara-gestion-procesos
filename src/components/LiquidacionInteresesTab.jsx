import { useState } from 'react';
import { mensajeError, fmtMonto } from '../lib/graph';
import { liquidar, generarPlantillaLiquidacion, leerPlantillaLiquidacion, liquidarFilas, generarExcelLiquidado, ultimaActualizacionTasas, ultimaActualizacionIPC } from '../lib/liquidacionIntereses';
import { generarLiquidacionInteresesPDF } from '../lib/liquidacionInteresesPDF';
import { IconTextButton } from './IconButton';

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

export default function LiquidacionInteresesTab({ notify, tasasInteres, ipcMensual, config }){
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
      </div>
    </div>
  );
}
