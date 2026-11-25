import { useEffect, useState } from 'react';
import { DATOS_APODERADA, radicadoConGuiones } from '../lib/solicitudAccesoExpediente';
import { URL_SOLICITUD_ACCESO_SAMAI } from '../lib/samai';
import { htmlRenglones, fechaDMA } from '../lib/ramaJudicial';

// «Solicitar acceso en SAMAI» (2026-11-26, pedido del usuario: «cómo podemos solicitar acceso al expediente por la página directamente al proceso»). En lo contencioso administrativo el acceso al
// expediente se pide en la Ventanilla Virtual del Consejo de Estado (formulario «Solicitud de acceso a expedientes en SAMAI»), no por correo. Esa página no recibe datos por la dirección, así que aquí
// se dejan LISTOS PARA COPIAR todos los datos que pide el formulario (los de la apoderada principal y los del proceso) y los pasos en orden. Lo que exige a la persona (aceptar los términos y datos
// personales, el captcha, adjuntar la cédula y enviar) lo hace ella en la página oficial: el portal no envía nada.
const solo = v => String(v || '').replace(/\D/g, '');
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function copiarTexto(texto){
  try{ await navigator.clipboard.writeText(texto); return true; }
  catch(e){
    try{ const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok; }catch(e2){ return false; }
  }
}
function Dato({ etiqueta, valor, ayuda, notify }){
  const [copiado, setCopiado] = useState(false);
  async function copiar(){
    const ok = await copiarTexto(String(valor || ''));
    if(ok){ setCopiado(true); setTimeout(() => setCopiado(false), 1600); } else notify?.('No se pudo copiar solo. Dato: ' + valor, 'info');
  }
  return (
    <div className="acc-dato">
      <div className="acc-dato-txt"><span className="acc-et">{etiqueta}</span><strong>{valor || <em className="rama-res-suave">elíjalo en el formulario</em>}</strong>{ayuda && <small className="rama-res-suave">{ayuda}</small>}</div>
      {valor ? <button type="button" className={'rama-btn rama-btn--hist' + (copiado ? ' acc-copiado' : '')} onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar'}</button> : null}
    </div>
  );
}

// Aviso con lo que SAMAI ya dejó en las actuaciones sobre el acceso de la apoderada (o lo que se anotó al presentarla desde el portal).
function AvisoAcceso({ acceso }){
  if(!acceso || acceso.estado === 'ninguna') return null;
  const mensajes = {
    autorizada: ['acc-aviso acc-aviso--ok', 'Ya tiene acceso a este proceso en SAMAI.'],
    vinculada: ['acc-aviso acc-aviso--ok', 'Ya tiene acceso a este proceso en SAMAI: aparece radicando memoriales por el sistema.'],
    solicitada: ['acc-aviso acc-aviso--pend', 'La solicitud ya se presentó y está pendiente. SAMAI no deja repetirla hasta que la Secretaría la tramite.'],
    negada: ['acc-aviso acc-aviso--mal', 'SAMAI NO autorizó el acceso. Corrija el motivo y vuelva a solicitarlo.'],
  }[acceso.estado];
  return (
    <div className={mensajes[0]} role="status">
      <strong>{mensajes[1]}</strong>
      {acceso.fecha && <span> Fecha: {fechaDMA(acceso.fecha)}{acceso.solicitud ? ' · solicitud No. ' + acceso.solicitud : ''}.</span>}
      {acceso.estado === 'negada' && acceso.motivo && <span> Motivo: «{acceso.motivo}»</span>}
      {(acceso.estado === 'autorizada' || acceso.estado === 'vinculada') && <span> No necesita pedirlo otra vez; los datos de abajo quedan por si hace falta.</span>}
    </div>
  );
}

export default function SolicitudAccesoSamaiModal({ acceso, proceso, radicado, despacho, notify, canWrite, onAgregarAlHistorico, onCerrar }){
  const [numero, setNumero] = useState('');
  useEffect(() => {
    const f = e => { if(e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);

  const p = proceso || {};
  const a = DATOS_APODERADA;
  const rad = solo(radicado);
  const actuamos = String(p.ParteActuamos || '');
  const lado = /demandado/i.test(actuamos) ? 'demandada' : /demandante/i.test(actuamos) ? 'demandante' : '';
  const nuestraParte = lado === 'demandada' ? p.Demandado : lado === 'demandante' ? p.Demandante : '';
  const cc = solo(a.cc), tp = solo(a.tp);
  const nombreDespacho = String(despacho || p.Despacho || '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
  const todo = [
    `Número de radicación: ${rad}`,
    `Nombre completo: ${a.nombre}`,
    `Documento: cédula de ciudadanía ${cc}`,
    `Correo electrónico: ${a.correo}`,
    `Teléfono de contacto: ${a.telefono}`,
    `Vinculación: apoderada${lado ? ' de la parte ' + lado : ''}${nuestraParte ? ' (' + nuestraParte + ')' : ''}`,
    `Tarjeta profesional: ${tp}`,
  ].join('\n');

  async function abrir(){
    const ok = await copiarTexto(rad);
    window.open(URL_SOLICITUD_ACCESO_SAMAI, '_blank', 'noopener,noreferrer');
    notify?.(ok ? 'Se abrió el formulario de SAMAI y se copió el radicado ' + rad + '. Acepte los términos, resuelva el captcha y siga los pasos de esta ventana.' : 'Se abrió el formulario de SAMAI. Copie el radicado con el botón de esta ventana.', 'success');
  }
  function anotar(){
    if(!onAgregarAlHistorico) return;
    const nota = 'Solicitud de acceso al expediente en SAMAI presentada por ' + a.nombre + (numero.trim() ? ' (solicitud No. ' + numero.trim() + ')' : '') + '; queda pendiente la respuesta de la Secretaría al correo ' + a.correo;
    onAgregarAlHistorico(htmlRenglones([{ fecha: hoyISO(), actuacion: nota, anotacion: '' }]));
    notify?.('Se agregó el renglón al Histórico. Presione «Guardar cambios» para guardarlo.', 'success');
    onCerrar();
  }

  return (
    <div className="confirm-overlay" onClick={e => { if(e.target === e.currentTarget) onCerrar(); }}>
      <div className="rama-modal acc-modal" role="dialog" aria-modal="true" aria-label="Solicitar acceso al expediente en SAMAI">
        <h4>Solicitar acceso al expediente en SAMAI</h4>
        <p className="rama-res-suave">Proceso <strong>{radicadoConGuiones(rad)}</strong>{nombreDespacho ? ' · ' + nombreDespacho : ''}. En lo contencioso administrativo el acceso se pide en la Ventanilla Virtual del Consejo de Estado, no por correo. El formulario no recibe datos por la dirección: aquí están todos listos para copiar y pegar. <strong>Usted acepta los términos, resuelve el captcha, adjunta la cédula y envía</strong>: el portal no envía nada por usted.</p>
        <AvisoAcceso acceso={acceso} />
        <div className="acc-acciones">
          <button type="button" className="rama-btn rama-btn--crear" onClick={abrir}>Abrir el formulario y copiar el radicado ↗</button>
          <button type="button" className="rama-btn rama-btn--hist" onClick={async () => { const ok = await copiarTexto(todo); notify?.(ok ? 'Se copiaron todos los datos.' : 'No se pudo copiar.', ok ? 'success' : 'info'); }}>Copiar todos los datos</button>
        </div>

        <h5>Datos para el formulario</h5>
        <div className="acc-datos">
          <Dato etiqueta="Número único de radicación (23 dígitos)" valor={rad} ayuda="Después presione «Buscar radicación» y compruebe que salgan el demandante y la clase de proceso correctos." notify={notify} />
          <Dato etiqueta="Tipo de documento" valor="Cédula de ciudadanía" notify={notify} />
          <Dato etiqueta="Número de documento" valor={cc} notify={notify} />
          <Dato etiqueta="Nombre completo" valor={a.nombre} ayuda="Igual a la cédula; el registro posterior en SAMAI debe coincidir exactamente." notify={notify} />
          <Dato etiqueta="Correo electrónico" valor={a.correo} ayuda="SAMAI solo permite un correo por número de documento." notify={notify} />
          <Dato etiqueta="Teléfono de contacto" valor={a.telefono} notify={notify} />
          <Dato etiqueta="Vinculación con el proceso" valor="Apoderada" ayuda="Elija la opción de apoderado o apoderada judicial." notify={notify} />
          <Dato etiqueta="Parte que representa" valor={nuestraParte} ayuda={lado ? 'Parte ' + lado + '.' : 'En el proceso no está marcado si actuamos con el demandante o con el demandado.'} notify={notify} />
          <Dato etiqueta="Tarjeta profesional" valor={tp} notify={notify} />
        </div>
        {(p.Demandante || p.TipoProceso) && <p className="rama-res-suave">Al «Buscar radicación» debe aparecer: {p.Demandante ? <>demandante <strong>{p.Demandante}</strong></> : null}{p.Demandante && p.TipoProceso ? ' · ' : ''}{p.TipoProceso ? <>clase <strong>{p.TipoProceso}</strong></> : null}.</p>}

        <h5>Paso a paso</h5>
        <ol className="acc-pasos">
          <li>Abra el formulario con el botón de arriba. Lea y marque la aceptación de términos y datos personales, y resuelva el captcha.</li>
          <li>En «Datos básicos del solicitante» pegue el tipo y número de documento, el nombre, el correo y el teléfono.</li>
          <li>Pegue el número de radicación, presione «Buscar radicación» y compruebe el demandante y la clase de proceso.</li>
          <li>Elija la vinculación (apoderada), la parte que representa y la tarjeta profesional, y presione «Añadir esta radicación». Si son varios procesos, repita el paso 3 y 4 con cada uno.</li>
          <li>Adjunte un PDF con la <strong>cédula de la Dra. Mónica por ambas caras</strong>, revise los procesos añadidos y presione «Enviar formulario». <strong>Anote el número de solicitud</strong> que muestra la página.</li>
          <li>La Secretaría verifica que sea apoderada y responde al correo {a.correo}. Si el expediente está «al Despacho» pueden negarla y hay que presentarla de nuevo; si ya hay una solicitud sin tramitar en ese proceso, el sistema no deja repetirla.</li>
          <li>Cuando la autoricen en el primer proceso, hay que registrarse una sola vez en SAMAI como «usuario nuevo», con los mismos datos de arriba.</li>
        </ol>

        {canWrite && onAgregarAlHistorico && (
          <div className="acc-anotar">
            <h5>Dejar constancia en el Histórico</h5>
            <div className="acc-fila">
              <input type="text" value={numero} onChange={e => setNumero(e.target.value)} placeholder="Número de solicitud (opcional)" aria-label="Número de solicitud" />
              <button type="button" className="rama-btn rama-btn--crear" onClick={anotar}>Anotar en el Histórico</button>
            </div>
            <small className="rama-res-suave">Agrega un renglón al Histórico del proceso; se guarda con «Guardar cambios».</small>
          </div>
        )}
        <div className="confirm-actions"><button type="button" className="btn-secondary" onClick={onCerrar}>Cerrar</button></div>
      </div>
    </div>
  );
}
