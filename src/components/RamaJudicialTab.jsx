import { urlsSamai, abrirEnSamai, CORPORACION_CONSEJO_ESTADO, esJurisdiccionOrdinaria } from '../lib/samai';
import { construirCorreoSolicitudAcceso, CORREO_GERENCIA_ACCESO, CATEGORIA_SOLICITUD_ACCESO } from '../lib/solicitudAccesoExpediente';
import { getAccount, crearBorradorConImagenesInline, firmaComoImagenInline } from '../lib/graph';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { stripHtml } from '../lib/graph';
import { colorCuentaRegresiva, etiquetaCuentaRegresiva } from '../lib/audienciasTerminos';
import { CATEGORIAS, clasificarActuacion, resumenDeActuaciones, audienciaDeActuacion, terminoDeActuacion, datosParaTermino, audienciaRegistrada, terminoRegistrado, hoyISO } from '../lib/ramaResumen';
import { FormularioNuevo } from './AudienciasTerminosTab';
import escudoColombia from '../assets/Escudo Colombia.png';
import logoSiugj from '../assets/Logo SIUGJ.svg';   // logo oficial de SIUGJ (el mismo del botón de la cabecera de Procesos)   // escudo de Colombia (el mismo del botón «Rama Judicial» de Procesos)

// Iconos de línea de los botones de la pestaña Rama (2026-11-17, pedido del usuario: «un poco más de color a estos botones, más diseño»).
const ICONOS = {
  externo: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  carpeta: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  correo: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 7l8 6 8-6',
  edificio: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6',
  refrescar: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  documento: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  buscar: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  copiar: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
};
// Copia el radicado de 23 dígitos (el que está elegido en la lista de terminaciones) al portapapeles. Solo copia: no cambia nada del proceso.
function CopiarNumero({ num, notify }){
  async function copiar(){
    let ok = false;
    try{ await navigator.clipboard.writeText(num); ok = true; }
    catch(e){
      try{ const ta = document.createElement('textarea'); ta.value = num; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); document.body.removeChild(ta); }catch(e2){ ok = false; }
    }
    notify?.(ok ? 'Radicado ' + num + ' copiado.' : 'No se pudo copiar solo. Radicado: ' + num, ok ? 'success' : 'info');
  }
  return <button type="button" className="rama-copiar" onClick={copiar} title="Copiar el número completo (23 dígitos)" aria-label={'Copiar el número ' + num}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONOS.copiar} /></svg></button>;
}
// «Copiar CUP» (SIUGJ) solo sale en los procesos de la jurisdicción ordinaria; los de lo contencioso administrativo van por SAMAI (2026-11-17: «si tiene SAMAI que lo vea y si no, que no lo vea»).
function BotonSiugj({ rad, despacho, notify }){
  if(!esJurisdiccionOrdinaria(rad, despacho)) return null;
  return <button type="button" className="rama-btn rama-btn--siugj" onClick={() => abrirSiugjConCup(rad, notify)} title="Copia el CUP de SIUGJ (radicado con guion después de los 12 primeros dígitos) y abre «Consultar procesos» de SIUGJ: péguelo, marque el captcha y busque."><Ico n="siugj" />Copiar CUP</button>;
}
function Ico({ n }){
  if(n === 'siugj') return <img className="rama-btn-logo" src={logoSiugj} alt="SIUGJ" />;
  if(n === 'escudo') return <img className="rama-btn-ico rama-btn-escudo" src={escudoColombia} alt="" />;
  return <svg className="rama-btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONOS[n]} /></svg>;
}
import { TERMINACIONES,
  numerosDelProceso, consultarRama, fechaDMA, resumenAnotacion, esDeTramite, yaEstaEnHistorico,
  actuacionesNuevas, htmlRenglones, renglonHistorico, actualizacionDesdeRama, ultimaActualizacionDesdeRama, abrirEnRamaJudicial,
  agregarLineasAlEstado, abrirPublicacionesProcesales, abrirSiugjConCup, fechaMasRecienteDelEstado, mezclarActuaciones, anotacionLimpia, descubrirHermanos, consultarDetalle,
} from '../lib/ramaJudicial';

// Pestaña «Rama Judicial» de la ficha del proceso (2026-11-13): lee las actuaciones del proceso en la Consulta Nacional Unificada de la Rama
// (por el «No. completo» y los números del «Histórico números completos») y permite pasarlas al Histórico en el mismo formato por renglones
// («DD-MM-AAAA Actuación: anotación»). Nunca guarda sola: agrega los renglones al Histórico del formulario y se guardan con «Guardar cambios».
const POR_PAGINA = 50;

