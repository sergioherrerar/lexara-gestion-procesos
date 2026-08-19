// Ficha individual de un solo Proceso judicial en PDF — a diferencia de los
// informes por Entidad (informeSOS.js/informeFamisanar.js/informeLexara.js,
// que listan VARIOS procesos en una carta), este es un resumen de UN solo
// proceso, pensado para el botón de PDF en la tabla de Procesos judiciales
// (ProcesosView.jsx). Reutiliza el mismo membrete/pie/paginación
// (prepararDocumentoPDF en informesPDF.js) que los demás PDF de la app.
// Rediseñado 2026-08-19 (pedido explícito del usuario: "SE UN PROFESIONAL EN
// DISEÑO DE INFORMES" porque la tabla Campo/Valor plana de 2 columnas se veía
// vacía) — ahora es una grilla de tarjetas por sección, igual al criterio
// visual que ya usa la propia app para "Datos generales" en ProcesoDrawer
// (ver [[project_procesos_extended_fields]]), en vez de una lista plana.
// Ver CHANGELOG 2026-08-16/2026-08-19 y [[project_informes_modulo]].
import { stripHtml, parseMonto, fmtMonto } from './graph';
import {
  prepararDocumentoPDF, fechaCorta, VERDE_OSCURO, GRIS_SUAVE, TEXTO, BORDE_SUAVE, GRIS_ZEBRA,
  MARGEN, CONTENIDO_Y_INICIAL, CONTENIDO_Y_MAXIMO,
} from './informesPDF';

