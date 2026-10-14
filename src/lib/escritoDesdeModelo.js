// Pedido del usuario 2026-10-09: el Word del escrito (contestación, aclaración, alcance…) debe ser una COPIA LITERAL del
// modelo del despacho — con el logo, los encabezados, las tablas, las imágenes y los estilos — y solo cambiar el texto.
// El artefacto de LexIA entrega el texto final del escrito; aquí se alinea ese texto con los párrafos del modelo (.docx)
// y se edita el XML del propio modelo: los párrafos iguales no se tocan, en los que cambian solo se reemplaza el tramo
// distinto (conserva negritas, fuentes y tamaños del resto), se quitan los que ya no aplican y se agregan los nuevos
// con el formato del párrafo vecino. El logo vive en el encabezado y las imágenes en el cuerpo: no se tocan.
import JSZip from 'jszip';

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const colapsar = t => String(t || '').replace(/\s+/g, ' ').trim();
const clave = t => colapsar(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palabras = t => new Set(clave(t).split(/[^a-z0-9ñ]+/).filter(w => w.length > 2));

function similitud(a, b){
  if(a.clave === b.clave) return 1;
  if(!a.palabras.size || !b.palabras.size) return 0;
  let comunes = 0;
  for(const w of a.palabras) if(b.palabras.has(w)) comunes++;
  return (2 * comunes) / (a.palabras.size + b.palabras.size);
}

function hijosElemento(el, nombre){
  const out = [];
  for(let n = el.firstChild; n; n = n.nextSibling) if(n.nodeType === 1 && n.localName === nombre && n.namespaceURI === NS) out.push(n);
  return out;
}

// Trozos de texto editables de un párrafo, en orden: <w:t> (texto), <w:tab> y <w:br> (un carácter cada uno).
function trozosDe(p){
  const trozos = [];
  const recorrer = (nodo) => {
    for(let n = nodo.firstChild; n; n = n.nextSibling){
      if(n.nodeType !== 1) continue;
      if(n.namespaceURI === NS){
        if(n.localName === 't') trozos.push({ tipo: 't', el: n, texto: n.textContent });
        else if(n.localName === 'tab' && nodo.localName === 'r') trozos.push({ tipo: 'tab', el: n, texto: ' ' });
        else if(n.localName === 'br' && nodo.localName === 'r') trozos.push({ tipo: 'br', el: n, texto: ' ' });
        else if(n.localName === 'delText' || n.localName === 'drawing' || n.localName === 'pict' || n.localName === 'object') continue;
        else recorrer(n);
      }else if(n.localName === 'AlternateContent'){
        continue;
      }
    }
  };
  recorrer(p);
  return trozos;
}

function textoDeParrafo(p){
  return trozosDe(p).map(t => t.texto).join('');
}

// Cambia en un párrafo solo las palabras que difieren (diff por palabras): cada tramo cambiado se reemplaza en el
// propio texto donde estaba, así que las negritas, fuentes y tamaños del resto del párrafo quedan intactos.
function tokens(t){ return String(t).match(/\s*\S+\s*|\s+/g) || []; }
const mismaPalabra = (x, y) => x.trim() === y.trim() || (!x.trim() && !y.trim());

function tramosDistintos(viejo, nuevo){
  const A = tokens(viejo), B = tokens(nuevo);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for(let i = n - 1; i >= 0; i--) for(let j = m - 1; j >= 0; j--){
    dp[i][j] = mismaPalabra(A[i], B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const offs = [0];
  for(const t of A) offs.push(offs[offs.length - 1] + t.length);
  const tramos = [];
  let i = 0, j = 0, actual = null;
  const cerrar = () => { if(actual){ tramos.push(actual); actual = null; } };
  while(i < n || j < m){
    if(i < n && j < m && mismaPalabra(A[i], B[j]) && dp[i][j] === dp[i + 1][j + 1] + 1){
      // se conserva la palabra; si solo cambió el espacio final, se deja como estaba
      cerrar(); i++; j++;
    }else if(i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])){
      if(!actual) actual = { ini: offs[i], fin: offs[i], texto: '' };
      actual.fin = offs[i + 1]; i++;
    }else{
      if(!actual) actual = { ini: offs[i], fin: offs[i], texto: '' };
      actual.texto += B[j]; j++;
    }
  }
  cerrar();
  return tramos;
}

function editarParrafo(p, nuevo){
  const trozos = trozosDe(p);
  const viejo = trozos.map(t => t.texto).join('');
  const tramos = tramosDistintos(viejo, nuevo);
  const inicios = [];
  let pos = 0;
  for(const t of trozos){ inicios.push(pos); pos += t.texto.length; }
  const aEliminar = [];
  // de atrás hacia adelante, para que los cambios no corran las posiciones de los anteriores
  for(const { ini, fin, texto: reemplazo } of [...tramos].reverse()){
    let colocado = false;
    trozos.forEach((t, k) => {
      const a = inicios[k], b = a + t.texto.length;
      if(t.tipo !== 't'){
        if(ini < fin && a < fin && b > ini) aEliminar.push(t.el);
        return;
      }
      const actual = t.el.textContent;
      if(ini === fin){
        if(!colocado && a <= ini && ini <= b){
          t.el.textContent = actual.slice(0, ini - a) + reemplazo + actual.slice(ini - a);
          t.el.setAttributeNS(XML_NS, 'xml:space', 'preserve');
          colocado = true;
        }
        return;
      }
      if(a < fin && b > ini){
        const antes = actual.slice(0, Math.max(0, ini - a));
        const despues = actual.slice(Math.min(t.texto.length, Math.max(0, fin - a)));
        t.el.textContent = antes + (colocado ? '' : reemplazo) + despues;
        t.el.setAttributeNS(XML_NS, 'xml:space', 'preserve');
        colocado = true;
      }
    });
  }
  aEliminar.forEach(el => el.parentNode && el.parentNode.removeChild(el));
}

function nivelCuerpo(el, cuerpo){
  let n = el;
  while(n.parentNode && n.parentNode !== cuerpo) n = n.parentNode;
  return n;
}

// Un párrafo con formato de cita (sangrado a ambos lados, en cursiva o con letra menor) no sirve de plantilla para los párrafos nuevos del cuerpo:
// los párrafos que se agregan deben quedar con la letra normal del modelo, no con la de una cita.
function esFormatoDeCita(p){
  const ppr = hijosElemento(p, 'pPr')[0];
  const ind = ppr ? hijosElemento(ppr, 'ind')[0] : null;
  const num = (el, a, b) => Number((el && (el.getAttributeNS(NS, a) || el.getAttributeNS(NS, b))) || 0);
  if(ind && num(ind, 'left', 'start') >= 500 && num(ind, 'right', 'end') >= 300) return true;
  const corridas = [...p.getElementsByTagNameNS(NS, 'r')].filter(x => hijosElemento(x, 't').length);
  const r0 = corridas.sort((x, y) => y.textContent.length - x.textContent.length)[0];
  const rpr = r0 ? hijosElemento(r0, 'rPr')[0] : null;
  if(rpr){
    const it = hijosElemento(rpr, 'i')[0];
    if(it && !['0', 'false'].includes(it.getAttributeNS(NS, 'val'))) return true;
    const sz = hijosElemento(rpr, 'sz')[0];
    if(sz && Number(sz.getAttributeNS(NS, 'val')) > 0 && Number(sz.getAttributeNS(NS, 'val')) <= 19) return true;
  }
  return false;
}
function parrafoNuevo(doc, plantilla, texto){
  const p = doc.createElementNS(NS, 'w:p');
  if(plantilla){
    const ppr = hijosElemento(plantilla, 'pPr')[0];
    if(ppr) p.appendChild(ppr.cloneNode(true));
  }
  const r = doc.createElementNS(NS, 'w:r');
  const corridas = plantilla ? [...plantilla.getElementsByTagNameNS(NS, 'r')].filter(x => hijosElemento(x, 't').length) : [];
  const run0 = corridas.sort((x, y) => y.textContent.length - x.textContent.length)[0] || null; // el formato del tramo más largo (el cuerpo, no un título corto)
  const rpr = run0 ? hijosElemento(run0, 'rPr')[0] : null;
  if(rpr) r.appendChild(rpr.cloneNode(true));
  const t = doc.createElementNS(NS, 'w:t');
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  t.textContent = texto;
  r.appendChild(t);
  p.appendChild(r);
  return p;
}

// Alineación por similitud (como un diff): empareja cada línea del texto final con el párrafo del modelo que más se le parece.
function alinear(M, D){
  const n = M.length, m = D.length;
  const sim = Array.from({ length: n }, () => new Float32Array(m));
  for(let i = 0; i < n; i++) for(let j = 0; j < m; j++){
    const s = similitud(M[i], D[j]);
    sim[i][j] = s >= 0.5 ? s : 0;
  }
  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  for(let i = n - 1; i >= 0; i--) for(let j = m - 1; j >= 0; j--){
    let mejor = Math.max(dp[i + 1][j], dp[i][j + 1]);
    if(sim[i][j] > 0) mejor = Math.max(mejor, dp[i + 1][j + 1] + sim[i][j]);
    dp[i][j] = mejor;
  }
  const pasos = [];
  let i = 0, j = 0;
  while(i < n || j < m){
    if(i < n && j < m && sim[i][j] > 0 && Math.abs(dp[i][j] - (dp[i + 1][j + 1] + sim[i][j])) < 1e-5){ pasos.push({ op: 'par', i, j }); i++; j++; }
    else if(i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])){ pasos.push({ op: 'quitar', i }); i++; }
    else { pasos.push({ op: 'agregar', j }); j++; }
  }
  // Entre dos párrafos emparejados, lo que se quita y lo que se agrega se empareja en orden: así el párrafo nuevo
  // hereda el formato del que reemplaza (por ejemplo el número de tutela, la fecha o el juzgado del encabezado).
  const salida = [];
  let quitar = [], agregar = [];
  const vaciar = () => {
    const k = Math.min(quitar.length, agregar.length);
    for(let x = 0; x < k; x++) salida.push({ op: 'par', i: quitar[x], j: agregar[x] });
    quitar.slice(k).forEach(i2 => salida.push({ op: 'quitar', i: i2 }));
    agregar.slice(k).forEach(j2 => salida.push({ op: 'agregar', j: j2 }));
    quitar = []; agregar = [];
  };
  for(const p of pasos){
    if(p.op === 'quitar') quitar.push(p.i);
    else if(p.op === 'agregar') agregar.push(p.j);
    else { vaciar(); salida.push(p); }
  }
  vaciar();
  return salida;
}

