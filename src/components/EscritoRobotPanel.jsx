// Escrito con LexIA desde el portal (Plan A, 2026-10-13): elegir el modelo del despacho y redactar la contestación u otro escrito de la tutela con
// el robot, pensando en gastar los menos créditos posibles (ver src/lib/escritoRobot.js). Muestra los tokens usados para compararlo con el
// artefacto Plan B.
import { useState } from 'react';
import { prepararCasoParaEscrito } from '../lib/graph';
import {
  TIPOS_ESCRITO, tipoEscritoDeRegistro, sexoPorNombre, claveCliente, obtenerIndiceModelos, modelosDelIndice,
  redactarEscritoConRobot, corregirEscritoConRobot, guardarLeccion, leerLecciones, leccionesParaPrompt,
} from '../lib/escritoRobot';
import { IconTextButton } from './IconButton';

function descargar(bytes, nombre){
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const fmt = n => Number(n || 0).toLocaleString('es-CO');

export default function EscritoRobotPanel({ numero, onedriveCarpetaUrl, robotUrl, notify }){
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);          // { registros }
  const [tipo, setTipo] = useState('contestacion');
  const [indiceRegistro, setIndiceRegistro] = useState(0);
  const [sexo, setSexo] = useState('Hombre');
  const [nota, setNota] = useState('');
  const [modeloManual, setModeloManual] = useState('');
  const [listaModelos, setListaModelos] = useState([]);
  const [trabajando, setTrabajando] = useState(false);
  const [log, setLog] = useState([]);
  const [error, setError] = useState('');
  const [escrito, setEscrito] = useState(null);      // resultado de redactarEscritoConRobot (se va actualizando con las correcciones)
  const [usos, setUsos] = useState([]);
  const [correccion, setCorreccion] = useState('');
  const [leccion, setLeccion] = useState(null);      // { regla, alcance }
  const [aviso, setAviso] = useState('');

  const anotar = (t) => setLog(prev => [...prev, t]);

  async function abrir(){
    setAbierto(true);
    if(datos) return;
    setCargando(true); setError('');
    try{
      const caso = await prepararCasoParaEscrito(onedriveCarpetaUrl, numero);
      if(!caso) throw new Error('Esta tutela todavía no tiene «Lectura LexIA.txt»: primero extráela con LexIA.');
      setDatos({ registros: caso.registros });
      const r0 = caso.registros[0] || {};
      setTipo(tipoEscritoDeRegistro(r0));
      setSexo(sexoPorNombre(r0.Usuario));
    }catch(err){ setError(err.message || String(err)); }
    finally{ setCargando(false); }
  }
  function cambiarCliente(i){
    setIndiceRegistro(i);
    const r = datos.registros[i] || {};
    setTipo(tipoEscritoDeRegistro(r));
    setSexo(sexoPorNombre(r.Usuario));
    setModeloManual(''); setListaModelos([]);
  }
  async function cargarModelos(forzar = false){
    setError('');
    try{
      const ind = await obtenerIndiceModelos(forzar, anotar);
      const cliente = claveCliente((datos.registros[indiceRegistro] || {}).Cliente);
      setListaModelos(modelosDelIndice(ind, tipo, sexo, cliente));
      if(forzar) notify?.('Lista de modelos al día (' + ind.entradas.length + ' modelos).', 'success');
    }catch(err){ setError(err.message || String(err)); }
  }
  async function redactar(){
    setTrabajando(true); setError(''); setLog([]); setEscrito(null); setUsos([]); setLeccion(null); setAviso('');
    try{
      const r = await redactarEscritoConRobot({ robotUrl, urlCarpeta: onedriveCarpetaUrl, numero, tipo, indiceRegistro, sexo, nota, modeloManual: modeloManual || null, log: anotar });
      setEscrito(r); setUsos(r.usos);
      anotar('Listo: ' + r.resumen.cambiados + ' párrafos cambiados, ' + r.resumen.reemplazos + ' reemplazos, ' + r.resumen.nuevos + ' nuevos, ' + r.resumen.quitados + ' quitados.');
    }catch(err){ console.error(err); setError(err.message || String(err)); }
    finally{ setTrabajando(false); }
  }
  async function enseñame(){
    if(!correccion.trim() || !escrito) return;
    setTrabajando(true); setError(''); setLeccion(null); setAviso('');
    try{
      const r = await corregirEscritoConRobot({ estado: escrito, instruccion: correccion.trim(), nota, lecciones: escrito.lecciones, log: anotar });
      setEscrito({ ...escrito, bytes: r.bytes, alertas: r.alertas || escrito.alertas });
      setUsos(prev => [...prev, r.uso]);
      setLeccion(r.leccion);
      setCorreccion('');
      setAviso('Corregido: ' + r.resumen.cambiados + ' párrafos cambiados, ' + r.resumen.reemplazos + ' reemplazos, ' + r.resumen.nuevos + ' nuevos, ' + r.resumen.quitados + ' quitados.' + (r.avisos.length ? ' · ' + r.avisos.join(' · ') : ''));
    }catch(err){ console.error(err); setError(err.message || String(err)); }
    finally{ setTrabajando(false); }
  }
  async function guardarLec(){
    if(!leccion) return;
    try{
      await guardarLeccion({ regla: leccion.regla, alcance: leccion.alcance, tipo: escrito.tipo, cliente: escrito.cliente });
      const todas = await leerLecciones();
      setEscrito(prev => ({ ...prev, lecciones: leccionesParaPrompt(todas, prev.tipo, prev.cliente) }));
      setLeccion(null);
      notify?.('Lección guardada: LexIA la aplicará en los próximos escritos.', 'success');
    }catch(err){ setError('No se pudo guardar la lección: ' + (err.message || err)); }
  }

  const totalEntrada = usos.reduce((s, u) => s + (u.entrada || 0), 0);
  const totalSalida = usos.reduce((s, u) => s + (u.salida || 0), 0);
  const totalCacheEscrito = usos.reduce((s, u) => s + (u.cacheEscrito || 0), 0);
  const totalCacheLeido = usos.reduce((s, u) => s + (u.cacheLeido || 0), 0);

  return (
    <div style={{marginTop:10, paddingTop:8, borderTop:'1px solid var(--gris-linea)'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
        <strong style={{fontSize:13}}>Escrito con LexIA (robot · Plan A)</strong>
        {!abierto && <IconTextButton icon="mail" variant="secondary" onClick={abrir}>Redactar un escrito de esta tutela</IconTextButton>}
        <span className="save-hint" style={{margin:0}}>Elige el modelo del despacho y arma el Word sobre el archivo original (logo y formato), con el menor gasto posible de créditos.</span>
      </div>
      {abierto && cargando && <p className="save-hint" style={{margin:'6px 0 0'}}>Leyendo la lectura de la tutela…</p>}
      {abierto && datos && (
        <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:8}}>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
            <label style={{fontSize:13}}>Escrito{' '}
              <select value={tipo} onChange={e => { setTipo(e.target.value); setModeloManual(''); setListaModelos([]); }}>
                {Object.entries(TIPOS_ESCRITO).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
              </select>
            </label>
            {datos.registros.length > 1 && (
              <label style={{fontSize:13}}>Cliente{' '}
                <select value={indiceRegistro} onChange={e => cambiarCliente(Number(e.target.value))}>
                  {datos.registros.map((r, i) => <option key={i} value={i}>{r.Cliente || ('Cliente ' + (i + 1))}</option>)}
                </select>
              </label>
            )}
            <label style={{fontSize:13}}>Quien acciona{' '}
              <select value={sexo} onChange={e => { setSexo(e.target.value); setModeloManual(''); setListaModelos([]); }}>
                <option>Mujer</option><option>Hombre</option>
              </select>
            </label>
          </div>
          <label style={{fontSize:13}}>Para aclaración, impugnación, alcance…: pega lo que dijo el juez o lo que se pide (para la contestación puede ir vacío)
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} style={{width:'100%', marginTop:4}} />
          </label>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
            <label style={{fontSize:13}}>Modelo{' '}
              <select value={modeloManual} onChange={e => setModeloManual(e.target.value)} onFocus={() => { if(!listaModelos.length) cargarModelos(false); }} style={{maxWidth:360}}>
                <option value="">Que LexIA elija el mejor</option>
                {listaModelos.map(m => <option key={m.ruta} value={m.ruta}>{m.ruta.replace(/\.docx?$/i, '')}</option>)}
              </select>
            </label>
            <IconTextButton icon="refresh" variant="secondary" disabled={trabajando} onClick={() => cargarModelos(true)}>Actualizar la lista de modelos</IconTextButton>
            <IconTextButton icon="add" disabled={trabajando} onClick={redactar}>{trabajando && !escrito ? 'Redactando…' : (modeloManual ? 'Redactar con este modelo' : 'Elegir el mejor modelo y redactar')}</IconTextButton>
          </div>
        </div>
      )}
      {log.length > 0 && <ul style={{margin:'8px 0 0', paddingLeft:18, fontSize:12}}>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {error && <p className="save-hint" style={{margin:'6px 0 0', color:'var(--rojo, #a3281c)'}}>{error}</p>}
      {escrito && (
        <div style={{marginTop:8, fontSize:13, display:'flex', flexDirection:'column', gap:8}}>
          <div><strong>Modelo usado:</strong> {escrito.modelo.replace(/\.docx?$/i, '')}</div>
          {escrito.alertas && (
            <div style={{background:'var(--crema, #fff7e8)', border:'1px solid #f0d9a8', borderRadius:6, padding:'8px 10px'}}>
              <strong>Alertas de LexIA para el abogado (no van en el escrito)</strong>
              <div style={{whiteSpace:'pre-wrap', marginTop:4}}>{escrito.alertas}</div>
            </div>
          )}
          {escrito.avisos.length > 0 && <div className="save-hint" style={{margin:0}}>Avisos: {escrito.avisos.join(' · ')}</div>}
          <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
            <IconTextButton icon="folder" onClick={() => descargar(escrito.bytes, escrito.nombre)}>Descargar el Word</IconTextButton>
            <span className="save-hint" style={{margin:0}}>También quedó guardado en la carpeta de la tutela. Las imágenes propias del caso (por ejemplo la tabla de afiliación) vienen del modelo: revísalas.</span>
          </div>
          <label>Enséñame: dile qué está mal o cómo debe quedar (corrijo el borrador y aprendo para los próximos)
            <textarea value={correccion} onChange={e => setCorreccion(e.target.value)} rows={3} style={{width:'100%', marginTop:4}} placeholder="Ej. el petitorio debe pedir la desvinculación y no solo el archivo..." />
          </label>
          <div><IconTextButton icon="add" disabled={trabajando || !correccion.trim()} onClick={enseñame}>{trabajando ? 'Aplicando…' : 'Enséñame'}</IconTextButton></div>
          {aviso && <div className="save-hint" style={{margin:0}}>{aviso}</div>}
          {leccion && (
            <div style={{border:'1px solid var(--gris-linea)', borderRadius:6, padding:'8px 10px'}}>
              <strong>¿Le enseño esto para los próximos escritos?</strong>
              <div style={{margin:'4px 0'}}>{leccion.regla} <em>(aplica a: {leccion.alcance === 'tipo' ? 'este tipo de escrito' : leccion.alcance === 'cliente' ? 'este cliente' : 'todos los escritos'})</em></div>
              <div style={{display:'flex', gap:8}}>
                <IconTextButton icon="add" onClick={guardarLec}>Sí, guardar la lección</IconTextButton>
                <IconTextButton icon="refresh" variant="secondary" onClick={() => setLeccion(null)}>No, era solo para este caso</IconTextButton>
              </div>
            </div>
          )}
          <details>
            <summary style={{cursor:'pointer'}}>Tokens usados (para comparar créditos con el artefacto)</summary>
            <table style={{borderCollapse:'collapse', marginTop:6, fontSize:12}}>
              <thead><tr>{['Paso', 'Modelo', 'Entrada', 'Salida', 'Caché escrita', 'Caché leída'].map(h => <th key={h} style={{textAlign:'right', padding:'2px 8px', borderBottom:'1px solid var(--gris-linea)'}}>{h}</th>)}</tr></thead>
              <tbody>
                {usos.map((u, i) => <tr key={i}><td style={{padding:'2px 8px'}}>{u.paso}</td><td style={{padding:'2px 8px'}}>{u.modelo}</td><td style={{textAlign:'right', padding:'2px 8px'}}>{fmt(u.entrada)}</td><td style={{textAlign:'right', padding:'2px 8px'}}>{fmt(u.salida)}</td><td style={{textAlign:'right', padding:'2px 8px'}}>{fmt(u.cacheEscrito)}</td><td style={{textAlign:'right', padding:'2px 8px'}}>{fmt(u.cacheLeido)}</td></tr>)}
                <tr style={{fontWeight:'bold'}}><td style={{padding:'2px 8px'}} colSpan={2}>Total</td><td style={{textAlign:'right', padding:'2px 8px'}}>{fmt(totalEntrada)}</td><td style={{textAlign:'right', padding:'2px 8px'}}>{fmt(totalSalida)}</td><td style={{textAlign:'right', padding:'2px 8px'}}>{fmt(totalCacheEscrito)}</td><td style={{textAlign:'right', padding:'2px 8px'}}>{fmt(totalCacheLeido)}</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      )}
    </div>
  );
}
