// Correo «Solicitud de acceso al expediente digital y reconocimiento de personería».
// Regla (2026-11-24, pedido del usuario): los procesos de lo contencioso administrativo (SAMAI) NO usan este correo —el acceso al expediente y el reconocimiento de personería se piden dentro de la
// propia SAMAI—; el correo es para los procesos de la jurisdicción ordinaria (laborales, etc.), donde el acceso al expediente digital se pide al despacho por correo. Ver esJurisdiccionOrdinaria en samai.js.
// El borrador se crea en el buzón de Gerencia (Mónica Paola Quintero Jiménez, apoderada principal) para que lo revise y lo envíe; NUNCA se envía solo. Los datos de la apoderada (cédula, tarjeta
// profesional, correo y teléfono) salen de FICHA_EMPRESA_MD (config.js), la misma ficha que usa la firma de los informes, para que el correo salga completo.
import { FICHA_EMPRESA_MD } from '../config';

export const CORREO_GERENCIA_ACCESO = FICHA_EMPRESA_MD.correo;
export const CATEGORIA_SOLICITUD_ACCESO = 'Solicitud de acceso al expediente';
export const APODERADA_PRINCIPAL = 'Mónica Paola Quintero Jiménez';
// «C.C. No. 40.039.240 de Tunja» y «T. P. No. 97.956 del C. S. de la J.» ya traen su rótulo completo.
export const DATOS_APODERADA = {
  nombre: APODERADA_PRINCIPAL,
  cc: FICHA_EMPRESA_MD.ccRepresentante,
  tp: FICHA_EMPRESA_MD.tarjetaProfesional,
  correo: FICHA_EMPRESA_MD.correo,
  telefono: FICHA_EMPRESA_MD.telefono,
};

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
 * `despacho`: el que informa la Rama (si no, el del proceso). Devuelve { asunto, html, para }. Solo lo que de verdad no se sabe (de qué lado actuamos) queda en blanco para completarlo.
 */
export function construirCorreoSolicitudAcceso({ proceso, radicado, despacho, srcFirma }){
  const p = proceso || {};
  const rad = radicadoConGuiones(radicado);
  const nombreDespacho = String(despacho || p.Despacho || '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
  const actuamos = String(p.ParteActuamos || '');
  const lado = /demandado/i.test(actuamos) ? 'demandada' : /demandante/i.test(actuamos) ? 'demandante' : '';
  const nuestraParte = lado === 'demandada' ? p.Demandado : lado === 'demandante' ? p.Demandante : '';
  const a = DATOS_APODERADA;
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
  <p style="margin:0 0 12px;">Yo, <strong>${esc(a.nombre)}</strong>, identificada con la ${esc(a.cc)} y abogada con ${esc(a.tp)}, actúo como apoderada de la parte ${lado || EN_BLANCO}${nuestraParte ? `, <strong>${esc(nuestraParte)}</strong>` : ''}, de acuerdo con el poder que obra en el proceso.</p>
  <p style="margin:0 0 6px;">De manera respetuosa solicito:</p>
  <ol style="margin:0 0 12px; padding-left:22px;">
    <li style="margin-bottom:4px;">Que se verifique y, de ser necesario, se <strong>reconozca mi personería</strong> como apoderada de la parte ${lado || EN_BLANCO} en este proceso.</li>
    <li>Que se me conceda <strong>acceso al expediente digital</strong>, compartiéndolo con mi correo electrónico <strong>${esc(a.correo)}</strong>, para consultar las actuaciones y los documentos que lo componen.</li>
  </ol>
  <p style="margin:0 0 12px;">Adjunto el poder y los documentos que acreditan mi calidad.</p>
  <p style="margin:0 0 4px;">Agradezco su atención.</p>
  <p style="margin:0;">Cordialmente,</p>
  ${srcFirma ? `<p style="margin:14px 0 0;"><img src="${srcFirma}" width="480" alt="${esc(a.nombre)}" style="display:block;border:0;width:480px;max-width:100%;height:auto;"></p>` : `<p style="margin:14px 0 0;"><strong>${esc(a.nombre)}</strong><br>${esc(a.cc)} · ${esc(a.tp)}<br>${esc(a.correo)} · ${esc(a.telefono)}</p>`}
</div>`;
  const correoDespacho = String(p.CorreoDespacho || '').split(/[;,\s]+/).map(c => c.trim()).filter(c => /^\S+@\S+\.\S+$/.test(c));
  return { asunto, html, para: correoDespacho };
}
