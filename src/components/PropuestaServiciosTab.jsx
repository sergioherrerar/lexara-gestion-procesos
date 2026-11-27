import { useEffect, useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';
import membrete from '../assets/Membrete Lexara.png';   // el membrete real de Lexara (el mismo de los PDF del portal)
import { getAccount, crearBorradorConImagenesInline, firmaComoImagenInline, firmaHtml, mensajeError, guardarCopiaPropuesta, listarPropuestas, actualizarPropuesta, leerCorreosBandeja, leerCuerpoCorreo, crearRespuestaBorrador } from '../lib/graph';
import { esSolicitudDePropuesta, extraerDatosSolicitud } from '../lib/solicitudPropuesta';
import { respuestaDePropuesta } from '../lib/respuestaPropuesta';
import { CORREO_GERENCIA_ACCESO } from '../lib/solicitudAccesoExpediente';
import {
  EQUIPO_LEXARA, ETAPAS_POR_SALARIOS, FRASE_ETAPA, etiquetaEtapa, textoSalarios, textoAsunto, textoPresentacion, serviciosPorDefecto, conceptoPorDefecto,
  CONDICIONES_POR_DEFECTO, CLIENTES_POR_DEFECTO, CIERRE_POR_DEFECTO, contactoPredeterminado, CONTACTO_GRUPO_COLMEDICA, generarPropuestaPDF, propuestaComoAdjunto, propuestaComoURL,
} from '../lib/propuestaServicios';

// Administración → «Propuesta de servicios» (2026-11-25, pedido del usuario): arma la carta de propuesta de servicios profesionales con el modelo de la última propuesta (Aliansalud 2026-00062).
// Como es una propuesta, no hay datos de un proceso del portal: el cliente se elige de la lista del portal o se escribe (entidad ajena), y el proceso, las partes y los textos se llenan aquí.
// Los honorarios usan las mismas etapas de las órdenes de compra y facturas, con un número de salarios mínimos por etapa. Se puede ver, descargar en PDF o dejar un borrador de correo con el PDF adjunto.
const HOY = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ROLES = ['parte demandada', 'parte demandante', 'parte vinculada', 'tercero interesado'];
const TIPOS_PROCESO = ['ORDINARIO LABORAL', 'EJECUTIVO LABORAL', 'ORDINARIO LABORAL DE PRIMERA INSTANCIA', 'NULIDAD Y RESTABLECIMIENTO DEL DERECHO', 'REPARACIÓN DIRECTA', 'EJECUTIVO', 'VERBAL', 'ACCIÓN DE TUTELA'];
const filaHonorarios = (etapa, salarios) => ({ etapa, frase: FRASE_ETAPA[etapa] || '', salarios: String(salarios) });
function inicial(){
  const equipo = {}; EQUIPO_LEXARA.forEach(m => { equipo[m.id] = true; });
  return {
    fecha: HOY(), clienteSel: '', entidad: '', entidadCorta: 'la entidad', tratamiento: 'Dra.', atteNombre: '', atteCargo: '', correoPara: '',
    tipoProceso: 'ORDINARIO LABORAL', numeroProceso: '', demandante: '', demandado: '', despacho: '', rol: 'parte demandada', vinculada: false,
    honorarios: [filaHonorarios('Entrega Poder', 1), filaHonorarios('Sentencia 1ra', 1), filaHonorarios('Sentencia 2da', 1)],
    cambioCompetencia: true, cambioCompetenciaSalarios: '1', condiciones: CONDICIONES_POR_DEFECTO, clientes: CLIENTES_POR_DEFECTO, equipo, cierre: CIERRE_POR_DEFECTO,
  };
}
const SALUDOS = { 'Dra.': 'Respetada Doctora:', 'Dr.': 'Respetado Doctor:', 'Señores': 'Respetados señores:' };
// Saludo del CUERPO DEL CORREO (más cercano que el de la carta; pedido del usuario, 2026-11-25): «Estimada Yessica, me complace mucho saludarte.»
function saludoCorreo(tratamiento, atteNombre){
  const primero = String(atteNombre || '').trim().split(/\s+/)[0];
  if(tratamiento === 'Dra.') return primero ? `Estimada ${primero}, me complace mucho saludarte.` : 'Estimada doctora, me complace mucho saludarla.';
  if(tratamiento === 'Dr.') return primero ? `Estimado ${primero}, me complace mucho saludarte.` : 'Estimado doctor, me complace mucho saludarlo.';
  return 'Estimados señores, me complace mucho saludarlos.';
}

function Campo({ etiqueta, ayuda, children, ancho }){
  return <div className="field" style={ancho ? { gridColumn: 'span ' + ancho } : undefined}><label>{etiqueta}</label>{children}{ayuda && <div className="field-info" style={{ marginTop: 4 }}>{ayuda}</div>}</div>;
}
const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 12 };