function despachoConcatenado(p){
  const despacho = (p.Despacho||"").trim();
  const numero = (p.NumeroDespacho||"").trim();
  return [despacho, numero].filter(Boolean).join(" ") || "—";
}
// Nombres de archivo no pueden tener estos caracteres en Windows.
function nombreArchivoSeguro(s){
  return (s||"").toString().replace(/[\/\\?%*:|"<>]/g, "-");
}

// --- Barra de título de sección (verde, texto blanco) — mismo lenguaje
// visual que ya usa el informe de Tutelas para separar bloques. ---
function dibujarTituloSeccion(doc, titulo, x, y, width){
  doc.setFillColor(...VERDE_OSCURO);
  doc.rect(x, y, width, 6.5, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(255);
  doc.text(titulo.toUpperCase(), x + 3, y + 4.6);
  return y + 6.5 + 3;
}

// --- Una "tarjeta" de campo: etiqueta chica arriba, valor abajo, con borde
// suave y fondo cebra — mucho más aire visual que una fila de tabla. ---
const ALTO_TARJETA = 15;
function dibujarTarjetaCampo(doc, x, y, w, label, value){
  doc.setDrawColor(...BORDE_SUAVE); doc.setLineWidth(0.15);
  doc.setFillColor(...GRIS_ZEBRA);
  doc.roundedRect(x, y, w, ALTO_TARJETA, 1.2, 1.2, 'FD');
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...GRIS_SUAVE);
  doc.text(label.toUpperCase(), x + 3.5, y + 5.2);
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...TEXTO);
  const lineas = doc.splitTextToSize(String(value ?? "—") || "—", w - 7);
  doc.text(lineas[0] || "—", x + 3.5, y + 11);
}

// Dibuja una sección completa (título + grilla de N columnas) y devuelve el
// Y donde sigue el contenido. Si algún campo no cabe en lo que queda de
// página, agrega una hoja nueva antes de esa sección (mismo membrete).
function dibujarSeccionGrilla(ctx, titulo, campos, y){
  const { doc, pageWidth, dibujarEncabezadoYPie } = ctx;
  const columnas = 2;
  const gap = 4;
  const anchoDisponible = pageWidth - MARGEN*2;
  const anchoTarjeta = (anchoDisponible - gap*(columnas-1)) / columnas;
  const filas = Math.ceil(campos.length / columnas);
  const altoSeccion = 6.5 + 3 + filas*(ALTO_TARJETA + gap);

  if(y + altoSeccion > CONTENIDO_Y_MAXIMO){
    doc.addPage();
    dibujarEncabezadoYPie();
    y = CONTENIDO_Y_INICIAL;
  }

  y = dibujarTituloSeccion(doc, titulo, MARGEN, y, anchoDisponible);
  campos.forEach(([label, value], i) => {
    const col = i % columnas;
    const fila = Math.floor(i / columnas);
    const x = MARGEN + col*(anchoTarjeta + gap);
    const yy = y + fila*(ALTO_TARJETA + gap);
    dibujarTarjetaCampo(doc, x, yy, anchoTarjeta, label, value);
  });
  return y + filas*(ALTO_TARJETA + gap) + 4;
}

// Dibuja un bloque de texto largo (Estado/Histórico) a todo el ancho, con
// título de sección — se pagina manualmente línea por línea porque estos
// campos vienen de HTML libre y pueden ser arbitrariamente largos.
function dibujarSeccionTexto(ctx, titulo, texto, y){
  const { doc, pageWidth, dibujarEncabezadoYPie } = ctx;
  const anchoDisponible = pageWidth - MARGEN*2;

  if(y + 6.5 + 3 + 10 > CONTENIDO_Y_MAXIMO){
    doc.addPage();
    dibujarEncabezadoYPie();
    y = CONTENIDO_Y_INICIAL;
  }
  y = dibujarTituloSeccion(doc, titulo, MARGEN, y, anchoDisponible);

  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(...TEXTO);
  const lineas = doc.splitTextToSize(texto || "—", anchoDisponible - 6);
  const alturaLinea = 4.6;
  // Caja envolvente con fondo cebra, igual criterio visual que las tarjetas.
  let inicioCaja = y;
  let yy = y + 6;
  for(const linea of lineas){
    if(yy > CONTENIDO_Y_MAXIMO){
      // Cierra la caja hasta acá, pagina, y reabre arriba de la página nueva
      // (se reasigna inicioCaja para que un texto que ocupe 3+ páginas cierre
      // bien cada caja, no solo la primera).
      doc.setDrawColor(...BORDE_SUAVE); doc.setLineWidth(0.15);
      doc.roundedRect(MARGEN, inicioCaja, anchoDisponible, yy - inicioCaja, 1.2, 1.2, 'S');
      doc.addPage();
      dibujarEncabezadoYPie();
      y = CONTENIDO_Y_INICIAL;
      inicioCaja = y;
      yy = y + 6;
    }
    doc.text(linea, MARGEN + 3, yy);
    yy += alturaLinea;
  }
  doc.setDrawColor(...BORDE_SUAVE); doc.setLineWidth(0.15);
  doc.roundedRect(MARGEN, y, anchoDisponible, (yy - y) + 3, 1.2, 1.2, 'S');
  return yy + 8;
}

export async function generarFichaProcesoPDF(proceso){
  const radicado = proceso.Radicado || proceso.NoCompleto || "—";
  const tituloDocumento = `Ficha del proceso — ${radicado}`;
  const { doc, pageWidth, dibujarEncabezadoYPie, numerarPaginas } = await prepararDocumentoPDF(tituloDocumento);
  const ctx = { doc, pageWidth, dibujarEncabezadoYPie };

  dibujarEncabezadoYPie();
  let y = CONTENIDO_Y_INICIAL;

  // --- Encabezado de la ficha: cliente + radicado en grande, a modo de
  // "carátula" del proceso — igual criterio que la caja de resumen de las
  // cartas por Entidad, para que la ficha se vea completa desde el inicio. ---
  doc.setFillColor(...VERDE_OSCURO);
  doc.roundedRect(MARGEN, y, pageWidth - MARGEN*2, 16, 2, 2, 'F');
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(255);
  doc.text('CLIENTE', MARGEN + 4, y + 6);
  doc.setFont('helvetica','bold'); doc.setFontSize(11.5);
  doc.text(proceso.Cliente || "—", MARGEN + 4, y + 12.5);
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
  doc.text('NO. RADICADO', pageWidth - MARGEN - 4, y + 6, {align:'right'});
  doc.setFont('helvetica','bold'); doc.setFontSize(11.5);
  doc.text(radicado, pageWidth - MARGEN - 4, y + 12.5, {align:'right'});
  y += 16 + 6;

  y = dibujarSeccionGrilla(ctx, 'Identificación', [
    ['No. Completo', proceso.NoCompleto],
    ['Entidad', proceso.Entidad],
    ['Apoderado', proceso.Apoderado],
    ['Despacho', despachoConcatenado(proceso)],
    ['Instancia', proceso.Instancia],
  ], y);

  y = dibujarSeccionGrilla(ctx, 'Trámite y fechas', [
    ['Tipo de Acción', proceso.TipoAccion],
    ['Tipo de proceso', proceso.TipoProceso],
    ['Etapa procesal', proceso.EtapaProcesal],
    ['Estado V/T', proceso.EstadoVT],
    ['Fecha admisión', fechaCorta(proceso.FechaAdmision)],
    ['Fecha contestación', fechaCorta(proceso.FechaContestacion)],
    ['Fecha último estado', fechaCorta(proceso.FechaUltimoEstado)],
  ], y);

  y = dibujarSeccionGrilla(ctx, 'Valores y contingencia', [
    ['Valor actual demanda', proceso.ValorActualDemanda ? fmtMonto(parseMonto(proceso.ValorActualDemanda)) : "—"],
    ['Calificación de contingencia', proceso.CalificacionContingencia],
  ], y);

  y = dibujarSeccionTexto(ctx, 'Estado', stripHtml(proceso.Estado), y);
  y = dibujarSeccionTexto(ctx, 'Histórico', stripHtml(proceso.Historico), y);

  numerarPaginas();

  const hoyISO = new Date().toISOString().slice(0,10);
  const nombreArchivo = nombreArchivoSeguro(`Ficha ${proceso.Radicado || proceso.NoCompleto || proceso.id}`);
  doc.save(`${nombreArchivo} ${hoyISO}.pdf`);
}
