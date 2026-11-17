// Correo «Solicitud de acceso al expediente digital y reconocimiento de personería» (2026-11-17, pedido del usuario): en SAMAI, la cuenta del apoderado solo ve los documentos públicos de un
// expediente mientras el despacho no le haya reconocido personería / dado el acceso de sujeto procesal (caso visto: 1 de 11 documentos en el Consejo de Estado). El borrador se crea en el
// buzón de Gerencia (Mónica Paola Quintero Jiménez, apoderada principal) para que lo revise y lo envíe; NUNCA se envía solo.
import { FICHA_EMPRESA_MD } from '../config';

export const CORREO_GERENCIA_ACCESO = FICHA_EMPRESA_MD.correo;
export const CATEGORIA_SOLICITUD_ACCESO = 'Solicitud de acceso al expediente';
export const APODERADA_PRINCIPAL = 'Mónica Paola Quintero Jiménez';

function esc(t){ return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const soloDigitos = v => String(v || '').replace(/\D/g, '');
const EN_BLANCO = '______';

/** 25000234100020200027601 → 25000-23-41-000-2020-00276-01 */
export function radicadoConGuiones(radicado){
  const d = soloDigitos(radicado);
  if(d.length !== 23) return String(radicado || '');
  return [d.slice(0, 5), d.slice(5, 7), d.slice(7, 9), d.slice(9, 12), d.slice(12, 16), d.slice(16, 21), d.slice(21, 23)].join('-');
}

/**
 * Arma el borrador. `proceso`: el registro del proceso (Demandante, Demandado, ParteActuamos, TipoProceso, Despacho, CorreoDespacho…); `radicado`: el número de 23 dígitos que se está consultando;
 * `despacho`: el que informa la Rama / SAMAI (si no, el del proceso). Devuelve { asunto, html, para }. Lo que no se sabe (cédula, tarjeta profesional) queda en blanco para completarlo.
 */
export function construirCorreoSolicitudAcceso({ proceso, radicado, despacho, srcFirma }){
  const p = proceso || {};
  const rad = radicadoConGuiones(radicado);
  const nombreDespacho = String(despacho || p.Despacho || '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
  const actuamos = String(p.ParteActuamos || '');
  const lado = /demandado/i.test(actuamos) ? 'demandada' : /demandante/i.test(actuamos) ? 'demandante' : '';
  const nuestraParte = lado === 'demandada' ? p.Demandado : lado === 'demandante' ? p.Demandante : '';
  const asunto = `Solicitud de acceso al expediente digital y reconocimiento de personería – Radicado ${rad}`;
  const fila = (k, v) => v ? `<tr><td style="padding:3px 12px 3px 0; color:#5b6866; white-space:nowrap; vertical-align:top;">${k}</td><td style="padding:3px 0;"><strong>${esc(v)}</strong></td></tr>` : '';
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:760px; font-size:14.5px; line-height:1.55;">
  <p style="margin:0 0 14px;">Señores<br><strong>${esc(nombreDespacho || 'Despacho judicial')}</strong></p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px; font-size:14px;">
    ${fila('Referencia', p.TipoProceso)}
    ${fila('Radicado', rad)}
    ${fila('Demandante', p.Demandante)}
    ${fila('Demandado', p.Demandado)}
  </table>
  <p style="margin:0 0 12px;">Respetados señores:</p>
  <p style="margin:0 0 12px;">Yo, <strong>${esc(APODERADA_PRINCIPAL)}</strong>, identificada con la C.C. ${EN_BLANCO} y abogada con T.P. ${EN_BLANCO} del C.S. de la J., actúo como apoderada de la parte ${lado || EN_BLANCO}${nuestraParte ? `, <strong>${esc(nuestraParte)}</strong>` : ''}, de acuerdo con el poder que obra en el proceso.</p>
  <p style="margin:0 0 12px;">Al ingresar a SAMAI con mi usuario para consultar el expediente digital, el sistema me muestra únicamente los documentos públicos (nivel de acceso «Público logeado») y no los demás documentos que lo componen, a los que tengo derecho como sujeto procesal.</p>
  <p style="margin:0 0 6px;">Por lo anterior, de manera respetuosa solicito:</p>
  <ol style="margin:0 0 12px; padding-left:22px;">
    <li style="margin-bottom:4px;">Que se verifique y, de ser necesario, se <strong>reconozca mi personería</strong> como apoderada de la parte ${lado || EN_BLANCO} en este proceso.</li>
    <li>Que se asigne a mi usuario de SAMAI el <strong>nivel de acceso de sujeto procesal</strong> para este expediente.</li>
  </ol>
  <p style="margin:0 0 12px;">Adjunto el poder y los documentos que acreditan mi calidad.</p>
  <p style="margin:0 0 4px;">Agradezco su atención.</p>
  <p style="margin:0;">Cordialmente,</p>
  ${srcFirma ? `<p style="margin:14px 0 0;"><img src="${srcFirma}" width="480" alt="${esc(APODERADA_PRINCIPAL)}" style="display:block;border:0;width:480px;max-width:100%;height:auto;"></p>` : `<p style="margin:14px 0 0;"><strong>${esc(APODERADA_PRINCIPAL)}</strong><br>C.C. ${EN_BLANCO} · T.P. ${EN_BLANCO}</p>`}
</div>`;
  const correoDespacho = String(p.CorreoDespacho || '').split(/[;,\s]+/).map(c => c.trim()).filter(c => /^\S+@\S+\.\S+$/.test(c));
  return { asunto, html, para: correoDespacho };
}