/**
 * @param {ArrayBuffer|Uint8Array} bytesModelo  el .docx del modelo
 * @param {string} textoFinal                    el escrito ya adaptado (un párrafo por línea)
 * @returns {Promise<{ bytes: Uint8Array, resumen: {iguales:number, cambiados:number, quitados:number, nuevos:number} }>}
 */
export async function aplicarTextoAModeloDocx(bytesModelo, textoFinal, deps = {}){
  const Parser = deps.DOMParser || globalThis.DOMParser;
  const Serializer = deps.XMLSerializer || globalThis.XMLSerializer;
  const zip = await JSZip.loadAsync(bytesModelo);
  const archivo = zip.file('word/document.xml');
  if(!archivo) throw new Error('El modelo no parece un Word válido (falta word/document.xml).');
  const xml = await archivo.async('string');
  const doc = new Parser().parseFromString(xml, 'application/xml');
  const cuerpo = doc.getElementsByTagNameNS(NS, 'body')[0];
  if(!cuerpo) throw new Error('No encontré el cuerpo del documento del modelo.');

  const todos = [...doc.getElementsByTagNameNS(NS, 'p')];
  const modelo = todos
    .map(el => ({ el, texto: textoDeParrafo(el) }))
    .filter(x => colapsar(x.texto))
    .map(x => ({ ...x, clave: clave(x.texto), palabras: palabras(x.texto) }));
  const lineas = String(textoFinal || '').split(/\r?\n/).map(colapsar).filter(Boolean)
    .map(texto => ({ texto, clave: clave(texto), palabras: palabras(texto) }));
  if(!modelo.length) throw new Error('El modelo no tiene texto para adaptar.');

  const pasos = alinear(modelo, lineas);
  const resumen = { iguales: 0, cambiados: 0, quitados: 0, nuevos: 0 };
  let ancla = null;                 // último párrafo del modelo que se conserva
  let ultimoLargo = modelo.find(m => m.texto.length > 80)?.el || null;
  const primero = modelo[0].el;
  const quitar = [];
  for(const paso of pasos){
    if(paso.op === 'par'){
      const m = modelo[paso.i];
      if(m.clave !== lineas[paso.j].clave){ editarParrafo(m.el, lineas[paso.j].texto); resumen.cambiados++; }
      else resumen.iguales++;
      ancla = m.el;
      if(m.texto.length > 80) ultimoLargo = m.el;
    }else if(paso.op === 'quitar'){
      quitar.push(modelo[paso.i].el);
      resumen.quitados++;
    }else{
      // Formato de un párrafo de cuerpo (largo) cercano, no el de un título corto.
      const plantilla = ultimoLargo || ancla || primero;
      const nuevo = parrafoNuevo(doc, plantilla, lineas[paso.j].texto);
      if(ancla){
        const ref = nivelCuerpo(ancla, cuerpo);
        cuerpo.insertBefore(nuevo, ref.nextSibling);
        ancla = nuevo;
      }else{
        cuerpo.insertBefore(nuevo, nivelCuerpo(primero, cuerpo));
      }
      resumen.nuevos++;
    }
  }
  // Respeto al modelo: con «conservarTodo» no se quita ningún párrafo del modelo aunque el texto final no lo traiga.
  if(deps.conservarTodo){ resumen.conservados = quitar.length; resumen.quitados = 0; quitar.length = 0; }
  for(const p of quitar){
    const padre = p.parentNode;
    if(padre && padre.localName === 'tc' && hijosElemento(padre, 'p').length <= 1){
      trozosDe(p).forEach(t => t.tipo === 't' ? (t.el.textContent = '') : (t.el.parentNode && t.el.parentNode.removeChild(t.el)));
    }else if(padre){
      padre.removeChild(p);
    }
  }
  zip.file('word/document.xml', new Serializer().serializeToString(doc));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, resumen };
}

