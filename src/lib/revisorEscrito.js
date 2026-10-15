// Revisor automático de escritos de tutela (2026-10-15): aplica en código las reglas MECÁNICAS del PROMPT MAESTRO de la abogada y marca lo dudoso,
// sin gastar tokens de Claude. Corrige solo lo que no cambia el sentido (reemplazos exactos de texto, que conservan el formato del párrafo y nunca tocan
// las citas de jurisprudencia o normas); lo que requiere criterio solo se avisa en `alertas`.
//
// revisarParrafos(parrafos, ctx) → { reemplazos: [{ p, buscar, reemplazar, regla }], alertas: [texto] }
//   parrafos: [{ n, t, cita? }] (como los devuelve listarParrafosDeDocx)
//   ctx: { registro?, ciudadJuzgado? }

const PLANES = /\b(ZAFIRO|DIAMANTE|RUB[IÍ]|ESMERALDA|AZUL|OC[EÉ]ANO|HUMANA|PIEDRAS|COLINA)\b/;
const RE_FECHA_CERO = /\b0([1-9])\/(\d{2})\/(\d{4})\b/g;

// Cada regla: { id, aviso, buscar: RegExp global, reemplazar: string | fn } — se aplica por coincidencia y se devuelve como reemplazos exactos.
const REGLAS_AUTOMATICAS = [
  { id: 'mi representada', aviso: '«mi representada» → «esta entidad»', re: /\bmi representada\b/gi, con: m => (/^M/.test(m) ? 'Esta entidad' : 'esta entidad') },
  { id: 'allegado', aviso: '«allegado al expediente» → «adjunto»', re: /\ballegad([oa])(s?) al expediente\b/gi, con: (m, v, s) => (v.toLowerCase() === 'o' ? 'adjunto' : 'adjunta') + s },
  { id: 'fecha sin cero', aviso: 'fecha numérica sin cero a la izquierda en el día', re: RE_FECHA_CERO, con: (m, d, mes, a) => d + '/' + mes + '/' + a },
  { id: 'plazo adicional', aviso: '«plazo adicional» → «plazo de 1 (un) día»', re: /\bplazo adicional\b/gi, con: () => 'plazo de 1 (un) día' },
  { id: 'registro civil', aviso: '«Registro Civil de Nacimiento No.» → «Registro Civil No.»', re: /\bRegistro Civil de Nacimiento No\./g, con: () => 'Registro Civil No.' },
  { id: 'palabra repetida', aviso: 'palabra repetida por el empalme', re: /\b(la|el|los|las|de|del|que|por|en|se|y|a)\s+\1\b/gi, con: (m, w) => w },
  { id: 'coma doble', aviso: 'coma o punto duplicado', re: /,\s*,/g, con: () => ',' },
  { id: 'espacio antes de signo', aviso: 'espacio sobrante antes de coma o punto', re: /[ \t]+([,.;:])(?=\s|$)/g, con: (m, s) => s },
  { id: 'fecha encabezado sin cero', aviso: 'día con cero a la izquierda en la línea de fecha', re: /^([A-Za-zÁÉÍÓÚáéíóúñÑ .]+,\s+[a-záéíóú]+ )0([1-9])( de \d{4})/, con: (m, a, d, b) => a + d + b },
];

function ciudadYFecha(t){
  const m = /^([A-Za-zÁÉÍÓÚáéíóúñÑ .]{3,40}),\s+[a-záéíóú]+ \d{1,2} de \d{4}\s*$/.exec(String(t || '').trim());
  return m ? m[1].trim() : '';
}

