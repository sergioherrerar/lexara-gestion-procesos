// Correo de felicitación de cumpleaños de un colaborador (Administración → Colaboradores MD, 2026-10-29, pedido del usuario): Lexara le desea el mejor
// cumpleaños, destaca su profesión según su cargo y lo que ha aportado en el portal, y le habla de un nuevo año de vida y de un futuro mejor.
//
// Las imágenes van como adjuntos en línea (cid:) para que Outlook las muestre sin pedir permiso: un banner de amanecer dibujado aquí mismo y la foto real del
// equipo (la del Panorama general). Ninguna imagen se inventa: la foto es la que entregó el usuario.
import { normalize, descargarFotoColaborador } from './graph';
import fotoEquipo from '../assets/Equipo Lexara reunion.webp';

export const CID_BANNER = 'felicitacion-banner';
export const CID_EQUIPO = 'felicitacion-equipo';
export const CID_FOTO = 'felicitacion-foto';

// Retrato del cumpleañero (si su foto está en SharePoint), centrado bajo el banner con marco dorado.
function bloqueFoto(srcFoto, nombre){
  if(!srcFoto) return '';
  return `<tr><td align="center" style="padding:22px 30px 0; line-height:0;"><img src="${srcFoto}" width="200" alt="${esc(nombre)}" style="display:block; width:200px; max-width:60%; height:auto; border:4px solid #fbbc33; border-radius:12px;"></td></tr>`;
}

// Lo que Lexara destaca de cada cargo. Está escrito sin género («tu labor como …») para no suponerlo; el cargo sale tal como está en la ficha.
const FRASES_CARGO = [
  { clave: 'especialista', texto: 'tu criterio jurídico y tu rigor al defender los casos más exigentes del despacho' },
  { clave: 'procesos', texto: 'tu constancia llevando cada proceso, cada término y cada audiencia al día, que es lo que hace confiable al despacho' },
  { clave: 'junior', texto: 'tu entrega y tus ganas de aprender y de resolver, que impulsan el trabajo de todo el equipo' },
  { clave: 'abogad', texto: 'tu compromiso y tu criterio jurídico en cada caso que acompañas' },
  { clave: 'contador', texto: 'tu orden y tu precisión con las cuentas, que le dan solidez y tranquilidad a Lexara' },
  { clave: 'help desk', texto: 'tu apoyo diario con la tecnología, que mantiene a todo el equipo trabajando sin interrupciones' },
  { clave: 'analista', texto: 'tu análisis cuidadoso, que convierte los datos en decisiones' },
  { clave: 'gerente', texto: 'tu liderazgo y tu visión, que mantienen el rumbo de Lexara' },
  { clave: 'asistente', texto: 'tu apoyo y tu organización, que hacen más fácil el trabajo de todos' },
];
function fraseDelCargo(cargo){
  const c = normalize(cargo || '');
  const hallada = FRASES_CARGO.find(f => c.includes(f.clave));
  return hallada ? hallada.texto : 'tu profesionalismo y tu dedicación en cada tarea que asumes';
}

// La jefa de la empresa (Mónica Paola Quintero Jiménez, gerente) recibe una felicitación distinta, en nombre de todo el equipo (pedido del usuario 2026-10-29):
// se reconoce su liderazgo y lo duro que es sacar adelante una empresa. Se reconoce por su cargo de gerente, por el correo de Gerencia o por su nombre.
export function esJefaDeLaEmpresa(colaborador){
  const cargo = normalize(colaborador?.Cargo || '');
  const correo = normalize(colaborador?.Correo || '').trim();
  const nombre = normalize(colaborador?.Nombre || '');
  return cargo.includes('gerente') || correo === 'gerencia@lexaraabogados.com' || (nombre.includes('monica') && nombre.includes('quintero'));
}

function esc(s){
  return String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}
function nombreCorto(nombre){
  // Nombre de pila: la primera palabra («Ariana Andrea Martín Mendoza» → «Ariana»).
  return String(nombre || '').trim().split(' ')[0] || 'amiga o amigo de Lexara';
}