// Detalle completo del proceso (2026-11-14): datos de la Rama, sujetos procesales y documentos del expediente.
function DetalleProceso({ datos, onReintentar }){
  const d = datos.detalle || {};
  const campos = [['Ponente', d.ponente], ['Tipo de proceso', d.tipoProceso], ['Clase de proceso', d.claseProceso], ['Subclase', d.subclaseProceso], ['Recurso', d.recurso], ['Ubicación del expediente', d.ubicacion], ['Contenido de radicación', d.contenidoRadicacion], ['Actualizado en la Rama', d.ultimaActualizacion ? fechaDMA(d.ultimaActualizacion) : '']].filter(([, v]) => v);
  const [verDocs, setVerDocs] = useState(false);
  const docs = datos.documentos || [];
  const docsVisibles = verDocs ? docs : docs.slice(0, 15);
  const err = datos.errores || {};
  const fallas = [err.detalle && 'los datos del proceso', err.sujetos && 'los sujetos procesales', err.documentos && 'los documentos'].filter(Boolean);
  return (
    <div className="rama-detalle-cuerpo">
      {fallas.length > 0 && <div className="rama-error" role="alert">La Rama no respondió {fallas.join(', ')}. <button type="button" className="rama-mas" onClick={onReintentar}>Volver a intentar</button></div>}
      {campos.length > 0 && <dl className="rama-datos">{campos.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      <h5>Sujetos procesales ({(datos.sujetos || []).length})</h5>
      <div className="table-wrap">
        <table className="rama-tabla">
          <thead><tr><th>Tipo</th><th>Nombre o razón social</th><th>Identificación</th></tr></thead>
          <tbody>{(datos.sujetos || []).map((s, i) => <tr key={i}><td>{s.tipo}</td><td>{s.nombre}{s.emplazado ? ' (emplazado)' : ''}</td><td>{s.identificacion || '—'}</td></tr>)}</tbody>
        </table>
      </div>
      <h5>Documentos del proceso ({docs.length})</h5>
      {docs.length === 0 ? <p className="rama-fuente">La Rama no lista documentos para este proceso.</p> : (
        <>
          <div className="table-wrap">
            <table className="rama-tabla">
              <thead><tr><th>Fecha de carga</th><th>Descripción</th><th>Nombre</th></tr></thead>
              <tbody>{docsVisibles.map((x, i) => <tr key={i}><td className="rama-fecha">{fechaDMA(x.fechaCarga)}</td><td>{x.descripcion || '—'}</td><td className="rama-term">{x.nombre}</td></tr>)}</tbody>
            </table>
          </div>
          {docs.length > docsVisibles.length && <button type="button" className="btn-secondary rama-btn" onClick={() => setVerDocs(true)}>Ver los {docs.length - docsVisibles.length} documentos restantes</button>}
        </>
      )}
      <p className="rama-fuente">La Rama solo lista los documentos; para abrirlos hay que entrar a su consulta pública.</p>
    </div>
  );
}

// Resumen para el abogado (2026-11-24): lo que importa de un vistazo, sacado de las actuaciones de la Rama. Son datos SUGERIDOS por lo que dice la Rama:
// nada se crea solo; «Crear audiencia / término» abre el formulario ya lleno y se guarda solo con «Agregar».
function hace(n){ return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' días'; }
function ResumenRama({ acts, audiencias, terminos, hoy, puedeCrear, onCrear }){
  const r = useMemo(() => resumenDeActuaciones(acts, hoy), [acts, hoy]);
  const au = r.audiencia;
  const auReg = au && audienciaRegistrada(au, audiencias);
  const terms = r.terminos.slice(0, 3);
  return (
    <div className="rama-resumen-card" aria-label="Resumen del proceso según la Rama Judicial">
      <div className="rama-res-grid">
        <div className="rama-res-tile">
          <h5>Dónde va el proceso</h5>
          {r.ultima ? <p><strong>{r.ultima.nombre}</strong><br /><span className="rama-res-suave">{fechaDMA(r.ultima.fecha)} · {hace(r.ultima.hace)}</span></p> : <p className="rama-res-suave">Sin actuaciones.</p>}
          {r.ultimaImportante && r.ultimaImportante.act !== (r.ultima && r.ultima.act) && <p className="rama-res-linea"><span className="rama-res-suave">Última importante:</span> {r.ultimaImportante.nombre} · {fechaDMA(r.ultimaImportante.fecha)}</p>}
          {r.desistimiento && <p className="rama-res-linea"><span className="rama-cat rama-cat--desistimiento">Desistimiento</span> {r.desistimiento.total === 1 ? 'Una actuación lo menciona' : r.desistimiento.total + ' actuaciones lo mencionan'}; la última, el {fechaDMA(r.desistimiento.fecha)} ({r.desistimiento.nombre}): <span className="rama-res-suave">{r.desistimiento.texto}</span> <span className="rama-res-suave">Vea el filtro «Desistimientos».</span></p>}
          {r.alDespacho && <p className="rama-res-linea"><span className="badge badge-naranja">Al despacho</span> desde {fechaDMA(r.alDespacho.fecha)} ({hace(r.alDespacho.hace)}): espera decisión del juez.</p>}
        </div>
        <div className="rama-res-tile">
          <h5>Próxima audiencia</h5>
          {au ? (
            <>
              <p><strong>{fechaDMA(au.fecha)}{au.hora ? ' · ' + au.hora : ''}</strong><br /><span className="rama-res-suave">{[au.tipo, au.modalidad].filter(Boolean).join(' · ') || au.actuacion}</span></p>
              <p className="rama-res-linea"><span className={'badge badge-' + colorCuentaRegresiva(au.restantes)}>{etiquetaCuentaRegresiva(au.restantes)}</span> {auReg ? <span className="rama-res-ok">Ya está en Audiencias del portal</span> : puedeCrear && <button type="button" className="btn-secondary rama-btn" onClick={() => onCrear('audiencias', au.act, au)}>Crear audiencia</button>}</p>
              {au.posibleCambio && <p className="rama-res-alerta">Hay una actuación posterior que habla de aplazar o cambiar la audiencia: verifique la fecha.</p>}
            </>
          ) : <p className="rama-res-suave">Ninguna audiencia con fecha futura en las actuaciones.</p>}
        </div>
        <div className="rama-res-tile">
          <h5>Términos que corren</h5>
          {terms.length ? terms.map((x, i) => {
            const reg = terminoRegistrado(x, terminos);
            return (
              <p key={i} className="rama-res-linea">
                <strong>Finaliza {fechaDMA(x.finaliza)}</strong> <span className={'badge badge-' + colorCuentaRegresiva(x.restantes)}>{etiquetaCuentaRegresiva(x.restantes)}</span><br />
                <span className="rama-res-suave">{x.actuacion} · {fechaDMA(x.fechaActuacion)}</span><br />
                {reg ? <span className="rama-res-ok">Ya está en Términos del portal</span> : puedeCrear && <button type="button" className="btn-secondary rama-btn" onClick={() => onCrear('terminos', x.act, x)}>Crear término</button>}
              </p>
            );
          }) : <p className="rama-res-suave">Ningún término corriendo según la Rama.</p>}
        </div>
      </div>
      {r.suspension && <p className={'rama-res-aviso' + (r.suspension.reanudacion ? ' ok' : '')}><strong>{r.suspension.reanudacion ? 'Reanudación de términos' : 'Suspensión de términos'} ({fechaDMA(r.suspension.fecha)}):</strong> {r.suspension.texto.slice(0, 260)}{r.suspension.texto.length > 260 ? '…' : ''} <em>Los días hábiles de arriba no descuentan suspensiones: verifique en el despacho.</em></p>}
      <p className="rama-res-nota">Según lo que publica la Rama (a veces con retraso). Verifique siempre contra el auto o el estado antes de confiar en una fecha.</p>
    </div>
  );
}

// Ventana para crear la audiencia o el término desde una actuación: el formulario del portal ya lleno; solo se guarda con «Agregar».
function ModalCrearDesdeRama({ crear, proceso, tiposAccion, colaboradores, notify, onCrearAudiencia, onCrearTermino, onCreateTipoTermino, onCerrar }){
  useEffect(() => {
    const f = e => { if(e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  const esAud = crear.tipo === 'audiencias';
  const base = esAud ? onCrearAudiencia : onCrearTermino;
  const guardo = useRef(false);
  const onCrear = async payload => { const r = await base(payload); guardo.current = !!r; return r; };
  return (
    <div className="confirm-overlay" onClick={e => { if(e.target === e.currentTarget) onCerrar(); }}>
      <div className="rama-modal" role="dialog" aria-modal="true" aria-label={esAud ? 'Crear audiencia desde la Rama' : 'Crear término desde la Rama'}>
        <h4>{esAud ? 'Crear audiencia' : 'Crear término'} desde la actuación de la Rama</h4>
        <p className="rama-res-suave">{crear.act.actuacion} · {fechaDMA(crear.act.fecha)}. {esAud ? 'Fecha y hora salen del texto de la actuación' : 'La Rama marca que el término finaliza el ' + fechaDMA(crear.finaliza) + '; la fecha de notificación es el último día hábil antes de que inicie y los días hábiles son los del término'}. <strong>Verifíquelos contra el auto antes de agregar.</strong></p>
        <FormularioNuevo
          tipo={crear.tipo} procesos={[proceso]} procesoFijo={proceso} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify}
          inicial={crear.inicial} onCrear={onCrear} onCreateTipoTermino={onCreateTipoTermino}
          onCreado={() => { if(guardo.current) onCerrar(); }}
        />
        <div className="confirm-actions"><button type="button" className="btn-secondary" onClick={onCerrar}>Cerrar sin guardar</button></div>
      </div>
    </div>
  );
}

function FilaActuacion({ act, nuevo, enHistorico, canWrite, onAgregar, hoy, audiencias, terminos, puedeCrear, onCrear }){
  const [abierta, setAbierta] = useState(false);
  const cl = clasificarActuacion(act);
  const catInfo = CATEGORIAS.find(c => c.id === cl.categoria);
  const au = puedeCrear ? audienciaDeActuacion(act, hoy) : null;
  const term = puedeCrear ? terminoDeActuacion(act, hoy) : null;
  const nota = String(act.anotacion || '').replace(/\s+/g, ' ').trim();
  const corta = anotacionLimpia(nota, 140) || '—';   // la lista muestra la anotación limpia; «ver más» el texto completo de la Rama
  return (
    <tr className={(esDeTramite(act) ? 'rama-tramite' : '') + (cl.importante ? ' rama-importante' : '')}>
      <td className="rama-fecha">{fechaDMA(act.fecha)}</td>
      <td className="rama-act">
        <strong>{act.actuacion}</strong>
        {cl.importante && catInfo && <span className={'rama-cat rama-cat--' + cl.categoria}>{catInfo.singular}</span>}
        {nuevo && <span className="badge badge-verde rama-nuevo">Nueva</span>}
        {enHistorico && <span className="rama-ya">ya en el Histórico</span>}
      </td>
      <td className="rama-nota">
        {abierta ? (nota || '—') : corta}
        {nota.length > corta.length && <button type="button" className="rama-mas" onClick={() => setAbierta(v => !v)}>{abierta ? 'ver menos' : 'ver más'}</button>}
      </td>
      <td className="rama-term">{fechaDMA(act.fechaInicial) || ''}</td>
      <td className="rama-term">{fechaDMA(act.fechaFinal) || ''}</td>
      <td className="rama-term">{fechaDMA(act.registro) || ''}</td>
      <td className="rama-acc">
        {canWrite && !enHistorico && <button type="button" className="btn-secondary rama-btn" onClick={() => onAgregar(act)} title="Agrega este renglón al final del Histórico y lo pone también en Estado y Fecha Estado">Al Histórico</button>}
        {au && !audienciaRegistrada(au, audiencias) && <button type="button" className="btn-secondary rama-btn" onClick={() => onCrear('audiencias', act, au)} title="Abre el formulario de Audiencias con la fecha y hora de esta actuación; no guarda hasta «Agregar»">Crear audiencia</button>}
        {term && !terminoRegistrado(term, terminos) && <button type="button" className="btn-secondary rama-btn" onClick={() => onCrear('terminos', act, term)} title="Abre el formulario de Términos con la fecha de esta actuación y los días hábiles hasta el vencimiento que marca la Rama; no guarda hasta «Agregar»">Crear término</button>}
      </td>
    </tr>
  );
}

// Los procesos de lo contencioso administrativo (juzgados y tribunales administrativos, Consejo de Estado) se consultan y sus documentos se bajan en SAMAI: enlaces directos armados con el radicado (ver lib/samai.js).
function BotonesSamai({ rad, despacho }){
  const u = urlsSamai(rad, despacho);
  if(!u) return null;
  return (
    <>
      <button type="button" className="rama-btn rama-btn--samai" onClick={() => abrirEnSamai(u.proceso)} title="Abre este proceso en SAMAI (inicie sesión en SAMAI si se lo pide)"><Ico n="externo" />Abrir en SAMAI</button>
      <button type="button" className="rama-btn rama-btn--exp" onClick={() => abrirEnSamai(u.expediente)} title="Abre el expediente digital en SAMAI: autos, memoriales y demás documentos, por cuaderno. Lo que se ve depende de su acceso en SAMAI."><Ico n="carpeta" />Expediente en SAMAI</button>
      {!u.esConsejoEstado && <button type="button" className="rama-btn rama-btn--ce" onClick={() => abrirEnSamai(urlsSamai(rad, despacho, CORPORACION_CONSEJO_ESTADO).proceso)} title="Si el proceso subió en apelación, SAMAI lo tiene en el Consejo de Estado"><Ico n="edificio" />En el Consejo de Estado</button>}
    </>
  );
}

// Los procesos de la jurisdicción ordinaria (laborales, etc.) piden el acceso al expediente digital y el reconocimiento de personería por CORREO al despacho; en SAMAI (contencioso administrativo) eso se pide dentro de SAMAI y no hay correo.
function BotonAccesoCorreo({ rad, despacho, onSolicitarAcceso, solicitando }){
  if(!onSolicitarAcceso || !esJurisdiccionOrdinaria(rad, despacho)) return null;
  return <button type="button" className="rama-btn rama-btn--acceso" onClick={() => onSolicitarAcceso(rad, despacho)} disabled={solicitando} title="Crea en los Borradores de Gerencia el correo al despacho pidiendo el reconocimiento de personería y el acceso al expediente digital, ya con los datos de la apoderada principal (Mónica Paola Quintero Jiménez), el radicado, las partes y el correo del despacho. No se envía solo."><Ico n="correo" />{solicitando ? 'Creando borrador…' : 'Solicitar acceso por correo'}</button>;
}

export default function RamaJudicialTab({ proceso, historico, estadoActual, fechaEstado, canWrite, config, notify, onAgregarAlHistorico, onActualizar, onRamaVista, tiposAccion, colaboradores, audiencias, terminos, onCrearAudiencia, onCrearTermino, onCreateTipoTermino }){
  const hoy = hoyISO();
  const [filtroCat, setFiltroCat] = useState('todas');   // 'todas' | 'importantes' | id de categoría
  const [crear, setCrear] = useState(null);   // { tipo, act, inicial, finaliza }: ventana de crear audiencia/término desde una actuación
  const puedeCrear = !!(canWrite && onCrearAudiencia && onCrearTermino);
  function abrirCrear(tipo, act, dato){
    const fechaAct = String(act.fecha || '').slice(0, 10);
    const sufijo = ' · ' + (act.actuacion || '');
    const inicial = tipo === 'audiencias'
      ? { fecha: dato.fecha, hora: dato.hora || '', observacion: ('Rama ' + fechaDMA(fechaAct) + sufijo + (dato.modalidad ? ' — ' + dato.modalidad : '')).slice(0, 250), textoSugerencia: dato.tipo || act.actuacion }
      : { ...(() => { const x = datosParaTermino(fechaAct, dato.inicia, dato.finaliza); return { fecha: x.fecha, diasHabiles: x.dias }; })(), observacion: ('Rama ' + fechaDMA(fechaAct) + sufijo + ' — término del ' + (dato.inicia ? fechaDMA(dato.inicia) : '…') + ' al ' + fechaDMA(dato.finaliza)).slice(0, 250), textoSugerencia: (act.actuacion || '') + ' ' + (act.anotacion || '') };
    setCrear({ tipo, act, inicial, finaliza: dato.finaliza });
  }
  const { principal, historicos } = useMemo(() => numerosDelProceso(proceso), [proceso]);
  const radicados = useMemo(() => [principal, ...historicos].filter(Boolean), [principal, historicos]);
  const [detalles, setDetalles] = useState({});   // idProceso -> { cargando, error, datos } (detalle completo, a pedido)
  const [hermanos, setHermanos] = useState({});   // radicado -> otras terminaciones (00-03) que existen en la Rama
  const descubiertos = useRef(new Set());
  const pedidosHermanos = useRef(new Set());
  const [buscarHist, setBuscarHist] = useState(false);   // false: solo el número principal; true: también los del histórico
  const [terminacion, setTerminacion] = useState({});   // número del histórico -> terminación (instancia) elegida en la lista desplegable
  const [elegidos, setElegidos] = useState([]);   // [{ rad, base }]: números con otra terminación que el usuario pidió consultar
  const [resultados, setResultados] = useState({});   // radicado -> { cargando, error, datos }
  const [verTodo, setVerTodo] = useState({});
  const [completando, setCompletando] = useState({});   // radicado -> true mientras se traen las actuaciones que faltan
  const [filtroFecha, setFiltroFecha] = useState({ desde: '', hasta: '' });
  const [conTramite, setConTramite] = useState(true);   // por defecto se ven TODAS las actuaciones (las de trámite salen atenuadas), como en la página de la Rama
  const url = config?.RAMA_JUDICIAL_URL;

  // La Rama entrega las actuaciones de 40 en 40: se piden las primeras páginas y, en segundo plano, el resto hasta tenerlas todas.
  const completar = useCallback(async (rad, inicial) => {
    let datos = inicial;
    try{
      for(let vuelta = 0; vuelta < 8; vuelta++){
        const p = datos.procesos?.[0];
        if(!p || p.esPrivado || !p.totalActuaciones || p.actuaciones.length >= p.totalActuaciones) break;
        setCompletando(prev => ({ ...prev, [rad]: true }));
        const desde = Math.floor(p.actuaciones.length / 40) + 1;
        const mas = await consultarRama(url, rad, { forzar: true, paginas: 3, desde });
        const q = mas.procesos?.[0];
        const unidas = mezclarActuaciones(p.actuaciones, q?.actuaciones || []);
        if(unidas.length <= p.actuaciones.length){
          // El servidor es la versión anterior de la consulta (ignora «desde»): se piden de una vez las páginas que permita.
          const todo = await consultarRama(url, rad, { forzar: true, paginas: 6 });
          const t = todo.procesos?.[0];
          const u2 = mezclarActuaciones(p.actuaciones, t?.actuaciones || []);
          if(u2.length > p.actuaciones.length) datos = { ...datos, procesos: [{ ...p, actuaciones: u2 }, ...datos.procesos.slice(1)] };
          setResultados(prev => ({ ...prev, [rad]: { ...(prev[rad] || {}), datos } }));
          break;
        }
        datos = { ...datos, procesos: [{ ...p, actuaciones: unidas }, ...datos.procesos.slice(1)] };
        setResultados(prev => ({ ...prev, [rad]: { ...(prev[rad] || {}), datos } }));
      }
    }catch(e){ /* se queda con lo ya cargado */ }
    finally{ setCompletando(prev => ({ ...prev, [rad]: false })); }
  }, [url]);

  const cargar = useCallback(async (rad, forzar) => {
    setResultados(prev => ({ ...prev, [rad]: { ...(prev[rad] || {}), cargando: true, error: '' } }));
    try{
      const datos = await consultarRama(url, rad, { forzar });
      setResultados(prev => ({ ...prev, [rad]: { cargando: false, error: '', datos } }));
      completar(rad, datos);
      // Cada número completo (principal o del histórico) se busca también con sus otras terminaciones 00, 01, 02 y 03: son procesos distintos.
      if(radicados.includes(rad) && !descubiertos.current.has(rad)){
        descubiertos.current.add(rad);
        descubrirHermanos(url, rad).then(h => { if(h.length) setHermanos(prev => ({ ...prev, [rad]: h })); });
      }
    }catch(e){
      setResultados(prev => ({ ...prev, [rad]: { cargando: false, error: e.message || String(e), datos: prev[rad]?.datos } }));
    }
  }, [url, completar, radicados]);

  const cargarDetalle = useCallback(async (idProceso) => {
    setDetalles(prev => ({ ...prev, [idProceso]: { cargando: true, error: '' } }));
    try{
      const datos = await consultarDetalle(url, idProceso);
      setDetalles(prev => ({ ...prev, [idProceso]: { cargando: false, error: '', datos } }));
    }catch(e){
      setDetalles(prev => ({ ...prev, [idProceso]: { cargando: false, error: e.message || String(e) } }));
    }
  }, [url]);

  // Las otras terminaciones que existen se consultan una tras otra, apenas se descubren.
  useEffect(() => {
    const nuevos = Object.values(hermanos).flat().filter(h => !pedidosHermanos.current.has(h) && !radicados.includes(h));
    if(!nuevos.length) return undefined;
    let cancelado = false;
    (async () => { for(const h of nuevos){ if(cancelado) break; pedidosHermanos.current.add(h); await cargar(h, false); } })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hermanos]);

  // Al abrir la pestaña se consulta primero el número principal (el servidor limita las consultas y se recuerdan 10 minutos).
  useEffect(() => { if(principal) cargar(principal, false); }, [principal, cargar]);

  // Al ver la Rama del proceso (el número principal y sus otras instancias), sus novedades en la balanza de la cabecera se dan por vistas.
  useEffect(() => {
    if(!principal || !onRamaVista) return;
    [principal, ...(hermanos[principal] || [])].forEach(rad => {
      const fecha = resultados[rad]?.datos?.procesos?.[0]?.fechaUltimaActuacion;
      if(fecha) onRamaVista(rad, fecha);
    });
  }, [resultados, principal, hermanos, onRamaVista]);

  // Si el principal no aparece en la Rama, se pasa solo a los números del histórico.
  const resPrincipal = resultados[principal];
  useEffect(() => {
    if(resPrincipal?.datos && !resPrincipal.error && (resPrincipal.datos.procesos || []).length === 0 && historicos.length) setBuscarHist(true);
  }, [resPrincipal, historicos.length]);

  // Los números del histórico se consultan uno tras otro (nunca todos a la vez), después del principal.
  useEffect(() => {
    if(!buscarHist) return undefined;
    let cancelado = false;
    (async () => { for(const h of historicos){ if(cancelado) break; await cargar(h, false); } })();
    return () => { cancelado = true; };
  }, [buscarHist, historicos, cargar]);

  // Cada número con sus otras terminaciones (00-03) que existen, justo debajo.
  const entradas = [];
  radicados.forEach(r => {
    entradas.push({ rad: r, base: r, esBase: true });
    (hermanos[r] || []).filter(h => !radicados.includes(h) && !entradas.some(e => e.rad === h)).forEach(h => entradas.push({ rad: h, base: r, esBase: false }));
    elegidos.filter(e => e.base === r && !entradas.some(x => x.rad === e.rad)).forEach(e => entradas.push({ rad: e.rad, base: r, esBase: false }));
  });

  // Borrador del correo que pide al despacho el reconocimiento de personería y el acceso al expediente digital (procesos de la jurisdicción ordinaria, no SAMAI): se crea en los Borradores de Gerencia; no se envía.
  const [solicitandoAcceso, setSolicitandoAcceso] = useState(false);
  async function solicitarAcceso(rad, despacho){
    if(!getAccount()){ notify?.('El borrador se crea en el Outlook de Gerencia al iniciar sesión con Microsoft; en el modo demo no hay buzón.', 'info'); return; }
    setSolicitandoAcceso(true);
    try{
      const firma = await firmaComoImagenInline('gerencia').catch(() => null);
      const c = construirCorreoSolicitudAcceso({ proceso, radicado: rad, despacho, srcFirma: firma ? 'cid:' + firma.cid : '' });
      const r = await crearBorradorConImagenesInline({ to: c.para, subject: c.asunto, htmlBody: c.html, imagenes: firma ? [firma] : [], categorias: [CATEGORIA_SOLICITUD_ACCESO + ' (borrador)'], buzon: CORREO_GERENCIA_ACCESO, caerAlBuzonPropio: true });
      const dest = c.para.length ? ' dirigido a ' + c.para.join(', ') : ' (sin destinatario: agregue el correo del despacho)';
      notify?.(r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + CORREO_GERENCIA_ACCESO + '. Quedó en TUS Borradores' + dest + ': revíselo, adjunte el poder y cambie el «De» a Gerencia si tiene permiso.'
        : '✓ Borrador «Solicitud de acceso al expediente» creado en los Borradores de ' + CORREO_GERENCIA_ACCESO + dest + '. Ya trae los datos de la apoderada: revíselo, adjunte el poder y envíelo.', r.enBuzonPropio ? 'info' : 'success');
    }catch(err){
      console.error(err);
      notify?.('No se pudo crear el borrador: ' + (err?.message || err), 'error');
    }finally{ setSolicitandoAcceso(false); }
  }

  // «Consultar este número» con la terminación elegida: si es otra distinta a la que trae el número, se agrega como un proceso más debajo.
  function consultarConTerminacion(rad, radSel){
    if(radSel !== rad) setElegidos(prev => (prev.some(e => e.rad === radSel) ? prev : [...prev, { rad: radSel, base: rad }]));
    cargar(radSel, false);
    setTerminacion(prev => { const n = { ...prev }; delete n[rad]; return n; });   // la lista vuelve al número propio: el otro sale como bloque aparte
  }

  if(!radicados.length){
    return <div className="empty-state empty-state-compact">Este proceso no tiene un «No. completo» de 23 dígitos, así que no se puede consultar en la Rama Judicial.</div>;
  }

  // «Al Histórico» de una fila (2026-11-13, pedido del usuario: «este botón también coloca el dato en Estado»): el renglón va al final del Histórico y la actuación pasa a ser el Estado,
  // con su fecha en Fecha Estado. Al guardar, el Estado anterior se archiva solo en el Histórico, como siempre.
  function agregarUno(act){
    const estado = agregarLineasAlEstado(estadoActual, [renglonHistorico(act, 140)]);
    onActualizar({ historicoHtml: htmlRenglones([act]), estado, fechaEstado: fechaMasRecienteDelEstado(estado) || String(act.fecha || '').slice(0, 10) || null });
    notify?.('Se agregó al Histórico y como línea nueva del Estado, y la Fecha Estado quedó en la más reciente. Presione «Guardar cambios» para guardarlo.', 'success');
  }

  function agregar(acts){
    if(!acts.length) return;
    onAgregarAlHistorico(htmlRenglones(acts));
    notify?.(acts.length === 1 ? 'Se agregó 1 renglón al Histórico. Presione «Guardar cambios» para guardarlo.' : `Se agregaron ${acts.length} renglones al Histórico. Presione «Guardar cambios» para guardarlos.`, 'success');
  }

  // Actualización completa: renglones nuevos en el Histórico + Estado y Fecha Estado con lo más reciente + marca de «Actualizado desde la Rama».
  function actualizarTodo(acts){
    const r = actualizacionDesdeRama(acts, historico, fechaEstado, estadoActual);
    onActualizar({ historicoHtml: r.historicoHtml, estado: r.estado, fechaEstado: r.fechaEstado });
    const partes = [];
    if(r.nuevas.length) partes.push(r.nuevas.length === 1 ? '1 renglón nuevo en el Histórico' : `${r.nuevas.length} renglones nuevos en el Histórico`);
    if(r.estado) partes.push('líneas nuevas en el Estado y Fecha Estado actualizada');
    notify?.((partes.length ? partes.join(' y ') : 'Sin novedades; se anotó la revisión en el Histórico') + '. Presione «Guardar cambios» para guardarlo.', 'success');
  }
  const ultimaRev = ultimaActualizacionDesdeRama(historico);

  return (
    <div className="field-section rama-tab">
      <p className="rama-fuente">Fuente: Consulta Nacional Unificada de la Rama Judicial (pública). Aquí solo se lee; «Al Histórico» deja la actuación en el Histórico y en el Estado, y luego se guarda con «Guardar cambios». De cada número también se buscan las terminaciones 00, 01, 02 y 03 (son procesos distintos: instancias) y salen debajo si existen.</p>
      <p className="rama-ultima">{ultimaRev ? `Última actualización desde la Rama Judicial: ${ultimaRev}.` : 'Este proceso aún no se ha actualizado desde la Rama Judicial.'}</p>
      <div className="rama-fechas">
        <label>Desde <input type="date" value={filtroFecha.desde} onChange={e => setFiltroFecha(f => ({ ...f, desde: e.target.value }))} /></label>
        <label>Hasta <input type="date" value={filtroFecha.hasta} onChange={e => setFiltroFecha(f => ({ ...f, hasta: e.target.value }))} /></label>
        {(filtroFecha.desde || filtroFecha.hasta) && <button type="button" className="rama-mas" onClick={() => setFiltroFecha({ desde: '', hasta: '' })}>Quitar filtro</button>}
      </div>
      <label className="rama-filtro"><input type="checkbox" checked={conTramite} onChange={e => setConTramite(e.target.checked)} /> Mostrar también actuaciones de trámite (envíos, recibos, notificaciones por estado)</label>
      {historicos.length > 0 && !buscarHist && (
        <div className="rama-hist-aviso">
          <span>Este proceso tiene {historicos.length === 1 ? '1 número' : `${historicos.length} números`} en el histórico, que no se consulta{historicos.length === 1 ? '' : 'n'} hasta que usted lo pida.</span>
          <button type="button" className="btn-secondary rama-btn" onClick={() => setBuscarHist(true)}>Consultar también {historicos.length === 1 ? 'el número del histórico' : 'los números del histórico'}</button>
        </div>
      )}
      {entradas.map(({ rad, base, esBase }) => {
        const esPrincipal = rad === principal;
        if(esBase && !esPrincipal && !resultados[rad] && !buscarHist){
          return (
            <div key={rad} className="rama-bloque rama-bloque-pendiente">
              <div className="rama-cab">
                <h4><span className="rama-tipo">Número del histórico</span> {rad.slice(0, 21)}<select className="rama-term-select" value={terminacion[rad] || rad.slice(21)} onChange={e => setTerminacion(prev => ({ ...prev, [rad]: e.target.value }))} aria-label="Terminación del número (instancia): 00, 01, 02 o 03" title="Terminación del radicado (instancia). Cada una es un proceso distinto: elija la que quiera consultar.">{[...new Set([rad.slice(21), ...TERMINACIONES])].sort().map(x => <option key={x} value={x}>{x}</option>)}</select><CopiarNumero num={rad.slice(0, 21) + (terminacion[rad] || rad.slice(21))} notify={notify} /></h4>
                <span className="rama-cab-acc">
                  <button type="button" className="rama-btn rama-btn--rama" onClick={() => abrirEnRamaJudicial(proceso, notify, rad.slice(0, 21) + (terminacion[rad] || rad.slice(21)))} title="Abre la consulta de la Rama Judicial y copia este radicado"><Ico n="escudo" />Abrir en la Rama</button>
                  <button type="button" className="rama-btn rama-btn--pub" onClick={() => abrirPublicacionesProcesales(rad.slice(0, 21) + (terminacion[rad] || rad.slice(21)))} title="Abre Publicaciones Procesales de la Rama (estados, traslados, edictos y autos de todos los despachos) ya buscado con este radicado"><Ico n="documento" />Publicaciones procesales</button>
                  <BotonSiugj rad={rad.slice(0, 21) + (terminacion[rad] || rad.slice(21))} despacho="" notify={notify} />
                  <BotonAccesoCorreo rad={rad.slice(0, 21) + (terminacion[rad] || rad.slice(21))} despacho="" onSolicitarAcceso={solicitarAcceso} solicitando={solicitandoAcceso} />
                  <BotonesSamai rad={rad.slice(0, 21) + (terminacion[rad] || rad.slice(21))} despacho="" />
                  <button type="button" className="rama-btn rama-btn--act" onClick={() => consultarConTerminacion(rad, rad.slice(0, 21) + (terminacion[rad] || rad.slice(21)))}><Ico n="buscar" />Consultar este número</button>
                </span>
              </div>
            </div>
          );
        }
        const r = resultados[rad] || { cargando: true };
        const procesos = r.datos?.procesos || [];
        // La lista de terminaciones es solo para CONSULTAR otro número: elegir otra no busca ni cambia nada hasta presionar «Consultar este número».
        const radSel = rad.slice(0, 21) + (terminacion[rad] || rad.slice(21));
        const cambiado = radSel !== rad;
        return (
          <div key={rad} className="rama-bloque">
            <div className="rama-cab">
              <h4><span className={'rama-tipo' + (esPrincipal ? ' principal' : '')} title={esBase ? '' : 'Es un proceso distinto: la misma radicación con otra terminación (instancia)'}>{esBase ? (esPrincipal ? 'Número principal' : 'Número del histórico') : `${base === principal ? 'Principal' : 'Histórico'} · termina en ${rad.slice(-2)}`}</span> {rad.slice(0, 21)}<select className="rama-term-select" value={terminacion[rad] || rad.slice(21)} onChange={e => setTerminacion(prev => ({ ...prev, [rad]: e.target.value }))} aria-label="Terminación del número (instancia): 00, 01, 02 o 03" title="Cada terminación del radicado es un proceso distinto (instancia). Elija una y presione «Consultar este número»; solo es para consultar, no cambia el proceso.">{[...new Set([rad.slice(21), ...TERMINACIONES])].sort().map(x => <option key={x} value={x}>{x}</option>)}</select><CopiarNumero num={radSel} notify={notify} /></h4>
              <span className="rama-cab-acc">
                <button type="button" className="rama-btn rama-btn--rama" onClick={() => abrirEnRamaJudicial(proceso, notify, radSel)} title="Abre la consulta de la Rama Judicial y copia este radicado"><Ico n="escudo" />Abrir en la Rama</button>
                  <button type="button" className="rama-btn rama-btn--pub" onClick={() => abrirPublicacionesProcesales(radSel)} title="Abre Publicaciones Procesales de la Rama (estados, traslados, edictos y autos de todos los despachos) ya buscado con este radicado"><Ico n="documento" />Publicaciones procesales</button>
                  <BotonSiugj rad={radSel} despacho={cambiado ? '' : ((resultados[rad]?.datos?.procesos?.[0]?.despacho) || (rad === principal ? proceso?.Despacho : ''))} notify={notify} />
                  <BotonAccesoCorreo rad={radSel} despacho={cambiado ? '' : ((resultados[rad]?.datos?.procesos?.[0]?.despacho) || (rad === principal ? proceso?.Despacho : ''))} onSolicitarAcceso={solicitarAcceso} solicitando={solicitandoAcceso} />
                  <BotonesSamai rad={radSel} despacho={cambiado ? '' : ((resultados[rad]?.datos?.procesos?.[0]?.despacho) || (rad === principal ? proceso?.Despacho : ''))} />
                {cambiado && <button type="button" className="rama-btn rama-btn--act" onClick={() => consultarConTerminacion(rad, radSel)}><Ico n="buscar" />Consultar este número</button>}
                <button type="button" className="rama-btn rama-btn--act" onClick={() => cargar(rad, true)} disabled={r.cargando}><Ico n="refrescar" />{r.cargando ? 'Consultando…' : 'Actualizar'}</button>
              </span>
            </div>
            {r.error && <div className="rama-error" role="alert">{r.error}</div>}
            {!r.datos && r.cargando && <div className="rama-cargando">Consultando la Rama Judicial…</div>}
            {r.datos && procesos.length === 0 && <div className="empty-state empty-state-compact">La Rama Judicial no devolvió ningún proceso con este número.</div>}
            {procesos.map(p => {
              const acts = p.actuaciones || [];
              const nuevas = actuacionesNuevas(acts, historico);
              const idsNuevas = new Set(nuevas.map(a => a.consecutivo));
              const cats = acts.map(a => clasificarActuacion(a));
              const conteo = { importantes: cats.filter(c => c.importante).length };
              CATEGORIAS.forEach(c => { conteo[c.id] = cats.filter(x => x.categoria === c.id).length; });
              const pasaCat = a => {
                if(filtroCat === 'todas') return conTramite || !esDeTramite(a);   // sin elegir categoría, manda la casilla de trámite
                const c = clasificarActuacion(a);
                return filtroCat === 'importantes' ? c.importante : c.categoria === filtroCat;
              };
              const visibles = acts.filter(a => pasaCat(a) && (!filtroFecha.desde || String(a.fecha || '').slice(0, 10) >= filtroFecha.desde) && (!filtroFecha.hasta || String(a.fecha || '').slice(0, 10) <= filtroFecha.hasta));
              const tope = verTodo[rad + p.idProceso] ? visibles.length : POR_PAGINA;
              return (
                <div key={p.idProceso} className="rama-proceso">
                  {!p.esPrivado && acts.length > 0 && <ResumenRama acts={acts} audiencias={audiencias || []} terminos={terminos || []} hoy={hoy} puedeCrear={puedeCrear} onCrear={abrirCrear} />}
                  <dl className="rama-datos">
                    <div><dt>Despacho</dt><dd>{p.despacho || '—'}</dd></div>
                    <div><dt>Departamento</dt><dd>{p.departamento || '—'}</dd></div>
                    <div><dt>Radicación</dt><dd>{fechaDMA(p.fechaProceso) || '—'}</dd></div>
                    <div><dt>Última actuación</dt><dd>{fechaDMA(p.fechaUltimaActuacion) || '—'}</dd></div>
                    <div className="rama-ancho"><dt>Sujetos procesales</dt><dd>{p.sujetos || '—'}</dd></div>
                  </dl>
                  {!p.esPrivado && p.idProceso && (() => {
                    const dt = detalles[p.idProceso];
                    return (
                      <div className="rama-detalle">
                        {!dt?.datos && <button type="button" className="btn-secondary rama-btn" onClick={() => cargarDetalle(p.idProceso)} disabled={dt?.cargando}>{dt?.cargando ? 'Cargando el detalle…' : 'Ver detalle completo del proceso'}</button>}
                        {dt?.error && <div className="rama-error" role="alert">{dt.error}</div>}
                        {dt?.datos && <DetalleProceso datos={dt.datos} onReintentar={() => cargarDetalle(p.idProceso)} />}
                      </div>
                    );
                  })()}
                  {p.esPrivado && <div className="rama-error">Este proceso es privado (reserva): la Rama no muestra sus actuaciones.</div>}
                  {p.error && <div className="rama-error">{p.error}</div>}
                  {!p.esPrivado && (
                    <>
                      <div className="rama-resumen">
                        <span>{p.totalActuaciones} actuaciones en la Rama{completando[rad] ? ` (cargando el resto: ${acts.length} de ${p.totalActuaciones}…)` : acts.length < p.totalActuaciones ? ` (se muestran las ${acts.length} más recientes: para ver todas hay que actualizar la consulta en Netlify)` : ''}.</span>
                        {nuevas.length > 0 && <strong className="rama-hay-nuevas">{nuevas.length} {nuevas.length === 1 ? 'novedad' : 'novedades'} para el Histórico</strong>}
                        {canWrite && (() => {
                          const u = actualizacionDesdeRama(acts, historico, fechaEstado, estadoActual);
                          return u.hayCambios
                            ? <button type="button" className="btn-primary rama-btn" onClick={() => actualizarTodo(acts)} title="Agrega los renglones nuevos al Histórico y pone en Estado y Fecha Estado lo más reciente de la Rama">Actualizar Histórico y Estado{nuevas.length ? ` (${nuevas.length})` : ''}</button>
                            : <span className="rama-al-dia">Estado e Histórico al día</span>;
                        })()}
                      </div>
                      <div className="rama-chips" role="group" aria-label="Filtrar las actuaciones por tipo">
                        {[{ id: 'todas', nombre: 'Todas', n: acts.length }, { id: 'importantes', nombre: 'Importantes', n: conteo.importantes }, ...CATEGORIAS.filter(c => conteo[c.id] > 0 || c.id === 'desistimiento').map(c => ({ id: c.id, nombre: c.nombre, n: conteo[c.id] }))].map(c => (
                          <button key={c.id} type="button" className={'rama-chip' + (filtroCat === c.id ? ' activo' : '')} aria-pressed={filtroCat === c.id} onClick={() => setFiltroCat(c.id)}>{c.nombre} <span>{c.n}</span></button>
                        ))}
                      </div>
                      <div className="table-wrap">
                        <table className="rama-tabla">
                          <thead><tr><th>Fecha</th><th>Actuación</th><th>Anotación</th><th>Inicia término</th><th>Finaliza término</th><th>Registro</th><th></th></tr></thead>
                          <tbody>
                            {visibles.slice(0, tope).map(a => (
                              <FilaActuacion
                                key={a.consecutivo + '-' + a.fecha} act={a} canWrite={canWrite}
                                nuevo={idsNuevas.has(a.consecutivo)} enHistorico={yaEstaEnHistorico(a, historico)}
                                onAgregar={agregarUno}
                                hoy={hoy} audiencias={audiencias || []} terminos={terminos || []} puedeCrear={puedeCrear} onCrear={abrirCrear}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {visibles.length > tope && <button type="button" className="btn-secondary rama-btn" onClick={() => setVerTodo(v => ({ ...v, [rad + p.idProceso]: true }))}>Ver las {visibles.length - tope} restantes</button>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {crear && <ModalCrearDesdeRama crear={crear} proceso={proceso} tiposAccion={tiposAccion} colaboradores={colaboradores} notify={notify} onCrearAudiencia={onCrearAudiencia} onCrearTermino={onCrearTermino} onCreateTipoTermino={onCreateTipoTermino} onCerrar={() => setCrear(null)} />}
    </div>
  );
}
