// Escrito con LexIA desde el portal (Plan A, 2026-10-13): elegir el modelo del despacho y redactar la contestación u otro escrito de la tutela con
// el robot, pensando en gastar los menos créditos posibles (ver src/lib/escritoRobot.js). Muestra los tokens usados para compararlo con el
// artefacto Plan B. Diseño con los componentes del portal (tarjeta elevada, tarjetas de campo, avisos de Lexara).
import { useState, useRef } from 'react';
import { prepararCasoParaEscrito, hayActuacionPrevia, registrarActuacion, graphDescargarArchivo, guardarArchivoEnTutela } from '../lib/graph';
import { aplicarTextoAModeloDocx } from '../lib/escritoDesdeModelo';
import {
  TIPOS_ESCRITO, tipoEscritoDeRegistro, sexoPorNombre, claveCliente, obtenerIndiceModelos, modelosDelIndice,
  redactarEscritoConRobot, corregirEscritoConRobot, guardarLeccion, leerLecciones, leccionesParaPrompt, generarFichasDeModelos,
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

export default function EscritoRobotPanel({ numero, onedriveCarpetaUrl, robotUrl, notify, antesDeRedactar, correoBuzon }){
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
  const [pegado, setPegado] = useState('');         // paquete copiado desde el artefacto (Plan B)
  const [repetido, setRepetido] = useState('');   // aviso de que este escrito ya se hizo (portal, artefacto o correo ya enviado)
  const [soloDatos, setSoloDatos] = useState(false);   // modo estricto: el modelo no se toca, solo se completan datos

  const t0Ref = useRef(Date.now());   // segundos desde que se pulsó «redactar», en cada paso
  const anotar = (t) => setLog(prev => [...prev, '[' + Math.round((Date.now() - t0Ref.current) / 1000) + ' s] ' + t]);

  // Fichas: una descripción corta de cada modelo para que LexIA elija mejor que solo por el nombre (se crean una vez y se comparten).
  async function crearFichas(){
    setTrabajando(true); setError(''); setLog([]);
    try{
      const ind = await obtenerIndiceModelos(false, anotar);
      const cliente = claveCliente((datos.registros[indiceRegistro] || {}).Cliente);
      const modelos = modelosDelIndice(ind, tipo, sexo, cliente);
      const sin = modelos.filter(m => !m.ficha).length;
      if(!sin){ anotar('Los ' + modelos.length + ' modelos de este escrito y cliente ya tienen ficha.'); return; }
      anotar('Creando la ficha de ' + sin + ' modelo' + (sin === 1 ? '' : 's') + ' (una sola vez; después elegir es más preciso y no cuesta más)...');
      const r = await generarFichasDeModelos({ robotUrl, modelos, log: anotar });
      anotar('Listo: ' + r.nuevas + ' fichas nuevas' + (r.pendientes ? ' (' + r.pendientes + ' no se pudieron leer)' : '') + ' · tokens: ' + fmt(r.uso.entrada) + ' entrada, ' + fmt(r.uso.salida) + ' salida.');
      setListaModelos(modelosDelIndice(await obtenerIndiceModelos(false), tipo, sexo, cliente));
    }catch(err){ console.error(err); setError(err.message || String(err)); }
    finally{ setTrabajando(false); }
  }

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
  async function redactar(forzar = false){
    t0Ref.current = Date.now();
    setTrabajando(true); setError(''); setLog([]); setEscrito(null); setUsos([]); setLeccion(null); setAviso('');
    try{
      // Que no se repita: si este escrito ya lo hizo el portal o el artefacto, o ya hay un correo enviado con él, se avisa y se pide confirmar.
      if(forzar !== true && correoBuzon){
        anotar('Revisando que este escrito no esté ya hecho...');
        const dup = await hayActuacionPrevia({ correoBuzon, urlCarpeta: onedriveCarpetaUrl, noTutela: numero, tipo: tipo === 'aplazamiento' ? 'aplazamiento' : 'escrito', cliente: (datos.registros[indiceRegistro] || {}).Cliente, detalle: tipo }).catch(() => ({ existe: false }));
        if(dup.existe){ setRepetido(dup.mensaje); setLog([]); return; }
      }
      setRepetido('');
      // Para redactar hay que volver a leer TODOS los correos de la tutela (pueden haber llegado pruebas o decisiones nuevas).
      if(antesDeRedactar){
        anotar('Releyendo todos los correos de la tutela...');
        const d = await antesDeRedactar();
        anotar('Correos de la tutela al día: ' + d.total + (d.nuevos ? ' (' + d.nuevos + ' nuevo' + (d.nuevos === 1 ? '' : 's') + ')' : ' (ninguno nuevo)') + '.');
      }
      const r = await redactarEscritoConRobot({ robotUrl, urlCarpeta: onedriveCarpetaUrl, numero, tipo, indiceRegistro, sexo, nota, modeloManual: modeloManual || null, estricto: soloDatos || tipo === 'aplazamiento', log: anotar });
      setEscrito(r); setUsos(r.usos);
      registrarActuacion(onedriveCarpetaUrl, numero, { tipo: tipo === 'aplazamiento' ? 'aplazamiento' : 'escrito', detalle: tipo, cliente: (datos.registros[indiceRegistro] || {}).Cliente || '', por: 'portal', archivo: r.nombre || '' }).catch(err => console.error('No se pudo anotar el escrito en la lectura:', err));
      anotar('Listo: ' + r.resumen.cambiados + ' párrafos cambiados, ' + r.resumen.reemplazos + ' reemplazos, ' + r.resumen.nuevos + ' nuevos, ' + r.resumen.quitados + ' quitados.');
    }catch(err){ console.error(err); setError(err.message || String(err)); }
    finally{ setTrabajando(false); }
  }
// Escrito redactado en el artefacto (con la cuenta de Claude de quien lo usa, sin gastar créditos del robot): se pasa al Word ORIGINAL del modelo,
  // así queda con su letra, citas, negritas y logos; no se quita ningún párrafo del modelo.
  async function armarDesdeArtefacto(){
    t0Ref.current = Date.now();
    setTrabajando(true); setError(''); setLog([]); setEscrito(null); setUsos([]); setLeccion(null); setAviso(''); setRepetido('');
    try{
      let p;
      try{ p = JSON.parse(String(pegado || '').trim().replace(/^LEXIA-ESCRITO\s*/, '')); }
      catch{ throw new Error('Lo pegado no es un escrito del artefacto: en el artefacto pulsa «Copiar para el portal» y pega aquí lo que se copió.'); }
      if(!p || !p.texto || !p.modelo || !p.modelo.uri) throw new Error('Al paquete del artefacto le falta el texto o el modelo. Vuelve a copiarlo desde el artefacto.');
      if(p.numero && String(p.numero) !== String(numero)) throw new Error('Ese escrito es de la tutela ' + p.numero + ' y aquí estás en la ' + numero + '.');
      const m = /^file:\/\/\/([^/]+)\/(.+)$/.exec(p.modelo.uri);
      if(!m) throw new Error('No pude identificar el archivo del modelo en lo pegado.');
      anotar('Bajando el modelo original de SharePoint (' + (p.modelo.ruta || p.modelo.nombre || '') + ')...');
      const { bytes } = await graphDescargarArchivo(m[1], m[2]);
      anotar('Pasando el texto del artefacto al Word del modelo (sin tocar su letra ni quitar párrafos)...');
      const aplicado = await aplicarTextoAModeloDocx(bytes, p.texto, { conservarTodo: true });
      const corto = { aliansalud: 'ALIANSALUD', colmedica: 'COLMEDICA', umd: 'UMD' }[claveCliente(p.cliente)] || String(p.cliente || '').slice(0, 20);
      const etiqueta = (TIPOS_ESCRITO[p.tipo] || {}).etiqueta || p.tipo || 'escrito';
      const nombre = (etiqueta + ' - ' + corto + ' - borrador del artefacto.docx').replace(/[\\/:*?"<>|]/g, ' ');
      anotar('Guardando en la carpeta de la tutela...');
      guardarArchivoEnTutela(onedriveCarpetaUrl, numero, nombre, aplicado.bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').catch(err => console.error('No pude guardar el Word en la carpeta de la tutela:', err));
      registrarActuacion(onedriveCarpetaUrl, numero, { tipo: p.tipo === 'aplazamiento' ? 'aplazamiento' : 'escrito', detalle: p.tipo, cliente: p.cliente || '', por: 'artefacto', archivo: nombre }).catch(err => console.error('No se pudo anotar el escrito en la lectura:', err));
      const avisos = [];
      if(aplicado.resumen.conservados) avisos.push('Se conservaron ' + aplicado.resumen.conservados + ' párrafo' + (aplicado.resumen.conservados === 1 ? '' : 's') + ' del modelo que el texto del artefacto no traía (el modelo no se recorta).');
      setEscrito({ bytes: aplicado.bytes, nombre, modelo: p.modelo.ruta || p.modelo.nombre || '', modeloRuta: p.modelo.ruta || p.modelo.nombre || '', alertas: '', avisos, resumen: { cambiados: aplicado.resumen.cambiados, reemplazos: 0, nuevos: aplicado.resumen.nuevos, quitados: 0 }, delArtefacto: true, tipo: p.tipo, cliente: p.cliente || '', numero, urlCarpeta: onedriveCarpetaUrl, lecciones: '' });
      anotar('Listo: ' + aplicado.resumen.cambiados + ' párrafos cambiados, ' + aplicado.resumen.nuevos + ' nuevos, ' + aplicado.resumen.iguales + ' iguales al modelo. No gastó créditos.');
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
        <h4><span className="tutela-seccion-n">Sección 6</span>Escrito con LexIA</h4>
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
            <label className="checkbox-field" style={{fontSize:12.5}}>
              <input type="checkbox" checked={soloDatos || tipo === 'aplazamiento'} disabled={tipo === 'aplazamiento'} onChange={e => setSoloDatos(e.target.checked)} />
              <span>Modo estricto: solo reemplazar datos, sin agregar ningún párrafo{tipo === 'aplazamiento' ? ' (siempre así en el aplazamiento)' : ''}. En todos los modelos se respeta el texto y el formato: no se elimina ni se reescribe nada, y solo se añade lo que salga de las pruebas o de los datos del portal.</span>
            </label>
            <details className="escrito-tokens">
              <summary>Traer un escrito redactado en el artefacto (sin gastar créditos, con la letra exacta del modelo)</summary>
              <div style={{display:'flex', flexDirection:'column', gap:8, padding:'8px 0'}}>
                <span className="escrito-nota">En el artefacto redacta el escrito y pulsa «Copiar para el portal»; pégalo aquí. El portal lo pasa al Word original del modelo (sin quitar párrafos) y lo guarda en la carpeta de la tutela.</span>
                <textarea value={pegado} onChange={e => setPegado(e.target.value)} rows={3} placeholder="Pega aquí lo que copiaste del artefacto (empieza con LEXIA-ESCRITO)" />
                <div className="escrito-acciones">
                  <IconTextButton icon="pdf" variant="primary" disabled={trabajando || !pegado.trim()} onClick={armarDesdeArtefacto}>Armar el Word con el modelo original</IconTextButton>
                </div>
              </div>
            </details>
            <div className="escrito-acciones">
              <IconTextButton icon="add" variant="primary" disabled={trabajando} onClick={() => redactar()}>
                {trabajando && !escrito ? 'Redactando…' : (modeloManual ? 'Redactar con este modelo' : 'Elegir el mejor modelo y redactar')}
              </IconTextButton>
              <IconTextButton icon="refresh" variant="secondary" disabled={trabajando} onClick={() => cargarModelos(true)}>Actualizar la lista de modelos</IconTextButton>
              <IconTextButton icon="view" variant="secondary" disabled={trabajando} onClick={crearFichas}>Crear fichas de estos modelos (una vez)</IconTextButton>
            </div>
          </>
        )}

        {repetido && (
          <div style={{background:'#fff4e0', border:'1px solid var(--amarillo, #e0a93b)', borderRadius:8, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8, fontSize:13}}>
            <span><strong>Ya está hecho.</strong> {repetido} ¿Redactarlo de todas formas?</span>
            <span style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <IconTextButton icon="add" variant="primary" onClick={() => redactar(true)}>Redactar de todas formas</IconTextButton>
              <IconTextButton icon="delete" variant="secondary" onClick={() => setRepetido('')}>Cancelar</IconTextButton>
            </span>
          </div>
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
              <span title="Ruta del modelo en SharePoint (Tutelas → Documentos)" style={{wordBreak:'break-word'}}>{escrito.modeloRuta || escrito.modelo}</span>
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

              {!escrito.delArtefacto && (<>
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
              </>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
