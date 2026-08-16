// Generador del informe formal de la Entidad "Aliansalud": PDF propio (el
// Excel es el formato "Grupo" compartido, ver informeGrupo.js — la misma
// plantilla que pidió también "Grupo Colmédica").
// Ver CHANGELOG 2026-08-16 y [[project_informes_modulo]].
import { stripHtml } from './graph';
import { generarCartaInformePDF, fechaLarga, VERDE_OSCURO } from './informesPDF';

export { generarInformeGrupoExcel as generarInformeAliansaludExcel } from './informeGrupo';

// Razón social completa, tomada literal de la columna "Cliente" de la
// plantilla real — se usa para el "Señores:" de la carta.
const NOMBRE_COMPLETO_ENTIDAD = {
  ALIANSALUD: "ALIANSALUD ENTIDAD PROMOTORA DE SALUD S.A.",
};

function despachoConcatenado(p){
  const despacho = (p.Despacho||"").trim();
  const numero = (p.NumeroDespacho||"").trim();
  return [despacho, numero].filter(Boolean).join(" ") || "—";
}

// "entidad" es la etiqueta corta guardada en el proceso (p.ej. "Aliansalud");
// "procesosVigentes" ya debe venir filtrado (solo los NO terminados de esa
// Entidad) — el conteo y las filas de la carta son exactamente esa lista.
// Columnas de la carta, confirmadas por el usuario, EN ESTE ORDEN: Número
// corto, Despacho (concatenado con No. de despacho), Estado.
export async function generarInformeAliansaludPDF(entidad, procesosVigentes){
  const nombreEntidad = NOMBRE_COMPLETO_ENTIDAD[(entidad||"").toUpperCase()] || entidad;
  const filas = [...procesosVigentes].sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));
  const fecha = fechaLarga(new Date());
  const parrafo = `De manera cordial me permito informar que, con corte al ${fecha}, a cargo de MD ABOGADOS SAS se ` +
    `encuentran un total de ${filas.length} procesos judiciales, de los cuales en el siguiente cuadro se especifica ` +
    `su número corto, despacho y estado del proceso, cuyo detalle se encuentra en el informe de Excel adjunto.`;

  await generarCartaInformePDF({
    nombreArchivo: 'Informe Aliansalud',
    nombreEntidad,
    cantidadProcesos: filas.length,
    parrafo,
    columnas: ["Número corto", "Despacho", "Estado"],
    filas: filas.map(p => [
      p.Radicado || "—",
      despachoConcatenado(p),
      stripHtml(p.Estado) || "—",
    ]),
    columnStyles: {
      // Número corto es el radicado con guiones (~30 caracteres) — igual que
      // en el resto de informes, letra chica + columna ancha para que no se
      // parta en dos líneas.
      0: { halign:'center', fontStyle:'bold', textColor:VERDE_OSCURO, font:'courier', fontSize:6.5, cellWidth:46 },
      1: { halign:'left', cellWidth:44 },
      2: { halign:'left', cellWidth:'auto' },
    },
  });
}