// ---------------------------------------------------------------------------------------------------------------------
// Plan A (portal + robot, 2026-10-13): en vez de mandarle a Claude el escrito completo para que lo reescriba (caro), el portal le manda la
// lista numerada de párrafos del modelo y Claude devuelve SOLO los cambios; aquí se aplican sobre el .docx original.
async function abrirDocx(bytesModelo, deps = {}){
  const Parser = deps.DOMParser || globalThis.DOMParser;
  const Serializer = deps.XMLSerializer || globalThis.XMLSerializer;
  const zip = await JSZip.loadAsync(bytesModelo);
  const archivo = zip.file('word/document.xml');
  if(!archivo) throw new Error('El modelo no parece un Word válido (falta word/document.xml).');
  const doc = new Parser().parseFromString(await archivo.async('string'), 'application/xml');
  const cuerpo = doc.getElementsByTagNameNS(NS, 'body')[0];
  if(!cuerpo) throw new Error('No encontré el cuerpo del documento.');
  const parrafos = [...doc.getElementsByTagNameNS(NS, 'p')]
    .map(el => ({ el, texto: colapsar(textoDeParrafo(el)) }))
    .filter(x => x.texto)
    .map((x, n) => ({ ...x, n }));
  return { zip, doc, cuerpo, parrafos, Serializer };
}