// Aportes en el portal: cuántos registros dejó modificados esta persona en el último año, por módulo (SharePoint guarda quién modificó cada registro por última vez).
// `listas` es la lista de listas ya cargadas del portal ({ key, label, rawItems }). Devuelve los módulos con más aportes: [{ label, n }].
const ETIQUETAS_MODULO = {
  procesos: 'Procesos judiciales', tutelas: 'Tutelas', facturacion: 'Facturación', ordenesCompra: 'Órdenes de compra', clientes: 'Clientes',
  audiencias: 'Audiencias', terminos: 'Términos', pendientes: 'Pendientes', gastos: 'Egresos', horasExtras: 'Horas extras', desistimientos: 'Desistimientos', formasPago: 'Formas de pago',
};
export function aportesDelColaborador(colaborador, listas, hoy = new Date()){
  const correo = normalize(colaborador?.Correo || '').trim();
  const nombre = normalize(colaborador?.Nombre || '').trim();
  if(!correo && !nombre) return [];
  const desde = new Date(hoy.getTime() - 365 * 86400000);
  const cuentas = [];
  (listas || []).forEach(l => {
    const etiqueta = ETIQUETAS_MODULO[l.key];
    if(!etiqueta) return;
    let n = 0;
    (l.rawItems || []).forEach(it => {
      const u = it && it.lastModifiedBy && it.lastModifiedBy.user;
      if(!u) return;
      const fecha = it.lastModifiedDateTime ? new Date(it.lastModifiedDateTime) : null;
      if(!fecha || fecha < desde) return;
      const mismoCorreo = correo && normalize(u.email || '').trim() === correo;
      const mismoNombre = nombre && normalize(u.displayName || '').trim() === nombre;
      if(mismoCorreo || mismoNombre) n++;
    });
    if(n > 0) cuentas.push({ label: etiqueta, n });
  });
  return cuentas.sort((a, b) => b.n - a.n).slice(0, 3);
}

function textoAportes(aportes){
  if(!aportes || !aportes.length) return '';
  const partes = aportes.map(a => `${a.n} ${a.n === 1 ? 'registro' : 'registros'} de ${a.label}`);
  const lista = partes.length === 1 ? partes[0] : partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
  return `Y se nota en el portal: en el último año dejaste tu huella en ${lista}. Cada actualización tuya mantiene la información del despacho al día para todos.`;
}

// Devuelve { asunto, html } con las imágenes referenciadas por cid (ver CID_BANNER y CID_EQUIPO). `imagenes` permite cambiar el origen
// (por ejemplo data:… para la vista previa, o cid: para el correo real).
export function construirFelicitacion({ colaborador, aportes, srcBanner = 'cid:' + CID_BANNER, srcEquipo = 'cid:' + CID_EQUIPO, srcFoto = '' }){
  if(esJefaDeLaEmpresa(colaborador)) return construirFelicitacionJefa({ colaborador, srcBanner, srcEquipo, srcFoto });
  const pila = nombreCorto(colaborador?.Nombre);
  const cargo = String(colaborador?.Cargo || '').trim();
  const frase = fraseDelCargo(cargo);
  const comoCargo = cargo ? ` como ${esc(cargo)}` : '';
  const parrafoAportes = textoAportes(aportes);
  const asunto = `¡Feliz cumpleaños, ${pila}! 🎉`;
  const estiloP = 'margin:0 0 14px; font-size:15.5px; line-height:1.65; color:#1c2624;';
  const html = `<div style="background:#f4f4f2; padding:20px 0; font-family:'Segoe UI', Arial, sans-serif;">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e4e4e1;">
    <tr><td style="padding:0; line-height:0;"><img src="${srcBanner}" width="600" alt="¡Feliz cumpleaños, ${esc(pila)}!" style="display:block; width:100%; max-width:600px; height:auto; border:0;"></td></tr>
    ${bloqueFoto(srcFoto, colaborador?.Nombre)}
    <tr><td style="padding:26px 30px 8px;">
      <p style="margin:0 0 14px; font-size:22px; font-weight:700; color:#004941;">¡Feliz cumpleaños, ${esc(pila)}!</p>
      <p style="${estiloP}">Hoy en <strong>Lexara Abogados</strong> celebramos tu vida y te deseamos el mejor de los cumpleaños, rodeado de las personas que más quieres.</p>
      <p style="${estiloP}">Queremos agradecerte, además, por ${frase}${comoCargo ? ` — tu labor${comoCargo} es una parte esencial de lo que somos` : ''}.</p>
      ${parrafoAportes ? `<p style="${estiloP}">${esc(parrafoAportes)}</p>` : ''}
      <p style="${estiloP}">Que este nuevo año de vida venga con salud, alegría y un futuro mejor, lleno de metas cumplidas y de nuevas oportunidades. Gracias por construir Lexara con nosotros: el camino que sigue lo seguimos haciendo juntos.</p>
    </td></tr>
    <tr><td style="padding:6px 30px 22px; line-height:0;"><img src="${srcEquipo}" width="540" alt="El equipo de Lexara Abogados" style="display:block; width:100%; max-width:540px; height:auto; border:0; border-radius:10px;"></td></tr>
    <tr><td style="padding:0 30px 26px;">
      <p style="margin:0; font-size:15.5px; line-height:1.6; color:#1c2624;">Con aprecio,</p>
      <p style="margin:2px 0 0; font-size:16px; font-weight:700; color:#004941;">Tu equipo de Lexara Abogados</p>
    </td></tr>
  </table>
</div>`;
  return { asunto, html };
}

