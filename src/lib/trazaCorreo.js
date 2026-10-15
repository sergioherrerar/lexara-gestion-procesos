// Fecha y hora en que el JUZGADO remitió el correo que el área jurídica reenvía (2026-10-15, regla del despacho: el término de una tutela
// se cuenta desde la fecha en que el juzgado que aparece en la TRAZA del correo lo remitió, no desde la fecha en que el área lo reenvió).
// Lee el texto del cuerpo del correo (con la traza de reenvíos o respuestas) y devuelve el instante "aaaa-mm-dd HH:MM" (hora de Colombia) del
// correo más reciente que salió de un juzgado, o "" si no logra leerlo. Es puro texto (sin dependencias) para poder probarlo aparte.

const MESES = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7,
  agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sep: 9, sept: 9, octubre: 10, oct: 10, noviembre: 11, nov: 11, diciembre: 12, dic: 12,
  january: 1, jan: 1, february: 2, march: 3, april: 4, apr: 4, june: 6, july: 7, august: 8, aug: 8, september: 9, october: 10, november: 11, december: 12, dec: 12,
};

const dos = n => String(n).padStart(2, '0');

function normalizar(t){
  return String(t || '').replace(/[  ]/g, ' ').replace(/&nbsp;/gi, ' ').replace(/[ \t]+/g, ' ').trim();
}

// "viernes, 9 de octubre de 2026 8:00 p. m." · "9 oct 2026 a las 20:00" · "Friday, October 9, 2026 8:00 PM" · "2026-10-09 20:00" → "2026-10-09 20:00"
export function parsearFechaHora(texto){
  const t = normalizar(texto).toLowerCase();
  if(!t) return '';
  let dia, mes, anio, m;
  if((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))){ anio = +m[1]; mes = +m[2]; dia = +m[3]; }
  else if((m = /(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)\.?,?\s*(?:de\s+)?(\d{4})/.exec(t)) && MESES[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '')]){
    dia = +m[1]; mes = MESES[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '')]; anio = +m[3];
  }else if((m = /([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t)) && MESES[m[1]]){ mes = MESES[m[1]]; dia = +m[2]; anio = +m[3]; }
  else if((m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t))){ dia = +m[1]; mes = +m[2]; anio = +m[3]; }
  else return '';
  if(!(anio >= 2000 && anio <= 2100 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return '';
  const resto = t.slice((m.index || 0) + m[0].length);
  const h = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/.exec(resto);
  if(!h) return '';
  let hora = +h[1];
  const min = +h[2];
  const sufijo = (h[3] || '').replace(/[.\s]/g, '');
  if(sufijo === 'pm' && hora < 12) hora += 12;
  if(sufijo === 'am' && hora === 12) hora = 0;
  if(hora > 23 || min > 59) return '';
  return `${anio}-${dos(mes)}-${dos(dia)} ${dos(hora)}:${dos(min)}`;
}

const REMITENTE_JUZGADO = /ramajudicial|cendoj|juzgad|tribunal|\.gov\.co|corte\s+(suprema|constitucional)|consejo\s+(superior|de estado)/i;

// Bloques de encabezado de un correo reenviado/respondido: «De: … Enviado el: … Para: …» (Outlook, español o inglés) y «El vie, 9 oct 2026 a las 20:00, X <y@z> escribió:» (Gmail).
export function correosDeLaTraza(cuerpo){
  const lineas = String(cuerpo || '').split(/\r?\n/).map(normalizar);
  const hallados = [];
  for(let i = 0; i < lineas.length; i++){
    const l = lineas[i];
    let m;
    if((m = /^(?:\*\*)?(?:de|from)\s*:\s*(.+)$/i.exec(l))){
      for(let k = i + 1; k <= Math.min(i + 7, lineas.length - 1); k++){
        const f = /^(?:\*\*)?(?:enviado(?: el)?|fecha|sent|date)\s*:\s*(.+)$/i.exec(lineas[k]);
        if(f){
          const instante = parsearFechaHora(f[1]);
          if(instante) hallados.push({ de: m[1], instante });
          break;
        }
      }
    }else if((m = /^(?:el|on)\s+(.+?)\s+(?:escribi[oó]|wrote)\s*:?\s*$/i.exec(l)) || (m = /^(?:el|on)\s+(.+?),?\s*$/i.exec(l)) && /escribi[oó]|wrote/i.test(lineas[i + 1] || '')){
      const instante = parsearFechaHora(m[1]);
      if(instante) hallados.push({ de: m[1], instante });
    }
  }
  return hallados;
}

// Instante "aaaa-mm-dd HH:MM" del correo más reciente que remitió un juzgado según la traza, o "".
export function envioDelJuzgadoSegunTraza(cuerpo){
  const deJuzgado = correosDeLaTraza(cuerpo).filter(c => REMITENTE_JUZGADO.test(c.de));
  if(!deJuzgado.length) return '';
  return deJuzgado.map(c => c.instante).sort().pop();
}
