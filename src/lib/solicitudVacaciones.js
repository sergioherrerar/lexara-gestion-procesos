// Solicitud de vacaciones (2026-10-29, pedido del usuario): el colaborador la llena en Informes → «Solicitud de vacaciones» (como las Horas Extras), el portal
// guarda el período en la lista «Vacaciones» con Aprobación pendiente y envía un correo DESDE el usuario que la crea, Para Gerencia y con copia a Soporte, con los datos
// elegidos. La aprobación se da en Administración → Vacaciones.
import { festivosColombia } from './horasExtras';
import { FICHA_EMPRESA_MD } from '../config';

export const CORREO_GERENCIA = FICHA_EMPRESA_MD.correo;
export const CORREO_SOPORTE = 'soporte@lexaraabogados.com';

function aISO(d){ return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function deISO(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function esHabil(d){
  const dia = d.getDay();
  return dia !== 0 && dia !== 6 && !festivosColombia(d.getFullYear()).has(aISO(d));
}

// Días hábiles (lunes a viernes, sin festivos de Colombia) entre dos fechas, ambas incluidas. Es la forma en que ya están contadas las vacaciones del historial
// (p. ej. 15 al 19 de agosto = 5 días). Es solo una sugerencia: el campo «Días» se puede corregir (días no consecutivos, medios días, etc.).
export function diasHabilesEntre(inicioISO, finISO){
  const ini = deISO(inicioISO), fin = deISO(finISO);
  if(!ini || !fin || fin < ini) return 0;
  let n = 0;
  for(let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) if(esHabil(d)) n++;
  return n;
}
// Primer día hábil después de la fecha fin (el día de reintegro al trabajo).
export function fechaReintegro(finISO){
  const fin = deISO(finISO);
  if(!fin) return '';
  const d = new Date(fin);
  do{ d.setDate(d.getDate() + 1); }while(!esHabil(d));
  return aISO(d);
}

function esc(t){ return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function dma(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; }
function numero(n){ return n == null || Number.isNaN(Number(n)) ? '—' : String(Math.round(Number(n) * 100) / 100).replace('.', ','); }

// Correo para Gerencia con los datos de la solicitud. `resumen` = { diasPendientes } de la persona ANTES de esta solicitud (puede ser null); `urlPortal` = enlace al portal.
export function construirCorreoSolicitudVacaciones({ periodo, cargo, resumen, urlPortal }){
  const nombre = String(periodo?.Colaborador || '').trim();
  const dias = Number(periodo?.Dias) || 0;
  const antes = resumen && resumen.diasPendientes != null ? Number(resumen.diasPendientes) : null;
  const despues = antes == null ? null : Math.round((antes - dias) * 100) / 100;
  const asunto = `Solicitud de vacaciones — ${nombre} (${dma(periodo?.FechaInicio)} al ${dma(periodo?.FechaFin)})`;
  const fila = (etiqueta, valor, fuerte) => `<tr><td style="padding:9px 14px; width:42%; background:#f4f4f2; color:#5c6b68; font-size:13px; border-bottom:1px solid #e4e4e1;">${etiqueta}</td><td style="padding:9px 14px; font-size:14px; ${fuerte ? 'font-weight:700; color:#004941;' : 'color:#1c2624;'} border-bottom:1px solid #e4e4e1;">${valor}</td></tr>`;
  const html = `<div style="font-family:'Segoe UI', Arial, sans-serif; color:#1c2624; max-width:620px;">
  <p style="margin:0 0 12px; font-size:15px;">Buen día, Gerencia:</p>
  <p style="margin:0 0 16px; font-size:15px; line-height:1.55;"><strong>${esc(nombre)}</strong>${cargo ? ` (${esc(cargo)})` : ''} solicita vacaciones con los siguientes datos. Queda <strong>pendiente de su aprobación</strong>.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border:1px solid #e4e4e1; border-radius:8px; border-collapse:separate; overflow:hidden;">
    ${fila('Colaborador', esc(nombre), true)}
    ${cargo ? fila('Cargo', esc(cargo)) : ''}
    ${fila('Fecha de inicio', dma(periodo?.FechaInicio), true)}
    ${fila('Fecha de fin', dma(periodo?.FechaFin), true)}
    ${fila('Regresa a trabajar el', dma(fechaReintegro(periodo?.FechaFin)))}
    ${fila('Días solicitados', numero(dias), true)}
    ${antes == null ? '' : fila('Días pendientes antes de esta solicitud', numero(antes))}
    ${despues == null ? '' : fila('Días pendientes si se aprueba', numero(despues))}
    ${fila('Observaciones', periodo?.Observaciones ? esc(periodo.Observaciones) : '—')}
    ${fila('Estado', 'Pendiente de aprobación')}
  </table>
  <p style="margin:18px 0 8px; font-size:14px; line-height:1.55;">Para aprobarla: Portal Lexara → <strong>Administración → Vacaciones</strong> → casilla <strong>Aprobación</strong> de la solicitud.</p>
  ${urlPortal ? `<p style="margin:0 0 16px;"><a href="${esc(urlPortal)}" style="display:inline-block; padding:10px 18px; background:#004941; color:#ffffff; text-decoration:none; border-radius:6px; font-size:14px; font-weight:600;">Abrir Portal Lexara</a></p>` : ''}
  <p style="margin:0; font-size:12.5px; color:#5c6b68;">Correo enviado desde Portal Lexara por quien registró la solicitud, con copia a Soporte.</p>
</div>`;
  return { asunto, html };
}