/** Lista de párrafos con texto del .docx: [{ n, t }] (n = posición entre los párrafos con texto). */
export async function listarParrafosDeDocx(bytes, deps = {}){
  const { parrafos } = await abrirDocx(bytes, deps);
  return parrafos.map(p => ({ n: p.n, t: p.texto }));
}

/**
 * Aplica los cambios que devolvió el robot sobre el .docx.
 * cambios: [{p, texto}] · reemplazos: [{p, buscar, reemplazar}] · eliminar: [p] · agregar: [{despues, textos[]}]
 * Devuelve { bytes, resumen, avisos } — avisos: lo que no se pudo aplicar (párrafo inexistente, texto a reemplazar no encontrado…).
 */
export async function aplicarCambiosADocx(bytes, { cambios = [], reemplazos = [], eliminar = [], agregar = [] }, deps = {}){
  const { zip, doc, cuerpo, parrafos, Serializer } = await abrirDocx(bytes, deps);
  const porN = new Map(parrafos.map(p => [p.n, p]));
  const avisos = [];
  const resumen = { cambiados: 0, reemplazos: 0, quitados: 0, nuevos: 0 };
  // texto actual de cada párrafo (por si se cambia y además se reemplaza)
  const actual = new Map(parrafos.map(p => [p.n, p.texto]));

  for(const c of cambios){
    const p = porN.get(c.p);
    if(!p){ avisos.push('Cambio para un párrafo que no existe (' + c.p + ').'); continue; }
    const nuevo = colapsar(c.texto);
    if(!nuevo){ continue; }
    if(clave(nuevo) !== clave(actual.get(c.p))){ editarParrafo(p.el, nuevo); actual.set(c.p, nuevo); resumen.cambiados++; }
  }
  for(const rp of reemplazos){
    const p = porN.get(rp.p);
    if(!p){ avisos.push('Reemplazo en un párrafo que no existe (' + rp.p + ').'); continue; }
    const base = actual.get(rp.p);
    const buscar = colapsar(rp.buscar);
    if(!buscar || !base.includes(buscar)){ avisos.push('No encontré «' + String(rp.buscar).slice(0, 50) + '» en el párrafo ' + rp.p + ' (queda sin cambiar).'); continue; }
    const nuevo = base.replace(buscar, () => colapsar(rp.reemplazar));
    editarParrafo(p.el, nuevo); actual.set(rp.p, nuevo); resumen.reemplazos++;
  }
  // formato de un párrafo de cuerpo (largo) cercano para los párrafos nuevos
  const plantillaPara = (n) => {
    for(let k = n; k >= 0; k--){ const q = porN.get(k); if(q && q.texto.length > 80 && !esFormatoDeCita(q.el)) return q.el; }
    const cualquiera = parrafos.find(q => q.texto.length > 80 && !esFormatoDeCita(q.el)) || parrafos.find(q => q.texto.length > 80);
    return (cualquiera || porN.get(n) || parrafos[0]).el;
  };
  for(const a of agregar){
    const p = porN.get(a.despues);
    if(!p){ avisos.push('No encontré el párrafo ' + a.despues + ' para agregar después de él.'); continue; }
    let ref = nivelCuerpo(p.el, cuerpo);
    const plantilla = plantillaPara(a.despues);
    for(const t of a.textos || []){
      const texto = colapsar(t);
      if(!texto) continue;
      const nuevo = parrafoNuevo(doc, plantilla, texto);
      cuerpo.insertBefore(nuevo, ref.nextSibling);
      ref = nuevo;
      resumen.nuevos++;
    }
  }
  for(const n of eliminar){
    const p = porN.get(n);
    if(!p){ continue; }
    const padre = p.el.parentNode;
    if(padre && padre.localName === 'tc' && hijosElemento(padre, 'p').length <= 1){
      trozosDe(p.el).forEach(t => t.tipo === 't' ? (t.el.textContent = '') : (t.el.parentNode && t.el.parentNode.removeChild(t.el)));
    }else if(padre){
      padre.removeChild(p.el);
    }
    resumen.quitados++;
  }
  zip.file('word/document.xml', new Serializer().serializeToString(doc));
  return { bytes: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), resumen, avisos };
}