// «Propuestas enviadas» (2026-11-27): lo guardado en ADMINISTRACION/Propuestas/_datos al crear cada correo. Estados: creada → aceptada (la confirma una persona) → proceso creado. «Crear proceso» abre el formulario de proceso
// nuevo ya lleno con los datos de la propuesta; al GUARDARLO se crea la carpeta del proceso y el PDF de la propuesta se copia a su «0. Contrato».
const ESTADO_PROPUESTA = { creada: ['Creada', 'badge-gris'], respondida: ['Respondida', 'badge-naranja'], aceptada: ['Aceptada', 'badge-naranja'], 'proceso-creado': ['Proceso creado', 'badge-verde'] };
const dmaP = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
export function procesoDesdePropuesta(p, clientes){
  const rad23 = String(p.numeroProceso || '').replace(/\D/g, '');
  const cli = (clientes || []).find(c => String(c.RazonSocial || c.Nombre || '').trim().toLowerCase() === String(p.cliente || '').trim().toLowerCase());
  const o = {};
  if(rad23.length >= 21) o.Radicado = rad23.slice(12, 16) + '-' + rad23.slice(16, 21);
  if(rad23.length === 23) o.NoCompleto = rad23;
  if(p.cliente) o.Cliente = p.cliente;
  if(cli && cli.Entidad) o.Entidad = cli.Entidad;
  if(p.tipoProceso) o.TipoProceso = p.tipoProceso;
  if(p.demandante) o.Demandante = p.demandante;
  if(p.demandado) o.Demandado = p.demandado;
  if(/demandante/i.test(p.rol || '')) o.ParteActuamos = 'Demandante'; else if(/demandad/i.test(p.rol || '')) o.ParteActuamos = 'Demandado';
  return o;
}
function PropuestasEnviadas({ config, liveMode, notify, canWrite, clientes, onCrearProceso }){
  const [lista, setLista] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(false);
  async function cargar(){
    if(!liveMode) return;
    setCargando(true); setError('');
    try{
      let propuestas = await listarPropuestas(config);
      // ¿Alguien respondió? Se busca en el correo de Gerencia, en el mismo hilo (conversación) de cada propuesta que sigue «Creada» o «Respondida». Solo lee; lo que se guarda es el aviso en el archivo de datos de la propuesta.
      const vigilar = propuestas.filter(p => p.conversacion && (p.estado === 'creada' || p.estado === 'respondida' || !p.estado));
      if(vigilar.length){
        try{
          const desde = vigilar.map(p => String(p.creadoEn || p.fecha).slice(0, 10)).sort()[0];
          const correos = await leerCorreosBandeja(CORREO_GERENCIA_ACCESO || 'gerencia@lexaraabogados.com', desde);
          const nuevas = [];
          for(const p of vigilar){
            const r = respuestaDePropuesta(p, correos);
            if(!r || (p.respuesta && p.respuesta.correoId === r.correo.id)) continue;
            const respuesta = { tipo: r.tipo, correoId: r.correo.id, fecha: r.correo.fecha, de: r.correo.remitenteNombre || r.correo.remitente, asunto: r.correo.asunto, resumen: String(r.correo.resumen || '').slice(0, 300), enlace: r.correo.enlace || '', total: r.total };
            try{ const nuevo = await actualizarPropuesta(config, p.numero, { estado: 'respondida', respuesta }); propuestas = propuestas.map(x => x.numero === p.numero ? nuevo : x); nuevas.push({ p, tipo: r.tipo }); }catch(e){ console.error(e); }
          }
          nuevas.forEach(n => notify?.(n.tipo === 'aceptacion' ? 'El cliente respondió a la propuesta ' + n.p.numero + ' y parece que la ACEPTÓ. Revise el correo y confirme la aceptación.' : 'El cliente respondió a la propuesta ' + n.p.numero + '. Revise el correo.', 'info'));
        }catch(e){ console.error(e); setError('No se pudo revisar si hubo respuestas en el correo de Gerencia: ' + mensajeError(e)); }
      }
      setLista(propuestas);
    }
    catch(err){ console.error(err); setError(mensajeError(err)); }
    finally{ setCargando(false); }
  }
  useEffect(() => { if(abierta && lista === null) cargar(); }, [abierta]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function aceptar(p){
    try{ await actualizarPropuesta(config, p.numero, { estado: 'aceptada', aceptadaEl: new Date().toISOString().slice(0, 10) }); notify?.('Propuesta ' + p.numero + ' marcada como aceptada.', 'success'); await cargar(); }
    catch(err){ notify?.('No se pudo marcar la propuesta: ' + mensajeError(err), 'error'); }
  }
  async function reabrir(p){
    try{ await actualizarPropuesta(config, p.numero, { estado: 'creada', aceptadaEl: '' }); await cargar(); }
    catch(err){ notify?.('No se pudo cambiar el estado: ' + mensajeError(err), 'error'); }
  }
  function crearProceso(p){
    if(!p.pdfItemId) notify?.('Esta propuesta no tiene el PDF guardado: se crea el proceso pero no se copiará nada a «0. Contrato».', 'info');
    onCrearProceso?.(procesoDesdePropuesta(p, clientes), p.pdfItemId ? { numero: p.numero, pdf: p.pdf, pdfItemId: p.pdfItemId, pdfDriveId: p.pdfDriveId } : { numero: p.numero });
    notify?.('Se abrió el formulario del proceso nuevo con los datos de la propuesta ' + p.numero + '. Revíselo y presione Guardar: ahí se crea el proceso, su carpeta y se copia la propuesta a «0. Contrato».', 'info');
  }
  const pendientes = (lista || []).filter(p => p.estado !== 'proceso-creado').length;
  const respondidas = (lista || []).filter(p => p.estado === 'respondida').length;
  return (
    <section className="rama-seccion" style={{ margin: '0 0 16px' }}>
      <button type="button" className="cob-cab" onClick={() => setAbierta(v => !v)} aria-expanded={abierta}>
        <strong>Propuestas enviadas</strong>{lista && <span className={'badge ' + (pendientes ? 'badge-naranja' : 'badge-verde')}>{lista.length}{pendientes ? ' · ' + pendientes + ' sin proceso' : ''}</span>}{respondidas > 0 && <span className="badge badge-alerta">{respondidas} {respondidas === 1 ? 'respondida' : 'respondidas'}</span>}
        <span className="cob-mas">{abierta ? 'ocultar' : 'ver'}</span>
      </button>
      {abierta && (
        <div style={{ marginTop: 8 }}>
          <p className="rama-res-suave" style={{ margin: '0 0 8px' }}>Cada vez que usa «Crear correo con la propuesta», el portal guarda una copia del PDF en <strong>Administración Lexara → ADMINISTRACION → Propuestas</strong> con un número (PS-año-consecutivo). Cuando el cliente la acepte, márquela como aceptada y use «Crear proceso»: al guardar el proceso nuevo se crea su carpeta en SharePoint y la propuesta se copia a su <strong>0. Contrato</strong>.</p>
          {!liveMode && <div className="empty-state empty-state-compact">En el modo demo no hay SharePoint: aquí aparecerán las propuestas guardadas.</div>}
          {liveMode && <div style={{ marginBottom: 8 }}><button type="button" className="btn-secondary rama-btn" onClick={cargar} disabled={cargando}>{cargando ? 'Leyendo…' : 'Actualizar la lista'}</button></div>}
          {error && <div className="rama-error" role="alert"><strong>No se pudo leer la lista.</strong> {error}</div>}
          {lista && lista.length === 0 && <div className="empty-state empty-state-compact">Todavía no hay propuestas guardadas. Aparecen al crear el primer correo con la propuesta.</div>}
          {lista && lista.length > 0 && (
            <div className="table-wrap"><table className="rama-tabla"><thead><tr><th>Propuesta</th><th>Fecha</th><th>Cliente</th><th>Proceso</th><th>Estado</th><th></th></tr></thead>
              <tbody>{lista.map(p => {
                const [txt, cls] = ESTADO_PROPUESTA[p.estado] || ESTADO_PROPUESTA.creada;
                return (
                  <tr key={p.numero} className={p.estado === 'respondida' ? 'rama-importante' : ''}>
                    <td><strong>{p.numero}</strong></td><td className="rama-fecha">{dmaP(p.fecha)}</td><td>{p.entidad || p.cliente}</td>
                    <td>{[p.tipoProceso, p.numeroProceso].filter(Boolean).join(' · ') || '—'}{p.demandante || p.demandado ? <><br /><span className="rama-res-suave">{[p.demandante, p.demandado].filter(Boolean).join(' vs. ')}</span></> : null}</td>
                    <td><span className={'badge ' + cls}>{txt}</span>{p.estado === 'proceso-creado' && p.procesoRadicado ? <><br /><span className="rama-res-suave">{p.procesoRadicado}</span></> : null}
                      {p.estado === 'respondida' && p.respuesta ? <><br /><strong>{p.respuesta.tipo === 'aceptacion' ? 'Parece una ACEPTACIÓN' : 'El cliente respondió'}</strong><br /><span className="rama-res-suave">{dmaP(String(p.respuesta.fecha).slice(0, 10))} · {p.respuesta.de}<br />«{p.respuesta.asunto}»</span></> : null}</td>
                    <td className="rama-acc">
                      {p.pdfWebUrl && <a className="btn-secondary rama-btn" href={p.pdfWebUrl} target="_blank" rel="noopener noreferrer">Ver PDF</a>}
                      {p.estado === 'respondida' && p.respuesta && p.respuesta.enlace && <a className="btn-secondary rama-btn" href={p.respuesta.enlace} target="_blank" rel="noopener noreferrer">Ver la respuesta</a>}
                      {canWrite && (p.estado === 'creada' || p.estado === 'respondida') && <button type="button" className="rama-btn rama-btn--crear" onClick={() => aceptar(p)} title="Confírmela cuando el cliente haya aceptado la propuesta">{p.estado === 'respondida' && p.respuesta && p.respuesta.tipo === 'aceptacion' ? 'Confirmar aceptación' : 'Marcar aceptada'}</button>}
                      {canWrite && p.estado === 'aceptada' && <><button type="button" className="rama-btn rama-btn--crear" onClick={() => crearProceso(p)} title="Abre el formulario de proceso nuevo con los datos de la propuesta; no guarda nada hasta Guardar">Crear proceso</button><button type="button" className="rama-mas" onClick={() => reabrir(p)}>quitar «aceptada»</button></>}
                    </td>
                  </tr>
                );
              })}</tbody></table></div>
          )}
        </div>
      )}
    </section>
  );
}
// «Solicitudes de propuesta recibidas» (2026-11-27): busca en el correo de Gerencia los correos que piden una propuesta de honorarios; «Usar esta solicitud» llena el formulario con lo que dice el correo y,
// al crear el correo, la propuesta se deja como RESPUESTA en ese mismo hilo (borrador, nunca se envía sola).
function SolicitudesRecibidas({ liveMode, notify, onUsar, seleccionada }){
  const [abierta, setAbierta] = useState(false);
  const [lista, setLista] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [usando, setUsando] = useState('');
  const [error, setError] = useState('');
  async function buscar(){
    if(!liveMode){ notify?.('En el modo demo no hay buzón de Gerencia.', 'info'); return; }
    setCargando(true); setError('');
    try{
      const d = new Date(); d.setDate(d.getDate() - 45);
      const desde = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const todos = await leerCorreosBandeja(CORREO_GERENCIA_ACCESO || 'gerencia@lexaraabogados.com', desde);
      setLista(todos.filter(m => esSolicitudDePropuesta(m.asunto, m.resumen, m.remitente)));
    }catch(err){ console.error(err); setError(mensajeError(err)); }
    finally{ setCargando(false); }
  }
  useEffect(() => { if(abierta && lista === null) buscar(); }, [abierta]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function usar(m){
    setUsando(m.id);
    try{
      const texto = await leerCuerpoCorreo(CORREO_GERENCIA_ACCESO || 'gerencia@lexaraabogados.com', m.id, 15000);
      const datos = extraerDatosSolicitud({ asunto: m.asunto, texto: texto || m.resumen, remitente: m.remitente, remitenteNombre: m.remitenteNombre, cc: [] });
      onUsar(datos, m);
    }catch(err){ notify?.('No se pudo leer el correo: ' + mensajeError(err), 'error'); }
    finally{ setUsando(''); }
  }
  const dma = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
  return (
    <section className="rama-seccion" style={{ margin: '0 0 16px' }}>
      <button type="button" className="cob-cab" onClick={() => setAbierta(v => !v)} aria-expanded={abierta}>
        <strong>Solicitudes de propuesta recibidas</strong>{lista && <span className={'badge ' + (lista.length ? 'badge-naranja' : 'badge-verde')}>{lista.length}</span>}
        <span className="cob-mas">{abierta ? 'ocultar' : 'ver'}</span>
      </button>
      {abierta && (
        <div style={{ marginTop: 8 }}>
          <p className="rama-res-suave" style={{ margin: '0 0 8px' }}>Correos de los últimos 45 días en Gerencia donde un cliente pide una propuesta de honorarios. «Usar esta solicitud» llena el formulario con lo que dice el correo (quién lo pide, su cargo, el proceso y las partes); <strong>revíselo y corríjalo</strong>. Al crear el correo, la propuesta queda como <strong>respuesta en ese mismo hilo</strong>, como borrador: no se envía sola.</p>
          <div style={{ marginBottom: 8 }}><button type="button" className="btn-secondary rama-btn" onClick={buscar} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar de nuevo'}</button></div>
          {error && <div className="rama-error" role="alert"><strong>No se pudo leer el correo.</strong> {error}</div>}
          {lista && lista.length === 0 && <div className="empty-state empty-state-compact">No encontré solicitudes de propuesta en los últimos 45 días.</div>}
          {lista && lista.length > 0 && (
            <div className="table-wrap"><table className="rama-tabla"><thead><tr><th>Recibido</th><th>De</th><th>Asunto</th><th></th></tr></thead>
              <tbody>{lista.map(m => (
                <tr key={m.id} className={seleccionada && seleccionada.id === m.id ? 'rama-importante' : ''}>
                  <td className="rama-fecha">{dma(m.fecha)}</td><td>{m.remitenteNombre || m.remitente}</td>
                  <td className="rama-nota"><strong>{m.asunto}</strong><br /><span className="rama-res-suave">{m.resumen.slice(0, 150)}{m.resumen.length > 150 ? '…' : ''}</span></td>
                  <td className="rama-acc">
                    <button type="button" className="rama-btn rama-btn--crear" onClick={() => usar(m)} disabled={!!usando}>{usando === m.id ? 'Leyendo…' : (seleccionada && seleccionada.id === m.id ? 'Volver a llenar' : 'Usar esta solicitud')}</button>
                    {m.enlace && <a className="btn-secondary rama-btn" href={m.enlace} target="_blank" rel="noopener noreferrer">Abrir correo</a>}
                  </td>
                </tr>
              ))}</tbody></table></div>
          )}
        </div>
      )}
    </section>
  );
}
function bytesDeBase64(b64){ const bin = atob(b64); const u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export default function PropuestaServiciosTab({ clientes, liveMode, notify, config, canWrite = true, onCrearProceso }){
  const [f, setF] = useState(inicial);
  const [editado, setEditado] = useState({ asunto: null, presentacion: null, concepto: null, servicios: null });   // texto escrito a mano (null = el automático)
  const [ocupado, setOcupado] = useState('');
  const [solicitud, setSolicitud] = useState(null);   // correo de solicitud al que se va a responder: { id, conversacion, asunto, remitenteNombre, fecha }
  const poner = (campo, valor) => setF(prev => ({ ...prev, [campo]: valor }));

  const listaClientes = useMemo(() => (clientes || []).map(c => String(c.RazonSocial || c.Nombre || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')), [clientes]);
  const asuntoAuto = textoAsunto({ entidad: f.entidad, rol: f.rol, vinculada: f.vinculada, tipoProceso: f.tipoProceso, numeroProceso: f.numeroProceso, demandante: f.demandante, demandado: f.demandado, despacho: f.despacho });
  const presentacionAuto = textoPresentacion({ entidad: f.entidad, rolFrase: f.rol, vinculada: f.vinculada });
  const asunto = editado.asunto ?? asuntoAuto;
  const presentacion = editado.presentacion ?? presentacionAuto;
  const concepto = editado.concepto ?? conceptoPorDefecto(f.entidadCorta);
  const servicios = editado.servicios ?? serviciosPorDefecto(f.entidadCorta);
  const totalSalarios = f.honorarios.reduce((s, h) => s + (Number(String(h.salarios).replace(',', '.')) || 0), 0);

  // Lo que recibe el generador del PDF.
  const datos = { ...f, asunto, presentacion, concepto, servicios, saludo: SALUDOS[f.tratamiento], atteNombre: f.atteNombre ? (f.tratamiento === 'Señores' ? '' : f.tratamiento + ' ') + f.atteNombre : '' };

  // Aliansalud o el grupo Colmédica: quedan llenos los datos de siempre (Dra. Yessica Bernal, su cargo y su correo). Si luego se elige otro cliente, se borran solo si siguen siendo esos mismos (no se pisa lo escrito a mano).
  function elegirCliente(valor){
    if(!valor || valor === '__otro__'){ setF(prev => ({ ...prev, clienteSel: valor })); return; }
    const pre = contactoPredeterminado(valor);
    setF(prev => {
      const eraPredeterminado = prev.atteNombre === CONTACTO_GRUPO_COLMEDICA.atteNombre;
      const base = { ...prev, clienteSel: valor, entidad: valor.toUpperCase() };
      if(pre) return { ...base, tratamiento: pre.tratamiento, atteNombre: pre.atteNombre, atteCargo: pre.atteCargo, correoPara: pre.correo, entidadCorta: pre.corta };
      return eraPredeterminado ? { ...base, atteNombre: '', atteCargo: '', correoPara: '', entidadCorta: 'la entidad' } : base;
    });
  }
  function cambiarFila(i, cambios){ setF(prev => ({ ...prev, honorarios: prev.honorarios.map((h, j) => j === i ? { ...h, ...cambios } : h) })); }
  function elegirEtapa(i, etapa){ cambiarFila(i, { etapa, frase: FRASE_ETAPA[etapa] || '' }); }
  function cambiarServicio(i, cambios){ setEditado(prev => ({ ...prev, servicios: servicios.map((s, j) => j === i ? { ...s, ...cambios } : s) })); }

  function usarSolicitud(d, m){
    const cli = listaClientes.find(n => d.entidad && n.toLowerCase().includes(String(d.entidad).split(' ')[0].toLowerCase())) || '';
    setF(prev => ({
      ...prev, clienteSel: cli || prev.clienteSel, entidad: d.entidad || prev.entidad, entidadCorta: d.entidadCorta || prev.entidadCorta, tratamiento: d.tratamiento || prev.tratamiento,
      atteNombre: d.atteNombre || prev.atteNombre, atteCargo: d.atteCargo || prev.atteCargo, correoPara: d.correoPara || prev.correoPara,
      tipoProceso: d.tipoProceso || prev.tipoProceso, numeroProceso: d.numeroProceso || prev.numeroProceso, demandante: d.demandante || prev.demandante, demandado: d.demandado || prev.demandado, rol: d.rol || prev.rol,
    }));
    setEditado(prev => ({ ...prev, asunto: null, presentacion: null }));
    setSolicitud({ id: m.id, conversacion: m.conversacion || '', asunto: m.asunto, remitenteNombre: m.remitenteNombre || m.remitente, fecha: m.fecha });
    notify?.('Formulario llenado con la solicitud de ' + (m.remitenteNombre || m.remitente) + '. Revise los datos antes de crear el correo.', 'success');
  }
  function validar(){
    if(!String(f.entidad).trim()){ notify?.('Escribe o elige la entidad a la que va dirigida la propuesta.', 'error'); return false; }
    if(!f.honorarios.some(h => Number(String(h.salarios).replace(',', '.')) > 0)){ notify?.('Agrega al menos una etapa de honorarios con su número de salarios.', 'error'); return false; }
    return true;
  }
  async function descargar(){
    if(!validar()) return;
    setOcupado('pdf');
    try{ const nombre = await generarPropuestaPDF(datos); notify?.('Propuesta descargada: ' + nombre, 'success'); }
    catch(err){ console.error(err); notify?.('No se pudo generar el PDF: ' + mensajeError(err), 'error'); }
    finally{ setOcupado(''); }
  }
  async function verPrevia(){
    if(!validar()) return;
    setOcupado('previa');
    try{ const url = await propuestaComoURL(datos); window.open(url, '_blank', 'noopener'); }
    catch(err){ console.error(err); notify?.('No se pudo generar la vista previa: ' + mensajeError(err), 'error'); }
    finally{ setOcupado(''); }
  }
  async function crearCorreo(){
    if(!validar()) return;
    if(!getAccount()){ notify?.('El borrador se crea en el Outlook de Gerencia al iniciar sesión con Microsoft; en el modo demo no hay buzón. Puedes descargar el PDF.', 'info'); return; }
    setOcupado('correo');
    try{
      const [adjunto, firma] = await Promise.all([propuestaComoAdjunto(datos), firmaComoImagenInline('gerencia').catch(() => null)]);
      const ent = String(f.entidad).trim();
      // Copia del PDF en «Administración Lexara → ADMINISTRACION → Propuestas» con su número (PS-AAAA-NNN); el adjunto del correo lleva el mismo nombre. Si no se puede guardar la copia, el borrador igual se crea.
      let copia = null, avisoCopia = '';
      if(liveMode){
        try{
          copia = await guardarCopiaPropuesta(config, {
            cliente: ent, fechaISO: f.fecha || HOY(), bytes: bytesDeBase64(adjunto.base64),
            datos: { cliente: f.clienteSel, entidad: ent, entidadCorta: f.entidadCorta, correoPara: f.correoPara, tipoProceso: f.tipoProceso, numeroProceso: f.numeroProceso, demandante: f.demandante, demandado: f.demandado, despacho: f.despacho, rol: f.rol, honorarios: f.honorarios, solicitudId: solicitud ? solicitud.id : '', conversacion: solicitud ? solicitud.conversacion : '', solicitudAsunto: solicitud ? solicitud.asunto : '', solicitante: solicitud ? solicitud.remitenteNombre : '' },
          });
          adjunto.nombre = copia.nombre;
        }catch(err){ console.error(err); avisoCopia = ' (No se pudo guardar la copia en Propuestas: ' + mensajeError(err) + ')'; }
      }
      const asuntoCorreo = `Propuesta de servicios profesionales – ${ent}${f.numeroProceso ? ' – proceso ' + f.numeroProceso : ''}`;
      const proceso = f.numeroProceso ? ` en el proceso ${f.tipoProceso ? f.tipoProceso.toLowerCase() + ' ' : ''}No. ${f.numeroProceso}` : '';
      const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const htmlBody = `<html><body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1c2624;">` +
        `<p>${esc(saludoCorreo(f.tratamiento, f.atteNombre))}</p>` +
        `<p>Adjuntamos la propuesta de prestación de servicios profesionales para la representación judicial de ${esc(ent)}${esc(proceso)}.</p>` +
        `<p>Quedamos atentos a sus comentarios.</p><p>Cordial saludo,</p>` + (firma ? firmaHtml('gerencia', 'cid:' + firma.cid) : '') + `</body></html>`;
      if(solicitud){
        // Respuesta en el MISMO hilo de la solicitud (borrador en Gerencia; conserva asunto y destinatarios, que son quien pidió y quienes iban con copia).
        try{
          const htmlAntes = htmlBody.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
          const rr = await crearRespuestaBorrador({ buzon: CORREO_GERENCIA_ACCESO, mensajeId: solicitud.id, htmlAntes, imagenes: firma ? [firma] : [], adjuntos: [adjunto], categorias: ['Propuesta de servicios (borrador)'] });
          if(copia && (rr.conversationId || solicitud.conversacion)) actualizarPropuesta(config, copia.numero, { conversacion: rr.conversationId || solicitud.conversacion }).catch(e => console.error(e));
          notify?.('✓ Respuesta creada en los Borradores de ' + CORREO_GERENCIA_ACCESO + ' dentro del hilo «' + solicitud.asunto + '», con la propuesta adjunta. Revísela y envíela.' + (copia ? ' Copia guardada en ADMINISTRACION/Propuestas como ' + copia.numero + '.' : '') + avisoCopia + (rr.imagenesFallidas && rr.imagenesFallidas.length ? ' (No se pudo poner la firma como imagen.)' : ''), 'success');
          return;
        }catch(err){ console.error(err); notify?.('No se pudo crear la respuesta en el hilo (' + mensajeError(err) + '). Se crea un correo nuevo con la propuesta.', 'info'); }
      }
      const r = await crearBorradorConImagenesInline({ to: f.correoPara.trim() ? [f.correoPara.trim()] : [], subject: asuntoCorreo, htmlBody, imagenes: firma ? [firma] : [], adjuntos: [adjunto], categorias: ['Propuesta de servicios (borrador)'], buzon: CORREO_GERENCIA_ACCESO, caerAlBuzonPropio: true });
      if(copia && r.conversationId) actualizarPropuesta(config, copia.numero, { conversacion: r.conversationId }).catch(e => console.error(e));
      notify?.(r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + CORREO_GERENCIA_ACCESO + '. Quedó en TUS Borradores con la propuesta adjunta: revísalo y cambia el «De» a Gerencia si tienes permiso.'
        : '✓ Borrador creado en los Borradores de ' + CORREO_GERENCIA_ACCESO + ' con la propuesta en PDF adjunta' + (f.correoPara.trim() ? ', dirigido a ' + f.correoPara.trim() : ' (sin destinatario: agrégalo)') + '. Revísalo y envíalo.' + (copia ? ' Copia guardada en ADMINISTRACION/Propuestas como ' + copia.numero + '.' : '') + avisoCopia, r.enBuzonPropio ? 'info' : 'success');
    }catch(err){ console.error(err); notify?.('No se pudo crear el borrador: ' + mensajeError(err), 'error'); }
    finally{ setOcupado(''); }
  }

  const Acciones = () => (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '6px 0 14px' }}>
      <IconTextButton icon="view" variant="secondary" onClick={verPrevia} disabled={!!ocupado}>{ocupado === 'previa' ? 'Preparando…' : 'Vista previa'}</IconTextButton>
      <IconTextButton icon="pdf" variant="primary" onClick={descargar} disabled={!!ocupado}>{ocupado === 'pdf' ? 'Generando…' : 'Descargar PDF'}</IconTextButton>
      <IconTextButton icon="mail" variant="primary" onClick={crearCorreo} disabled={!!ocupado}>{ocupado === 'correo' ? 'Creando borrador…' : 'Crear correo con la propuesta'}</IconTextButton>
    </div>
  );

  return (
    <div className="field-section">
      <SolicitudesRecibidas liveMode={liveMode} notify={notify} onUsar={usarSolicitud} seleccionada={solicitud} />
      {solicitud && <div className="rama-hist-aviso" style={{ marginBottom: 12 }}><span><strong>Esta propuesta responderá al correo «{solicitud.asunto}»</strong> de {solicitud.remitenteNombre}, en el mismo hilo (como borrador). <button type="button" className="rama-mas" onClick={() => setSolicitud(null)}>no responder a ese correo, crear uno nuevo</button></span></div>}
      <PropuestasEnviadas config={config} liveMode={liveMode} notify={notify} canWrite={canWrite} clientes={clientes} onCrearProceso={onCrearProceso} />
      <p className="rama-fuente">Arma la propuesta de servicios profesionales con el modelo de la última (Aliansalud 2026-00062): carta, portafolio, honorarios por etapas, condiciones, clientes, equipo de trabajo y firma de la representante legal. Como es una propuesta, no se necesitan datos de un proceso del portal: elige el cliente de la lista o escribe otra entidad, y llena el proceso y las partes que se conozcan. Todos los textos se pueden ajustar.</p>
      {Acciones()}

      {/* La propuesta se arma sobre el papel membretado de Lexara, como si se escribiera en el Word: tres hojas (carta y proceso · servicios y honorarios · clientes, equipo y cierre). Los campos son los mismos de siempre. */}
      <div className="prop-mesa">
      <div className="prop-marco"><div className="prop-rotulo">Hoja 1 de 3 · Carta y proceso</div><div className="prop-hoja" style={{ '--membrete': `url(${membrete})` }}>
      <h4 style={{ marginTop: 22 }}>1. A quién va dirigida</h4>
      <div style={GRID}>
        <Campo etiqueta="Fecha de la carta"><input type="date" value={f.fecha} onChange={e => poner('fecha', e.target.value)} /></Campo>
        <Campo etiqueta="Cliente del portal" ayuda="Elige uno de la lista o «Otra entidad» para escribirla.">
          <select value={f.clienteSel} onChange={e => elegirCliente(e.target.value)}>
            <option value="">Selecciona…</option>
            {listaClientes.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__otro__">Otra entidad (fuera del portal)</option>
          </select>
        </Campo>
        <Campo etiqueta="Entidad (como sale en la carta)"><input type="text" value={f.entidad} onChange={e => poner('entidad', e.target.value)} placeholder="Ej. ALIANSALUD EPS" /></Campo>
        <Campo etiqueta="Cómo la llamamos en el texto" ayuda="Ej. «la EPS», «la compañía», «la entidad».">
          <input type="text" value={f.entidadCorta} onChange={e => poner('entidadCorta', e.target.value)} />
        </Campo>
        <Campo etiqueta="Tratamiento">
          <select value={f.tratamiento} onChange={e => poner('tratamiento', e.target.value)}><option>Dra.</option><option>Dr.</option><option>Señores</option></select>
        </Campo>
        <Campo etiqueta="Atención de (nombre)"><input type="text" value={f.atteNombre} onChange={e => poner('atteNombre', e.target.value)} placeholder="Ej. Yessica Paola Bernal Saavedra" /></Campo>
        <Campo etiqueta="Cargo"><input type="text" value={f.atteCargo} onChange={e => poner('atteCargo', e.target.value)} placeholder="Ej. Abogada Senior de Asuntos Judiciales y Entes de Control" /></Campo>
        <Campo etiqueta="Correo de destino (opcional)" ayuda="Solo para el borrador de correo."><input type="email" value={f.correoPara} onChange={e => poner('correoPara', e.target.value)} /></Campo>
      </div>

      <h4 style={{ marginTop: 22 }}>2. El proceso (opcional)</h4>
      <div style={GRID}>
        <Campo etiqueta="Tipo de proceso"><input type="text" list="tipos-proceso-propuesta" value={f.tipoProceso} onChange={e => poner('tipoProceso', e.target.value)} /><datalist id="tipos-proceso-propuesta">{TIPOS_PROCESO.map(t => <option key={t} value={t} />)}</datalist></Campo>
        <Campo etiqueta="Número del proceso"><input type="text" value={f.numeroProceso} onChange={e => poner('numeroProceso', e.target.value)} placeholder="Ej. 110013105006-2026-00062-00" /></Campo>
        <Campo etiqueta="Demandante"><input type="text" value={f.demandante} onChange={e => poner('demandante', e.target.value)} /></Campo>
        <Campo etiqueta="Demandado"><input type="text" value={f.demandado} onChange={e => poner('demandado', e.target.value)} /></Campo>
        <Campo etiqueta="Despacho judicial"><input type="text" value={f.despacho} onChange={e => poner('despacho', e.target.value)} placeholder="Ej. Juzgado Sexto Laboral del Circuito de Bogotá" /></Campo>
        <Campo etiqueta="Parte que representaremos">
          <select value={f.rol} onChange={e => poner('rol', e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: 13 }}><input type="checkbox" checked={f.vinculada} onChange={e => poner('vinculada', e.target.checked)} /> En caso de ser vinculada al proceso</label>
        </Campo>
      </div>
      <Campo etiqueta="Asunto" ayuda={editado.asunto !== null ? undefined : 'Se arma solo con los datos de arriba; puedes cambiarlo.'}>
        <textarea rows={3} value={asunto} onChange={e => setEditado(prev => ({ ...prev, asunto: e.target.value }))} />
        {editado.asunto !== null && <button type="button" className="rama-mas" onClick={() => setEditado(prev => ({ ...prev, asunto: null }))}>Volver al asunto automático</button>}
      </Campo>
      <Campo etiqueta="Texto de presentación" ayuda={editado.presentacion !== null ? undefined : 'Se arma solo con la entidad y la parte; puedes cambiarlo (un párrafo por línea en blanco).'}>
        <textarea rows={9} value={presentacion} onChange={e => setEditado(prev => ({ ...prev, presentacion: e.target.value }))} />
        {editado.presentacion !== null && <button type="button" className="rama-mas" onClick={() => setEditado(prev => ({ ...prev, presentacion: null }))}>Volver al texto automático</button>}
      </Campo>

      </div></div>
      <div className="prop-marco"><div className="prop-rotulo">Hoja 2 de 3 · Servicios y honorarios</div><div className="prop-hoja" style={{ '--membrete': `url(${membrete})` }}>
      <h4 style={{ marginTop: 22 }}>3. Portafolio de servicios</h4>
      {servicios.map((s, i) => (
        <div key={i} className="rama-resumen-card" style={{ marginBottom: 10 }}>
          <Campo etiqueta={`Servicio ${i + 1} (título)`}><input type="text" value={s.titulo} onChange={e => cambiarServicio(i, { titulo: e.target.value })} /></Campo>
          <Campo etiqueta="Descripción"><textarea rows={6} value={s.texto} onChange={e => cambiarServicio(i, { texto: e.target.value })} /></Campo>
          {servicios.length > 1 && <button type="button" className="rama-mas" onClick={() => setEditado(prev => ({ ...prev, servicios: servicios.filter((_, j) => j !== i) }))}>Quitar este servicio</button>}
        </div>
      ))}
      <button type="button" className="btn-secondary rama-btn" onClick={() => setEditado(prev => ({ ...prev, servicios: [...servicios, { titulo: '', texto: '' }] }))}>+ Agregar otro servicio</button>

      <h4 style={{ marginTop: 22 }}>4. Honorarios por etapas</h4>
      <p className="rama-res-suave">Las etapas son las mismas de las órdenes de compra y las facturas. Cada una lleva un número de salarios mínimos mensuales legales vigentes (puede ser 1, 1,5, 2…).</p>
      <Campo etiqueta="Concepto de los honorarios (frase «Por …, se pagará como honorarios…»)">
        <input type="text" value={concepto} onChange={e => setEditado(prev => ({ ...prev, concepto: e.target.value }))} />
      </Campo>
      <div className="table-wrap">
        <table className="rama-tabla">
          <thead><tr><th>Etapa</th><th>Cómo se escribe en la carta</th><th style={{ width: 110 }}>Salarios</th><th></th></tr></thead>
          <tbody>
            {f.honorarios.map((h, i) => (
              <tr key={i}>
                <td>
                  <select value={ETAPAS_POR_SALARIOS.includes(h.etapa) ? h.etapa : ''} onChange={e => elegirEtapa(i, e.target.value)}>
                    <option value="">Otra (escribir)</option>
                    {ETAPAS_POR_SALARIOS.map(e => <option key={e} value={e}>{etiquetaEtapa(e)}</option>)}
                  </select>
                </td>
                <td><input type="text" value={h.frase} onChange={e => cambiarFila(i, { frase: e.target.value })} placeholder="Ej. con la entrega del poder" style={{ width: '100%' }} /></td>
                <td><input type="number" min="0" step="0.5" value={h.salarios} onChange={e => cambiarFila(i, { salarios: e.target.value })} style={{ width: 90 }} /></td>
                <td><button type="button" className="rama-mas" onClick={() => setF(prev => ({ ...prev, honorarios: prev.honorarios.filter((_, j) => j !== i) }))}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
        <button type="button" className="btn-secondary rama-btn" onClick={() => setF(prev => ({ ...prev, honorarios: [...prev.honorarios, filaHonorarios('Contestacion', 1)] }))}>+ Agregar etapa</button>
        <strong>Total: {totalSalarios > 0 ? textoSalarios(totalSalarios, true) : '—'}</strong>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginBottom: 10 }}>
        <input type="checkbox" checked={f.cambioCompetencia} onChange={e => poner('cambioCompetencia', e.target.checked)} />
        Incluir el cobro adicional si el proceso cambia de competencia o de jurisdicción:
        <input type="number" min="0" step="0.5" value={f.cambioCompetenciaSalarios} onChange={e => poner('cambioCompetenciaSalarios', e.target.value)} style={{ width: 70 }} /> salario(s)
      </label>
      <Campo etiqueta="Condiciones contractuales (una por línea)"><textarea rows={7} value={f.condiciones} onChange={e => poner('condiciones', e.target.value)} /></Campo>

      </div></div>
      <div className="prop-marco"><div className="prop-rotulo">Hoja 3 de 3 · Clientes, equipo y cierre</div><div className="prop-hoja" style={{ '--membrete': `url(${membrete})` }}>
      <h4 style={{ marginTop: 22 }}>5. Nuestros clientes</h4>
      <Campo etiqueta="Una entidad por línea"><textarea rows={7} value={f.clientes} onChange={e => poner('clientes', e.target.value)} /></Campo>

      <h4 style={{ marginTop: 22 }}>6. Nuestro equipo de trabajo</h4>
      <p className="rama-res-suave">Los perfiles de la casa son los de la página web de Lexara; los externos quedan como en la última propuesta. Marca quién va en esta carta.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 6, marginBottom: 12 }}>
        {EQUIPO_LEXARA.map(m => (
          <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5 }}>
            <input type="checkbox" checked={!!f.equipo[m.id]} onChange={e => setF(prev => ({ ...prev, equipo: { ...prev.equipo, [m.id]: e.target.checked } }))} style={{ marginTop: 3 }} />
            <span><strong>{m.nombre}</strong> – {m.cargo}{m.externo ? <span className="rama-res-suave"> (externo)</span> : ''}</span>
          </label>
        ))}
      </div>

      <h4 style={{ marginTop: 22 }}>7. Cierre</h4>
      <Campo etiqueta="Texto de cierre (antes de «Cordial saludo» y la firma de la representante legal)"><textarea rows={4} value={f.cierre} onChange={e => poner('cierre', e.target.value)} /></Campo>

      </div></div>
      </div>

      {Acciones()}
    </div>
  );
}
