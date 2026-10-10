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