// ---------------------------------------------------------------------------------------------------------------------
// PERFIL DE FORMATO de un modelo (2026-10-14, pedido del usuario: «que el Word se descargue igual desde el artefacto»).
// El conector de Microsoft 365 solo entrega el TEXTO de un Word, no el archivo: el artefacto no puede editar el modelo original. Para que su Word salga
// con la misma letra, el portal (que sí baja el .docx por Graph) deja junto a los modelos un perfil con el formato de cada párrafo (alineación, sangría,
// espaciado y, por tramo de texto, negrita, cursiva, subrayado, tamaño, fuente y color), ya resuelto con los estilos del documento. El artefacto lo lee
// y arma su Word con ese formato. Se guarda en «PERFILES DE FORMATO LexIA/<id del modelo>.json» (ver escritoRobot.js).
const aNumero = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const atributo = (el, n) => (el ? el.getAttributeNS(NS, n) : null);
const hijo1 = (el, n) => (el ? hijosElemento(el, n)[0] || null : null);

function mapaDeEstilos(docEstilos){
  const mapa = new Map();
  let defRpr = null, defPpr = null, estiloBase = null;
  if(!docEstilos) return { mapa, defRpr, defPpr, estiloBase };
  const dd = docEstilos.getElementsByTagNameNS(NS, 'docDefaults')[0];
  if(dd){ defRpr = hijo1(hijo1(dd, 'rPrDefault'), 'rPr'); defPpr = hijo1(hijo1(dd, 'pPrDefault'), 'pPr'); }
  for(const st of docEstilos.getElementsByTagNameNS(NS, 'style')){
    const id = atributo(st, 'styleId');
    if(!id) continue;
    mapa.set(id, { tipo: atributo(st, 'type'), basadoEn: atributo(hijo1(st, 'basedOn'), 'val'), ppr: hijo1(st, 'pPr'), rpr: hijo1(st, 'rPr') });
    if(atributo(st, 'type') === 'paragraph' && atributo(st, 'default') === '1') estiloBase = id;
  }
  return { mapa, defRpr, defPpr, estiloBase };
}
// Cadena de estilos de la base hasta el propio estilo.
function cadenaDeEstilo(mapa, id){
  const cadena = [];
  const vistos = new Set();
  let actual = id;
  while(actual && mapa.has(actual) && !vistos.has(actual)){ vistos.add(actual); cadena.push(mapa.get(actual)); actual = mapa.get(actual).basadoEn; }
  return cadena.reverse();
}
function aplicarRpr(f, rpr){
  if(!rpr) return;
  const bool = (n) => { const e = hijo1(rpr, n); if(!e) return null; const v = atributo(e, 'val'); return !(v === '0' || v === 'false' || v === 'off'); };
  const b = bool('b'); if(b !== null) f.b = b;
  const i = bool('i'); if(i !== null) f.i = i;
  const u = hijo1(rpr, 'u'); if(u){ const v = atributo(u, 'val'); f.u = !!v && v !== 'none'; }
  const sz = hijo1(rpr, 'sz'); if(sz && aNumero(atributo(sz, 'val')) > 0) f.sz = aNumero(atributo(sz, 'val'));
  const rf = hijo1(rpr, 'rFonts'); if(rf){ const fu = atributo(rf, 'ascii') || atributo(rf, 'hAnsi'); if(fu) f.f = fu; }
  const c = hijo1(rpr, 'color'); if(c){ const v = atributo(c, 'val'); if(v && v !== 'auto') f.c = v; }
  const hl = hijo1(rpr, 'highlight'); if(hl){ const v = atributo(hl, 'val'); if(v && v !== 'none') f.hl = v; }
}
function aplicarPpr(p, ppr){
  if(!ppr) return;
  const jc = hijo1(ppr, 'jc'); if(jc) p.al = atributo(jc, 'val');
  const ind = hijo1(ppr, 'ind');
  if(ind){
    const izq = atributo(ind, 'left') ?? atributo(ind, 'start'); if(izq !== null && izq !== '') p.l = aNumero(izq);
    const der = atributo(ind, 'right') ?? atributo(ind, 'end'); if(der !== null && der !== '') p.r = aNumero(der);
    const fl = atributo(ind, 'firstLine'); if(fl !== null && fl !== '') { p.fl = aNumero(fl); p.h = 0; }
    const h = atributo(ind, 'hanging'); if(h !== null && h !== '') { p.h = aNumero(h); p.fl = 0; }
  }
  const sp = hijo1(ppr, 'spacing');
  if(sp){
    const a = atributo(sp, 'before'); if(a !== null && a !== '') p.sb = aNumero(a);
    const d = atributo(sp, 'after'); if(d !== null && d !== '') p.sa = aNumero(d);
    const l = atributo(sp, 'line'); if(l !== null && l !== '') p.ln = aNumero(l);
    const lr = atributo(sp, 'lineRule'); if(lr) p.lr = lr;
  }
}
const claveFormato = f => [f.b ? 1 : 0, f.i ? 1 : 0, f.u ? 1 : 0, f.sz || 0, f.f || '', f.c || '', f.hl || ''].join('|');