// Felicitación para la jefa: de parte de todos sus colaboradores.
function construirFelicitacionJefa({ colaborador, srcBanner, srcEquipo, srcFoto }){
  const pila = nombreCorto(colaborador?.Nombre);
  const asunto = `¡Feliz cumpleaños, ${pila}! De parte de todo tu equipo 🎉`;
  const estiloP = 'margin:0 0 14px; font-size:15.5px; line-height:1.65; color:#1c2624;';
  const html = `<div style="background:#f4f4f2; padding:20px 0; font-family:'Segoe UI', Arial, sans-serif;">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e4e4e1;">
    <tr><td style="padding:0; line-height:0;"><img src="${srcBanner}" width="600" alt="¡Feliz cumpleaños, ${esc(pila)}!" style="display:block; width:100%; max-width:600px; height:auto; border:0;"></td></tr>
    ${bloqueFoto(srcFoto, colaborador?.Nombre)}
    <tr><td style="padding:26px 30px 8px;">
      <p style="margin:0 0 14px; font-size:22px; font-weight:700; color:#004941;">¡Feliz cumpleaños, ${esc(pila)}!</p>
      <p style="${estiloP}">Hoy todos los que hacemos parte de <strong>Lexara Abogados</strong> queremos celebrar contigo y desearte el mejor de los cumpleaños, rodeada de las personas que más quieres.</p>
      <p style="${estiloP}">Queremos reconocer algo que vemos cada día: tu <strong>liderazgo</strong>. Nos guías con visión, con exigencia y con cercanía, y nos enseñas con el ejemplo lo que significa responder por un trabajo bien hecho. Tu forma de liderar es la que le da rumbo y carácter a este equipo.</p>
      <p style="${estiloP}">Sabemos lo <strong>duro que es hacer empresa</strong>: las decisiones difíciles, los riesgos, las jornadas que no se ven y la responsabilidad de sostener el trabajo y el futuro de tantas personas. Detrás de cada proceso que avanza y de cada cliente que confía en nosotros están tu esfuerzo, tu constancia y tu valentía para seguir construyendo, también en los días complicados.</p>
      <p style="${estiloP}">Gracias por creer en este proyecto y por hacernos parte de él. Que este nuevo año de vida te traiga salud, descanso, alegría y un futuro mejor, con todas las metas que sueñas para ti y para Lexara. Aquí tienes un equipo que está contigo y que seguirá construyendo a tu lado.</p>
    </td></tr>
    <tr><td style="padding:6px 30px 22px; line-height:0;"><img src="${srcEquipo}" width="540" alt="El equipo de Lexara Abogados" style="display:block; width:100%; max-width:540px; height:auto; border:0; border-radius:10px;"></td></tr>
    <tr><td style="padding:0 30px 26px;">
      <p style="margin:0; font-size:15.5px; line-height:1.6; color:#1c2624;">Con admiración y cariño,</p>
      <p style="margin:2px 0 0; font-size:16px; font-weight:700; color:#004941;">Tus colaboradores de Lexara Abogados</p>
    </td></tr>
  </table>
</div>`;
  return { asunto, html };
}

// ---- Imágenes (se generan en el navegador) ----
function cargarImagen(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen del equipo.'));
    img.src = src;
  });
}
function lienzoABase64Jpeg(canvas, calidad = 0.88){
  const url = canvas.toDataURL('image/jpeg', calidad);
  return url.slice(url.indexOf(',') + 1);
}

