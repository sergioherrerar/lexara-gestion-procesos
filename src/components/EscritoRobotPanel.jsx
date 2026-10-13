// Escrito con LexIA desde el portal (Plan A, 2026-10-13): elegir el modelo del despacho y redactar la contestación u otro escrito de la tutela con
// el robot, pensando en gastar los menos créditos posibles (ver src/lib/escritoRobot.js). Muestra los tokens usados para compararlo con el
// artefacto Plan B. Diseño con los componentes del portal (tarjeta elevada, tarjetas de campo, avisos de Lexara).
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

// Tarjeta de campo: etiqueta verde oscura arriba y valor abajo (mismo formato de las fichas del portal).
function Campo({ etiqueta, completo, children }){
  return (
    <div className={'field-card' + (completo ? ' full' : '')}>
      <div className="field-card-label">{etiqueta}</div>
      <div className="field-card-value">{children}</div>
    </div>
  );
}

export default function EscritoRobotPanel({ numero, onedriveCarpetaUrl, robotUrl, notify, antesDeRedactar }){
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
      // Para redactar hay que volver a leer TODOS los correos de la tutela (pueden haber llegado pruebas o decisiones nuevas).
      if(antesDeRedactar){
        anotar('Releyendo todos los correos de la tutela...');
        const d = await antesDeRedactar();
        anotar('Correos de la tutela al día: ' + d.total + (d.nuevos ? ' (' + d.nuevos + ' nuevo' + (d.nuevos === 1 ? '' : 's') + ')' : ' (ninguno nuevo)') + '.');
      }
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

  const totales = usos.reduce((t, u) => ({
    entrada: t.entrada + (u.entrada || 0), salida: t.salida + (u.salida || 0),
    cacheEscrito: t.cacheEscrito + (u.cacheEscrito || 0), cacheLeido: t.cacheLeido + (u.cacheLeido || 0),
  }), { entrada: 0, salida: 0, cacheEscrito: 0, cacheLeido: 0 });

  return (
    <div className="escrito-panel">
      <div className="escrito-head">
        <h4>Escrito con LexIA</h4>
        <span className="escrito-chip">Plan A · robot</span>
      </div>
      <div className="escrito-body">
        <p className="escrito-intro">
          Elige el modelo del despacho y arma el Word sobre el archivo original (con su logo y formato), gastando los menos créditos posibles.
          Antes de redactar se leen de nuevo todos los correos de la tutela.
        </p>

        {!abierto && (
          <div className="escrito-acciones">
            <IconTextButton icon="add" variant="primary" onClick={abrir}>Redactar un escrito de esta tutela</IconTextButton>
          </div>
        )}
        {abierto && cargando && <p className="escrito-nota">Leyendo la lectura de la tutela…</p>}

        {abierto && datos && (
          <>
            <div className="escrito-grid">
              <Campo etiqueta="Escrito">
                <select value={tipo} onChange={e => { setTipo(e.target.value); setModeloManual(''); setListaModelos([]); }}>
                  {Object.entries(TIPOS_ESCRITO).map(([k, v]) => <option key={k} value={k}>{v.etiqueta}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Cliente">
                <select value={indiceRegistro} onChange={e => cambiarCliente(Number(e.target.value))}>
                  {datos.registros.map((r, i) => <option key={i} value={i}>{r.Cliente || ('Cliente ' + (i + 1))}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Quien acciona">
                <select value={sexo} onChange={e => { setSexo(e.target.value); setModeloManual(''); setListaModelos([]); }}>
                  <option>Mujer</option><option>Hombre</option>
                </select>
              </Campo>
            </div>
            <Campo etiqueta="Modelo del despacho" completo>
              <select value={modeloManual} onChange={e => setModeloManual(e.target.value)} onFocus={() => { if(!listaModelos.length) cargarModelos(false); }}>
                <option value="">Que LexIA elija el mejor modelo</option>
                {listaModelos.map(m => <option key={m.ruta} value={m.ruta}>{m.ruta.replace(/\.docx?$/i, '')}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Lo que dijo el juez o lo que se pide (aclaración, impugnación, alcance…; en la contestación puede ir vacío)" completo>
              <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder="Ej. el fallo ordena a la EPS… / el juez pide aclarar…" />
            </Campo>
            <div className="escrito-acciones">
              <IconTextButton icon="add" variant="primary" disabled={trabajando} onClick={redactar}>
                {trabajando && !escrito ? 'Redactando…' : (modeloManual ? 'Redactar con este modelo' : 'Elegir el mejor modelo y redactar')}
              </IconTextButton>
              <IconTextButton icon="refresh" variant="secondary" disabled={trabajando} onClick={() => cargarModelos(true)}>Actualizar la lista de modelos</IconTextButton>
            </div>
          </>
        )}

        {log.length > 0 && (
          <ul className="escrito-pasos">
            {log.map((l, i) => <li key={i} className={trabajando && i === log.length - 1 ? 'activo' : ''}>{l}</li>)}
          </ul>
        )}
        {error && <div className="escrito-error">{error}</div>}

        {escrito && (
          <div className="escrito-resultado">
            <div className="escrito-resultado-head">
              <strong>Modelo usado</strong>
              <span>{escrito.modelo.replace(/\.docx?$/i, '')}</span>
            </div>
            <div className="escrito-resultado-body">
              {escrito.alertas && (
                <div className="escrito-alertas">
                  <strong>Alertas de LexIA para el abogado (no van en el escrito)</strong>
                  <div style={{whiteSpace:'pre-wrap'}}>{escrito.alertas}</div>
                </div>
              )}
              {escrito.avisos.length > 0 && <div className="field-info">Avisos: {escrito.avisos.join(' · ')}</div>}
              <div className="escrito-acciones">
                <IconTextButton icon="pdf" variant="primary" onClick={() => descargar(escrito.bytes, escrito.nombre)}>Descargar el Word</IconTextButton>
                <span className="escrito-nota">También quedó guardado en la carpeta de la tutela. Las imágenes propias del caso (por ejemplo la tabla de afiliación) vienen del modelo: revísalas.</span>
              </div>

              <Campo etiqueta="Enséñame: qué está mal o cómo debe quedar (corrijo el borrador y aprendo para los próximos)" completo>
                <textarea value={correccion} onChange={e => setCorreccion(e.target.value)} rows={3} placeholder="Ej. el petitorio debe pedir la desvinculación y no solo el archivo…" />
              </Campo>
              <div className="escrito-acciones">
                <IconTextButton icon="edit" variant="primary" disabled={trabajando || !correccion.trim()} onClick={enseñame}>{trabajando ? 'Aplicando…' : 'Enséñame'}</IconTextButton>
              </div>
              {aviso && <div className="field-info">{aviso}</div>}
              {leccion && (
                <div className="escrito-leccion">
                  <strong>¿Le enseño esto para los próximos escritos?</strong>
                  <div style={{margin:'4px 0 8px'}}>{leccion.regla} <em>(aplica a: {leccion.alcance === 'tipo' ? 'este tipo de escrito' : leccion.alcance === 'cliente' ? 'este cliente' : 'todos los escritos'})</em></div>
                  <div className="escrito-acciones">
                    <IconTextButton icon="add" variant="primary" onClick={guardarLec}>Sí, guardar la lección</IconTextButton>
                    <IconTextButton icon="delete" variant="secondary" onClick={() => setLeccion(null)}>No, era solo para este caso</IconTextButton>
                  </div>
                </div>
              )}

              <details className="escrito-tokens">
                <summary>Tokens usados (para comparar créditos con el artefacto)</summary>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Paso</th><th>Modelo</th><th className="num">Entrada</th><th className="num">Salida</th><th className="num">Caché escrita</th><th className="num">Caché leída</th></tr></thead>
                    <tbody>
                      {usos.map((u, i) => <tr key={i}><td>{u.paso}</td><td>{u.modelo}</td><td className="num">{fmt(u.entrada)}</td><td className="num">{fmt(u.salida)}</td><td className="num">{fmt(u.cacheEscrito)}</td><td className="num">{fmt(u.cacheLeido)}</td></tr>)}
                      <tr style={{fontWeight:700}}><td colSpan={2}>Total</td><td className="num">{fmt(totales.entrada)}</td><td className="num">{fmt(totales.salida)}</td><td className="num">{fmt(totales.cacheEscrito)}</td><td className="num">{fmt(totales.cacheLeido)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
