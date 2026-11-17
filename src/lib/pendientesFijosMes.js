// Pendientes fijos de cada mes para el perfil de Soporte (2026-11-17, pedido del usuario): «unos pendientes que son fijos todos los meses… que quede la notificación y se quite cuando se haga».
// Aparecen en la campana de la cabecera desde el día que corresponde y se quitan solos cuando el correo ya salió (se revisa «Elementos enviados» de Soporte por la categoría con que
// el portal marca cada correo) o cuando la persona presiona «Hecho» (queda guardado en este navegador, por mes).
//
//   1. Primer día hábil → factura electrónica de SOS (mes anterior) a Beatriz: $7.000.000, contrato GJU-31-03-2025-431.
//   2. Primer día hábil → órdenes de compra de Colmédica (mes anterior), igual que la de SOS.
//   3. Sobre el 20 → correo con los pagos pendientes de ETB y Claro.
//   4. Día 28 → novedades de nómina a Beatriz.
//   5. Sobre el 27 → gastos de cuentas de cobro a Beatriz.
//   6. Primer día hábil → gastos del mes anterior, con sus soportes, a Beatriz.
// Un pendiente de un mes que no se alcanzó a hacer sigue visible hasta el día 7 del mes siguiente.
import { festivosColombia, MESES_NOMBRES } from './horasExtras.js';

// Mismos nombres con que el portal marca los correos al enviarlos (correoSolicitudDocumento.js, correoOrdenesColmedica.js, correoPagosPorRealizar.js, novedadesNomina.js, correoGastos.js).
export const TAREAS_FIJAS = [
  { id: 'factura-sos', orden: 1, regla: 'primerHabil', mesAnterior: true,
    texto: m => `Enviar a Beatriz la factura electrónica de SOS de ${m} (valor $7.000.000, contrato GJU-31-03-2025-431)`,
    donde: 'Factura Electrónica → solicitar la factura por correo',
    categoria: 'Solicitud de factura electrónica', asuntoRe: /\bSOS\b|servicio occidental/i },
  { id: 'ordenes-colmedica', orden: 2, regla: 'primerHabil', mesAnterior: true,
    texto: m => `Enviar las órdenes de compra de Colmédica de ${m}`,
    donde: 'Administración → Facturación → Órdenes Colmédica',
    categoria: 'Órdenes Colmédica' },
  { id: 'gastos-mes', orden: 6, regla: 'primerHabil', mesAnterior: true,
    texto: m => `Enviar a Beatriz todos los gastos de ${m} con sus soportes`,
    donde: 'Administración → Egresos → Gastos',
    categoria: 'Gastos del mes', hastaDia: 20 },
  { id: 'pagos-etb-claro', orden: 3, regla: 20, mesAnterior: false,
    texto: () => 'Enviar el correo con los pagos pendientes de ETB y Claro',
    donde: 'Administración → Egresos → Gastos → Pagos por realizar',
    categoria: 'Pagos por realizar', desdeDia: 15 },
  { id: 'cuentas-cobro', orden: 5, regla: 27, mesAnterior: false,
    texto: m => `Enviar a Beatriz todos los gastos relacionados con cuentas de cobro de ${m}`,
    donde: 'Administración → Egresos → Gastos', categoria: null },
  { id: 'novedades-nomina', orden: 4, regla: 28, mesAnterior: false,
    texto: m => `Enviar a Beatriz las novedades de nómina de ${m}`,
    donde: 'Administración → Novedades de nómina',
    categoria: 'Novedades de nómina', desdeDia: 20 },
];

/** Categorías que hay que revisar en «Elementos enviados» de Soporte. */
export const CATEGORIAS_FIJAS = [...new Set(TAREAS_FIJAS.map(t => t.categoria).filter(Boolean))];