// Banner de «amanecer»: del azul verdoso de Lexara al dorado del horizonte, con el sol saliendo detrás de las colinas y la frase del futuro mejor.
export function crearBannerBase64(nombre, jefa = false){
  const W = 1200, H = 420;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cielo = g.createLinearGradient(0, 0, 0, H);
  cielo.addColorStop(0, '#003630'); cielo.addColorStop(0.45, '#0a6a5f'); cielo.addColorStop(0.75, '#52bbb5'); cielo.addColorStop(1, '#fbbc33');
  g.fillStyle = cielo; g.fillRect(0, 0, W, H);
  // Sol con resplandor, subiendo sobre el horizonte.
  const solX = W * 0.76, solY = H * 0.78;
  const brillo = g.createRadialGradient(solX, solY, 10, solX, solY, 330);
  brillo.addColorStop(0, 'rgba(255,236,170,.95)'); brillo.addColorStop(0.35, 'rgba(251,188,51,.55)'); brillo.addColorStop(1, 'rgba(251,188,51,0)');
  g.fillStyle = brillo; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(solX, solY, 62, Math.PI, 0); g.fill();
  // Colinas.
  g.fillStyle = '#0a4d44';
  g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.84);
  g.bezierCurveTo(W * 0.18, H * 0.70, W * 0.34, H * 0.92, W * 0.52, H * 0.82);
  g.bezierCurveTo(W * 0.70, H * 0.72, W * 0.86, H * 0.90, W, H * 0.80);
  g.lineTo(W, H); g.closePath(); g.fill();
  g.fillStyle = '#003630';
  g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.93);
  g.bezierCurveTo(W * 0.25, H * 0.84, W * 0.45, H * 1.0, W * 0.65, H * 0.92);
  g.bezierCurveTo(W * 0.82, H * 0.86, W * 0.92, H * 0.96, W, H * 0.90);
  g.lineTo(W, H); g.closePath(); g.fill();
  // Estrellas pequeñas arriba.
  g.fillStyle = 'rgba(255,255,255,.75)';
  [[90, 60, 2.4], [210, 120, 1.8], [330, 48, 2.2], [470, 96, 1.6], [590, 40, 2.4], [700, 120, 1.8], [820, 56, 2.2], [980, 40, 1.8], [1100, 110, 2.4], [1040, 190, 1.6]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  // Textos.
  g.fillStyle = '#ffffff'; g.textBaseline = 'alphabetic';
  g.font = '700 66px "Segoe UI", Arial, sans-serif';
  g.shadowColor = 'rgba(0,30,26,.45)'; g.shadowBlur = 12;
  g.fillText('¡Feliz cumpleaños!', 60, 170);
  g.font = '600 40px "Segoe UI", Arial, sans-serif';
  g.fillText(String(nombre || '').split(' ')[0] || '', 62, 228);
  g.shadowBlur = 8;
  g.font = '400 27px "Segoe UI", Arial, sans-serif';
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.fillText(jefa ? 'De parte de todo tu equipo, con admiración.' : 'Un nuevo año de vida, un futuro mejor.', 62, 282);
  return lienzoABase64Jpeg(c);
}

// La foto real del equipo en JPEG (Outlook no muestra WebP).
export async function fotoEquipoBase64(){
  const img = await cargarImagen(fotoEquipo);
  const ancho = Math.min(1100, img.naturalWidth || 1100);
  const alto = Math.round(ancho * ((img.naturalHeight || 733) / (img.naturalWidth || 1100)));
  const c = document.createElement('canvas'); c.width = ancho; c.height = alto;
  const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, ancho, alto); g.drawImage(img, 0, 0, ancho, alto);
  return lienzoABase64Jpeg(c, 0.86);
}

// Todo junto: asunto + html para el correo real (cid) y para la vista previa (data:), más las imágenes para adjuntar.
// Foto del colaborador reducida a JPEG (las de SharePoint pesan 400-800 KB; en el correo se ven a 200 px). null si no hay foto o no se pudo leer.
async function fotoColaboradorBase64(config, colaborador){
  if(!config) return null;
  try{
    const blob = await descargarFotoColaborador(config, colaborador?.Nombre);
    if(!blob) return null;
    const url = URL.createObjectURL(blob);
    try{
      const img = await cargarImagen(url);
      const ancho = Math.min(420, img.naturalWidth || 420);
      const alto = Math.round(ancho * ((img.naturalHeight || ancho) / (img.naturalWidth || ancho)));
      const c = document.createElement('canvas'); c.width = ancho; c.height = alto;
      const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, ancho, alto); g.drawImage(img, 0, 0, ancho, alto);
      return lienzoABase64Jpeg(c, 0.88);
    }finally{ URL.revokeObjectURL(url); }
  }catch(err){ console.error('No se pudo preparar la foto de ' + (colaborador?.Nombre || '') + ':', err); return null; }
}

export async function prepararFelicitacion({ colaborador, listas, config }){
  const aportes = aportesDelColaborador(colaborador, listas);
  const [banner, equipo, foto] = [crearBannerBase64(colaborador?.Nombre, esJefaDeLaEmpresa(colaborador)), await fotoEquipoBase64(), await fotoColaboradorBase64(config, colaborador)];
  const correo = construirFelicitacion({ colaborador, aportes, srcFoto: foto ? 'cid:' + CID_FOTO : '' });
  const vista = construirFelicitacion({ colaborador, aportes, srcBanner: 'data:image/jpeg;base64,' + banner, srcEquipo: 'data:image/jpeg;base64,' + equipo, srcFoto: foto ? 'data:image/jpeg;base64,' + foto : '' });
  return {
    asunto: correo.asunto, html: correo.html, htmlVistaPrevia: vista.html, aportes, conFoto: !!foto,
    imagenes: [
      { nombre: 'banner-cumpleanos.jpg', cid: CID_BANNER, base64: banner },
      ...(foto ? [{ nombre: 'foto-colaborador.jpg', cid: CID_FOTO, base64: foto }] : []),
      { nombre: 'equipo-lexara.jpg', cid: CID_EQUIPO, base64: equipo },
    ],
  };
}