export function revisarParrafos(parrafos, ctx = {}){
  const reemplazos = [];
  const alertas = [];
  const reg = ctx.registro || {};
  const lista = (parrafos || []).filter(p => p && p.t);
  const propios = lista.filter(p => !p.cita);   // las citas de jurisprudencia o normas no se tocan

  for(const p of propios){
    const t = p.t;
    for(const r of REGLAS_AUTOMATICAS){
      r.re.lastIndex = 0;
      let m;
      while((m = r.re.exec(t))){
        const nuevo = r.con(...m);
        if(nuevo !== m[0]) reemplazos.push({ p: p.n, buscar: m[0], reemplazar: nuevo, regla: r.aviso });
        if(!r.re.global) break;
      }
    }
    // Raya larga: entre dos rayas es un inciso (→ comas); una sola raya se avisa.
    if(t.includes('—')){
      const pares = /\s—\s?([^—]{1,200}?)\s?—\s?/.exec(t);
      if(pares) reemplazos.push({ p: p.n, buscar: pares[0], reemplazar: ', ' + pares[1].trim() + ', ', regla: 'raya larga (—) entre comas' });
      else alertas.push(`Párrafo ${p.n}: tiene una raya larga (—); el despacho usa comas.`);
    }
    // Código de plan de medicina prepagada: «ZAFIRO (26) PREMIUM (2) 260000031258» → «ZAFIRO PREMIUM 260000031258».
    if(PLANES.test(t)){
      const re = /\s\(\d{1,3}\)(?=\s|[,.;:]|$)/g;
      let m;
      while((m = re.exec(t))) reemplazos.push({ p: p.n, buscar: m[0], reemplazar: '', regla: 'códigos entre paréntesis en el nombre del plan' });
    }
    // Radicado largo en la línea RAD → número corto aaaa-nnnnn.
    if(/^RAD\b/i.test(t)){
      const largo = /\d[\d\s.-]{19,}\d/.exec(t);
      const dig = largo ? largo[0].replace(/\D/g, '') : '';
      if(dig.length >= 21) reemplazos.push({ p: p.n, buscar: largo[0], reemplazar: dig.slice(12, 16) + '-' + dig.slice(16, 21), regla: 'RAD con el radicado largo → número corto' });
    }
    // Cosas que exigen criterio: solo se avisan.
    if(/\bal plenario\b/i.test(t)) alertas.push(`Párrafo ${p.n}: dice «al plenario» (no se usa).`);
    if(/\b(CRONOS|Almera|back ?office|\bNUS\b)\b/i.test(t)) alertas.push(`Párrafo ${p.n}: nombra un aplicativo interno (CRONOS, Almera, back office, NUS); se dice «según consta en el sistema interno de la entidad».`);
    if(/\bNIT\b\s*[:.]?\s*\d/i.test(t)) alertas.push(`Párrafo ${p.n}: trae un NIT de un tercero (no se incluye).`);
    if(/uso fuera de etiqueta/i.test(t)) alertas.push(`Párrafo ${p.n}: «uso fuera de etiqueta» → «su uso está por fuera de las indicaciones INVIMA».`);
    if(/mal podr[ií]a el juez constitucional suplir/i.test(t)) alertas.push(`Párrafo ${p.n}: usa «Mal podría el juez constitucional suplir…» (la fórmula aprobada de subsidiariedad es otra).`);
    if(/de conformidad con la normatividad vigente/i.test(t) && /ha autorizado a/i.test(t)) alertas.push(`Párrafo ${p.n}: el párrafo de estado actual no lleva «de conformidad con la normatividad vigente».`);
    if(/\b(del la|a la la|por parte (colm[eé]dica|aliansalud))\b/i.test(t)) alertas.push(`Párrafo ${p.n}: posible error de empalme («del la», «a la la», «por parte COLMÉDICA»).`);
    if(/(\bPor lo anterior,\s*){2,}/i.test(t)) alertas.push(`Párrafo ${p.n}: «Por lo anterior,» repetido.`);
  }

  // Encabezado: ciudad del juzgado (nunca Bogotá por defecto), y pendientes sin completar.
  const cabecera = lista.slice(0, 14);
  const lineaFecha = cabecera.find(p => ciudadYFecha(p.t));
  const ciudadEsperada = String(ctx.ciudadJuzgado || reg.Ciudad || '').trim();
  if(lineaFecha && ciudadEsperada){
    const c = ciudadYFecha(lineaFecha.t);
    const norm = x => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\bd c\b/, '').trim();
    if(norm(c) !== norm(ciudadEsperada) && !norm(ciudadEsperada).includes(norm(c)) && !norm(c).includes(norm(ciudadEsperada))){
      alertas.push(`Encabezado: la fecha dice «${c}» y la ciudad del juzgado en la lectura es «${ciudadEsperada}» — revisa cuál es.`);
    }
  }
  if(cabecera.some(p => /\[[^\]]{2,}\]/.test(p.t) && !/COMPLETAR/i.test(p.t))) alertas.push('Encabezado: quedaron corchetes sin completar.');
  const pendientes = lista.filter(p => /\[COMPLETAR/i.test(p.t)).length;
  if(pendientes) alertas.push(`Hay ${pendientes} párrafo${pendientes === 1 ? '' : 's'} con [COMPLETAR…]: faltan datos por llenar.`);

  // El accionante y su cédula deben aparecer; un menor va solo con iniciales.
  const todo = lista.map(p => p.t).join('\n');
  const cc = String(reg.NoIdentificacion || '').replace(/\D/g, '');
  if(cc.length >= 6 && !todo.replace(/\D/g, '').includes(cc)) alertas.push(`La cédula del usuario (${reg.NoIdentificacion}) no aparece en el escrito.`);
  const esMenor = /menor|ni[ñn][oa]|adolescente/i.test(JSON.stringify(reg.Analisis || {}).slice(0, 4000) + ' ' + String(reg.Solicita || ''));
  const nombre = String(reg.Usuario || '').trim();
  if(esMenor && nombre.length > 6 && new RegExp(nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i').test(todo)){
    alertas.push('Parece un caso de MENOR de edad y el nombre completo aparece en el escrito: debe ir solo con iniciales.');
  }

  // Nombre de la entidad uniforme (ALIANSALUD EPS en mayúscula, no alternado).
  for(const [mayus, resto] of [['ALIANSALUD EPS', /\bAliansalud EPS\b/g], ['COLMÉDICA MEDICINA PREPAGADA', /\bColm[eé]dica Medicina Prepagada\b/g]]){
    if(todo.includes(mayus) && resto.test(todo)) alertas.push(`El nombre de la entidad alterna mayúsculas y minúsculas (${mayus}): debe ser uniforme.`);
  }

  // Numeración de acápites: 2.1, 2.2, 2.3… sin saltos (tras eliminar bloques hay que renumerar).
  const sub = {};
  for(const p of lista){
    const m = /^(\d+)\.(\d+)\.?\s+\S/.exec(p.t);
    if(m && p.t.length < 160) (sub[m[1]] = sub[m[1]] || []).push(+m[2]);
  }
  for(const [mayor, nums] of Object.entries(sub)){
    const esperado = nums.every((x, i) => x === i + 1);
    if(!esperado) alertas.push(`Numeración del acápite ${mayor}: va ${nums.map(x => mayor + '.' + x).join(', ')} — falta renumerar.`);
  }

  return { reemplazos, alertas };
}

/** Resumen legible de lo corregido: «3× fecha numérica sin cero…, 1× «mi representada» → …». */
export function resumenDeCorrecciones(reemplazos){
  const cuenta = new Map();
  for(const r of reemplazos || []) cuenta.set(r.regla, (cuenta.get(r.regla) || 0) + 1);
  return [...cuenta.entries()].map(([regla, n]) => `${n}× ${regla}`).join('; ');
}