/**
 * @param {ArrayBuffer|Uint8Array} bytes  el .docx del modelo
 * @returns {Promise<{v:number, n:number, gen:string, pag:object, ps:Array}>}  ps: un elemento por párrafo del cuerpo (sin tablas), en orden:
 *   { t, al, l, r, fl, h, sb, sa, ln, lr, img?, k:[{ t, b?, i?, u?, sz?, f?, c?, hl? }] }  (medidas en veintavos de punto, tamaños en medios puntos)
 */
export async function perfilFormatoDeDocx(bytes, deps = {}){
  const Parser = deps.DOMParser || globalThis.DOMParser;
  const zip = await JSZip.loadAsync(bytes);
  const archivo = zip.file('word/document.xml');
  if(!archivo) throw new Error('El modelo no parece un Word válido (falta word/document.xml).');
  const doc = new Parser().parseFromString(await archivo.async('string'), 'application/xml');
  const archivoEstilos = zip.file('word/styles.xml');
  const docEstilos = archivoEstilos ? new Parser().parseFromString(await archivoEstilos.async('string'), 'application/xml') : null;
  const { mapa, defRpr, defPpr, estiloBase } = mapaDeEstilos(docEstilos);
  const cuerpo = doc.getElementsByTagNameNS(NS, 'body')[0];
  if(!cuerpo) throw new Error('No encontré el cuerpo del documento del modelo.');

  const ps = [];
  for(const p of hijosElemento(cuerpo, 'p')){
    const ppr = hijo1(p, 'pPr');
    const idEstilo = atributo(hijo1(ppr, 'pStyle'), 'val') || estiloBase;
    const cadena = cadenaDeEstilo(mapa, idEstilo);
    const fp = { al: 'left', l: 0, r: 0, fl: 0, h: 0, sb: 0, sa: 0, ln: 240, lr: 'auto' };
    aplicarPpr(fp, defPpr);
    cadenaDeEstilo(mapa, estiloBase).forEach(e => aplicarPpr(fp, e.ppr));
    cadena.forEach(e => aplicarPpr(fp, e.ppr));
    aplicarPpr(fp, ppr);
    const base = { sz: 22 };
    aplicarRpr(base, defRpr);
    cadenaDeEstilo(mapa, estiloBase).forEach(e => aplicarRpr(base, e.rpr));
    cadena.forEach(e => aplicarRpr(base, e.rpr));

    const tramos = [];
    let imagen = false;
    const recorrer = (nodo) => {
      for(let n = nodo.firstChild; n; n = n.nextSibling){
        if(n.nodeType !== 1 || n.namespaceURI !== NS) continue;
        if(n.localName === 'r'){
          const f = { ...base };
          const rpr = hijo1(n, 'rPr');
          const idChar = atributo(hijo1(rpr, 'rStyle'), 'val');
          if(idChar) cadenaDeEstilo(mapa, idChar).forEach(e => aplicarRpr(f, e.rpr));
          aplicarRpr(f, rpr);
          let texto = '';
          for(let h = n.firstChild; h; h = h.nextSibling){
            if(h.nodeType !== 1 || h.namespaceURI !== NS) continue;
            if(h.localName === 't') texto += h.textContent;
            else if(h.localName === 'tab') texto += '\t';
            else if(h.localName === 'br' && atributo(h, 'type') !== 'page') texto += '\n';
            else if(h.localName === 'drawing' || h.localName === 'pict' || h.localName === 'object') imagen = true;
          }
          if(texto) tramos.push({ texto, f });
        }else if(['hyperlink', 'smartTag', 'ins', 'sdt', 'sdtContent', 'fldSimple'].includes(n.localName)){
          recorrer(n);
        }
      }
    };
    recorrer(p);
    // une tramos vecinos con el mismo formato
    const k = [];
    for(const tr of tramos){
      const prev = k[k.length - 1];
      if(prev && claveFormato(prev._f) === claveFormato(tr.f)) prev.t += tr.texto;
      else k.push({ t: tr.texto, _f: tr.f });
    }
    const salida = { t: k.map(x => x.t).join(''), al: fp.al, l: fp.l, r: fp.r, fl: fp.fl, h: fp.h, sb: fp.sb, sa: fp.sa, ln: fp.ln, lr: fp.lr, k: k.map(x => {
      const o = { t: x.t };
      if(x._f.b) o.b = 1; if(x._f.i) o.i = 1; if(x._f.u) o.u = 1;
      o.sz = x._f.sz || base.sz; if(x._f.f) o.f = x._f.f; if(x._f.c) o.c = x._f.c; if(x._f.hl) o.hl = x._f.hl;
      return o;
    }) };
    if(imagen) salida.img = 1;
    if(!k.length) salida.sz = base.sz;   // párrafo vacío: tamaño de la marca de párrafo
    if(!k.length && base.f) salida.f = base.f;
    ps.push(salida);
  }
  const sect = hijosElemento(cuerpo, 'sectPr').pop();
  const sz = hijo1(sect, 'pgSz'), mar = hijo1(sect, 'pgMar');
  const pag = {
    w: aNumero(atributo(sz, 'w')) || 12240, h: aNumero(atributo(sz, 'h')) || 15840,
    t: aNumero(atributo(mar, 'top')) || 1440, r: aNumero(atributo(mar, 'right')) || 1440, b: aNumero(atributo(mar, 'bottom')) || 1440, l: aNumero(atributo(mar, 'left')) || 1440,
    hd: aNumero(atributo(mar, 'header')) || 709, ft: aNumero(atributo(mar, 'footer')) || 709,
  };
  return { v: 1, n: bytes.byteLength || bytes.length || 0, gen: new Date().toISOString(), pag, ps };
}
