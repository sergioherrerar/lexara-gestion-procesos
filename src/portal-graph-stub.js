// Versión LIVIANA de src/lib/graph.js SOLO para el paquete de exportación del portal de clientes (vite.config.portal.js la pone en lugar de './graph').
// Los informes de la app (informeGrupo, informeLexara, informeProceso, informeClientesTutelas…) importan unas pocas funciones de graph.js; traer graph.js entero
// arrastraría el inicio de sesión de Microsoft y media aplicación. Aquí van copias MÍNIMAS de esas funciones (misma lógica) y avisos en las que el portal no usa.

const MARCAS = /[̀-ͯ]/g;
export function normalize(str){
  return String(str || "").toLowerCase().normalize("NFD").replace(MARCAS, "");
}
export function stripHtml(html){
  if(!html) return "";
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}
export function parseMonto(val){
  if(val == null || val === "") return 0;
  if(typeof val === "number") return val;
  const str = String(val).trim();
  if(str.includes(",")){
    const n = parseFloat(str.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  const partes = str.split(".");
  const esDecimalSimple = partes.length === 2 && partes[1].length <= 2;
  const limpio = esDecimalSimple ? str : str.replace(/\./g, "");
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}
const formatoMonto = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtMonto(n){ return formatoMonto.format(n || 0); }

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtDate(dateStr){
  if(!dateStr) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if(!m) return dateStr;
  return `${m[3]} ${MESES_CORTOS[Number(m[2]) - 1]}. ${m[1]}`;
}

// Cruce «Valores Entidad» (Entidad + Cliente + Tipo), igual que graph.js buscarValorEntidad.
function claveValorEntidad(s){ return normalize(String(s ?? "")).replace(/[^a-z0-9]/g, ""); }
function claveTipoValorEntidad(s){ return claveValorEntidad(s).replace(/(.)\1+/g, "$1"); }
const indices = new WeakMap();
function indiceValores(valores){
  let indice = indices.get(valores);
  if(!indice || indice.size > valores.length){
    indice = new Map();
    valores.forEach(v => {
      const k = `${claveValorEntidad(v.Entidad)}|${claveValorEntidad(v.Cliente)}|${claveTipoValorEntidad(v.Tipo)}`;
      if(!indice.has(k)) indice.set(k, v);
    });
    indices.set(valores, indice);
  }
  return indice;
}
export function buscarValorEntidad(valoresEntidad, entidad, cliente, tipoRespuesta){
  if(!Array.isArray(valoresEntidad) || !valoresEntidad.length) return null;
  const k = `${claveValorEntidad(entidad)}|${claveValorEntidad(cliente)}|${claveTipoValorEntidad(tipoRespuesta)}`;
  return indiceValores(valoresEntidad).get(k) || null;
}

// Importadas por los informes pero que el portal NO usa (envío de correos de la app, desistimientos, abogados).
const noDisponible = nombre => () => { throw new Error(nombre + ' no está disponible en el portal de clientes.'); };
export const crearBorradorConImagenesInline = noDisponible('crearBorradorConImagenesInline');
export const firmaComoImagenInline = noDisponible('firmaComoImagenInline');
export const firmaHtml = noDisponible('firmaHtml');
export const procesoForDesistimiento = noDisponible('procesoForDesistimiento');
export const nombreAbogadoCanonico = s => s;
