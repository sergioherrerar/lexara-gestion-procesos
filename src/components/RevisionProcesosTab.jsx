import { useState } from 'react';
import { leerArchivoVigilancia, compararConProcesos, generarExcelRevisionProcesos } from '../lib/revisionProcesos';
import { IconTextButton } from './IconButton';

// "Revisión de Procesos" (Administración) — pedido explícito del usuario
// 2026-09-03: cruza el informe mensual que manda la empresa de vigilancia
// judicial física contra Procesos judiciales. Ver lib/revisionProcesos.js
// para el detalle completo del cruce (por número, en dos pasos) y qué
// significa cada una de las 3 diferencias que reporta.
export default function RevisionProcesosTab({ procesos, notify }){
  const [archivo, setArchivo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [filasArchivo, setFilasArchivo] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  async function handleArchivo(e){
    const file = e.target.files?.[0];
    if(!file) return;
    setArchivo(file);
    setResultado(null);
    setFilasArchivo(null);
    setProcesando(true);
    try{
      const filas = await leerArchivoVigilancia(file);
      const cruce = compararConProcesos(filas, procesos);
      setFilasArchivo(filas);
      setResultado(cruce);
      notify?.(`Comparación lista: ${filas.length} procesos leídos del archivo.`, 'success');
    }catch(err){
      console.error(err);
      notify?.("No se pudo leer/comparar el archivo: " + err.message, 'error');
    } finally {
      setProcesando(false);
      e.target.value = "";
    }
  }

  // El Excel trae, además de la hoja "Revisión" (las 3 diferencias), una
  // hoja con el archivo tal como se leyó y otra con los datos de Procesos
  // judiciales — pedido explícito del usuario 2026-09-03, como respaldo
  // crudo de ambos lados del cruce.
  async function handleDescargar(){
    if(!resultado) return;
    setGenerandoExcel(true);
    try{
      const hoyISO = new Date().toISOString().slice(0,10);
      await generarExcelRevisionProcesos(`Revisión de Procesos ${hoyISO}`, resultado, filasArchivo, procesos);
    } finally { setGenerandoExcel(false); }
  }

  const total = resultado ? (resultado.noEncontrados.length + resultado.terminados.length + resultado.faltantesEnArchivo.length) : 0;

  return (
    <div className="panel">
      <div className="panel-head"><h3>Revisión de Procesos</h3></div>
      <div className="panel-body">
        <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
          Sube el informe mensual de la empresa de vigilancia judicial (Excel) — Portal Lexara lo compara contra Procesos judiciales y te dice: qué procesos del archivo no están en el Portal Lexara, cuáles ya figuran Terminados acá aunque la vigilancia los sigue reportando, y cuáles procesos vigentes del Portal el archivo no reporta.
        </p>
        <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:18}}>
          <label className="btn-secondary" style={{cursor: procesando ? 'default' : 'pointer'}}>
            {procesando ? "Leyendo…" : "Subir archivo de vigilancia"}
            <input type="file" accept=".xlsx" onChange={handleArchivo} disabled={procesando} style={{display:'none'}} />
          </label>
          {archivo && <span className="save-hint">{archivo.name}</span>}
        </div>

        {resultado && (
          <>
            <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:18}}>
              <span className="badge badge-alerta">{resultado.noEncontrados.length} no están en Portal Lexara</span>
              <span className="badge badge-naranja">{resultado.terminados.length} figuran Terminados en Portal Lexara</span>
              <span className="badge badge-gris">{resultado.faltantesEnArchivo.length} vigentes sin reportar en el archivo</span>
            </div>
            <div style={{marginBottom:18}}>
              <IconTextButton icon="excel" variant="secondary" onClick={handleDescargar} disabled={generandoExcel}>
                {generandoExcel ? "Generando…" : "Descargar Excel"}
              </IconTextButton>
            </div>
            {!total && <div className="empty-state">Todo cruza correctamente — no hay diferencias que reportar.</div>}
          </>
        )}
      </div>
    </div>
  );
}
