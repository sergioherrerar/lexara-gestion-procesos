import { useMemo, useState } from 'react';
import { IconTextButton } from './IconButton';
import { getAccount, crearBorradorConImagenesInline, firmaComoImagenInline, firmaHtml, mensajeError } from '../lib/graph';
import { CORREO_GERENCIA_ACCESO } from '../lib/solicitudAccesoExpediente';
import {
  EQUIPO_LEXARA, ETAPAS_POR_SALARIOS, FRASE_ETAPA, etiquetaEtapa, textoSalarios, textoAsunto, textoPresentacion, serviciosPorDefecto, conceptoPorDefecto,
  CONDICIONES_POR_DEFECTO, CLIENTES_POR_DEFECTO, CIERRE_POR_DEFECTO, generarPropuestaPDF, propuestaComoAdjunto, propuestaComoURL,
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

function Campo({ etiqueta, ayuda, children, ancho }){
  return <div className="field" style={ancho ? { gridColumn: 'span ' + ancho } : undefined}><label>{etiqueta}</label>{children}{ayuda && <div className="field-info" style={{ marginTop: 4 }}>{ayuda}</div>}</div>;
}
const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 12 };

export default function PropuestaServiciosTab({ clientes, liveMode, notify }){
  const [f, setF] = useState(inicial);
  const [editado, setEditado] = useState({ asunto: null, presentacion: null, concepto: null, servicios: null });   // texto escrito a mano (null = el automático)
  const [ocupado, setOcupado] = useState('');
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

  function elegirCliente(valor){
    if(valor && valor !== '__otro__') setF(prev => ({ ...prev, clienteSel: valor, entidad: valor.toUpperCase() }));
    else setF(prev => ({ ...prev, clienteSel: valor }));
  }
  function cambiarFila(i, cambios){ setF(prev => ({ ...prev, honorarios: prev.honorarios.map((h, j) => j === i ? { ...h, ...cambios } : h) })); }
  function elegirEtapa(i, etapa){ cambiarFila(i, { etapa, frase: FRASE_ETAPA[etapa] || '' }); }
  function cambiarServicio(i, cambios){ setEditado(prev => ({ ...prev, servicios: servicios.map((s, j) => j === i ? { ...s, ...cambios } : s) })); }

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
      const asuntoCorreo = `Propuesta de servicios profesionales – ${ent}${f.numeroProceso ? ' – proceso ' + f.numeroProceso : ''}`;
      const proceso = f.numeroProceso ? ` en el proceso ${f.tipoProceso ? f.tipoProceso.toLowerCase() + ' ' : ''}No. ${f.numeroProceso}` : '';
      const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const htmlBody = `<html><body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#1c2624;">` +
        `<p>${esc(SALUDOS[f.tratamiento])}</p>` +
        `<p>Adjuntamos la propuesta de prestación de servicios profesionales para la representación judicial de ${esc(ent)}${esc(proceso)}.</p>` +
        `<p>Quedamos atentos a sus comentarios.</p><p>Cordial saludo,</p>` + (firma ? firmaHtml('gerencia', 'cid:' + firma.cid) : '') + `</body></html>`;
      const r = await crearBorradorConImagenesInline({ to: f.correoPara.trim() ? [f.correoPara.trim()] : [], subject: asuntoCorreo, htmlBody, imagenes: firma ? [firma] : [], adjuntos: [adjunto], categorias: ['Propuesta de servicios (borrador)'], buzon: CORREO_GERENCIA_ACCESO, caerAlBuzonPropio: true });
      notify?.(r.enBuzonPropio
        ? '⚠ No pude crear el borrador en ' + CORREO_GERENCIA_ACCESO + '. Quedó en TUS Borradores con la propuesta adjunta: revísalo y cambia el «De» a Gerencia si tienes permiso.'
        : '✓ Borrador creado en los Borradores de ' + CORREO_GERENCIA_ACCESO + ' con la propuesta en PDF adjunta' + (f.correoPara.trim() ? ', dirigido a ' + f.correoPara.trim() : ' (sin destinatario: agrégalo)') + '. Revísalo y envíalo.', r.enBuzonPropio ? 'info' : 'success');
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
      <p className="rama-fuente">Arma la propuesta de servicios profesionales con el modelo de la última (Aliansalud 2026-00062): carta, portafolio, honorarios por etapas, condiciones, clientes, equipo de trabajo y firma de la representante legal. Como es una propuesta, no se necesitan datos de un proceso del portal: elige el cliente de la lista o escribe otra entidad, y llena el proceso y las partes que se conozcan. Todos los textos se pueden ajustar.</p>
      {Acciones()}

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

      {Acciones()}
    </div>
  );
}
