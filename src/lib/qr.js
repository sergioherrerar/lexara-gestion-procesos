// Generación de códigos QR — agregado 2026-09-15 a pedido explícito del
// usuario: reemplaza la imagen fija "Qr_Redes.png" (nadie podía confirmar
// qué link tenía adentro) por un QR generado directo desde el texto/URL real
// en el código — así Facturas, Órdenes de compra y la Certificación laboral
// usan siempre el mismo link verdadero, y si cambia algún día basta con
// cambiar el texto acá, sin tener que rehacer ninguna imagen.
//
// Personalizado con el logo de Lexara en el centro (pedido explícito del
// usuario) — usa nivel de corrección de errores "H" (el más alto, ~30% de
// los módulos se pueden tapar/dañar y el QR sigue leyéndose bien), que es
// justo lo que hace falta para poder tapar el centro con un logo sin que
// deje de escanear.
import miniLogo from '../assets/Mini verde oscuro.png';

function cargarImagen(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function generarQRDataUrl(texto, opts = {}){
  const { default: QRCode } = await import('qrcode');
  const { conLogo = true, logoScale = 0.24, width = 256, ...qrOpts } = opts;
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, texto, {
    margin: 1,
    width,
    color: { dark: '#0a3d33', light: '#ffffff' },
    errorCorrectionLevel: conLogo ? 'H' : 'M',
    ...qrOpts,
  });
  if(conLogo){
    const ctx = canvas.getContext('2d');
    const logoImg = await cargarImagen(miniLogo);
    // El archivo "Mini verde oscuro.png" es una imagen apaisada (16:9) con la
    // "X" de Lexara en el centro y mucho margen transparente. Antes se
    // estiraba ENTERA a un cuadrado, así que la X salía angosta/deformada;
    // ahora se recorta al área de la X (mismas proporciones que la imagen
    // original: 250,55 de 300×340 sobre 800×450) y se dibuja sin deformar.
    const sx = logoImg.naturalWidth * (250 / 800), sy = logoImg.naturalHeight * (55 / 450);
    const sw = logoImg.naturalWidth * (300 / 800), sh = logoImg.naturalHeight * (340 / 450);
    const dh = width * logoScale;
    const dw = dh * (sw / sh);
    const x = (width - dw) / 2, y = (width - dh) / 2;
    // Fondo blanco (con esquinas redondeadas) detrás del logo, para que no
    // se mezcle con los módulos oscuros del QR justo alrededor.
    const pad = dh * 0.16;
    ctx.fillStyle = '#ffffff';
    if(ctx.roundRect){
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, dw + pad*2, dh + pad*2, width * 8 / 256);
      ctx.fill();
    } else {
      ctx.fillRect(x - pad, y - pad, dw + pad*2, dh + pad*2);
    }
    ctx.drawImage(logoImg, sx, sy, sw, sh, x, y, dw, dh);
  }
  return canvas.toDataURL('image/png');
}

// Link de redes sociales y contacto de MD Abogados — un solo lugar para
// cambiarlo si algún día cambia. Era el Linktree
// (https://linktr.ee/LexaraAbogados, confirmado por el usuario 2026-09-15); desde
// 2026-10-05 (pedido explícito del usuario) es la página de enlaces propia en
// el cPanel (carpeta links-cpanel/ del repo, se sube a public_html/links/). Lo
// usan los QR "Síguenos" de Facturas, Órdenes de compra y la Certificación
// laboral.
export const LINK_REDES_SOCIALES = 'https://www.lexaraabogados.com/links/';

// El QR de redes sociales es siempre el mismo — se genera una sola vez y se
// reutiliza (Facturas y Órdenes de compra compartían el mismo código copiado
// en cada drawer, con su propia caché; ahora hay una sola).
let qrRedesCache = null;
export function obtenerQrRedesDataUrl(){
  if(!qrRedesCache){
    qrRedesCache = generarQRDataUrl(LINK_REDES_SOCIALES).catch(err => { qrRedesCache = null; throw err; });
  }
  return qrRedesCache;
}
