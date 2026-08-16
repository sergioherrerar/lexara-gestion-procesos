// Generador del informe formal de la Entidad "Grupo Colmédica": PDF propio
// (el Excel es el formato "Grupo" compartido con Aliansalud, ver
// informeGrupo.js — "FORMATO GRUPO", mismo Excel, distinto PDF).
// Ver CHANGELOG 2026-08-16 y [[project_informes_modulo]].
import { stripHtml } from './graph';
import { generarCartaInformePDF, fechaLarga, fechaCorta, VERDE_OSCURO, GRIS_SUAVE } from './informesPDF';

export { generarInformeGrupoExcel as generarInformeColmedicaExcel } from './informeGrupo';

function despachoConcatenado(p){
  const despacho = (p.Despacho||"").trim();
  const numero = (p.NumeroDespacho||"").trim();
  return [despacho, numero].filter(Boolean).join(" ") || "—";
}

// "entidad" es la etiqueta corta guardada en el proceso (p.ej. "GRUPO
// COLMEDICA"); no hay razón social completa confirmada todavía — se usa tal
// cual para el "Señores:" de la carta, igual que el formato genérico de
// Lexara. "procesosVigentes" ya debe venir filtrado (solo los NO terminados
// de esa Entidad). Columnas de la carta, confirmadas por el usuario, EN
// ESTE ORDEN: Número corto, Despacho (concatenado con No. de despacho),
// Fecha Estado, Estado.
export async function generarInformeColmedicaPDF(entidad, procesosVigentes){
  const filas = [...procesosVigentes].sort((a,b) => (a.Radicado||"").localeCompare(b.Radicado||""));
  const fecha = fechaLarga(new Date());
  const parrafo = `De manera cordial me permito informar que, con corte al ${fecha}, a cargo de MD ABOGADOS SAS se ` +
    `encuentran un total de ${filas.length} procesos judiciales, de los cuales en el siguiente cuadro se especifica ` +
    `su número corto, despacho, fecha del último estado y estado del proceso, cuyo detalle se encuentra en el ` +
    `informe de Excel adjunto.`;

  await generarCartaInformePDF({
    nombreArchivo: 'Informe Grupo Colmedica',
    nombreEntidad: entidad,
    cantidadProcesos: filas.length,
    parrafo,
    columnas: ["Número corto", "Despacho", "Fecha Estado", "Estado"],
    filas: filas.map(p => [
      p.Radicado || "—",
      despachoConcatenado(p),
      fechaCorta(p.FechaUltimoEstado),
      stripHtml(p.Estado) || "—",
    ]),
    columnStyles: {
      // Número corto es el radicado con guiones (~30 caracteres) — igual que
      // en el resto de informes, letra chica + columna ancha para que no se
      // parta en dos líneas.
      0: { halign:'center', fontStyle:'bold', textColor:VERDE_OSCURO, font:'courier', fontSize:6.5, cellWidth:46 },
      1: { halign:'left', cellWidth:40 },
      2: { halign:'center', cellWidth:20, textColor:GRIS_SUAVE },
      3: { halign:'left', cellWidth:'auto' },
    },
  });
}