const iso = (a, m1, d) => `${a}-${String(m1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const mesNombre = i0 => MESES_NOMBRES[(i0 + 12) % 12].toLowerCase();

function esHabil(fechaISO){
  const [a, m, d] = fechaISO.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dow !== 0 && dow !== 6 && !festivosColombia(a).has(fechaISO);
}
/** Primer día hábil (ni sábado, ni domingo, ni festivo) del mes `mes1` (1 a 12). */
export function primerDiaHabil(anio, mes1){
  for(let d = 1; d <= 10; d++){ const f = iso(anio, mes1, d); if(esHabil(f)) return f; }
  return iso(anio, mes1, 1);
}

/** Fecha en que le corresponde a Soporte hacer la tarea en el mes `mes1` del año `anio`. */
export function fechaDeTarea(t, anio, mes1){
  return t.regla === 'primerHabil' ? primerDiaHabil(anio, mes1) : iso(anio, mes1, t.regla);
}

const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// Fecha (AAAA-MM-DD) en Bogotá de un instante ISO.
function fechaBogota(instante){
  const d = new Date(instante);
  if(isNaN(d)) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/**
 * ¿Ya se hizo la tarea de ese mes? Es cierto si hay un correo enviado con su categoría dentro del mes (y de la ventana de días de la tarea) o si la persona la marcó como hecha.
 * `enviados`: { [categoría]: [{ asunto, fecha }] } (lo que devuelve listarEnviadosPorCategoria). `hechas`: { [clave]: 'AAAA-MM-DD' }.
 */
export function tareaHecha(t, anio, mes1, enviados, hechas){
  if(hechas && hechas[claveFija(t, anio, mes1)]) return true;
  if(!t.categoria) return false;
  const lista = (enviados && enviados[t.categoria]) || [];
  const prefijo = `${anio}-${String(mes1).padStart(2, '0')}-`;
  return lista.some(c => {
    const f = fechaBogota(c.fecha);
    if(!f.startsWith(prefijo)) return false;
    const dia = Number(f.slice(8, 10));
    if(t.desdeDia && dia < t.desdeDia) return false;
    if(t.hastaDia && dia > t.hastaDia) return false;
    return !t.asuntoRe || t.asuntoRe.test(c.asunto || '');
  });
}

export const claveFija = (t, anio, mes1) => `fijo:${t.id}:${anio}-${String(mes1).padStart(2, '0')}`;

/**
 * Filas de la campana: los pendientes fijos que ya le tocan a Soporte y aún no se hacen. Cada fila:
 * { clave, tipo:'fijos', fecha, hora, texto, radicado, cliente, responsable, donde, vencido, color, etiqueta, esFijo }.
 */
export function filasFijasDelMes({ hoy, enviados, hechas }){
  const [anio, mes1] = hoy.split('-').map(Number);
  const dia = Number(hoy.slice(8, 10));
  const periodos = [{ a: anio, m: mes1 }];
  if(dia <= 7) periodos.unshift({ a: mes1 === 1 ? anio - 1 : anio, m: mes1 === 1 ? 12 : mes1 - 1 });   // lo que quedó sin hacer el mes pasado, hasta el día 7
  const filas = [];
  for(const p of periodos){
    for(const t of TAREAS_FIJAS){
      const fecha = fechaDeTarea(t, p.a, p.m);
      if(fecha > hoy) continue;
      if(tareaHecha(t, p.a, p.m, enviados, hechas)) continue;
      const mesTexto = mesNombre(t.mesAnterior ? p.m - 2 : p.m - 1);
      const diasTarde = diasEntre(fecha, hoy);
      filas.push({
        clave: claveFija(t, p.a, p.m), tipo: 'fijos', fecha, hora: '', texto: t.texto(mesTexto), radicado: '', cliente: '', responsable: 'Soporte',
        donde: t.donde, esFijo: true, orden: t.orden, vencido: diasTarde > 0,
        color: diasTarde > 0 ? 'rojo' : 'naranja',
        etiqueta: diasTarde > 0 ? (diasTarde === 1 ? 'Atrasado 1 día' : `Atrasado ${diasTarde} días`) : 'Hoy',
      });
    }
  }
  return filas.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.orden - y.orden);
}

// ---- «Hecho» manual, guardado en este navegador ----
const LLAVE = 'lexara.pendientesFijos.v1';
export function leerHechas(){
  try{ const j = JSON.parse(localStorage.getItem(LLAVE) || '{}'); return j && typeof j === 'object' ? j : {}; }catch(e){ return {}; }
}
export function guardarHecha(clave, fecha){
  const h = leerHechas();
  if(fecha) h[clave] = fecha; else delete h[clave];
  try{ localStorage.setItem(LLAVE, JSON.stringify(h)); }catch(e){ /* sin almacenamiento: queda solo mientras la página esté abierta */ }
  return h;
}
