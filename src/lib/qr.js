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
    const logoSize = width * logoScale;
    const x = (width - logoSize) / 2, y = (width - logoSize) / 2;
    // Fondo blanco (con esquinas redondeadas) detrás del logo, para que no
    // se mezcle con los módulos oscuros del QR justo alrededor.
    const pad = logoSize * 0.16;
    ctx.fillStyle = '#ffffff';
    if(ctx.roundRect){
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, logoSize + pad*2, logoSize + pad*2, 8);
      ctx.fill();
    } else {
      ctx.fillRect(x - pad, y - pad, logoSize + pad*2, logoSize + pad*2);
    }
    ctx.drawImage(logoImg, x, y, logoSize, logoSize);
  }
  return canvas.toDataURL('image/png');
}

// Link real de redes sociales de MD Abogados (Linktree) — confirmado por el
// usuario 2026-09-15. Un solo lugar para cambiarlo si algún día cambia.
export const LINK_REDES_SOCIALES = 'https://linktr.ee/LexaraAbogados';
